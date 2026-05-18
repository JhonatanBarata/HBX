import asyncio
from types import SimpleNamespace

from app.schemas import SearchRequest
from app.services.discovery import _is_allowed_url, build_social_queries, discover_social_profiles, discover_urls
from app.services.filters import is_blocked_lead_source_domain, is_social_signal_domain
from app.services.search_service import SearchService
from app.services.social import is_valid_social_profile_url, normalize_social_url


def test_instagram_is_social_signal_not_blocked_lead_source() -> None:
    assert is_social_signal_domain("https://instagram.com/oficina")
    assert not is_blocked_lead_source_domain("https://instagram.com/oficina")
    assert is_blocked_lead_source_domain("https://youtube.com/watch?v=1")


def test_discovery_recognizes_social_signal_but_does_not_use_as_primary_source(monkeypatch) -> None:
    queries: list[str] = []

    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            queries.append(query)
            return [
                {"href": "https://instagram.com/oficina_araraquara"},
                {"href": "https://instagram.com/oficina_araraquara/reel/123"},
                {"href": "https://instagram.com/p/abc"},
            ]

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    urls = discover_urls(
        "Araraquara",
        "SP",
        "oficina",
        10,
        30,
        required_channels=["instagram"],
    )

    assert not any("instagram" in query.lower() for query in queries)
    assert is_valid_social_profile_url("https://instagram.com/oficina_araraquara")
    assert "https://instagram.com/oficina_araraquara" not in urls
    assert not _is_allowed_url("https://instagram.com/oficina_araraquara", required_channels=["instagram"])
    assert not _is_allowed_url("https://instagram.com/oficina/reel/123", required_channels=["instagram"])
    assert not _is_allowed_url("https://instagram.com/p/abc", required_channels=["instagram"])


def test_discover_social_profiles_returns_requested_instagram(monkeypatch) -> None:
    calls: list[dict] = []

    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            calls.append({"query": query, **kwargs})
            return [
                {
                    "href": "https://instagram.com/barbeariacampinas",
                    "title": "Barbearia Campinas",
                    "body": "Barbearia em Campinas SP",
                }
            ]

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    profiles = discover_social_profiles("Campinas", "SP", "barbearia", 10, required_channels=["instagram"])

    assert len(profiles) == 1
    assert profiles[0]["url"] == "https://instagram.com/barbeariacampinas"
    assert profiles[0]["channel"] == "instagram"
    assert calls[0]["max_results"] == 50


def test_instagram_social_queries_prioritize_profile_results() -> None:
    queries = build_social_queries("farmacia", "São Paulo", "SP", {"instagram"})

    assert queries[0] == "site:instagram.com farmacia São Paulo -/p/ -/reel/ -/stories/"
    assert "site:instagram.com farmacia Sao Paulo -/p/ -/reel/ -/stories/" in queries


def test_discover_social_profiles_can_stop_at_social_first_target(monkeypatch) -> None:
    calls: list[str] = []

    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            calls.append(query)
            return [
                {"href": "https://instagram.com/farmaciasocial", "title": "Farmácia Social"},
                {"href": "https://instagram.com/farmaciasocial2", "title": "Farmácia Social 2"},
            ]

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    profiles = discover_social_profiles("São Paulo", "SP", "farmacia", 1, required_channels=["instagram"], target_override=1)

    assert len(profiles) == 1
    assert len(calls) == 1


def test_discover_urls_keeps_social_out_but_social_discovery_returns_it(monkeypatch) -> None:
    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            return [
                {"href": "https://instagram.com/barbeariacampinas", "title": "Barbearia Campinas", "body": "Barbearia em Campinas SP"},
                {"href": "https://barbeariacampinas.example.com", "title": "Barbearia Campinas", "body": "Contato"},
            ]

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    urls = discover_urls("Campinas", "SP", "barbearia", 10, 30, required_channels=["instagram"])
    profiles = discover_social_profiles("Campinas", "SP", "barbearia", 10, required_channels=["instagram"])

    assert "https://instagram.com/barbeariacampinas" not in urls
    assert "https://barbeariacampinas.example.com" in urls
    assert profiles[0]["url"] == "https://instagram.com/barbeariacampinas"


def test_discover_social_profiles_does_not_stop_at_twenty(monkeypatch) -> None:
    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            return [
                {
                    "href": f"https://instagram.com/barbeariacampinas{i}",
                    "title": f"Barbearia Campinas {i}",
                    "body": "Barbearia em Campinas SP",
                }
                for i in range(50)
            ]

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    profiles = discover_social_profiles("Campinas", "SP", "barbearia", 20, required_channels=["instagram"])

    assert len(profiles) > 20


def test_discover_urls_with_required_social_uses_aggressive_max_results(monkeypatch) -> None:
    calls: list[dict] = []

    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            calls.append({"query": query, **kwargs})
            return [{"href": "https://barbeariacampinas.example.com"}]

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    discover_urls("Campinas", "SP", "barbearia", 20, 500, required_channels=["instagram"])

    assert calls
    assert calls[0]["max_results"] >= 30


def test_attach_discovered_social_profiles_matches_real_contact() -> None:
    service = SearchService()
    contacts = [
        {
            "name": "Barbearia Campinas",
            "phone": "(19) 99999-9999",
            "phoneDigits": "19999999999",
            "score": 80,
            "website": "https://barbeariacampinas.com.br",
        }
    ]
    profiles = [
        {
            "url": "https://instagram.com/barbeariacampinas",
            "channel": "instagram",
            "title": "Barbearia Campinas",
            "snippet": "Barbearia em Campinas SP",
            "query": "site:instagram.com barbearia Campinas SP",
        }
    ]

    stats = service.attach_discovered_social_profiles(contacts, profiles, "Campinas", "barbearia")

    assert contacts[0]["instagramUrl"] == "https://instagram.com/barbeariacampinas"
    assert stats["profilesAttached"] == 1


def test_required_instagram_and_facebook_accepts_either_channel() -> None:
    service = SearchService()

    assert service.has_required_social_channels(
        {"instagramUrl": "https://instagram.com/barbearia"},
        {"instagram", "facebook"},
    )
    assert service.has_required_social_channels(
        {"facebookUrl": "https://facebook.com/barbearia"},
        {"instagram", "facebook"},
    )
    assert not service.has_required_social_channels(
        {},
        {"instagram", "facebook"},
    )
    assert not service.has_required_social_channels(
        {"facebookUrl": "https://facebook.com/barbearia"},
        {"instagram"},
    )
    assert not service.has_required_social_channels(
        {"instagramUrl": "https://instagram.com/barbearia"},
        {"facebook"},
    )
    assert service.has_required_social_channels(
        {
            "instagramUrl": "https://instagram.com/barbearia",
            "facebookUrl": "https://facebook.com/barbearia",
        },
        {"instagram", "facebook"},
    )


def test_invalid_social_urls_are_rejected() -> None:
    assert normalize_social_url("https://instagram.com/oficina?utm_source=x") == "https://instagram.com/oficina"
    assert not is_valid_social_profile_url("https://instagram.com/oficina/reel/123")
    assert not is_valid_social_profile_url("https://instagram.com/p/abc")
    assert not is_valid_social_profile_url("https://instagram.com/stories/oficina/123")
    assert not is_valid_social_profile_url("https://facebook.com/sharer/sharer.php?u=https://x.test")


def test_social_queries_escape_internal_quotes() -> None:
    service = SearchService()

    queries = service.social_queries_for_contact(
        {
            "name": 'Auto "Center" Silva',
            "phone": "(19) 99999-1234",
            "phoneDigits": "19999991234",
            "website": "https://autocentersilva.com.br",
        },
        "Campinas",
        "oficina",
        "instagram",
    )

    assert queries
    assert any('"Auto Center Silva"' in query for query in queries)
    assert all('"Center"' not in query for query in queries)
    assert all(query.count('"') % 2 == 0 for query in queries)


def test_social_enrichment_skips_bad_directory_candidate_without_ddgs(monkeypatch) -> None:
    service = SearchService()
    calls: list[str] = []

    def fake_search(*args, **kwargs):
        calls.append("called")
        return None, 0

    monkeypatch.setattr(service, "search_social_profile_url", fake_search)

    contacts, stats = service.enrich_social_links_for_contacts(
        [
            {
                "name": "Todos os estabelecimentos em CAMPINAS, SP",
                "phone": "(19) 99999-9999",
                "phoneDigits": "19999999999",
                "score": 80,
                "website": "https://diretorio.example.com",
            }
        ],
        "Campinas",
        "SP",
        "oficina",
        required_channels=["instagram"],
    )

    assert contacts[0].get("instagramUrl") is None
    assert calls == []
    assert stats["processed"] == 0
    assert stats["skippedBadCandidate"] == 1


def test_search_service_enriches_required_instagram_after_base_contact(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://barbeariaestilo.example.com")]

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            return [
                {"href": "https://instagram.com/barbeariaestilo", "title": "Barbearia Estilo Araraquara"},
                {"href": "https://instagram.com/barbeariaestilo/reel/123", "title": "Reel"},
            ]

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://barbeariaestilo.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Barbearia Estilo",
                    "phone": "(16) 99999-9999",
                    "phoneDigits": "16999999999",
                    "rating": None,
                    "reviews": None,
                    "address": "Araraquara SP",
                    "website": "https://barbeariaestilo.example.com",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://barbeariaestilo.example.com",
                }
            ],
            "Barbearia Estilo Araraquara telefone",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Araraquara",
                state="SP",
                segment="barbearia",
                targetType="pj",
                limit=10,
                fresh=True,
                requiredChannels=["instagram"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].instagramUrl == "https://instagram.com/barbeariaestilo"
    assert response.results[0].website == "https://barbeariaestilo.example.com"
    assert response.social["enrichmentRan"] is True
    assert response.stats["missingRequiredChannel"] == 0


def test_search_service_best_effort_uses_social_from_html_without_required_channels(monkeypatch) -> None:
    html = """
    <html>
      <head><title>Barbearia Estilo</title></head>
      <body>
        <h1>Barbearia Estilo</h1>
        <a href="tel:+5516999999999">Ligar</a>
        <a href="https://instagram.com/barbeariaestilo?utm_source=site">Instagram</a>
      </body>
    </html>
    """

    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html=html, url="https://barbeariaestilo.example.com")]

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            return []

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://barbeariaestilo.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Araraquara",
                state="SP",
                segment="barbearia",
                targetType="pj",
                limit=10,
                fresh=True,
            )
        )
    )

    assert response.count == 1
    assert response.results[0].instagramUrl == "https://instagram.com/barbeariaestilo"
    assert response.results[0].website == "https://barbeariaestilo.example.com"
    assert response.social["enrichmentRan"] is True
    assert response.stats["missingRequiredChannel"] == 0


def test_search_service_enriches_top_pj_contacts_best_effort_without_required_channels(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://barbeariaestilo.example.com")]

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            if "instagram.com" in query:
                return [{"href": "https://instagram.com/barbeariaestilo", "title": "Barbearia Estilo Araraquara"}]
            if "facebook.com" in query:
                return [{"href": "https://facebook.com/barbeariaestilo", "title": "Barbearia Estilo Araraquara"}]
            return []

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://barbeariaestilo.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Barbearia Estilo",
                    "phone": "(16) 99999-9999",
                    "phoneDigits": "16999999999",
                    "rating": None,
                    "reviews": None,
                    "address": "Araraquara SP",
                    "website": "https://barbeariaestilo.example.com",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://barbeariaestilo.example.com",
                }
            ],
            "Barbearia Estilo Araraquara telefone",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Araraquara",
                state="SP",
                segment="barbearia",
                targetType="pj",
                limit=10,
                fresh=True,
            )
        )
    )

    assert response.count == 1
    assert response.results[0].instagramUrl == "https://instagram.com/barbeariaestilo"
    assert response.results[0].facebookUrl == "https://facebook.com/barbeariaestilo"
    assert response.social["processed"] == 1
    assert response.social["enrichedCount"] == 1
    assert response.stats["missingRequiredChannel"] == 0
    assert response.stats["rawFound"] == 1
    assert response.stats["deduped"] == 1
    assert "socialProfilesDiscovered" in response.stats
    assert "socialProfilesAttached" in response.stats
    assert "socialProfilesUnmatched" in response.stats


def test_required_instagram_discards_contact_missing_social(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://barbeariaestilo.example.com")]

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            return []

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://barbeariaestilo.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Barbearia Estilo",
                    "phone": "(16) 99999-9999",
                    "phoneDigits": "16999999999",
                    "rating": None,
                    "reviews": None,
                    "address": "Araraquara SP",
                    "website": "https://barbeariaestilo.example.com",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://barbeariaestilo.example.com",
                }
            ],
            "Barbearia Estilo Araraquara telefone",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Araraquara",
                state="SP",
                segment="barbearia",
                targetType="pj",
                limit=10,
                fresh=True,
                requiredChannels=["instagram"],
            )
        )
    )

    assert response.count == 0
    assert response.stats["missingRequiredChannel"] == 1
    assert response.social["missingRequiredChannel"] == 1


def test_required_instagram_accepts_social_from_html(monkeypatch) -> None:
    html = """
    <html>
      <head><title>Barbearia Estilo</title></head>
      <body>
        <h1>Barbearia Estilo</h1>
        <a href="tel:+5516999999999">Ligar</a>
        <a href="https://instagram.com/barbeariaestilo">Instagram</a>
      </body>
    </html>
    """

    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html=html, url="https://barbeariaestilo.example.com")]

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            return []

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://barbeariaestilo.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Araraquara",
                state="SP",
                segment="barbearia",
                targetType="pj",
                limit=10,
                fresh=True,
                requiredChannels=["instagram"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].instagramUrl == "https://instagram.com/barbeariaestilo"
    assert response.stats["missingRequiredChannel"] == 0


def test_required_instagram_promotes_discovered_social_profile_without_phone(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.search_service.discover_social_profiles",
        lambda *args, **kwargs: [
            {
                "url": "https://instagram.com/farmaciasocial",
                "channel": "instagram",
                "title": "Farmácia Social São Paulo • Instagram",
                "snippet": "Farmácia em São Paulo",
                "query": "site:instagram.com farmacia São Paulo",
            }
        ],
    )
    monkeypatch.setattr(
        "app.services.search_service.discover_urls",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("social-first should not call web discovery")),
    )

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="São Paulo",
                state="SP",
                segment="farmacia",
                targetType="pj",
                limit=1,
                fresh=True,
                requiredChannels=["instagram"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].name == "Farmácia Social São Paulo"
    assert response.results[0].phone == ""
    assert response.results[0].phoneDigits == ""
    assert response.results[0].instagramUrl == "https://instagram.com/farmaciasocial"
    assert response.results[0].source == "hbx_scraping:social_discovery"
    assert response.social["socialFirstCandidates"] == 1


def test_required_instagram_and_facebook_accepts_when_one_channel_exists(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://barbeariaestilo.example.com")]

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            if "facebook.com" in query:
                return [{"href": "https://facebook.com/barbeariaestilo", "title": "Barbearia Estilo Araraquara"}]
            return []

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://barbeariaestilo.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Barbearia Estilo",
                    "phone": "(16) 99999-9999",
                    "phoneDigits": "16999999999",
                    "rating": None,
                    "reviews": None,
                    "address": "Araraquara SP",
                    "website": "https://barbeariaestilo.example.com",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://barbeariaestilo.example.com",
                }
            ],
            "Barbearia Estilo Araraquara telefone",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Araraquara",
                state="SP",
                segment="barbearia",
                targetType="pj",
                limit=10,
                fresh=True,
                requiredChannels=["instagram", "facebook"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].facebookUrl == "https://facebook.com/barbeariaestilo"
    assert response.stats["missingRequiredChannel"] == 0

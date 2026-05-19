import asyncio
from types import SimpleNamespace

from app.schemas import EnrichLeadRequest, SearchRequest
from app.services.discovery import _is_allowed_url, build_directory_seed_urls, build_social_queries, discover_social_profiles, discover_urls
from app.services.filters import is_blocked_lead_source_domain, is_social_signal_domain
from app.services.search_service import SearchService
from app.services.social import is_valid_social_profile_url, normalize_social_url


def test_instagram_is_social_signal_not_blocked_lead_source() -> None:
    assert is_social_signal_domain("https://instagram.com/oficina")
    assert not is_blocked_lead_source_domain("https://instagram.com/oficina")
    assert is_blocked_lead_source_domain("https://youtube.com/watch?v=1")


def test_enrich_lead_request_preserves_required_website_and_email_channels() -> None:
    request = EnrichLeadRequest(
        name="Pizzaria do Roberto",
        city="Rio Claro",
        state="SP",
        segment="pizzaria",
        preferredChannels=[],
        requiredChannels=["site", "email", "instagram", "facebook"],
    )

    assert request.preferredChannels == []
    assert request.requiredChannels == ["website", "email", "instagram", "facebook"]


def test_website_candidate_rejects_aggregator_wrapped_official_domain() -> None:
    service = SearchService()
    contact = {
        "name": "Pizzaria do Roberto",
        "phone": "(19) 99836-8311",
        "phoneDigits": "19998368311",
    }
    row = {
        "title": "Pizzariadoroberto / Pizzaria do Roberto - A melhor de Rio Claro",
        "body": "Meta tags e estatisticas do site oficial.",
    }

    assert service.score_website_candidate(
        contact,
        row,
        "https://pizzariadoroberto.com.br.siteindices.com/",
        "Rio Claro",
    ) == -100
    assert service.score_website_candidate(
        contact,
        row,
        "https://pizzariadoroberto.com.br/",
        "Rio Claro",
    ) >= 35


def test_direct_website_probe_accepts_identity_verified_domain(monkeypatch) -> None:
    calls: list[str] = []

    class FakeResponse:
        status_code = 200
        url = "https://pizzariadoroberto.com.br/"
        text = "<title>Pizzaria do Roberto - Rio Claro</title><body>Tradição e qualidade desde 1977 em Rio Claro.</body>"

    def fake_get(url, **kwargs):
        calls.append(url)
        if "pizzariadoroberto.com.br" in url and not url.startswith("https://www."):
            return FakeResponse()
        raise RuntimeError("host not found")

    monkeypatch.setattr("app.services.search_service.httpx.get", fake_get)
    website, score, query = SearchService().probe_direct_website_for_contact(
        {
            "name": "PIZZARIA E CHOPERIA ROBERTO DE MORAES",
            "phone": "(19) 99836-8311",
            "phoneDigits": "19998368311",
        },
        "Rio Claro",
    )

    assert website == "https://pizzariadoroberto.com.br"
    assert score >= 65
    assert query == "direct_probe:pizzariadoroberto.com.br"
    assert any("pizzariadoroberto.com.br" in call for call in calls)


def test_direct_website_candidates_prioritize_probable_brand_domain() -> None:
    urls = SearchService().direct_website_candidate_urls({
        "name": "PIZZARIA E CHOPERIA ROBERTO DE MORAES",
    })

    assert "https://pizzariadoroberto.com.br" in urls[:3]
    assert not any("robertopizzaria" in url for url in urls)


def test_social_candidate_rejects_single_common_name_token_with_city() -> None:
    service = SearchService()
    contact = {
        "name": "Casa dos Pneus e Mecânica",
        "phone": "(16) 3332-1939",
        "phoneDigits": "1633321939",
        "segment": "pneus automotivo auto center",
    }

    score = service.score_social_candidate(
        contact,
        {
            "href": "https://instagram.com/casaseniorararaquara",
            "title": "Casa Senior Araraquara",
            "body": "Araraquara SP",
        },
        "https://instagram.com/casaseniorararaquara",
        "instagram",
        "Araraquara",
        "pneus automotivo auto center",
        'site:instagram.com "casa" "Araraquara"',
    )

    assert score == -100


def test_social_candidate_rejects_clinic_profile_for_auto_shop() -> None:
    service = SearchService()
    contact = {
        "name": "Clinic Car Pneus E Oficina Ltda",
        "phone": "(16) 3010-0055",
        "phoneDigits": "1630100055",
        "segment": "pneus automotivo auto center",
    }

    score = service.score_social_candidate(
        contact,
        {
            "href": "https://instagram.com/arclinicaqa",
            "title": "AR Clínica Araraquara",
            "body": "Clínica médica em Araraquara SP",
        },
        "https://instagram.com/arclinicaqa",
        "instagram",
        "Araraquara",
        "pneus automotivo auto center",
        'site:instagram.com "clinic" "Araraquara"',
    )

    assert score == -100


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


def test_discovery_adds_directory_seed_urls_when_search_backend_fails(monkeypatch) -> None:
    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            raise RuntimeError("search backend unavailable")

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    urls = discover_urls("Boituva", "SP", "farmácias", 5, 20)

    assert "https://www.solutudo.com.br/empresas/sp/boituva/farmacias" in urls
    assert "https://listaamarela.com.br/busca/farmacias-boituva-sp" in urls


def test_directory_seed_urls_slugify_accents() -> None:
    urls = build_directory_seed_urls("clínicas odontológicas", "São José do Rio Preto", "SP")

    assert urls[0] == "https://www.solutudo.com.br/empresas/sp/sao-jose-do-rio-preto/clinicas-odontologicas"


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


def test_discover_social_profiles_skips_forced_deep_lookup(monkeypatch) -> None:
    calls: list[dict] = []

    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            calls.append({"query": query, **kwargs})
            return [
                {"href": "https://instagram.com/farmaciasocial", "title": "Farmácia Social"},
                {"href": "https://instagram.com/farmaciasocial2", "title": "Farmácia Social 2"},
            ]

    monkeypatch.setattr("app.services.discovery.DDGS", FakeDDGS)

    profiles = discover_social_profiles("São Paulo", "SP", "farmacia", 1, required_channels=["instagram"], target_override=1)

    assert profiles == []
    assert calls == []


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
    assert "https://www.solutudo.com.br/empresas/sp/campinas/barbearia" in urls
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

    urls = discover_urls("Campinas", "SP", "barbearia", 20, 500, required_channels=["instagram"])

    assert not calls
    assert urls


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


def test_requested_social_channels_uses_preferred_and_required_hints() -> None:
    service = SearchService()

    assert service.requested_social_channels(["instagram"], []) == {"instagram"}
    assert service.requested_social_channels(["instagram"], ["facebook", "website"]) == {"instagram", "facebook"}


def test_required_social_channels_is_legacy_any_match_diagnostic() -> None:
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


def test_social_enrichment_runs_for_preferred_instagram(monkeypatch) -> None:
    service = SearchService()
    calls: list[str] = []

    def fake_guess(contact, channel, city, deadline=None):
        calls.append(channel)
        return ("https://instagram.com/oficinarica", 82) if channel == "instagram" else (None, 0)

    monkeypatch.setattr(service, "guessed_social_url_for_contact", fake_guess)

    contacts, stats = service.enrich_social_links_for_contacts(
        [
            {
                "name": "Oficina Rica",
                "phone": "(19) 98888-0004",
                "phoneDigits": "19988880004",
                "city": "Campinas",
                "segment": "oficina",
                "score": 80,
            }
        ],
        "Campinas",
        "SP",
        "oficina",
        preferred_channels=["instagram"],
    )

    assert "instagram" in calls
    assert contacts[0]["instagramUrl"] == "https://instagram.com/oficinarica"
    assert stats["enrichmentRan"] is True
    assert stats["requestedChannels"] == ["instagram"]


def test_bridge_page_extraction_reads_instagram_and_facebook(monkeypatch) -> None:
    service = SearchService()

    html = """
    <script type="application/ld+json">
      {"sameAs":["https://www.facebook.com/SilcarPneusOficial","https://instagram.com/silcarpneusoficial"]}
    </script>
    """

    def fake_get(*args, **kwargs):
        return SimpleNamespace(status_code=200, text=html)

    monkeypatch.setattr("app.services.search_service.httpx.get", fake_get)

    assert service.extract_social_urls_from_bridge("https://linktr.ee/silcarpneus", "instagram") == [
        "https://instagram.com/silcarpneusoficial"
    ]
    assert service.extract_social_urls_from_bridge("https://linktr.ee/silcarpneus", "facebook") == [
        "https://facebook.com/SilcarPneusOficial"
    ]


def test_required_social_bridge_search_attaches_both_channels(monkeypatch) -> None:
    service = SearchService()
    contact = {
        "name": "Silcar pneus",
        "phone": "",
        "phoneDigits": "",
        "city": "Araraquara",
        "state": "SP",
        "segment": "pneus automotivo",
        "score": 70,
    }
    html = """
    <script type="application/ld+json">
      {"sameAs":["https://www.facebook.com/SilcarPneusOficial","https://instagram.com/silcarpneusoficial"]}
    </script>
    """

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            return [
                {
                    "href": "https://linktr.ee/silcarpneus",
                    "title": "Silcar Pneus Official: Instagram, Facebook | Linktree",
                    "body": "Pneus para todos os veículos em Araraquara.",
                }
            ]

    def fake_get(*args, **kwargs):
        return SimpleNamespace(status_code=200, text=html)

    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr("app.services.search_service.httpx.get", fake_get)

    contacts, stats = service.enrich_social_links_for_contacts(
        [contact],
        "Araraquara",
        "SP",
        "pneus automotivo",
        required_channels=["instagram", "facebook"],
        time_budget_seconds=10,
    )

    assert contacts[0]["instagramUrl"] == "https://instagram.com/silcarpneusoficial"
    assert contacts[0]["facebookUrl"] == "https://facebook.com/SilcarPneusOficial"
    assert service.has_required_social_channels(contacts[0], {"instagram", "facebook"})
    assert stats["missingRequiredChannel"] == 0


def test_invalid_social_urls_are_rejected() -> None:
    assert normalize_social_url("https://instagram.com/oficina?utm_source=x") == "https://instagram.com/oficina"
    assert not is_valid_social_profile_url("https://instagram.com/oficina/reel/123")
    assert not is_valid_social_profile_url("https://instagram.com/p/abc")
    assert not is_valid_social_profile_url("https://instagram.com/stories/oficina/123")
    assert not is_valid_social_profile_url("https://facebook.com/RodadeSambaAraraquara/events")
    assert not is_valid_social_profile_url("https://facebook.com/oficina/posts/123")
    assert not is_valid_social_profile_url("https://facebook.com/sharer/sharer.php?u=https://x.test")
    assert not is_valid_social_profile_url("https://facebook.com/sharer.php?u=https://x.test")


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


def test_website_candidate_rejects_job_portal_domain() -> None:
    service = SearchService()

    score = service.score_website_candidate(
        {"name": "Silcar Pneus Ltda", "segment": "borracharias"},
        {
            "href": "https://silcarpneus.gupy.io/",
            "title": "Silcar Pneus - vagas",
            "body": "Ambiente de carreira da Silcar Pneus.",
        },
        "https://silcarpneus.gupy.io/",
        "Araraquara",
    )

    assert score == -100


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
                        "instagramUrl": "https://instagram.com/barbeariaestilo",
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


def test_search_with_preferred_instagram_keeps_card_without_instagram(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://oficinarica.example.com")]

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://oficinarica.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Oficina Rica",
                    "phone": "(19) 98888-0004",
                    "phoneDigits": "19988880004",
                    "rating": 4.8,
                    "reviews": 123,
                    "address": "Campinas SP",
                    "website": "https://oficinarica.example.com",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://oficinarica.example.com",
                }
            ],
            "Oficina Rica Campinas telefone",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)
    monkeypatch.setattr(SearchService, "guessed_social_url_for_contact", lambda *args, **kwargs: (None, 0))
    monkeypatch.setattr(SearchService, "search_social_profile_url", lambda *args, **kwargs: (None, 0))

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Campinas",
                state="SP",
                segment="oficina",
                targetType="pj",
                limit=10,
                fresh=True,
                preferredChannels=["instagram"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].name == "Oficina Rica"
    assert response.results[0].instagramUrl is None
    assert response.social["enrichmentRan"] is True
    assert response.stats["missingRequiredChannel"] == 0


def test_search_keeps_social_only_card_without_phone(monkeypatch) -> None:
    html = """
    <html>
      <head><title>Oficina Social Campinas</title></head>
      <body>
        <h1>Oficina Social Campinas</h1>
        <a href="https://instagram.com/oficinasocialcampinas">Instagram</a>
      </body>
    </html>
    """

    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html=html, url="https://oficinasocial.example.com")]

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://oficinasocial.example.com"])
    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Campinas",
                state="SP",
                segment="oficina",
                targetType="pj",
                limit=10,
                fresh=True,
                preferredChannels=["instagram"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].phone == ""
    assert response.results[0].phoneDigits == ""
    assert response.results[0].instagramUrl == "https://instagram.com/oficinasocialcampinas"
    assert response.results[0].website == "https://oficinasocial.example.com"
    assert response.stats["invalidPhone"] == 0


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
    assert response.social["enrichmentRan"] is False
    assert response.stats["missingRequiredChannel"] == 0


def test_search_service_enriches_top_pj_contacts_when_social_is_preferred(monkeypatch) -> None:
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
                        "instagramUrl": "https://instagram.com/barbeariaestilo",
                        "facebookUrl": "https://facebook.com/barbeariaestilo",
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
                preferredChannels=["instagram", "facebook"],
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


def test_required_instagram_does_not_discard_contact_missing_social(monkeypatch) -> None:
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
                        "facebookUrl": "https://facebook.com/barbeariaestilo",
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
    assert response.results[0].name == "Barbearia Estilo"
    assert response.results[0].facebookUrl == "https://facebook.com/barbeariaestilo"
    assert response.stats["missingRequiredChannel"] == 0
    assert response.social["missingRequiredChannel"] == 0


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


def test_lead_plus_enrichment_finds_social_and_confirms_email(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="Fale conosco: atendimento@barbeariaestilo.com.br", url="https://barbeariaestilo.com.br/contato")]

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

    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr(SearchService, "guessed_social_url_for_contact", lambda *args, **kwargs: (None, 0))

    response = asyncio.run(
        SearchService().enrich_lead(
            EnrichLeadRequest(
                name="Barbearia Estilo",
                phone="(16) 99999-9999",
                phoneDigits="16999999999",
                city="Araraquara",
                state="SP",
                segment="barbearia",
                website="https://barbeariaestilo.com.br",
            )
        )
    )

    assert response.instagramUrl == "https://instagram.com/barbeariaestilo"
    assert response.facebookUrl == "https://facebook.com/barbeariaestilo"
    assert response.email == "atendimento@barbeariaestilo.com.br"
    assert response.emailStatus == "confirmed"
    assert response.socialStatus == "found"


def test_identity_search_finds_confraria_social_without_phone_in_snippet(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return []

    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            if "facebook.com" in query:
                return [
                    {
                        "href": "https://facebook.com/confrariachoperiaelounge",
                        "title": "Confraria - Choperia e Lounge | Rio Claro SP",
                        "body": "Bar e restaurante em Rio Claro. Choperia, lounge e porções.",
                    }
                ]
            if "instagram.com" in query:
                return [
                    {
                        "href": "https://instagram.com/confrariachoperia",
                        "title": "Confraria Choperia e Lounge Rio Claro",
                        "body": "Bar restaurante e choperia em Rio Claro SP.",
                    }
                ]
            return []

    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)

    response = asyncio.run(
        SearchService().enrich_lead(
            EnrichLeadRequest(
                name="Confraria - Choperia e Lounge",
                phone="19981288136",
                phoneDigits="19981288136",
                city="Rio Claro",
                state="SP",
                segment="bar/restaurante",
                requiredChannels=["facebook"],
            )
        )
    )

    assert response.facebookUrl == "https://facebook.com/confrariachoperiaelounge"
    assert response.socialConfidence >= 55
    assert response.stats["social"]["matches"][0]["status"] in {"confirmed", "probable"}
    assert response.stats["social"]["matches"][0]["score"] >= 55


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
    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: [])

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
    assert response.results[0].phone == ""
    assert response.results[0].phoneDigits == ""
    assert response.results[0].instagramUrl == "https://instagram.com/farmaciasocial"
    assert response.stats["socialProfilesPromoted"] == 1


def test_required_instagram_promotes_valid_social_profile_and_skips_generic(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.search_service.discover_social_profiles",
        lambda *args, **kwargs: [
            {
                "url": "https://instagram.com/dtopskiy",
                "channel": "instagram",
                "title": "Link to instagram.com",
                "snippet": "",
                "query": "site:instagram.com farmacia São Paulo",
            },
            {
                "url": "https://instagram.com/drogariasaopaulo",
                "channel": "instagram",
                "title": "Drogaria São Paulo (@drogariasaopaulo) • Instagram",
                "snippet": "Farmácia em São Paulo",
                "query": "site:instagram.com farmacia São Paulo",
            },
        ],
    )
    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: [])

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
    assert response.results[0].instagramUrl == "https://instagram.com/drogariasaopaulo"
    assert response.stats["socialProfilesPromoted"] == 1


def test_social_first_name_uses_slug_when_title_is_generic() -> None:
    service = SearchService()
    name = service.social_profile_name(
        {
            "url": "https://facebook.com/Farmácia-são-Paulo-106481897893596",
            "title": "Link to facebook.com",
        },
        "São Paulo",
        "farmacia",
    )

    assert name == "Farmácia São Paulo"


def test_social_first_response_preserves_social_url() -> None:
    service = SearchService()

    response = service.build_social_first_response(
        SearchRequest(
            city="Rio Claro",
            state="SP",
            segment="restaurante",
            targetType="pj",
            limit=1,
            requiredChannels=["facebook"],
        ),
        [
            {
                "name": "Confraria Choperia",
                "phone": "",
                "phoneDigits": "",
                "address": "Rio Claro SP",
                "facebookUrl": "https://facebook.com/confrariachoperia",
                "source": "hbx_scraping:social_discovery",
                "score": 70,
            }
        ],
        {"profilesDiscovered": 1, "profilesUnmatched": 0},
    )

    assert response.results[0].facebookUrl == "https://facebook.com/confrariachoperia"
    assert response.results[0].score == 70


def test_identity_search_accepts_hidden_facebook_result_with_handle_and_query(monkeypatch) -> None:
    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            if 'site:facebook.com "confraria" "Rio Claro"' in query:
                return [
                    {
                        "href": "https://www.facebook.com/confrariarc/",
                        "title": "Link to facebook.com",
                        "body": "The site owner hides the web page description.",
                    }
                ]
            return []

    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)

    response = asyncio.run(
        SearchService().enrich_lead(
            EnrichLeadRequest(
                name="Confraria - Choperia e Lounge",
                phone="19981288136",
                phoneDigits="19981288136",
                city="Rio Claro",
                state="SP",
                segment="bar/restaurante",
                preferredChannels=["instagram", "facebook"],
                requiredChannels=["facebook"],
            )
        )
    )

    assert response.facebookUrl == "https://facebook.com/confrariarc"
    assert response.socialConfidence >= 55
    social = response.stats["social"]
    assert social["matches"][0]["status"] in {"confirmed", "probable"}


def test_identity_search_rejects_hidden_facebook_without_city_handle(monkeypatch) -> None:
    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            if 'site:facebook.com "famiglia" "São Paulo"' in query:
                return [
                    {
                        "href": "https://www.facebook.com/restaurantelafamiglia449/",
                        "title": "Link to facebook.com",
                        "body": "The site owner hides the web page description.",
                    }
                ]
            return []

    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)

    response = asyncio.run(
        SearchService().enrich_lead(
            EnrichLeadRequest(
                name="Famiglia Mancini",
                phone="",
                phoneDigits="",
                city="São Paulo",
                state="SP",
                segment="restaurante italiano",
                preferredChannels=["facebook"],
                requiredChannels=["facebook"],
            )
        )
    )

    assert response.facebookUrl is None
    assert response.stats["social"]["missingRequiredChannel"] == 1


def test_identity_search_rejects_generic_pneus_profile_for_silcar() -> None:
    service = SearchService()
    contact = {
        "name": "Silcar Pneus Ltda",
        "phone": "(17) 3202-3332",
        "phoneDigits": "1732023332",
        "segment": "borracharias",
        "score": 70,
    }

    wrong_score = service.score_social_candidate(
        contact,
        {
            "href": "https://facebook.com/dfpneusararaquarasp",
            "title": "DF Pneus Araraquara SP",
            "body": "Pneus e borracharia em Araraquara.",
        },
        "https://facebook.com/dfpneusararaquarasp",
        "facebook",
        "Araraquara",
        "borracharias",
        'site:facebook.com "pneus" "Araraquara"',
    )
    right_score = service.score_social_candidate(
        contact,
        {
            "href": "https://instagram.com/silcarpneusoficial",
            "title": "Instagram",
            "body": "The site owner hides the web page description.",
        },
        "https://instagram.com/silcarpneusoficial",
        "instagram",
        "Araraquara",
        "borracharias",
        "site:instagram.com silcarpneusoficial",
    )

    assert wrong_score == -100
    assert right_score >= 70


def test_silcar_queries_try_official_handle_variants() -> None:
    service = SearchService()
    handles = service.business_social_handle_candidates("Silcar Pneus Ltda")
    queries = service.social_queries_for_contact(
        {"name": "Silcar Pneus Ltda", "phone": "(17) 3202-3332", "phoneDigits": "1732023332"},
        "Araraquara",
        "borracharias",
        "instagram",
    )

    assert "silcarpneusoficial" in handles
    assert "site:instagram.com silcarpneusoficial" in queries


def test_validated_handle_guess_accepts_official_business_handle_without_city(monkeypatch) -> None:
    class FakeResponse:
        status_code = 200
        text = "Silcar Pneus Oficial @silcarpneusoficial pneus e borracharia"

    monkeypatch.setattr("app.services.search_service.httpx.get", lambda *args, **kwargs: FakeResponse())
    service = SearchService()

    url, score = service.validate_guessed_social_url(
        {
            "name": "Silcar Pneus Ltda",
            "phone": "(17) 3202-3332",
            "phoneDigits": "1732023332",
            "segment": "borracharias",
        },
        "instagram",
        "silcarpneusoficial",
        "Araraquara",
    )

    assert url == "https://instagram.com/silcarpneusoficial"
    assert score >= 70


def test_validated_handle_guess_does_not_guess_facebook_urls() -> None:
    service = SearchService()

    url, score = service.guessed_social_url_for_contact(
        {
            "name": "Silcar Pneus Ltda",
            "phone": "(17) 3202-3332",
            "phoneDigits": "1732023332",
            "segment": "borracharias",
        },
        "facebook",
        "Araraquara",
    )

    assert url is None
    assert score == 0


def test_validated_handle_guess_accepts_city_matched_non_official_handle(monkeypatch) -> None:
    class FakeResponse:
        status_code = 200
        text = "Pizzaria do Roberto Rio Claro SP @pizzariadoroberto pizzaria restaurante"

    monkeypatch.setattr("app.services.search_service.httpx.get", lambda *args, **kwargs: FakeResponse())
    service = SearchService()

    url, score = service.validate_guessed_social_url(
        {
            "name": "PIZZARIA E CHOPERIA ROBERTO DE MORAES",
            "phone": "(19) 99836-8311",
            "phoneDigits": "19998368311",
            "segment": "pizzarias restaurantes",
        },
        "instagram",
        "pizzariadoroberto",
        "Rio Claro",
    )

    assert url == "https://instagram.com/pizzariadoroberto"
    assert score >= 70


def test_identity_search_rejects_weak_short_social_identity() -> None:
    service = SearchService()
    contact = {
        "name": "DUO estética e design de sobrancelha",
        "phone": "(13) 99770-6950",
        "phoneDigits": "13997706950",
        "segment": "estética sobrancelha",
        "score": 70,
    }

    score = service.score_social_candidate(
        contact,
        {
            "href": "https://facebook.com/mikesantosduo",
            "title": "Mike Santos Duo",
            "body": "Perfil pessoal em Santos.",
        },
        "https://facebook.com/mikesantosduo",
        "facebook",
        "Santos",
        "estética sobrancelha",
        'site:facebook.com "duo" "Santos"',
    )

    assert score == -100


def test_identity_search_rejects_low_confidence_required_social_candidate(monkeypatch) -> None:
    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            if 'site:instagram.com "oficina" "Campinas"' in query:
                return [
                    {
                        "href": "https://instagram.com/oficina_de_brindes_campinas",
                        "title": "Oficina de Brindes Campinas",
                        "body": "Brindes personalizados em Campinas.",
                    }
                ]
            return []

    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)
    monkeypatch.setattr(SearchService, "guessed_social_url_for_contact", lambda *args, **kwargs: (None, 0))

    response = asyncio.run(
        SearchService().enrich_lead(
            EnrichLeadRequest(
                name="Oficina Brasil",
                phone="",
                phoneDigits="",
                city="Campinas",
                state="SP",
                segment="oficina auto center",
                preferredChannels=["instagram"],
                requiredChannels=["instagram"],
            )
        )
    )

    assert response.instagramUrl is None
    assert response.stats["social"]["missingRequiredChannel"] == 1


def test_required_social_does_not_accept_guessed_official_handle(monkeypatch) -> None:
    monkeypatch.setattr(SearchService, "search_social_profile_candidates", lambda *args, **kwargs: [])

    response = asyncio.run(
        SearchService().enrich_lead(
            EnrichLeadRequest(
                name="Silcar Pneus Ltda",
                phone="(17) 3202-3332",
                phoneDigits="1732023332",
                city="Araraquara",
                state="SP",
                segment="borracharias",
                preferredChannels=["instagram"],
                requiredChannels=["instagram"],
            )
        )
    )

    assert response.instagramUrl is None
    assert response.socialConfidence == 0
    assert response.stats["social"]["missingRequiredChannel"] == 1


def test_validated_handle_guess_rejects_weak_official_handle_without_city(monkeypatch) -> None:
    class FakeResponse:
        status_code = 200
        text = "Barbearia Estilo Oficial @barbeariaestilooficial cortes masculinos"

    monkeypatch.setattr("app.services.search_service.httpx.get", lambda *args, **kwargs: FakeResponse())
    service = SearchService()

    url, score = service.validate_guessed_social_url(
        {
            "name": "Barbearia Estilo",
            "phone": "(16) 99999-9999",
            "phoneDigits": "16999999999",
            "segment": "barbearia",
        },
        "instagram",
        "barbeariaestilooficial",
        "Araraquara",
    )

    assert url is None
    assert score == 0


def test_required_social_keeps_trying_preferred_second_channel(monkeypatch) -> None:
    class FakeDDGS:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def text(self, query, **kwargs):
            if query.startswith('site:facebook.com "confraria"'):
                return [
                    {
                        "href": "https://www.facebook.com/confrariarc/",
                        "title": "Link to facebook.com",
                        "body": "The site owner hides the web page description.",
                    }
                ]
            if query.startswith('site:instagram.com "confraria"'):
                return [
                    {
                        "href": "https://www.instagram.com/confrariarc/",
                        "title": "Confraria Rio Claro (@confrariarc) Instagram",
                        "body": "Choperia e restaurante em Rio Claro SP.",
                    }
                ]
            return []

    monkeypatch.setattr("app.services.search_service.DDGS", FakeDDGS)

    response = asyncio.run(
        SearchService().enrich_lead(
            EnrichLeadRequest(
                name="Confraria - Choperia e Lounge",
                phone="19981288136",
                phoneDigits="19981288136",
                city="Rio Claro",
                state="SP",
                segment="bar/restaurante",
                preferredChannels=["instagram", "facebook"],
                requiredChannels=["facebook"],
            )
        )
    )

    assert response.facebookUrl == "https://facebook.com/confrariarc"
    assert response.instagramUrl == "https://instagram.com/confrariarc"
    assert response.socialStatus == "found"


def test_required_instagram_and_facebook_does_not_reject_when_one_channel_exists(monkeypatch) -> None:
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
                        "facebookUrl": "https://facebook.com/barbeariaestilo",
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

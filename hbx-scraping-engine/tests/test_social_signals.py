import asyncio
from types import SimpleNamespace

from app.schemas import SearchRequest
from app.services.discovery import _is_allowed_url, discover_urls
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


def test_invalid_social_urls_are_rejected() -> None:
    assert normalize_social_url("https://instagram.com/oficina?utm_source=x") == "https://instagram.com/oficina"
    assert not is_valid_social_profile_url("https://instagram.com/oficina/reel/123")
    assert not is_valid_social_profile_url("https://instagram.com/p/abc")
    assert not is_valid_social_profile_url("https://instagram.com/stories/oficina/123")
    assert not is_valid_social_profile_url("https://facebook.com/sharer/sharer.php?u=https://x.test")


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


def test_required_instagram_and_facebook_accepts_at_least_one_social(monkeypatch) -> None:
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

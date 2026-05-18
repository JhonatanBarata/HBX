import asyncio
from types import SimpleNamespace

from app.schemas import SearchRequest
from app.services.discovery import _is_allowed_url, discover_urls
from app.services.filters import is_blocked_lead_source_domain, is_social_signal_domain
from app.services.search_service import SearchService


def test_instagram_is_social_signal_not_blocked_lead_source() -> None:
    assert is_social_signal_domain("https://instagram.com/oficina")
    assert not is_blocked_lead_source_domain("https://instagram.com/oficina")
    assert is_blocked_lead_source_domain("https://youtube.com/watch?v=1")


def test_discovery_required_instagram_does_not_use_social_as_primary_source(monkeypatch) -> None:
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
    assert "https://instagram.com/oficina_araraquara" not in urls
    assert all("/reel/" not in url and "/p/" not in url for url in urls)
    assert not _is_allowed_url("https://instagram.com/oficina/reel/123", required_channels=["instagram"])
    assert not _is_allowed_url("https://instagram.com/p/abc", required_channels=["instagram"])


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
                {"href": "https://instagram.com/barbeariaestilo"},
                {"href": "https://instagram.com/barbeariaestilo/reel/123"},
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

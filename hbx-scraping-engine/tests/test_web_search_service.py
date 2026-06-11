import asyncio

import pytest

from app.schemas import WebSearchRequest, WebSearchResult
from app.services.web_search_service import WebSearchService, normalize_web_query


def test_normalize_web_query() -> None:
    assert normalize_web_query("  Schio Imóveis   Rio Claro SP ") == "schio imoveis rio claro sp"


def test_request_rejects_empty_query() -> None:
    with pytest.raises(ValueError):
        WebSearchRequest(query="   ")


def test_web_search_clamps_limit_and_caches(tmp_path) -> None:
    calls = {"count": 0}
    service = WebSearchService(cache_path=tmp_path / "cache.json")
    service.max_results = 3

    def collect(query, limit, fetched_at, errors):
        calls["count"] += 1
        return [
            WebSearchResult(
                title=f"Resultado {index}",
                url=f"https://example.com/{index}",
                snippet="",
                rank=index,
                source="test",
                fetchedAt=fetched_at,
            )
            for index in range(1, limit + 1)
        ]

    service.collect_results = collect
    first = asyncio.run(service.search(WebSearchRequest(query="teste rio claro", limit=10)))
    second = asyncio.run(service.search(WebSearchRequest(query="teste rio claro", limit=3)))

    assert first.count == 3
    assert first.cached is False
    assert second.cached is True
    assert second.count == 3
    assert calls["count"] == 1


def test_web_search_empty_response_does_not_break(tmp_path) -> None:
    service = WebSearchService(cache_path=tmp_path / "cache.json")
    service.collect_results = lambda query, limit, fetched_at, errors: []

    response = asyncio.run(service.search(WebSearchRequest(query="sem resultado", limit=5, fresh=True)))

    assert response.count == 0
    assert response.results == []
    assert response.cached is False


def test_searxng_provider_parses_json_results(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("HBX_SEARXNG_URL", "http://127.0.0.1:8888/")
    service = WebSearchService(cache_path=tmp_path / "cache.json")
    assert service.searxng_url == "http://127.0.0.1:8888"

    service._http_get_json = lambda url, params=None: {
        "results": [
            {"url": "https://pizzariabellamassa.com.br/contato", "title": "Pizzaria Bella Massa", "content": "Telefone e WhatsApp"},
            {"url": "https://www.google.com/maps/place/x", "title": "Bloqueado", "content": ""},
        ]
    }
    rows = service._search_searxng("pizzaria rio claro", 5, "2026-06-11T00:00:00+00:00")

    assert len(rows) == 1
    assert rows[0].source == "searxng"
    assert rows[0].url == "https://pizzariabellamassa.com.br/contato"


def test_searxng_disabled_without_env(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("HBX_SEARXNG_URL", raising=False)
    service = WebSearchService(cache_path=tmp_path / "cache.json")
    assert service.searxng_url == ""


def test_candidate_ranking_prefers_query_identity(tmp_path) -> None:
    service = WebSearchService(cache_path=tmp_path / "cache.json")
    weak = WebSearchResult(
        title="Schio - Wikipedia",
        url="https://en.wikipedia.org/wiki/Schio",
        snippet="Cidade italiana",
        rank=1,
        source="duckduckgo",
        fetchedAt="2026-06-01T00:00:00+00:00",
    )
    strong = WebSearchResult(
        title="SCHIO CORRETORES DE IMOVEIS em Rio Claro - Guia ideal",
        url="https://guiaideal.com.br/rio-claro/assinante/15903",
        snippet="Schio corretores de imóveis - Rio Claro SP",
        rank=2,
        source="bing",
        fetchedAt="2026-06-01T00:00:00+00:00",
    )

    assert service._candidate_score("Schio Corretores De Imoveis Ltda Rio Claro SP", strong) > service._candidate_score(
        "Schio Corretores De Imoveis Ltda Rio Claro SP",
        weak,
    )

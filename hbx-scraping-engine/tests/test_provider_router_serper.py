import asyncio
import json

import httpx
import pytest

from app.schemas import EnrichLeadRequest
from app.search.enrichment.provider_router import LeadEnrichmentProviderRouter


def serper_provider(router: LeadEnrichmentProviderRouter):
    return next(item for item in router.providers if item.name == "SerperProvider")


def build_request() -> EnrichLeadRequest:
    return EnrichLeadRequest(
        name="Pizzaria Bella Massa",
        phone="(19) 99888-7766",
        phoneDigits="19998887766",
        city="Rio Claro",
        state="SP",
        segment="pizzaria",
        preferredChannels=["instagram"],
    )


def test_search_serper_without_key_returns_empty(monkeypatch) -> None:
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    router = LeadEnrichmentProviderRouter()
    results = asyncio.run(router.search_serper(build_request(), serper_provider(router)))
    assert results == []


def test_search_serper_parses_and_classifies_organic_results(monkeypatch) -> None:
    monkeypatch.setenv("SERPER_API_KEY", "test-key")
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured.setdefault("bodies", []).append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(200, json={
            "organic": [
                {
                    "link": "https://www.instagram.com/pizzariabellamassa/",
                    "title": "Pizzaria Bella Massa Rio Claro (@pizzariabellamassa)",
                    "snippet": "Pizzaria Bella Massa em Rio Claro SP - pedidos 19 99888-7766",
                },
                {
                    "link": "https://www.bing.com/search?q=ignorar",
                    "title": "Resultado de buscador",
                    "snippet": "",
                },
            ],
        })

    transport = httpx.MockTransport(handler)

    async def run() -> list[dict]:
        router = LeadEnrichmentProviderRouter()
        async with httpx.AsyncClient(transport=transport) as client:
            return await router.search_serper(build_request(), serper_provider(router), client=client)

    results = asyncio.run(run())

    assert captured["url"] == "https://google.serper.dev/search"
    assert captured["headers"].get("x-api-key") == "test-key"
    assert all(body.get("gl") == "br" for body in captured["bodies"])
    instagram = [item for item in results if item.get("channel") == "instagram"]
    assert instagram, results
    assert "instagram.com/pizzariabellamassa" in instagram[0]["url"]
    assert instagram[0]["score"] >= 35


def test_serper_provider_enabled_only_with_key(monkeypatch) -> None:
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    assert serper_provider(LeadEnrichmentProviderRouter()).enabled is False
    monkeypatch.setenv("SERPER_API_KEY", "test-key")
    assert serper_provider(LeadEnrichmentProviderRouter()).enabled is True


def test_search_serper_ignores_http_errors(monkeypatch) -> None:
    monkeypatch.setenv("SERPER_API_KEY", "test-key")
    transport = httpx.MockTransport(lambda request: httpx.Response(429, json={"message": "rate limited"}))

    async def run() -> list[dict]:
        router = LeadEnrichmentProviderRouter()
        async with httpx.AsyncClient(transport=transport) as client:
            return await router.search_serper(build_request(), serper_provider(router), client=client)

    assert asyncio.run(run()) == []

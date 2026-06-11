import asyncio

import httpx

from app.services.fetcher import Fetcher


def run_fetch(handler, attempts: int) -> list:
    fetcher = Fetcher("test-agent", 4, 2, 100_000, attempts=attempts)
    transport = httpx.MockTransport(handler)

    async def run():
        async with httpx.AsyncClient(transport=transport, follow_redirects=True) as client:
            return await fetcher._get(client, "https://example.com/")

    return asyncio.run(run())


def test_fetcher_retries_retryable_status_then_succeeds() -> None:
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] == 1:
            return httpx.Response(503, text="instavel")
        return httpx.Response(200, html="<html><body>ok</body></html>")

    page = run_fetch(handler, attempts=2)
    assert calls["count"] == 2
    assert page is not None
    assert "ok" in page.html


def test_fetcher_single_attempt_does_not_retry() -> None:
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        return httpx.Response(503, text="instavel")

    page = run_fetch(handler, attempts=1)
    assert calls["count"] == 1
    assert page is None


def test_fetcher_retries_transport_error_then_succeeds() -> None:
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] == 1:
            raise httpx.ConnectError("conexao recusada", request=request)
        return httpx.Response(200, html="<html><body>ok</body></html>")

    page = run_fetch(handler, attempts=2)
    assert calls["count"] == 2
    assert page is not None


def test_fetcher_clamps_attempts_from_env(monkeypatch) -> None:
    monkeypatch.setenv("HBX_SCRAPING_FETCH_ATTEMPTS", "99")
    assert Fetcher("ua", 4, 1, 1000).attempts == 4
    monkeypatch.setenv("HBX_SCRAPING_FETCH_ATTEMPTS", "abc")
    assert Fetcher("ua", 4, 1, 1000).attempts == 2

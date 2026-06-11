import time

from app.services.discovery import discovery_budget, search_searxng_rows


def test_discovery_budget_default_when_env_missing(monkeypatch) -> None:
    monkeypatch.delenv("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", raising=False)
    assert discovery_budget("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", 8) == 8


def test_discovery_budget_env_override(monkeypatch) -> None:
    monkeypatch.setenv("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", "120")
    assert discovery_budget("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", 8) == 120


def test_discovery_budget_clamps_and_ignores_invalid(monkeypatch) -> None:
    monkeypatch.setenv("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", "999999")
    assert discovery_budget("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", 8) == 900
    monkeypatch.setenv("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", "abc")
    assert discovery_budget("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", 8) == 8


def test_search_searxng_rows_disabled_without_env(monkeypatch) -> None:
    monkeypatch.delenv("HBX_SEARXNG_URL", raising=False)
    assert search_searxng_rows("pizzaria rio claro", time.monotonic() + 5) is None

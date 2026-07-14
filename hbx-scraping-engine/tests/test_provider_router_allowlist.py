from app.search.enrichment.provider_router import LeadEnrichmentProviderRouter


def test_router_never_registers_removed_paid_providers(monkeypatch) -> None:
    for key in (
        "SERPER_API_KEY",
        "SCRAPINGDOG_API_KEY",
        "TAVILY_API_KEY",
        "EXA_API_KEY",
        "FIRECRAWL_API_KEY",
        "SERPAPI_KEY",
    ):
        monkeypatch.setenv(key, "must-not-enable-provider")
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "allowed-provider")

    names = {provider.name for provider in LeadEnrichmentProviderRouter().providers}

    assert names == {
        "LocalCacheProvider",
        "HbxDatabaseProvider",
        "HbxEngineProvider",
        "DuckDuckGoProvider",
        "BraveSearchProvider",
    }


def test_brave_is_the_only_external_keyed_search_provider(monkeypatch) -> None:
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "allowed-provider")
    keyed = [
        provider.name
        for provider in LeadEnrichmentProviderRouter().providers
        if provider.requiresApiKey
    ]

    assert keyed == ["BraveSearchProvider"]

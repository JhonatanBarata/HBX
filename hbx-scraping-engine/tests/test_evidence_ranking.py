from app.schemas import SearchIntent, SearchRequest
from app.search.rank import EvidenceScorer
from app.services.discovery import build_commercial_fit_discovery_queries


def test_search_intent_preserves_contract_and_sales_profile() -> None:
    request = SearchRequest(
        city="Rio Claro",
        state="SP",
        radiusKm=25,
        originLat=-22.4,
        originLng=-47.5,
        segments=["pizzaria", "restaurante"],
        targetType="pj",
        quantity=12,
        preferredChannels=["instagram"],
        requiredChannels=["site"],
        channelMatchMode="any_required",
        qualityMode="lead_plus",
        freshness="live",
        whatDoYouSell="plano de saúde",
        targetAudience={"labels": ["idosos", "60+"]},
    )

    intent = SearchIntent.from_request(request)

    assert intent.quantity == 12
    assert intent.segments == ["pizzaria", "restaurante"]
    assert intent.preferredChannels == ["instagram"]
    assert intent.requiredChannels == ["website"]
    assert intent.channelMatchMode == "any_required"
    assert intent.salesProfile["whatDoYouSell"] == "plano de saúde"
    assert intent.salesProfile["targetAudience"]["labels"] == ["idosos", "60+"]


def test_required_channels_any_required_accepts_only_matching_channel() -> None:
    request = SearchRequest(
        city="Campinas",
        state="SP",
        segment="oficina",
        requiredChannels=["instagram"],
        channelMatchMode="any_required",
    )

    from app.services.search_service import SearchService

    service = SearchService()
    assert service.matches_channel_intent({"name": "Oficina A", "instagramUrl": "https://instagram.com/oficinaa"}, request)
    assert not service.matches_channel_intent({"name": "Oficina B", "website": "https://oficinab.com.br"}, request)


def test_preferred_instagram_increases_score_without_cutting() -> None:
    scorer = EvidenceScorer()
    base = {
        "name": "Pizzaria Roberto",
        "phoneDigits": "19999999999",
        "address": "Rio Claro SP",
        "website": "https://pizzariaroberto.com.br",
    }
    no_preference = SearchIntent(city="Rio Claro", state="SP", segments=["pizzaria"], preferredChannels=[])
    prefer_instagram = SearchIntent(city="Rio Claro", state="SP", segments=["pizzaria"], preferredChannels=["instagram"])

    without_instagram = scorer.score(base, prefer_instagram, "pizzaria Rio Claro")
    with_instagram = scorer.score({**base, "instagramUrl": "https://instagram.com/pizzariaroberto"}, prefer_instagram, "pizzaria Rio Claro")
    neutral = scorer.score(base, no_preference, "pizzaria Rio Claro")

    assert without_instagram.finalScore >= neutral.finalScore
    assert with_instagram.finalScore > without_instagram.finalScore


def test_commercial_fit_boosts_senior_health_targets_and_hard_rejects() -> None:
    scorer = EvidenceScorer()
    intent = SearchIntent(
        city="Americana",
        state="SP",
        segments=["serviços"],
        salesProfile={
            "whatDoYouSell": "plano de saúde",
            "targetAudience": ["idosos", "60+", "aposentados"],
            "hardRejectSegments": ["balada"],
        },
    )

    clinic = scorer.score(
        {"name": "Clínica Geriátrica Vida", "phoneDigits": "19999999999", "address": "Americana SP"},
        intent,
        "geriatria fisioterapia idosos Americana",
    )
    nightclub = scorer.score(
        {"name": "Balada Neon", "phoneDigits": "19999999999", "address": "Americana SP"},
        intent,
        "balada eventos noturnos",
    )

    assert clinic.commercialFitScore >= 80
    assert "Combina com seu público-alvo: idosos / plano de saúde." in clinic.reasons
    assert nightclub.finalScore == 0
    assert "commercial_hard_reject" in nightclub.penalties


def test_senior_health_profile_generates_compatible_discovery_queries() -> None:
    intent = SearchIntent(
        city="Americana",
        state="SP",
        segments=["serviços"],
        salesProfile={
            "whatDoYouSell": "plano de saúde",
            "targetAudience": ["idosos", "60+", "aposentados"],
        },
    )

    queries = build_commercial_fit_discovery_queries("serviços", "Americana", "SP", intent)
    joined = "\n".join(queries).lower()

    assert "clínicas geriátricas americana sp telefone" in joined
    assert "cuidadores de idosos americana sp contato" in joined
    assert "farmácias americana sp site oficial" in joined
    assert "associações terceira idade americana sp telefone" in joined


def test_generic_directory_does_not_rank_above_official_site_or_social() -> None:
    scorer = EvidenceScorer()
    intent = SearchIntent(city="Americana", state="SP", segments=["oficina"])
    official = scorer.score(
        {
            "name": "Oficina Central",
            "phoneDigits": "19999999999",
            "website": "https://oficinacentral.com.br",
            "_pageUrl": "https://oficinacentral.com.br",
            "address": "Americana SP",
        },
        intent,
        "Oficina Central Americana SP contato",
    )
    social = scorer.score(
        {
            "name": "Oficina Central",
            "instagramUrl": "https://instagram.com/oficinacentralamericana",
            "_pageUrl": "https://instagram.com/oficinacentralamericana",
            "address": "Americana SP",
        },
        intent,
        "Oficina Central Americana SP",
    )
    directory = scorer.score(
        {
            "name": "Oficinas mecânicas em Americana",
            "_pageUrl": "https://www.guiamais.com.br/busca/oficina/americana-sp",
            "address": "Americana SP",
        },
        intent,
        "Lista de oficinas mecanicas em Americana",
    )

    assert official.finalScore > directory.finalScore
    assert social.finalScore > directory.finalScore
    assert "generic_directory_source" in directory.penalties


def test_source_metrics_is_returned_by_search(monkeypatch) -> None:
    import asyncio
    from types import SimpleNamespace

    from app.services.search_service import SearchService

    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://pizzariaoficial.com.br")]

    monkeypatch.setattr("app.services.search_service.discover_social_profiles", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://pizzariaoficial.com.br"])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Pizzaria Oficial",
                    "phone": "(19) 99999-9999",
                    "phoneDigits": "19999999999",
                    "address": "Rio Claro SP",
                    "website": "https://pizzariaoficial.com.br",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://pizzariaoficial.com.br",
                }
            ],
            "Pizzaria Oficial Rio Claro SP telefone site oficial",
        ),
    )

    response = asyncio.run(
        SearchService().search(
            SearchRequest(city="Rio Claro", state="SP", segment="pizzaria", targetType="pj", limit=5, fresh=True)
        )
    )

    assert response.count == 1
    assert response.stats["sourceMetrics"][0]["approved"] == 1
    assert response.stats["sourceMetrics"][0]["approvalRate"] == 1

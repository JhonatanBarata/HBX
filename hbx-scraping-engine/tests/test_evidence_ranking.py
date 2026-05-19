from app.schemas import SearchIntent, SearchRequest
from app.search.rank import EvidenceScorer


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

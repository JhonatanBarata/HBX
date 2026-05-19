import asyncio

from scripts.radar_intent_smoke import SCENARIOS, run_mock_scenario


def report_by_name() -> dict[str, dict]:
    return {scenario["name"]: asyncio.run(run_mock_scenario(scenario)) for scenario in SCENARIOS}


def test_radar_intent_smoke_outputs_required_funnel_fields() -> None:
    reports = report_by_name()

    for report in reports.values():
        assert report["queriesGeradas"]
        assert report["urlsDescobertasPorFonte"]
        assert "paginasBaixadas" in report
        assert "parsed" in report
        assert "approved" in report
        assert "rejected" in report
        assert "missingRequiredChannel" in report
        assert isinstance(report["sourceMetrics"], list)
        assert report["sourceMetrics"]


def test_health_plan_seniors_smoke_has_high_commercial_fit() -> None:
    report = report_by_name()["plano_saude_idosos_rio_claro"]

    assert any("clínicas geriátricas Rio Claro SP" in query for query in report["queriesGeradas"])
    assert report["top10"][0]["commercialFitScore"] >= 80
    assert "idosos / plano de saúde" in report["top10"][0]["qualityReason"]


def test_required_instagram_smoke_affects_discovery_and_approval() -> None:
    report = report_by_name()["pizzarias_instagram_rio_claro"]

    assert any("instagram" in query.lower() for query in report["queriesGeradas"])
    assert report["missingRequiredChannel"] >= 1
    assert report["approved"] == 1
    assert "instagram" in report["top10"][0]["channels"]


def test_required_website_email_smoke_rejects_missing_email() -> None:
    report = report_by_name()["clinicas_website_email_rio_claro"]

    assert any("contato email" in query.lower() for query in report["queriesGeradas"])
    assert report["missingRequiredChannel"] >= 1
    assert report["approved"] == 1
    assert {"website", "email"}.issubset(set(report["top10"][0]["channels"]))


def test_directory_does_not_beat_official_or_social_in_smoke() -> None:
    report = report_by_name()["diretorio_vs_oficial_social"]

    assert report["top10"]
    assert report["top10"][0]["sourceScore"] >= 75
    assert "guiamais.com.br" not in str(report["top10"][0].get("sourceUrl") or "")
    assert report["rejected"] >= 1
    assert report["directorySeedReturnedEarly"] is False


def test_intent_sensitive_does_not_return_directory_seed_early() -> None:
    report = report_by_name()["intent_sensitive_nao_retorna_directory_seed_cedo"]

    assert report["directorySeedReturnedEarly"] is False
    assert report["top10"][0]["sourceUrl"] == "https://clinicavidaoficial.com.br"

import asyncio
from types import SimpleNamespace

from app.schemas import EnrichLeadResponse
from app.search.enrichment.provider_router import LeadEnrichmentProviderRouter
from app.services.fetcher import Fetcher
from app.services.search_service import SearchService


def test_enrich_response_keeps_three_phones_and_emails() -> None:
    response = EnrichLeadResponse(
        name="Empresa Exemplo",
        phone="(11) 99999-0001",
        phoneDigits="11999990001",
        phones=["+55 11 99999-0001", "(11) 3333-0002", "11 98888-0003", "11 97777-0004"],
        email="contato@exemplo.com.br",
        emails=["CONTATO@exemplo.com.br", "vendas@exemplo.com.br", "financeiro@exemplo.com.br", "extra@exemplo.com.br"],
    )

    LeadEnrichmentProviderRouter().finalize_contact_lists(response)

    assert response.phones == ["11999990001", "1133330002", "11988880003"]
    assert response.emails == ["contato@exemplo.com.br", "vendas@exemplo.com.br", "financeiro@exemplo.com.br"]


def test_website_crawl_collects_contact_slots_without_overwriting_primary(monkeypatch) -> None:
    async def fake_fetch_all(_self, _urls):
        return [
            SimpleNamespace(
                html="""
                    <a href="tel:+551133330002">Telefone fixo</a>
                    <a href="https://wa.me/5511988880003">WhatsApp</a>
                    contato@exemplo.com.br vendas@exemplo.com.br financeiro@exemplo.com.br
                """
            )
        ]

    monkeypatch.setattr(Fetcher, "fetch_all", fake_fetch_all)
    service = object.__new__(SearchService)
    service.settings = SimpleNamespace(
        user_agent="HBX test",
        timeout_seconds=2,
        concurrency=1,
        max_page_bytes=100_000,
    )

    email, status, source, _confidence, stats, emails, phones = asyncio.run(
        service.discover_contacts_for_contact({
            "phone": "(11) 99999-0001",
            "phoneDigits": "11999990001",
            "email": "cadastro@exemplo.com.br",
            "website": "https://exemplo.com.br",
        })
    )

    assert email == "cadastro@exemplo.com.br"
    assert status in {"confirmed", "unverified"}
    assert source == "manual"
    assert emails == ["cadastro@exemplo.com.br", "contato@exemplo.com.br", "vendas@exemplo.com.br"]
    assert phones == ["11999990001", "1133330002", "11988880003"]
    assert stats == {"pagesFetched": 1, "emailsFound": 3, "phonesFound": 3}

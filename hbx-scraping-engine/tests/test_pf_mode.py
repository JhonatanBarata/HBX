import asyncio
from types import SimpleNamespace

from app.schemas import SearchRequest
from app.services.discovery import build_queries
from app.services.filters import (
    has_pf_role_text,
    is_generic_name,
    is_pf_weak_domain,
    looks_like_company_or_institution_name,
    looks_like_person_name,
)
from app.services.scoring import score_contact
from app.services.search_service import SearchService


def test_pf_discovery_queries_focus_on_people_roles() -> None:
    queries = build_queries("consultor plano de saude", "Americana", "SP", "pf")

    assert queries[0] == "consultor consultor plano de saude Americana SP telefone"
    assert "corretor consultor plano de saude Americana SP whatsapp" in queries
    assert "vendedor consultor plano de saude Americana SP telefone" in queries
    assert "representante consultor plano de saude Americana SP whatsapp" in queries


def test_pf_scores_mobile_local_person_above_fixed_or_outside_ddd() -> None:
    local_mobile = score_contact(
        {
            "name": "Ricardo Selis",
            "phoneDigits": "19983961337",
            "website": "https://ricardoselis.com",
            "_pageUrl": "https://ricardoselis.com",
        },
        "Americana",
        "SP",
        "consultor plano de saude",
        "consultor plano de saude Americana whatsapp",
        target_type="pf",
    )
    local_fixed = score_contact(
        {
            "name": "Ricardo Selis",
            "phoneDigits": "1934611337",
            "website": "https://ricardoselis.com",
            "_pageUrl": "https://ricardoselis.com",
        },
        "Americana",
        "SP",
        "consultor plano de saude",
        "consultor plano de saude Americana whatsapp",
        target_type="pf",
    )
    outside_mobile = score_contact(
        {
            "name": "Ricardo Selis",
            "phoneDigits": "11983961337",
            "website": "https://ricardoselis.com",
            "_pageUrl": "https://ricardoselis.com",
        },
        "Americana",
        "SP",
        "consultor plano de saude",
        "consultor plano de saude Americana whatsapp",
        target_type="pf",
    )

    assert local_mobile > local_fixed
    assert local_mobile > outside_mobile


def test_pf_penalizes_weak_domains_and_generic_names() -> None:
    assert is_pf_weak_domain("https://exame.com/noticia/plano")
    assert is_pf_weak_domain("https://americana.sp.gov.br/servicos")
    assert is_pf_weak_domain("https://compareplanodesaude.com.br")
    assert is_generic_name("Secretaria Municipal de Saúde", "Americana", "pf", "consultor plano de saude")
    assert is_generic_name("Como funciona o sistema de saúde", "Americana", "pf", "consultor plano de saude")
    assert is_generic_name("Vale a pena contratar plano?", "Americana", "pf", "consultor plano de saude")
    assert is_generic_name("Cupom Petlove Plano de Saúde Americana", "Americana", "pf", "consultor plano de saude")
    assert is_generic_name("Foi demitido? Veja dicas para manter o plano de saúde", "Americana", "pf", "consultor plano de saude")
    assert looks_like_person_name("Ricardo Selis")
    assert not looks_like_person_name("Secretaria Municipal de Saúde")
    assert has_pf_role_text("Consultor de plano de saúde")
    assert not has_pf_role_text("MC Corretora de Seguros")
    assert looks_like_company_or_institution_name("MC Corretora de Seguros")
    assert looks_like_company_or_institution_name("PLANO SAMARITANO AMERICANA")


def test_pf_search_does_not_filter_by_score(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://example.com")]

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://example.com"])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Contato encontrado - Americana",
                    "phone": "(19) 3456-7890",
                    "phoneDigits": "1934567890",
                    "rating": None,
                    "reviews": None,
                    "address": None,
                    "website": None,
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://example.com",
                }
            ],
            "Americana telefone",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 0)

    response = asyncio.run(
        SearchService().search(SearchRequest(city="Americana", state="SP", segment="plano de saude", targetType="pf", limit=10, fresh=True))
    )

    assert response.count == 1
    assert response.results[0].score == 0


def test_pj_search_skips_excluded_phone_digits(monkeypatch) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://example.com")]

    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://example.com"])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Madeireira Antiga",
                    "phone": "(11) 98765-1111",
                    "phoneDigits": "11987651111",
                    "address": "Rua 1",
                    "website": "https://antiga.example.com",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://example.com",
                },
                {
                    "name": "Madeireira Nova",
                    "phone": "(11) 98765-2222",
                    "phoneDigits": "11987652222",
                    "address": "Rua 2",
                    "website": "https://nova.example.com",
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://example.com",
                },
            ],
            "Madeireira telefone contato",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 80)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                segment="Madeireira",
                targetType="pj",
                limit=10,
                fresh=True,
                excludePhoneDigits=["11987651111"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].phoneDigits == "11987652222"
    assert response.results[0].source == "hbx_scraping:free_pj"

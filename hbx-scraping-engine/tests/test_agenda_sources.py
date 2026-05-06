import asyncio
from types import SimpleNamespace

import pytest

from app.schemas import ContactResult, SearchRequest
from app.services.agenda_sources import build_abctelefonos_urls, dedupe_by_phone, parse_abctelefonos_contacts, slugify_city
from app.services.search_service import SearchService


def test_agenda_slugifies_city_and_builds_urls() -> None:
    assert slugify_city("São Paulo") == "sao-paulo"
    urls = build_abctelefonos_urls("Limeira", "SP", 2)

    assert urls[0] == "https://pt.abctelefonos.com/indice_brasil/sp/limeira"
    assert urls[1].endswith("/indice_brasil/sp/limeira/pag_1")
    assert urls[2].endswith("/indice_brasil/sp/limeira/pag_2")


def test_abctelefonos_parser_extracts_contact() -> None:
    html = """
    <html>
      <body>
        <div class="resultado">
          <h2>Maria Oliveira</h2>
          <span>Telefone: (19) 99999-1234</span>
        </div>
        <div class="resultado">
          <strong>João Silva</strong>
          <span>(19) 3456-7890</span>
        </div>
      </body>
    </html>
    """

    contacts = parse_abctelefonos_contacts(html, "https://pt.abctelefonos.com/indice_brasil/sp/limeira/pag_1", "Limeira", "SP")

    assert contacts[0]["name"] == "Maria Oliveira"
    assert contacts[0]["phone"] == "(19) 99999-1234"
    assert contacts[0]["phoneDigits"] == "19999991234"
    assert contacts[0]["source"] == "hbx_agenda:abctelefonos"
    assert contacts[0]["rating"] is None
    assert contacts[0]["reviews"] is None
    assert contacts[0]["address"] is None
    assert contacts[0]["website"] is None


def test_agenda_dedupes_by_phone_digits() -> None:
    contacts = dedupe_by_phone(
        [
            {"name": "Maria", "phone": "(19) 99999-1234", "phoneDigits": "19999991234"},
            {"name": "Maria Outra", "phone": "+55 19 99999-1234", "phoneDigits": "19999991234"},
        ]
    )

    assert len(contacts) == 1


def test_agenda_pf_does_not_filter_by_score(monkeypatch) -> None:
    async def fake_search_abctelefonos(*args, **kwargs):
        return [
            {
                "name": "Contato Baixo Score",
                "phone": "(19) 3456-7890",
                "phoneDigits": "1934567890",
                "rating": None,
                "reviews": None,
                "address": None,
                "website": None,
                "source": "hbx_agenda:abctelefonos",
                "score": 0,
            }
        ]

    monkeypatch.setattr("app.services.search_service.search_abctelefonos", fake_search_abctelefonos)
    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: [])
    response = asyncio.run(SearchService().search(SearchRequest(city="Limeira", state="SP", targetType="agenda_pf", limit=10, fresh=True)))

    assert response.count == 1
    assert response.results[0].score == 0


def test_agenda_pf_skips_excluded_phone_digits(monkeypatch) -> None:
    async def fake_search_abctelefonos(*args, **kwargs):
        return [
            {
                "name": "Contato Antigo",
                "phone": "(19) 3456-7890",
                "phoneDigits": "1934567890",
                "rating": None,
                "reviews": None,
                "address": None,
                "website": None,
                "source": "hbx_agenda:abctelefonos",
                "score": 80,
            },
            {
                "name": "Contato Novo",
                "phone": "(19) 99999-1234",
                "phoneDigits": "19999991234",
                "rating": None,
                "reviews": None,
                "address": None,
                "website": None,
                "source": "hbx_agenda:abctelefonos",
                "score": 70,
            },
        ]

    monkeypatch.setattr("app.services.search_service.search_abctelefonos", fake_search_abctelefonos)

    response = asyncio.run(
        SearchService().search(
            SearchRequest(
                city="Limeira",
                state="SP",
                targetType="agenda_pf",
                limit=2,
                fresh=True,
                excludePhoneDigits=["1934567890"],
            )
        )
    )

    assert response.count == 1
    assert response.results[0].name == "Contato Novo"
    assert response.results[0].phoneDigits == "19999991234"


def test_agenda_pf_falls_back_to_web_when_abc_is_empty(monkeypatch) -> None:
    async def fake_search_abctelefonos(*args, **kwargs):
        return []

    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, urls):
            return [SimpleNamespace(html="<html></html>", url="https://lista.example.com/limeira")]

    monkeypatch.setattr("app.services.search_service.search_abctelefonos", fake_search_abctelefonos)
    monkeypatch.setattr("app.services.search_service.discover_urls", lambda *args, **kwargs: ["https://lista.example.com/limeira"])
    monkeypatch.setattr("app.services.search_service.Fetcher", FakeFetcher)
    monkeypatch.setattr(
        "app.services.search_service.parse_page",
        lambda *args, **kwargs: (
            [
                {
                    "name": "Contato encontrado - Limeira",
                    "phone": "(19) 3456-7890",
                    "phoneDigits": "1934567890",
                    "rating": None,
                    "reviews": None,
                    "address": None,
                    "website": None,
                    "source": "hbx_scraping:web",
                    "_pageUrl": "https://lista.example.com/limeira",
                }
            ],
            "Limeira telefone",
        ),
    )
    monkeypatch.setattr("app.services.search_service.score_contact", lambda *args, **kwargs: 0)

    response = asyncio.run(SearchService().search(SearchRequest(city="Limeira", state="SP", targetType="agenda_pf", limit=10, fresh=True)))

    assert response.count == 1
    assert response.results[0].source == "hbx_agenda:web"
    assert response.results[0].score == 0


def test_agenda_result_forbids_removed_fields() -> None:
    payload = {
        "name": "Maria",
        "phone": "(19) 99999-1234",
        "phoneDigits": "19999991234",
        "rating": None,
        "reviews": None,
        "address": None,
        "website": None,
        "source": "hbx_agenda:abctelefonos",
        "score": 80,
    }
    for field in ("cpf", "cnpj", "document", "probableWhatsApp", "googleMapsUrl"):
        with pytest.raises(ValueError):
            ContactResult.model_validate({**payload, field: "bloqueado"})

import pytest

from app.schemas import ContactResult, SearchRequest


def test_target_type_defaults_to_pj() -> None:
    request = SearchRequest(city="Americana", state="sp", segment="oficina mecanica")

    assert request.targetType == "pj"
    assert request.state == "SP"


def test_pf_allows_limit_up_to_100() -> None:
    request = SearchRequest(city="Americana", state="SP", segment="plano de saúde", targetType="pf", limit=100)

    assert request.limit == 100


def test_agenda_pf_allows_empty_segment() -> None:
    request = SearchRequest(city="Limeira", state="SP", targetType="agenda_pf", limit=50)

    assert request.segment == ""
    assert request.targetType == "agenda_pf"


def test_pj_allows_limit_up_to_100() -> None:
    request = SearchRequest(segment="Madeireira", targetType="pj", limit=100)

    assert request.limit == 100
    assert request.city == ""
    assert request.state == ""


def test_search_request_preserves_preferred_social_channel() -> None:
    request = SearchRequest(city="Campinas", state="SP", segment="oficina", preferredChannels=["instagram"])

    assert request.preferredChannels == ["instagram"]


def test_search_request_normalizes_channel_aliases() -> None:
    request = SearchRequest(
        city="Campinas",
        state="SP",
        segment="oficina",
        preferredChannels=["insta", "fb", "site", "wpp"],
    )

    assert request.preferredChannels == ["instagram", "facebook", "website", "whatsapp"]


def test_contact_result_allows_business_email() -> None:
    result = ContactResult.model_validate({
        "name": "Oficina Rica",
        "phone": "",
        "phoneDigits": "",
        "website": "https://oficinarica.com.br",
        "email": "contato@oficinarica.com.br",
    })

    assert result.email == "contato@oficinarica.com.br"


def test_contact_result_forbids_removed_and_document_fields() -> None:
    base = {
        "name": "Maria Silva",
        "phone": "(19) 99999-9999",
        "phoneDigits": "19999999999",
        "rating": None,
        "reviews": None,
        "address": None,
        "website": None,
        "source": "hbx_scraping:web",
        "score": 72,
    }

    for field in ("probableWhatsApp", "googleMapsUrl", "cpf", "cnpj", "document"):
        with pytest.raises(ValueError):
            ContactResult.model_validate({**base, field: "bloqueado"})


def test_pf_result_does_not_require_rating_site_or_address() -> None:
    result = ContactResult.model_validate(
        {
            "name": "Maria Silva",
            "phone": "(19) 99999-9999",
            "phoneDigits": "19999999999",
            "rating": None,
            "reviews": None,
            "address": None,
            "website": None,
            "source": "hbx_scraping:web",
            "score": 80,
        }
    )

    assert result.name == "Maria Silva"
    assert result.rating is None
    assert result.website is None

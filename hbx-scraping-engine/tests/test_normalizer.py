from app.schemas import ContactResult
from app.services.discovery import _is_allowed_url
from app.services.filters import is_generic_name
from app.services.normalizer import dedupe_contacts, format_phone, normalize_phone_digits


def test_normalize_phone_digits_removes_country_code() -> None:
    assert normalize_phone_digits("+55 (19) 99999-9999") == "19999999999"
    assert normalize_phone_digits("55 19 3461-1234") == "1934611234"


def test_blocks_national_generic_phone_numbers() -> None:
    assert normalize_phone_digits("0800 123 4567") is None
    assert normalize_phone_digits("(11) 4003-1234") is None
    assert normalize_phone_digits("(11) 3003-1234") is None
    assert normalize_phone_digits("(11) 3004-1000") is None
    assert normalize_phone_digits("(55) 4000-1179") is None
    assert normalize_phone_digits("(01) 93461-2811") is None
    assert normalize_phone_digits("(80) 0665-1515") is None


def test_format_phone() -> None:
    assert format_phone("19999999999") == "(19) 99999-9999"
    assert format_phone("1934611234") == "(19) 3461-1234"


def test_dedupe_contacts_by_phone_digits() -> None:
    contacts = dedupe_contacts(
        [
            {"name": "Oficina A", "phone": "(19) 99999-9999"},
            {"name": "Oficina A duplicada", "phoneDigits": "19999999999", "phone": "+55 19 99999-9999"},
        ]
    )

    assert len(contacts) == 1
    assert contacts[0]["phoneDigits"] == "19999999999"


def test_dedupe_limits_same_domain_and_name_to_two_phones() -> None:
    contacts = dedupe_contacts(
        [
            {"name": "Centro Automotivo Bom", "phone": "(19) 99999-0001", "website": "https://bom.example.com"},
            {"name": "Centro Automotivo Bom", "phone": "(19) 99999-0002", "website": "https://bom.example.com"},
            {"name": "Centro Automotivo Bom", "phone": "(19) 99999-0003", "website": "https://bom.example.com"},
        ],
        city="Americana",
    )

    assert len(contacts) == 2


def test_blocks_generic_names_and_bad_domains() -> None:
    assert is_generic_name("Oficina Mecânica", "Americana")
    assert is_generic_name("Mecânica em Americana", "Americana")
    assert not is_generic_name("Maria Silva", "Americana", "pf")
    assert is_generic_name("Americana", "Americana", "pf")
    assert is_generic_name("Categorias", "Americana", "pf")
    assert is_generic_name("Planos de Saúde em Americana", "Americana", "pf", "plano de saúde")
    assert is_generic_name("Manutenção de confiança para seu Automóvel !", "Americana")
    assert not _is_allowed_url("https://querobolsa.com.br/cursos/engenharia-mecanica")
    assert not _is_allowed_url("https://instagram.com/oficina")


def test_schema_forbids_removed_fields() -> None:
    payload = {
        "name": "Oficina A",
        "phone": "(19) 99999-9999",
        "phoneDigits": "19999999999",
        "rating": None,
        "reviews": None,
        "address": None,
        "website": None,
        "source": "hbx_scraping:web",
        "score": 72,
        "probableWhatsApp": True,
    }

    try:
        ContactResult.model_validate(payload)
    except Exception as error:
        assert "probableWhatsApp" in str(error)
    else:
        raise AssertionError("schema aceitou campo removido")

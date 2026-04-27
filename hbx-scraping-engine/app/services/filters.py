import re
import unicodedata
from urllib.parse import urlparse

BLOCKED_HOST_PARTS = (
    "google.",
    "maps.google",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "facebook.com",
    "querobolsa.com.br",
)

DIRECTORY_HOST_HINTS = (
    "guia",
    "apontador",
    "telelistas",
    "econodata",
    "solutudo",
    "guiamais",
    "catalogo",
    "listagem",
    "diariocidade",
    "paginaamarela",
    "infoisinfo",
    "americana.net.br",
    "qualotelefone",
    "brasilapifacil",
    "lista11",
)

GENERIC_NAME_EXACT = {
    "contato",
    "home",
    "inicio",
    "pagina inicial",
    "telefone",
    "enderecos",
    "categorias",
    "oficina mecanica",
    "mecanica em americana",
    "manutencao de confianca para seu automovel",
}

GENERIC_NAME_PREFIXES = (
    "10 melhores ",
    "melhores oficinas ",
    "oficinas mecanicas em ",
    "oficina mecanica em ",
    "oficina mecanica e ",
    "mecanica em ",
)

NATIONAL_PHONE_PREFIXES = ("0800", "0300", "3003", "3004", "4000", "4002", "4003", "4004")

STATE_DDDS = {
    "AC": {"68"},
    "AL": {"82"},
    "AM": {"92", "97"},
    "AP": {"96"},
    "BA": {"71", "73", "74", "75", "77"},
    "CE": {"85", "88"},
    "DF": {"61"},
    "ES": {"27", "28"},
    "GO": {"62", "64"},
    "MA": {"98", "99"},
    "MG": {"31", "32", "33", "34", "35", "37", "38"},
    "MS": {"67"},
    "MT": {"65", "66"},
    "PA": {"91", "93", "94"},
    "PB": {"83"},
    "PE": {"81", "87"},
    "PI": {"86", "89"},
    "PR": {"41", "42", "43", "44", "45", "46"},
    "RJ": {"21", "22", "24"},
    "RN": {"84"},
    "RO": {"69"},
    "RR": {"95"},
    "RS": {"51", "53", "54", "55"},
    "SC": {"47", "48", "49"},
    "SE": {"79"},
    "SP": {"11", "12", "13", "14", "15", "16", "17", "18", "19"},
    "TO": {"63"},
}
VALID_DDDS = set().union(*STATE_DDDS.values())

CITY_DDD_OVERRIDES = {
    ("americana", "SP"): {"19"},
    ("campinas", "SP"): {"19"},
    ("sumare", "SP"): {"19"},
    ("santa barbara d oeste", "SP"): {"19"},
}


def text_key(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", re.sub(r"[^a-zA-Z0-9]+", " ", ascii_text).lower()).strip()


def domain_from_url(url: str | None) -> str:
    parsed = urlparse(str(url or ""))
    return parsed.netloc.lower().removeprefix("www.")


def is_blocked_domain(url_or_host: str | None) -> bool:
    value = str(url_or_host or "").lower()
    host = domain_from_url(value) or value
    return any(part in host for part in BLOCKED_HOST_PARTS)


def is_directory_domain(url_or_host: str | None) -> bool:
    value = str(url_or_host or "").lower()
    host = domain_from_url(value) or value
    return any(hint in host for hint in DIRECTORY_HOST_HINTS)


def is_generic_name(name: str | None, city: str | None = None, target_type: str = "pj", segment: str | None = None) -> bool:
    key = text_key(name)
    if not key:
        return True
    city_key = text_key(city)
    if city_key and key == city_key:
        return True
    segment_key = text_key(segment)
    if segment_key:
        segment_variants = {segment_key}
        first, _, rest = segment_key.partition(" ")
        if rest and not first.endswith("s"):
            segment_variants.add(f"{first}s {rest}")
        generic_segment_names = set(segment_variants)
        if city_key:
            generic_segment_names.update({f"{variant} em {city_key}" for variant in segment_variants})
        if key in generic_segment_names:
            return True
    if target_type == "pf":
        return key in {"contato", "home", "inicio", "pagina inicial", "telefone", "enderecos", "categorias"} or key == "manutencao de confianca para seu automovel"
    if key in GENERIC_NAME_EXACT:
        return True
    if city_key and key in {f"mecanica em {city_key}", f"oficina mecanica em {city_key}", f"oficinas mecanicas em {city_key}"}:
        return True
    return any(key.startswith(prefix) for prefix in GENERIC_NAME_PREFIXES)


def is_blocked_phone_digits(digits: str | None) -> bool:
    value = re.sub(r"\D", "", str(digits or ""))
    if not value:
        return True
    if value.startswith(NATIONAL_PHONE_PREFIXES):
        return True
    if len(value) in (10, 11) and value[2:6] in NATIONAL_PHONE_PREFIXES:
        return True
    if len(value) in (10, 11) and value[:2] not in VALID_DDDS:
        return True
    return False


def expected_ddds(city: str | None, state: str | None) -> set[str]:
    state_value = str(state or "").upper()
    city_key = text_key(city)
    return CITY_DDD_OVERRIDES.get((city_key, state_value)) or STATE_DDDS.get(state_value, set())


def phone_ddd(digits: str | None) -> str:
    value = re.sub(r"\D", "", str(digits or ""))
    return value[:2] if len(value) in (10, 11) else ""


def is_mobile_phone(digits: str | None) -> bool:
    value = re.sub(r"\D", "", str(digits or ""))
    return len(value) == 11 and value[2] == "9"

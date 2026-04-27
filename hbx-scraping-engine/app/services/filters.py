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
PF_TECHNICAL_BLOCKED_HOST_PARTS = (
    "google.",
    "maps.google",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
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

PF_WEAK_HOST_PARTS = (
    "exame.com",
    "mises.org.br",
    "buzzero.com",
    "americana.sp.gov.br",
    "saudeamericana.com.br",
    "saudepets.com.br",
    "conveniocrcsp.com.br",
    "plano-de-saude-saopaulo.com.br",
    "compareplanodesaude.com.br",
)

GENERIC_NAME_EXACT = {
    "contato",
    "home",
    "inicio",
    "pagina inicial",
    "telefone",
    "enderecos",
    "categorias",
    "negocios",
    "negocio",
    "curso online",
    "relacao de unidades",
    "protecao que voce pode confiar",
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
    "como funciona",
    "como realmente funciona",
    "vale a pena",
    "relacao de unidades",
    "secretaria municipal",
    "curso online",
    "negocios",
)

PF_GENERIC_PREFIXES = (
    "como ",
    "como funciona",
    "como realmente funciona",
    "vale a pena",
    "veja ",
    "foi demitido",
    "voce sabe",
    "cupom ",
    "protecao ",
    "relacao de unidades",
    "secretaria municipal",
    "secretaria de ",
    "curso online",
    "cursos ",
    "portal ",
    "maior academia",
    "plano municipal",
    "plano ",
    "planos de saude",
    "plano de saude",
)
PF_ROLE_TOKENS = {"consultor", "consultora", "corretor", "vendedor", "vendedora", "representante"}
PF_COMPANY_TOKENS = {
    "corretora",
    "seguros",
    "seguro",
    "clinica",
    "convenio",
    "hospital",
    "unimed",
    "hapvida",
    "samaritano",
    "ltda",
    "empresa",
}

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


def is_pf_technical_blocked_domain(url_or_host: str | None) -> bool:
    value = str(url_or_host or "").lower()
    host = domain_from_url(value) or value
    return any(part in host for part in PF_TECHNICAL_BLOCKED_HOST_PARTS)


def is_directory_domain(url_or_host: str | None) -> bool:
    value = str(url_or_host or "").lower()
    host = domain_from_url(value) or value
    return any(hint in host for hint in DIRECTORY_HOST_HINTS)


def is_pf_weak_domain(url_or_host: str | None) -> bool:
    value = str(url_or_host or "").lower()
    host = domain_from_url(value) or value
    return any(part in host for part in PF_WEAK_HOST_PARTS)


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
        if key in GENERIC_NAME_EXACT or key in {"contato", "home", "inicio", "pagina inicial", "telefone", "enderecos", "categorias"}:
            return True
        return any(key.startswith(prefix) for prefix in PF_GENERIC_PREFIXES)
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


def has_pf_role_text(value: str | None) -> bool:
    key = text_key(value)
    words = set(key.split())
    return bool(words & PF_ROLE_TOKENS)


def looks_like_company_or_institution_name(name: str | None) -> bool:
    key = text_key(name)
    words = set(key.split())
    if bool(words & PF_COMPANY_TOKENS):
        return True
    return any(marker in key for marker in (" s a", " sa ", "mei", "eireli"))


def looks_like_person_name(name: str | None) -> bool:
    key = text_key(name)
    if not key:
        return False
    words = key.split()
    if len(words) < 2 or len(words) > 5:
        return False
    blocked = {
        "plano",
        "planos",
        "saude",
        "secretaria",
        "municipal",
        "unimed",
        "hapvida",
        "clinica",
        "hospital",
        "portal",
        "curso",
        "cursos",
        "seguro",
        "seguros",
        "corretora",
        "empresa",
        "academia",
        "noticias",
    }
    if any(word in blocked for word in words):
        return False
    return all(word.isalpha() and len(word) >= 2 for word in words)

import unicodedata
import re
from urllib.parse import quote, urlparse

from ddgs import DDGS

from .filters import is_blocked_lead_source_domain
from .social import is_valid_social_profile_url, normalize_social_url, social_channel_for_url

BLOCKED_HOST_PARTS = ("pinterest.", "linkedin.com")
BLOCKED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".zip", ".rar")
PJ_DISCOVERY_MIN_TARGET = 200
PJ_DISCOVERY_LIMIT_MULTIPLIER = 10
SOCIAL_DISCOVERY_MIN_TARGET = 80
SOCIAL_DISCOVERY_LIMIT_MULTIPLIER = 12
SOCIAL_DISCOVERY_MAX_RESULTS_PER_QUERY = 50
SOCIAL_DISCOVERY_FORCED_QUERY_LIMIT_PER_CHANNEL = 3
SocialProfileCandidate = dict[str, str]


def slugify_path_part(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_text)).strip("-")


def build_directory_seed_urls(segment: str, city: str, state: str) -> list[str]:
    segment_slug = slugify_path_part(segment)
    city_slug = slugify_path_part(city)
    state_slug = slugify_path_part(state)
    if not segment_slug or not city_slug or not state_slug:
        return []

    query_slug = quote(f"{segment_slug}-{city_slug}-{state_slug}", safe="-")
    return [
        f"https://www.solutudo.com.br/empresas/{state_slug}/{city_slug}/{segment_slug}",
        f"https://listaamarela.com.br/busca/{query_slug}",
        f"https://www.apontador.com.br/local/{state_slug}/{city_slug}/{segment_slug}.html",
        f"https://www.guiamais.com.br/busca/{segment_slug}/{city_slug}-{state_slug}",
    ]


def build_queries(segment: str, city: str, state: str, target_type: str = "pj", query: str = "") -> list[str]:
    explicit_query = " ".join(str(query or "").split())
    if explicit_query:
        return [explicit_query]
    location = " ".join(part for part in [city, state] if str(part or "").strip()).strip()
    if target_type == "agenda_pf":
        return [
            f"{city} {state} telefone",
            f"agenda telefônica {city} {state}",
            f"lista telefônica {city} {state}",
            f"contatos {city} {state} telefone",
            f"telefones úteis {city} {state}",
            f"nomes telefone {city} {state}",
            f"whatsapp {city} {state}",
        ]
    if target_type == "pf":
        return [
            f"consultor {segment} {city} {state} telefone",
            f"corretor {segment} {city} {state} whatsapp",
            f"vendedor {segment} {city} {state} telefone",
            f"representante {segment} {city} {state} whatsapp",
            f"consultor {segment} {city} telefone",
            f"corretor {segment} {city} telefone",
            f"vendedor {segment} {city} whatsapp",
            f"{segment} {city} {state} whatsapp",
        ]
    if location:
        return [
            f"{segment} {location} telefone",
            f"{segment} {location} contato",
            f"{segment} {location} whatsapp",
            f"{segment} em {location}",
            f"{segment} {location} site oficial",
        ]
    return [
        f"{segment} telefone",
        f"{segment} contato",
        f"{segment} whatsapp",
        f"{segment} site oficial",
        f"{segment} empresas telefone",
    ]


def _is_allowed_url(
    url: str,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    full = url.lower()
    if parsed.scheme not in ("http", "https") or not host:
        return False
    social_channel = social_channel_for_url(url)
    if social_channel:
        return False
    if is_blocked_lead_source_domain(host) or any(part in host for part in BLOCKED_HOST_PARTS):
        return False
    if "google.com/maps" in full or "/login" in path or "signin" in path:
        return False
    if path.endswith(BLOCKED_EXTENSIONS):
        return False
    return True


def requested_social_channels(
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> set[str]:
    values = [*(preferred_channels or []), *(required_channels or [])]
    return {str(value or "").strip().lower() for value in values if str(value or "").strip().lower() in {"instagram", "facebook"}}


def text_variants(value: str) -> list[str]:
    text = " ".join(str(value or "").split())
    if not text:
        return []
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return list(dict.fromkeys([text, ascii_text]))


def build_social_queries(segment: str, city: str, state: str, channels: set[str]) -> list[str]:
    city_text = " ".join(str(city or "").split())
    state_text = " ".join(str(state or "").split())
    segment_text = " ".join(str(segment or "").split())
    location = " ".join(part for part in [city_text, state_text] if part).strip()
    queries: list[str] = []

    for channel in ("instagram", "facebook"):
        if channel not in channels:
            continue
        domain = "instagram.com" if channel == "instagram" else "facebook.com"

        if channel == "instagram":
            for city_variant in text_variants(city_text):
                profile_term = " ".join(part for part in [segment_text, city_variant] if part).strip()
                if profile_term:
                    queries.append(f"site:{domain} {profile_term} -/p/ -/reel/ -/stories/")

        base_terms = [
            f"{segment_text} {location}",
            f"{segment_text} {city_text}",
            f"{segment_text} em {city_text}",
            f"{segment_text} perto {city_text}",
            f"{segment_text} {state_text}",
        ]

        commercial_terms = [
            "telefone",
            "whatsapp",
            "contato",
            "agendamento",
            "oficial",
        ]

        for term in base_terms:
            if not term.strip():
                continue
            queries.append(f"site:{domain} {term}")
            queries.append(f"{term} {channel}")
            for extra in commercial_terms:
                queries.append(f"site:{domain} {term} {extra}")

    return list(dict.fromkeys(" ".join(query.split()) for query in queries if query.strip()))


def discover_social_profiles(
    city: str,
    state: str,
    segment: str,
    limit: int,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
    target_override: int | None = None,
) -> list[SocialProfileCandidate]:
    channels = requested_social_channels(preferred_channels, required_channels)
    if not channels:
        return []
    if target_override is not None:
        return []

    queries = build_social_queries(segment, city, state, channels)
    target = max(1, int(target_override)) if target_override is not None else max(SOCIAL_DISCOVERY_MIN_TARGET, limit * SOCIAL_DISCOVERY_LIMIT_MULTIPLIER)
    if target_override is not None:
        channels_count = max(1, len(channels))
        queries = queries[: max(1, channels_count * SOCIAL_DISCOVERY_FORCED_QUERY_LIMIT_PER_CHANNEL)]
    per_query_results = min(8, max(target * 2, 6)) if target_override is not None else SOCIAL_DISCOVERY_MAX_RESULTS_PER_QUERY
    backend = "auto"
    seen: set[str] = set()
    profiles: list[SocialProfileCandidate] = []

    try:
        ddgs = DDGS(timeout=2 if target_override is not None else 6)
    except TypeError:
        ddgs = DDGS()
    with ddgs:
        for query in queries:
            try:
                rows = ddgs.text(query, region="br-pt", safesearch="off", max_results=per_query_results, backend=backend)
            except Exception as error:
                print(f"[social_discovery] query falhou: {query} error={error}")
                continue

            for row in rows or []:
                raw_url = str(row.get("href") or row.get("url") or "").strip()
                url = normalize_social_url(raw_url)
                channel = social_channel_for_url(url or "")
                if not url or not channel or channel not in channels:
                    continue
                if url in seen:
                    continue
                if not is_valid_social_profile_url(url):
                    continue

                seen.add(url)
                profiles.append({
                    "url": url,
                    "channel": channel,
                    "title": str(row.get("title") or ""),
                    "snippet": str(row.get("body") or row.get("snippet") or row.get("description") or ""),
                    "query": query,
                })

                if len(profiles) >= target:
                    return profiles

    return profiles


def discovery_target(limit: int, max_discovery_results: int, target_type: str = "pj", exclude_count: int = 0) -> int:
    if target_type == "agenda_pf":
        return min(max_discovery_results, max(60, limit * 4))
    if target_type == "pj":
        return min(max_discovery_results, max(80, limit * 3))
    multiplier = 5 if target_type == "pf" else 4
    minimum = 60 if target_type == "pf" else 40
    return min(max_discovery_results, max(minimum, limit * multiplier))


def discover_urls(
    city: str,
    state: str,
    segment: str,
    limit: int,
    max_discovery_results: int,
    target_type: str = "pj",
    exclude_count: int = 0,
    query: str = "",
    exclude_urls: list[str] | None = None,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> list[str]:
    queries = build_queries(segment, city, state, target_type, query)
    social_channels = requested_social_channels(preferred_channels, required_channels)
    if target_type == "pj" and social_channels:
        target = min(max_discovery_results, max(PJ_DISCOVERY_MIN_TARGET, limit * PJ_DISCOVERY_LIMIT_MULTIPLIER))
    else:
        target = discovery_target(limit, max_discovery_results, target_type, exclude_count)
    if target_type == "pj" and social_channels:
        per_query = max(30, target // len(queries) + 5)
    else:
        per_query = max(8, target // len(queries) + 2)
    seen: set[str] = {str(url or "").strip().rstrip("/") for url in (exclude_urls or []) if str(url or "").strip()}
    urls: list[str] = []

    if target_type == "pj":
        for url in build_directory_seed_urls(segment, city, state):
            normalized = url.rstrip("/")
            if normalized in seen or not _is_allowed_url(normalized, preferred_channels, required_channels):
                continue
            seen.add(normalized)
            urls.append(normalized)
        if social_channels and urls:
            return urls
        if len(urls) >= max(1, min(limit, 4)):
            return urls

    try:
        ddgs = DDGS(timeout=6)
    except TypeError:
        ddgs = DDGS()
    with ddgs:
        for query in queries:
            try:
                results = ddgs.text(query, region="br-pt", safesearch="off", max_results=per_query)
            except Exception as error:
                print(f"[discovery] query falhou: {query} error={error}")
                continue
            for row in results or []:
                url = str(row.get("href") or row.get("url") or "").strip()
                normalized = url.rstrip("/")
                if social_channel_for_url(normalized) and is_valid_social_profile_url(normalized):
                    continue
                if normalized in seen or not _is_allowed_url(normalized, preferred_channels, required_channels):
                    continue
                seen.add(normalized)
                urls.append(normalized)
                if len(urls) >= target:
                    return urls

    if target_type == "pj" and len(urls) < max(1, min(limit, 4)):
        for url in build_directory_seed_urls(segment, city, state):
            normalized = url.rstrip("/")
            if normalized in seen or not _is_allowed_url(normalized, preferred_channels, required_channels):
                continue
            seen.add(normalized)
            urls.append(normalized)

    return urls

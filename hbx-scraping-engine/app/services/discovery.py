from urllib.parse import parse_qs, urlparse

from ddgs import DDGS

from .filters import is_blocked_lead_source_domain, is_social_signal_domain, text_key

BLOCKED_HOST_PARTS = ("pinterest.", "linkedin.com")
BLOCKED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".zip", ".rar")
SOCIAL_BLOCKED_PATH_PARTS = ("/p/", "/reel/", "/stories/", "/explore/", "/accounts/", "/login")
SOCIAL_BLOCKED_QUERY_KEYS = {"next", "login", "hl", "__coig_restricted"}


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


def _requested_social_channels(
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> set[str]:
    values = [*(preferred_channels or []), *(required_channels or [])]
    return {text_key(value) for value in values if text_key(value) in {"instagram", "facebook"}}


def _social_channel_for_url(url_or_host: str) -> str | None:
    host = urlparse(url_or_host).netloc.lower() or str(url_or_host or "").lower()
    if "instagram.com" in host:
        return "instagram"
    if "facebook.com" in host:
        return "facebook"
    return None


def _is_valid_social_profile_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if parsed.scheme not in ("http", "https") or not host or not is_social_signal_domain(host):
        return False
    if path.endswith(BLOCKED_EXTENSIONS):
        return False
    if any(part in path for part in SOCIAL_BLOCKED_PATH_PARTS):
        return False
    if any(key in parse_qs(parsed.query) for key in SOCIAL_BLOCKED_QUERY_KEYS):
        return False
    clean_parts = [part for part in path.split("/") if part]
    if not clean_parts:
        return False
    if clean_parts[0] in {"share", "sharer", "plugins", "dialog", "events", "marketplace", "watch"}:
        return False
    return len(clean_parts) <= 2


def _social_queries(segment: str, city: str, channels: set[str]) -> list[str]:
    queries: list[str] = []
    for channel in ("instagram", "facebook"):
        if channel not in channels:
            continue
        domain = "instagram.com" if channel == "instagram" else "facebook.com"
        queries.extend([
            f'site:{domain} "{segment}" "{city}"',
            f'"{segment}" "{city}" {channel}',
        ])
    return queries


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
    requested_social = _requested_social_channels(preferred_channels, required_channels)
    social_channel = _social_channel_for_url(url)
    if social_channel:
        return social_channel in requested_social and _is_valid_social_profile_url(url)
    if is_blocked_lead_source_domain(host) or any(part in host for part in BLOCKED_HOST_PARTS):
        return False
    if "google.com/maps" in full or "/login" in path or "signin" in path:
        return False
    if path.endswith(BLOCKED_EXTENSIONS):
        return False
    return True


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
    target = discovery_target(limit, max_discovery_results, target_type, exclude_count)
    requested_social = _requested_social_channels(preferred_channels, required_channels)
    queries = [
        *build_queries(segment, city, state, target_type, query),
        *([] if query else _social_queries(segment, city, requested_social)),
    ]
    per_query = max(8, target // len(queries) + 2)
    seen: set[str] = {str(url or "").strip().rstrip("/") for url in (exclude_urls or []) if str(url or "").strip()}
    urls: list[str] = []

    with DDGS() as ddgs:
        for query in queries:
            try:
                results = ddgs.text(query, region="br-pt", safesearch="off", max_results=per_query)
            except Exception as error:
                print(f"[discovery] query falhou: {query} error={error}")
                continue
            for row in results or []:
                url = str(row.get("href") or row.get("url") or "").strip()
                normalized = url.rstrip("/")
                if normalized in seen or not _is_allowed_url(normalized, preferred_channels, required_channels):
                    continue
                seen.add(normalized)
                urls.append(normalized)
                if len(urls) >= target:
                    return urls

    return urls

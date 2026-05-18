from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

from .filters import is_social_signal_domain

BLOCKED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".zip", ".rar")
SOCIAL_BLOCKED_PATH_PARTS = ("/p/", "/reel/", "/stories/", "/explore/", "/accounts/", "/login")
SOCIAL_BLOCKED_FIRST_PATH_PARTS = {"share", "sharer", "sharer.php", "plugins", "dialog", "events", "marketplace", "watch"}
SOCIAL_BLOCKED_QUERY_KEYS = {"next", "login", "hl", "__coig_restricted", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"}


def social_channel_for_url(url_or_host: str) -> str | None:
    host = urlparse(str(url_or_host or "")).netloc.lower() or str(url_or_host or "").lower()
    if "instagram.com" in host:
        return "instagram"
    if "facebook.com" in host:
        return "facebook"
    return None


def social_field_for_url(url: str) -> str | None:
    channel = social_channel_for_url(url)
    if channel == "instagram":
        return "instagramUrl"
    if channel == "facebook":
        return "facebookUrl"
    return None


def _has_blocked_social_path(path: str) -> bool:
    path_l = str(path or "").lower()
    if path_l.endswith(BLOCKED_EXTENSIONS):
        return True
    if any(part in path_l for part in SOCIAL_BLOCKED_PATH_PARTS):
        return True
    clean_parts = [part for part in path_l.split("/") if part]
    return bool(clean_parts and clean_parts[0] in SOCIAL_BLOCKED_FIRST_PATH_PARTS)


def normalize_social_url(url: str) -> str | None:
    parsed = urlparse(str(url or "").strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    host = parsed.netloc.lower().removeprefix("www.")
    if not is_social_signal_domain(host):
        return None
    if _has_blocked_social_path(parsed.path):
        return None
    query = parse_qs(parsed.query, keep_blank_values=False)
    clean_query = {
        key: values
        for key, values in query.items()
        if key not in SOCIAL_BLOCKED_QUERY_KEYS and not key.lower().startswith("utm_")
    }
    clean_parts = [part for part in parsed.path.split("/") if part]
    if not clean_parts or len(clean_parts) > 2:
        return None
    path = "/" + "/".join(clean_parts)
    normalized = urlunparse((parsed.scheme.lower(), host, path, "", urlencode(clean_query, doseq=True), ""))
    return normalized.rstrip("/")


def is_valid_social_profile_url(url: str) -> bool:
    return normalize_social_url(url) is not None


def extract_social_links_from_html(html: str, page_url: str) -> dict[str, str]:
    soup = BeautifulSoup(html or "", "lxml")
    links: dict[str, str] = {}
    for link in soup.find_all("a", href=True):
        href = normalize_social_url(urljoin(page_url, str(link.get("href") or "").strip()))
        field = social_field_for_url(href or "")
        if field and href and field not in links:
            links[field] = href
    return links

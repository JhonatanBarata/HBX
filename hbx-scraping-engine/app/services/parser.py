import json
import re
from collections.abc import Iterable
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .filters import domain_from_url, is_blocked_domain, is_directory_domain, is_social_signal_domain
from .normalizer import clean_name, extract_phone_from_url, fallback_name, format_phone, normalize_phone_digits
from .social import extract_social_links_from_html, is_valid_social_profile_url, normalize_social_url, social_field_for_url

PHONE_RE = re.compile(r"(?<!\d)(?:\+?55\s*)?(?:\(\d{2}\)|\d{2}[\s.-]+)\s*9?\d{4}[-.\s]+\d{4}(?!\d)")


def _as_list(value) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _flatten_jsonld(value) -> Iterable[dict]:
    if isinstance(value, list):
        for item in value:
            yield from _flatten_jsonld(item)
    elif isinstance(value, dict):
        if isinstance(value.get("@graph"), list):
            yield from _flatten_jsonld(value["@graph"])
        if isinstance(value.get("itemListElement"), list):
            for element in value["itemListElement"]:
                if isinstance(element, dict) and isinstance(element.get("item"), (dict, list)):
                    yield from _flatten_jsonld(element["item"])
                else:
                    yield from _flatten_jsonld(element)
        if isinstance(value.get("item"), (dict, list)):
            yield from _flatten_jsonld(value["item"])
        yield value


def _jsonld_address(address) -> str | None:
    if isinstance(address, str):
        return address.strip() or None
    if not isinstance(address, dict):
        return None
    parts = [
        address.get("streetAddress"),
        address.get("addressLocality"),
        address.get("addressRegion"),
        address.get("postalCode"),
    ]
    text = ", ".join(str(part).strip() for part in parts if str(part or "").strip())
    return text or None


def _jsonld_rating(item: dict) -> tuple[float | None, int | None]:
    rating = item.get("aggregateRating")
    if not isinstance(rating, dict):
        return None, None
    rating_value = None
    reviews = None
    try:
        if rating.get("ratingValue") is not None:
            rating_value = float(str(rating.get("ratingValue")).replace(",", "."))
    except (TypeError, ValueError):
        rating_value = None
    for key in ("reviewCount", "ratingCount"):
        try:
            if rating.get(key) is not None:
                reviews = max(0, int(float(str(rating.get(key)).replace(",", "."))))
                break
        except (TypeError, ValueError):
            continue
    return rating_value, reviews


def is_directory_url(url: str) -> bool:
    return is_directory_domain(url)


def _apply_social_links(contact: dict, links: dict[str, str]) -> dict:
    for field, value in links.items():
        contact.setdefault(field, value)
    return contact


def _official_website(page_url: str, jsonld_url: str | None, directory: bool) -> str | None:
    page_host = urlparse(page_url).netloc.lower().removeprefix("www.")
    if jsonld_url:
        jsonld_host = urlparse(jsonld_url).netloc.lower().removeprefix("www.")
        if jsonld_host and not is_social_signal_domain(jsonld_host) and not is_blocked_domain(jsonld_host) and (not directory or jsonld_host != page_host):
            return jsonld_url
    return None if directory or is_social_signal_domain(page_host) else f"{urlparse(page_url).scheme}://{urlparse(page_url).netloc}"


def _external_website_from_links(soup: BeautifulSoup, page_url: str) -> str | None:
    page_host = urlparse(page_url).netloc.lower().removeprefix("www.")
    for link in soup.find_all("a", href=True):
        href = str(link.get("href") or "").strip()
        parsed = urlparse(href)
        host = parsed.netloc.lower().removeprefix("www.")
        if parsed.scheme not in ("http", "https") or not host:
            continue
        if host == page_host or is_social_signal_domain(host) or is_blocked_domain(host):
            continue
        return f"{parsed.scheme}://{parsed.netloc}"
    return None


def _title_name(soup: BeautifulSoup, target_type: str = "pj") -> str | None:
    h1 = soup.find("h1")
    if h1:
        name = clean_name(h1.get_text(" ", strip=True), allow_generic=target_type == "pf")
        if name:
            return name
    og_title = soup.find("meta", attrs={"property": "og:title"})
    if og_title:
        name = clean_name(og_title.get("content"), allow_generic=target_type == "pf")
        if name:
            return name
    return clean_name(soup.title.get_text(" ", strip=True) if soup.title else None, allow_generic=target_type == "pf")


def parse_page(html: str, url: str, target_type: str = "pj", city: str | None = None) -> tuple[list[dict], str]:
    soup = BeautifulSoup(html, "lxml")
    directory = is_directory_url(url)
    page_domain = domain_from_url(url)
    social_field = social_field_for_url(url)
    social_links = extract_social_links_from_html(html, url) if not directory else {}
    if social_field and is_valid_social_profile_url(url):
        social_links.setdefault(social_field, normalize_social_url(url) or url.rstrip("/"))
    contacts: list[dict] = []

    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for item in _flatten_jsonld(data):
            types = {str(t).lower() for t in _as_list(item.get("@type"))}
            if not (types & {"localbusiness", "organization", "professionalservice", "store", "autorepair", "restaurant"} or item.get("telephone")):
                continue
            name = fallback_name(item.get("name"), city, target_type)
            address = _jsonld_address(item.get("address"))
            rating, reviews = _jsonld_rating(item)
            website = _official_website(url, item.get("url"), directory)
            for phone in _as_list(item.get("telephone")):
                digits = normalize_phone_digits(str(phone))
                if digits and name:
                    contact = {
                        "name": name,
                        "phone": format_phone(digits),
                        "phoneDigits": digits,
                        "rating": rating,
                        "reviews": reviews,
                        "address": address,
                        "website": website,
                        "source": "hbx_scraping:web",
                        "_domain": page_domain,
                        "_pageUrl": url,
                    }
                    if social_field:
                        contact["website"] = website
                    contacts.append(_apply_social_links(contact, social_links))

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    visible_text = soup.get_text(" ", strip=True)[:20000]
    resolved_fallback_name = fallback_name(_title_name(soup, target_type), city, target_type)
    fallback_website = _external_website_from_links(soup, url) if social_field else _official_website(url, None, directory)
    phones: set[str] = set()
    for link in soup.find_all("a", href=True):
        digits = extract_phone_from_url(str(link.get("href")))
        if digits:
            phones.add(digits)
    for match in PHONE_RE.finditer(visible_text):
        digits = normalize_phone_digits(match.group(0))
        if digits:
            phones.add(digits)

    for digits in phones:
        if resolved_fallback_name:
            contact = {
                "name": resolved_fallback_name,
                "phone": format_phone(digits),
                "phoneDigits": digits,
                "rating": None,
                "reviews": None,
                "address": None,
                "website": fallback_website,
                "source": "hbx_scraping:web",
                "_domain": page_domain,
                "_pageUrl": url,
            }
            if social_field:
                contact[social_field] = normalize_social_url(url) or url.rstrip("/")
            contacts.append(_apply_social_links(contact, social_links))

    has_actionable_channel = bool(fallback_website or social_links or (social_field and is_valid_social_profile_url(url)))
    if target_type == "pj" and not contacts and resolved_fallback_name and has_actionable_channel:
        contact = {
            "name": resolved_fallback_name,
            "phone": "",
            "phoneDigits": "",
            "rating": None,
            "reviews": None,
            "address": None,
            "website": fallback_website,
            "source": "hbx_scraping:web",
            "_domain": page_domain,
            "_pageUrl": url,
        }
        if social_field:
            contact[social_field] = normalize_social_url(url) or url.rstrip("/")
        contacts.append(_apply_social_links(contact, social_links))

    return contacts, visible_text

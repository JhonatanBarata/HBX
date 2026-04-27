import re
from urllib.parse import parse_qs, unquote, urlparse

import phonenumbers

from .filters import domain_from_url, is_blocked_phone_digits, is_generic_name, text_key


def normalize_phone_digits(raw: str | None) -> str | None:
    digits = re.sub(r"\D", "", str(raw or ""))
    if not digits:
        return None

    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("55") and len(digits) > 11:
        digits = digits[2:]

    if len(digits) in (10, 11):
        if is_blocked_phone_digits(digits):
            return None
        try:
            parsed = phonenumbers.parse(f"+55{digits}", "BR")
            if phonenumbers.is_valid_number(parsed):
                return digits
        except phonenumbers.NumberParseException:
            pass
        return None

    return None


def format_phone(digits: str) -> str:
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    return digits


def extract_phone_from_url(value: str) -> str | None:
    parsed = urlparse(value)
    if parsed.scheme == "tel":
        return normalize_phone_digits(unquote(parsed.path))
    host = parsed.netloc.lower()
    if "wa.me" in host:
        return normalize_phone_digits(parsed.path)
    if "whatsapp.com" in host:
        query_phone = parse_qs(parsed.query).get("phone", [None])[0]
        return normalize_phone_digits(query_phone or value)
    return None


def clean_name(raw: str | None) -> str | None:
    text = re.sub(r"\s+", " ", str(raw or "")).strip(" -|:/\t\r\n")
    if not text:
        return None
    text = re.split(r"\s+[-|]\s+", text)[0].strip()
    text = re.sub(r"\b(telefone|contato|endere[cç]o|google maps|facebook|instagram)\b.*$", "", text, flags=re.I).strip(" -|:")
    if not text or is_generic_name(text) or len(text) < 2:
        return None
    return text[:160]


def dedupe_contacts(items: list[dict], city: str | None = None, target_type: str = "pj") -> list[dict]:
    seen: set[str] = set()
    website_name_count: dict[tuple[str, str], int] = {}
    deduped: list[dict] = []
    for item in items:
        digits = normalize_phone_digits(item.get("phoneDigits") or item.get("phone"))
        name = clean_name(item.get("name"))
        if not digits or not name or digits in seen or is_generic_name(name, city, target_type):
            continue
        domain = str(item.get("_domain") or domain_from_url(item.get("website")) or "").lower()
        name_key = text_key(name)
        website_key = (domain, name_key)
        website_name_count[website_key] = website_name_count.get(website_key, 0) + 1
        if domain and website_name_count[website_key] > 2:
            continue
        next_item = dict(item)
        next_item["name"] = name
        next_item["phoneDigits"] = digits
        next_item["phone"] = item.get("phone") or format_phone(digits)
        if domain and website_name_count[website_key] > 1:
            next_item["score"] = max(0, int(next_item.get("score") or 0) - 15)
        seen.add(digits)
        deduped.append(next_item)
    return deduped

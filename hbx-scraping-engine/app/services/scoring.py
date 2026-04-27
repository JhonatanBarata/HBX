import re

from .filters import expected_ddds, is_blocked_domain, is_directory_domain, is_generic_name, is_mobile_phone, phone_ddd


def _tokens(value: str) -> set[str]:
    return {token for token in re.split(r"\W+", value.lower()) if len(token) >= 4}


def score_contact(contact: dict, city: str, state: str, segment: str, page_text: str = "", is_directory: bool = False, target_type: str = "pj") -> int:
    score = 0
    name = str(contact.get("name") or "").strip()
    address = str(contact.get("address") or "")
    website = str(contact.get("website") or "")
    page_url = str(contact.get("_pageUrl") or "")
    city_l = city.lower()
    state_l = state.lower()
    address_l = address.lower()
    name_l = name.lower()
    page_l = page_text.lower()
    segment_tokens = _tokens(segment)
    automotive_tokens = {"oficina", "mecanica", "mecânica", "auto", "automotivo", "automotiva", "centro"}
    content_tokens = {"software", "academ", "acadêm", "engenharia", "curso", "faculdade", "universidade"}
    relevant_name = bool(segment_tokens & _tokens(name)) or any(token in name_l for token in automotive_tokens)
    expected = expected_ddds(city, state)
    ddd = phone_ddd(contact.get("phoneDigits"))
    if target_type == "pf":
        if contact.get("phoneDigits"):
            score += 55
        if is_mobile_phone(contact.get("phoneDigits")):
            score += 20
        if expected and ddd in expected:
            score += 15
        elif ddd:
            score -= 10
        if city_l in page_l or city_l in address_l or city_l in name_l or state_l in page_l or state_l in address_l:
            score += 20
        if name and not is_generic_name(name, city, "pf", segment) and len(name) > 2:
            score += 15
        else:
            score -= 45
        if website:
            score += 5
        if address:
            score += 5
        if is_blocked_domain(website) or is_blocked_domain(page_url):
            score -= 100
        if is_directory or is_directory_domain(website) or is_directory_domain(page_url):
            score -= 10
        return max(0, min(100, score))

    if contact.get("phoneDigits"):
        score += 40
    if name and not is_generic_name(name, city, "pj", segment) and len(name) > 2:
        score += 20
    else:
        score -= 35
    if expected and ddd in expected:
        score += 20
    elif ddd:
        score -= 35
    if address:
        if city_l in address_l:
            score += 15
        else:
            score -= 45
    elif city_l in page_l or city_l in name_l:
        score += 15
    else:
        score -= 30
    if website:
        score += 10
    if contact.get("address"):
        score += 10
    if contact.get("rating") is not None or contact.get("reviews") is not None:
        score += 5
    if not address and contact.get("rating") is None and contact.get("reviews") is None and not relevant_name:
        score -= 40
    if any(token in name_l for token in content_tokens):
        score -= 35
    if is_blocked_domain(website) or is_blocked_domain(page_url):
        score -= 100
    if is_directory or is_directory_domain(website) or is_directory_domain(page_url):
        score -= 25
    if is_generic_name(name, city, "pj", segment):
        score -= 35

    return max(0, min(100, score))

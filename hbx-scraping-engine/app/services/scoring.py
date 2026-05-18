import re

from .filters import (
    expected_ddds,
    is_blocked_lead_source_domain,
    is_directory_domain,
    is_generic_name,
    is_mobile_phone,
    is_pf_weak_domain,
    is_social_signal_domain,
    has_pf_role_text,
    name_conflicts_with_requested_segment,
    looks_like_person_name,
    looks_like_company_or_institution_name,
    phone_ddd,
)


def _tokens(value: str) -> set[str]:
    return {token for token in re.split(r"\W+", value.lower()) if len(token) >= 4}


def score_contact(contact: dict, city: str, state: str, segment: str, page_text: str = "", is_directory: bool = False, target_type: str = "pj") -> int:
    score = 0
    name = str(contact.get("name") or "").strip()
    address = str(contact.get("address") or "")
    website = str(contact.get("website") or "")
    page_url = str(contact.get("_pageUrl") or "")
    has_social_signal = bool(contact.get("instagramUrl") or contact.get("facebookUrl"))
    city_l = city.lower()
    state_l = state.lower()
    address_l = address.lower()
    name_l = name.lower()
    page_l = page_text.lower()
    page_url_l = page_url.lower()
    segment_tokens = _tokens(segment)
    automotive_tokens = {"oficina", "mecanica", "mecânica", "auto", "automotivo", "automotiva", "centro"}
    content_tokens = {"software", "academ", "acadêm", "engenharia", "curso", "faculdade", "universidade"}
    relevant_name = bool(segment_tokens & _tokens(name)) or any(token in name_l for token in automotive_tokens)
    expected = expected_ddds(city, state)
    ddd = phone_ddd(contact.get("phoneDigits"))
    if target_type == "pf":
        local_ddd = bool(expected and ddd in expected)
        if is_mobile_phone(contact.get("phoneDigits")):
            score += 55
        elif contact.get("phoneDigits"):
            score += 25
            score -= 15
        if local_ddd:
            score += 20
        elif ddd:
            score -= 30
        if looks_like_person_name(name):
            score += 15
        if any(token in page_l or token in name_l for token in ("consultor", "corretor", "vendedor", "representante", "whatsapp")):
            score += 10
        if city_l in page_l or city_l in address_l or city_l in name_l or state_l in page_l or state_l in address_l:
            score += 10
        if is_generic_name(name, city, "pf", segment):
            score -= 15
        if name and not is_generic_name(name, city, "pf", segment) and len(name) > 2:
            score += 5
        if not looks_like_person_name(name) and not has_pf_role_text(name):
            score -= 10
        if looks_like_company_or_institution_name(name):
            score -= 10
        if is_blocked_lead_source_domain(website) or is_blocked_lead_source_domain(page_url):
            score -= 100
        if is_pf_weak_domain(website) or is_pf_weak_domain(page_url):
            score -= 40
        if is_directory or is_directory_domain(website) or is_directory_domain(page_url):
            score -= 10
        return max(0, min(100, score))

    if contact.get("phoneDigits"):
        score += 40
    generic_name = is_generic_name(name, city, "pj", segment)
    if name and not generic_name and len(name) > 2:
        score += 20
    else:
        score -= 80
    if expected and ddd in expected:
        score += 20
    elif ddd:
        score -= 35
    if address:
        if city_l in address_l:
            score += 15
        elif city_l in page_l or city_l in page_url_l:
            score += 5
        else:
            score -= 45
    elif city_l in page_l or city_l in name_l:
        score += 15
    else:
        score -= 30
    if website:
        score += 10
    if has_social_signal:
        score += 8
    if contact.get("address"):
        score += 10
    if contact.get("rating") is not None or contact.get("reviews") is not None:
        score += 5
    if not address and contact.get("rating") is None and contact.get("reviews") is None and not relevant_name:
        score -= 40
    if any(token in name_l for token in content_tokens):
        score -= 35
    if is_blocked_lead_source_domain(website) or (is_blocked_lead_source_domain(page_url) and not has_social_signal):
        score -= 100
    if website and is_social_signal_domain(website) and not has_social_signal:
        score -= 100
    if is_directory or is_directory_domain(website) or is_directory_domain(page_url):
        score -= 25
    if generic_name:
        score -= 80
    if name_conflicts_with_requested_segment(name, segment):
        score -= 45
    if looks_like_person_name(name) and not looks_like_company_or_institution_name(name) and not relevant_name:
        score -= 45

    return max(0, min(100, score))

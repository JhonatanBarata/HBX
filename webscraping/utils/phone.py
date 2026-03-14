import re


def normalize_phone(raw_phone: str) -> str:
    return re.sub(r"\D+", "", raw_phone or "")


def canonical_br_phone(raw_phone: str) -> str:
    digits = normalize_phone(raw_phone)
    if digits.startswith("55"):
        digits = digits[2:]

    if len(digits) in (10, 11):
        return digits
    return ""


def is_likely_valid_br_phone(raw_phone: str) -> bool:
    return bool(canonical_br_phone(raw_phone))


def is_likely_whatsapp(raw_phone: str) -> bool:
    digits = canonical_br_phone(raw_phone)
    if not digits:
        return False

    return len(digits) == 11 and digits[2] == "9"


import re

from app.schemas import SearchIntent
from app.services.filters import domain_from_url, is_directory_domain, is_directory_listing_url, is_generic_name, text_key
from app.services.parser import is_directory_url
from app.services.social import is_valid_social_profile_url

from .evidence import Evidence


OFFICIAL_SOURCE_HINTS = ("google", "maps", "instagram", "facebook", "official", "site")
SENIOR_AUDIENCE_TERMS = {
    "idoso",
    "idosos",
    "60",
    "60+",
    "aposentado",
    "aposentados",
    "melhor idade",
    "terceira idade",
}
SENIOR_COMPATIBLE_TERMS = {
    "clinica",
    "clinicas",
    "farmacia",
    "farmacias",
    "laboratorio",
    "laboratorios",
    "medico",
    "medica",
    "cuidador",
    "cuidadores",
    "geriatria",
    "geriatrico",
    "casa de repouso",
    "repouso",
    "fisioterapia",
    "fisio",
    "otica",
    "oticas",
    "odontologia",
    "dentista",
    "associacao",
    "associacoes",
    "terceira idade",
    "melhor idade",
}


def _labels(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item or "").strip() for item in value if str(item or "").strip()]
    if isinstance(value, dict):
        raw = value.get("labels") if isinstance(value.get("labels"), list) else []
        hard = value.get("hardReject") if isinstance(value.get("hardReject"), list) else []
        return [str(item or "").strip() for item in [*raw, *hard] if str(item or "").strip()]
    return []


def _has_phone(contact: dict) -> bool:
    return bool(re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or "")))


def _label_matches(label: str, content_key: str) -> bool:
    tokens = [token for token in text_key(label).split() if len(token) >= 4]
    if not tokens:
        return False
    if len(tokens) == 1:
        return tokens[0] in content_key
    label_key = " ".join(tokens)
    return label_key in content_key or all(token in content_key for token in tokens)


def _channels(contact: dict) -> list[str]:
    channels: list[str] = []
    if _has_phone(contact):
        channels.extend(["phone", "whatsapp"])
    if contact.get("website"):
        channels.append("website")
    if contact.get("email"):
        channels.append("email")
    if contact.get("instagramUrl"):
        channels.append("instagram")
    if contact.get("facebookUrl"):
        channels.append("facebook")
    page_url = str(contact.get("_pageUrl") or contact.get("sourceUrl") or "")
    if page_url and "google." in page_url and "/maps" in page_url:
        channels.append("website")
    if page_url and ("instagram.com" in page_url or "facebook.com" in page_url) and is_valid_social_profile_url(page_url):
        channels.append("instagram" if "instagram.com" in page_url else "facebook")
    return list(dict.fromkeys(channels))


class EvidenceScorer:
    def commercial_fit(
        self,
        contact: dict,
        intent: SearchIntent,
        content: str,
        penalties: list[str],
        reasons: list[str],
        lead_content: str = "",
    ) -> tuple[int, int]:
        profile = intent.salesProfile or {}
        what = text_key(str(profile.get("whatDoYouSell") or profile.get("offerCategory") or ""))
        audience_labels = _labels(profile.get("targetAudience"))
        target_labels = _labels(profile.get("targetSegments"))
        avoid_labels = _labels(profile.get("avoidSegments"))
        hard_reject_labels = [
            *_labels(profile.get("hardRejectSegments")),
            *_labels({
                "labels": [],
                "hardReject": (profile.get("avoidSegments") or {}).get("hardReject", []) if isinstance(profile.get("avoidSegments"), dict) else [],
            }),
        ]
        content_key = text_key(content)
        lead_key = text_key(lead_content or content)
        score = 50
        penalty_score = 0

        for label in hard_reject_labels:
            if _label_matches(label, lead_key):
                penalties.append("commercial_hard_reject")
                reasons.append(f"Bloqueado por segmento rejeitado: {label}.")
                return 0, 100

        for label in avoid_labels:
            if _label_matches(label, lead_key):
                penalty_score += 25
                penalties.append("commercial_avoid_segment")
                reasons.append(f"Penalizado por segmento evitado: {label}.")

        if target_labels:
            matched = next((label for label in target_labels if _label_matches(label, lead_key)), "")
            if matched:
                score += 25
                reasons.append(f"Combina com seus segmentos-alvo: {matched}.")
            else:
                score -= 10

        senior_audience = any(any(term in text_key(label) for term in SENIOR_AUDIENCE_TERMS) for label in audience_labels)
        health_offer = any(token in what for token in ("plano", "saude", "saúde", "convenio", "convênio"))
        if senior_audience and health_offer:
            if any(term in content_key for term in SENIOR_COMPATIBLE_TERMS):
                score += 35
                reasons.append("Combina com seu público-alvo: idosos / plano de saúde.")
            else:
                score -= 20
                penalties.append("weak_senior_health_fit")

        if audience_labels and not senior_audience:
            matched_audience = next((label for label in audience_labels if _label_matches(label, lead_key)), "")
            if matched_audience:
                score += 15
                reasons.append(f"Combina com seu público-alvo: {matched_audience}.")

        return max(0, min(100, score)), penalty_score

    def score(self, contact: dict, intent: SearchIntent, page_text: str = "") -> Evidence:
        name = str(contact.get("name") or "").strip()
        page_url = str(contact.get("_pageUrl") or contact.get("sourceUrl") or "")
        source = str(contact.get("source") or "")
        channels = _channels(contact)
        required_social_present = any(
            channel in channels
            for channel in getattr(intent, "requiredChannels", [])
            if channel in {"instagram", "facebook"}
        )
        penalties: list[str] = []
        reasons: list[str] = []

        identity = 30 if name else 0
        generic_identity = is_generic_name(name, intent.city, intent.targetType, intent.segments[0] if intent.segments else "") if name else True
        if name and not generic_identity:
            identity += 35
            reasons.append("Nome comercial identificado.")
        else:
            penalties.append("generic_identity")

        contact_score = min(100, len(channels) * 24 + (18 if _has_phone(contact) else 0))
        if required_social_present:
            contact_score = max(contact_score, 44)
        if channels:
            reasons.append("Canal publico acionavel encontrado.")
        else:
            penalties.append("missing_actionable_channel")

        host = domain_from_url(contact.get("website") or page_url)
        directory_listing = is_directory_listing_url(page_url)
        directory = bool(is_directory_url(page_url) or is_directory_domain(host))
        source_score = 55
        if contact.get("website") and not directory:
            source_score += 20
            reasons.append("Site proprio encontrado.")
        if any(hint in f"{source} {page_url}".lower() for hint in OFFICIAL_SOURCE_HINTS):
            source_score += 12
        if required_social_present:
            source_score += 8
        if directory_listing or (directory and not _has_phone(contact) and not required_social_present):
            source_score -= 35
            penalties.append("generic_directory_source")
        elif directory:
            source_score -= 10
            reasons.append("Diretorio com contato proprio aproveitado.")

        intent_score = 35
        lead_commercial_content = " ".join([
            name,
            str(contact.get("address") or ""),
            str(contact.get("segment") or ""),
            str(contact.get("businessCategory") or ""),
            page_url,
        ])
        commercial_content = " ".join([lead_commercial_content, page_text])
        content = text_key(commercial_content)
        if intent.city and text_key(intent.city) in content:
            intent_score += 25
        if intent.state and text_key(intent.state) in content:
            intent_score += 10
        for segment in intent.segments:
            tokens = [token for token in text_key(segment).split() if len(token) >= 4]
            if tokens and any(token in content for token in tokens):
                intent_score += 25
                break
        if intent.preferredChannels and any(channel in channels for channel in intent.preferredChannels):
            intent_score += 12
            reasons.append("Canal preferido presente.")

        freshness = 65 if intent.freshness in {"live", "hybrid"} else 45
        commercial_fit, penalty_score = self.commercial_fit(contact, intent, commercial_content, penalties, reasons, lead_commercial_content)
        raw = (
            min(identity, 100) * 0.25
            + min(contact_score, 100) * 0.20
            + min(source_score, 100) * 0.15
            + min(intent_score, 100) * 0.15
            + min(commercial_fit, 100) * 0.20
            + min(freshness, 100) * 0.05
        ) - penalty_score
        if "missing_actionable_channel" in penalties and not required_social_present:
            raw = min(raw, 35)
        if "commercial_hard_reject" in penalties:
            raw = 0
        if directory and not (contact.get("website") or contact.get("instagramUrl") or contact.get("facebookUrl")):
            raw = min(raw, 54)

        # Operational safety net: Radar must not return zero just because a useful
        # live contact from a directory/source scored slightly below the approval
        # threshold. Hard rejects and contacts without any actionable channel still
        # stay blocked; actionable candidates become review/list cards.
        if channels and "commercial_hard_reject" not in penalties and not generic_identity:
            raw = max(raw, 52)
            if raw < 56:
                reasons.append("Mantido para revisão por ter canal acionável e identidade comercial.")

        final = max(0, min(100, round(raw)))
        return Evidence(
            identityScore=max(0, min(100, identity)),
            contactScore=max(0, min(100, contact_score)),
            sourceScore=max(0, min(100, source_score)),
            intentScore=max(0, min(100, intent_score)),
            commercialFitScore=max(0, min(100, commercial_fit)),
            freshnessScore=max(0, min(100, freshness)),
            penalties=penalties,
            penaltyScore=max(0, min(100, penalty_score)),
            channels=channels,
            reasons=reasons,
            finalScore=final,
        )

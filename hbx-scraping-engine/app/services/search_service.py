import asyncio
import base64
import html
import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import httpx
from ddgs import DDGS

from app.config import DB_PATH, get_settings
from app.schemas import ContactResult, EnrichLeadRequest, EnrichLeadResponse, QueryPayload, SearchIntent, SearchRequest, SearchResponse
from app.search.enrichment.provider_router import LeadEnrichmentProviderRouter
from app.search.rank import EvidenceScorer
from app.search.sources import build_intent_discovery_queries, discover_social_profiles, discover_urls
from app.services.web_search_service import WebSearchService

from .agenda_sources import dedupe_by_phone, search_abctelefonos
from .fetcher import Fetcher
from .filters import domain_from_url, expected_ddds, is_blocked_lead_source_domain, is_generic_name, is_pf_technical_blocked_domain, is_social_signal_domain, phone_ddd, text_key
from .normalizer import dedupe_contacts
from .parser import is_directory_listing_page, is_directory_url, parse_page
from .scoring import score_contact
from .social import extract_social_links_from_html, is_valid_social_profile_url, normalize_social_url, social_field_for_url
from .storage import Storage

SOCIAL_ENRICH_MAX_RESULTS_PER_QUERY = 12
SOCIAL_ENRICH_MAX_CONTACTS_REQUIRED = 4
SOCIAL_ENRICH_MAX_CONTACTS_PREFERRED = 30
SOCIAL_ENRICH_MAX_QUERIES_PER_CHANNEL = 10
SOCIAL_ENRICH_MAX_HANDLE_VALIDATIONS = 10
SOCIAL_ENRICH_TOTAL_BUDGET_SECONDS = 90
SOCIAL_ENRICH_SEARCH_TIMEOUT_SECONDS = 4
SOCIAL_ENRICH_WEBSITE_MAX_QUERIES = 3
SOCIAL_BRIDGE_HOST_PARTS = (
    "linktr.ee",
    "linktree.com",
    "bio.link",
    "beacons.ai",
    "pixnoy.com",
    "pixwox.com",
    "picuki.com",
    "dumpor.com",
    "imginn.com",
    "inflact.com",
)
INSTAGRAM_MIRROR_HOST_PARTS = ("pixnoy.com", "pixwox.com", "picuki.com", "dumpor.com", "imginn.com", "inflact.com")
OFFICIAL_WEBSITE_PROBE_TLDS = ("com.br", "com")
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
CNPJ_RE = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
BAD_EMAIL_LOCAL_PARTS = {
    "asset",
    "assets",
    "example",
    "email",
    "favicon",
    "icon",
    "image",
    "img",
    "logo",
    "sprite",
    "teste",
    "test",
    "usuario",
    "user",
}
BAD_EMAIL_TLDS = {"css", "gif", "jpeg", "jpg", "js", "png", "svg", "webp"}
BAD_EMAIL_DOMAINS = {
    "bit.ly",
    "benditoguia.com.br",
    "econodata.com.br",
    "example.com",
    "example.com.br",
    "facebook.com",
    "fb.com",
    "goo.gl",
    "google.com",
    "instagram.com",
    "linktr.ee",
    "maps.app.goo.gl",
    "polomap.com",
    "restaurantguru.com",
    "restaurantguru.com.br",
    "solutudo.com.br",
    "test.com",
    "teste.com",
    "top-rated.online",
    "wa.me",
    "whatsapp.com",
    "wixsite.com",
    "dominio.com",
}

OFFICIAL_WEBSITE_BLOCKED_DOMAINS = {
    "aguasdesaopedro.com.br",
    "acheiempresa.com.br",
    "applocal.com.br",
    "benditoguia.com.br",
    "brazilguide.net",
    "cardapio.menu",
    "cylex.com.br",
    "eguias.net",
    "econodata.com.br",
    "guia.provik.com.br",
    "listamais.com.br",
    "misterwhat.com.br",
    "paginaamarela.com.br",
    "polomap.com",
    "restaurantguru.com",
    "restaurantguru.com.br",
    "sneps.com.br",
    "solutudo.com.br",
    "top-rated.online",
    "locaisdobrasil.com.br",
    "directmap.biz",
    "gupy.io",
    "linkedin.com",
    "pizzariaspertodemim.com",
    "siteindices.com",
    "tripadvisor.com",
    "tripadvisor.com.br",
    "urlm.com.br",
    "visitmestre.com",
}

SOCIAL_QUERY_BAD_NAME_HINTS = (
    "confira as melhores",
    "todos os estabelecimentos",
    "melhores opcoes",
    "melhores opções",
    "diversos",
    "papai noel",
    "guia",
    "lista",
    "catalogo",
    "catálogo",
)

SOCIAL_QUERY_STOP_TOKENS = {
    "confira",
    "melhores",
    "opcoes",
    "opções",
    "opcao",
    "opção",
    "todos",
    "estabelecimentos",
    "diversos",
    "cidade",
    "telefone",
    "contato",
    "guia",
    "lista",
}

BUSINESS_NAME_STOP_TOKENS = {
    "administradora",
    "administradoras",
    "bens",
    "cia",
    "comercio",
    "companhia",
    "corretor",
    "corretora",
    "corretoras",
    "corretores",
    "das",
    "de",
    "do",
    "dos",
    "eireli",
    "empreendimento",
    "empreendimentos",
    "gestao",
    "imobiliario",
    "imobiliarios",
    "ltda",
    "me",
    "moraes",
    "negocios",
    "participacoes",
    "servico",
    "servicos",
    "spe",
}

BUSINESS_CATEGORY_TOKENS = {
    "auto",
    "bar",
    "bares",
    "barbearia",
    "beleza",
    "borracharia",
    "borracharias",
    "calcado",
    "calcados",
    "center",
    "choperia",
    "clinica",
    "confeccao",
    "confeccoes",
    "corte",
    "cortes",
    "confeitaria",
    "confeitarias",
    "delivery",
    "doceria",
    "docerias",
    "doces",
    "esmalteria",
    "espetinho",
    "estetica",
    "gastronomia",
    "hamburgueria",
    "imobiliaria",
    "imobiliarias",
    "imoveis",
    "imovel",
    "japones",
    "kids",
    "lanches",
    "lancheria",
    "lancherias",
    "lanchonete",
    "lanchonetes",
    "lounge",
    "loja",
    "marmitaria",
    "moda",
    "oficina",
    "oficinas",
    "padaria",
    "padarias",
    "pneu",
    "pneus",
    "pizzaiolo",
    "pizzaria",
    "pizza",
    "pizzas",
    "salao",
    "saude",
    "restaurante",
    "restaurantes",
    "sobrancelha",
    "studio",
    "sushi",
    "trattoria",
    "trattorias",
}

SOCIAL_GENERIC_BUSINESS_TOKENS = BUSINESS_CATEGORY_TOKENS | {
    "artificial",
    "beauty",
    "beleza",
    "bem",
    "bronzeamento",
    "cabelo",
    "cabelos",
    "calcado",
    "calcados",
    "clinica",
    "confeccao",
    "confeccoes",
    "coworking",
    "cortes",
    "design",
    "delivery",
    "espaco",
    "esmalteria",
    "estar",
    "estetica",
    "kids",
    "lanches",
    "lancheria",
    "lancherias",
    "lanchonete",
    "lanchonetes",
    "loja",
    "manicure",
    "moda",
    "penteados",
    "podologia",
    "pizzaria",
    "pizza",
    "pizzas",
    "restaurante",
    "restaurantes",
    "salao",
    "saude",
    "sobrancelha",
    "studio",
}

WEBSITE_GENERIC_HOST_TOKENS = SOCIAL_GENERIC_BUSINESS_TOKENS | {
    "animal",
    "animais",
    "medica",
    "medicas",
    "medico",
    "medicos",
    "odontologica",
    "odontologicas",
    "odontologico",
    "odontologicos",
    "pet",
    "pets",
    "vet",
    "veterinaria",
    "veterinarias",
    "veterinario",
    "veterinarios",
}

WEAK_SOCIAL_DISTINCTIVE_TOKENS = {
    "absolute",
    "bella",
    "belle",
    "bello",
    "bem",
    "bigode",
    "casa",
    "casas",
    "central",
    "centro",
    "class",
    "clinic",
    "comercial",
    "estilo",
    "express",
    "forte",
    "ideal",
    "imperio",
    "mais",
    "max",
    "mega",
    "melhor",
    "nova",
    "novo",
    "oficial",
    "popular",
    "prime",
    "real",
    "santa",
    "santo",
    "top",
    "vip",
}


class SearchService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.storage = Storage(DB_PATH, self.settings.cache_ttl_hours)
        self.evidence_scorer = EvidenceScorer()
        self.lead_provider_router = LeadEnrichmentProviderRouter()
        self.web_search_service = WebSearchService()

    def requested_social_channels(
        self,
        preferred_channels: list[str] | None = None,
        required_channels: list[str] | None = None,
    ) -> set[str]:
        channels = set(preferred_channels or []) | set(required_channels or [])
        return {channel for channel in channels if channel in {"instagram", "facebook"}}

    def effective_requested_social_channels(self, request: SearchRequest) -> set[str]:
        return self.requested_social_channels(request.preferredChannels, request.requiredChannels)

    def effective_discovery_channels(self, request: SearchRequest) -> list[str]:
        return list(dict.fromkeys([*(request.requiredChannels or []), *(request.preferredChannels or [])]))

    def required_social_channels(self, required_channels: list[str] | None = None) -> set[str]:
        return {channel for channel in (required_channels or []) if channel in {"instagram", "facebook"}}

    def has_required_social_channels(self, contact: dict, required_channels: set[str]) -> bool:
        if not required_channels:
            return True
        # Compatibilidade legada: isso é diagnóstico/prioridade de busca, não regra de descarte.
        return any(
            contact.get("instagramUrl" if channel == "instagram" else "facebookUrl")
            for channel in required_channels
        )

    def contact_channels(self, contact: dict) -> set[str]:
        channels: set[str] = set()
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        if phone_digits:
            channels.update({"phone", "whatsapp"})
        if contact.get("website"):
            channels.add("website")
        if contact.get("email"):
            channels.add("email")
        if contact.get("instagramUrl"):
            channels.add("instagram")
        if contact.get("facebookUrl"):
            channels.add("facebook")
        page_url = str(contact.get("_pageUrl") or contact.get("sourceUrl") or "")
        if "instagram.com" in page_url and is_valid_social_profile_url(page_url):
            channels.add("instagram")
        if "facebook.com" in page_url and is_valid_social_profile_url(page_url):
            channels.add("facebook")
        if re.match(r"^https?://(?:www\.)?(?:google\.[^/]+/maps|maps\.app\.goo\.gl)/", page_url, re.I):
            channels.add("website")
        return channels

    def recommended_channel_for_contact(self, contact: dict, required_channels: list[str] | None = None) -> str:
        channels = self.contact_channels(contact)
        for channel in required_channels or []:
            if channel in {"instagram", "facebook"} and channel in channels:
                return channel
        return next((channel for channel in ["whatsapp", "instagram", "facebook", "email", "website", "phone"] if channel in channels), "review")

    def matches_channel_intent(self, contact: dict, request: SearchRequest) -> bool:
        required = list(request.requiredChannels or [])
        if not required:
            return True
        channels = self.contact_channels(contact)
        if request.channelMatchMode == "all_required":
            return all(channel in channels for channel in required)
        return any(channel in channels for channel in required)

    def has_public_actionable_channel(self, item: dict) -> bool:
        phone_digits = re.sub(r"\D", "", str(item.get("phoneDigits") or item.get("phone") or ""))
        page_url = str(item.get("_pageUrl") or item.get("sourceUrl") or "").strip()
        page_host = domain_from_url(page_url)
        page_social_field = social_field_for_url(page_url)
        page_is_valid_social = bool(page_social_field and is_valid_social_profile_url(page_url))
        page_is_maps = bool(re.match(r"^https?://(?:www\.)?(?:google\.[^/]+/maps|maps\.app\.goo\.gl)/", page_url, re.I))
        page_is_compatible_domain = False
        if page_url and page_host and not is_blocked_lead_source_domain(page_host) and not is_social_signal_domain(page_host):
            page_is_compatible_domain = self.score_website_candidate(
                item,
                {"title": item.get("name"), "href": page_url, "url": page_url},
                page_url,
                str(item.get("city") or ""),
            ) > 0
        return bool(
            phone_digits
            or item.get("instagramUrl")
            or item.get("facebookUrl")
            or item.get("website")
            or item.get("email")
            or page_is_valid_social
            or page_is_maps
            or page_is_compatible_domain
        )

    def time_budget_expired(self, deadline: float | None) -> bool:
        return bool(deadline is not None and time.monotonic() >= deadline)

    def remaining_budget_seconds(self, deadline: float | None, default: float) -> float:
        if deadline is None:
            return default
        return max(0.1, min(default, deadline - time.monotonic()))

    def record_possible_social_candidate(
        self,
        contact: dict,
        stats: dict,
        field: str,
        url: str,
        score: int,
        reason: str,
        query: str = "",
        method: str = "",
        evidence: dict | None = None,
    ) -> None:
        normalized = normalize_social_url(url) or str(url or "").strip()
        if not normalized:
            return
        candidate = {
            "field": field,
            "channel": "instagram" if field == "instagramUrl" else "facebook",
            "url": normalized,
            "score": max(0, min(100, int(score or 0))),
            "status": "possible",
            "reason": reason,
            "query": query,
            "method": method,
            "evidence": evidence or {},
        }
        contact.setdefault("possibleSocialCandidates", [])
        stats.setdefault("possibleSocialCandidates", [])
        seen = {
            str(item.get("url") or "").rstrip("/").lower()
            for item in contact.get("possibleSocialCandidates") or []
            if isinstance(item, dict)
        }
        if normalized.rstrip("/").lower() in seen:
            return
        contact["possibleSocialCandidates"].append(candidate)
        stats["possibleSocialCandidates"].append(candidate)

    def compact_key(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", text_key(value))

    def quote_query_part(self, value: str) -> str:
        text = " ".join(str(value or "").replace('"', " ").replace("'", " ").split())
        return f'"{text}"' if text else ""

    def social_name_tokens(self, value: str) -> list[str]:
        key = text_key(value)
        return [token for token in key.split() if len(token) >= 4 and token not in SOCIAL_QUERY_STOP_TOKENS]

    def distinctive_social_name_tokens(self, value: str) -> list[str]:
        key = text_key(value)
        tokens = []
        for token in key.split():
            if len(token) < 3:
                continue
            if token in SOCIAL_QUERY_STOP_TOKENS or token in BUSINESS_NAME_STOP_TOKENS or token in SOCIAL_GENERIC_BUSINESS_TOKENS:
                continue
            tokens.append(token)
        return list(dict.fromkeys(tokens))

    def business_name_variants(self, value: str) -> list[str]:
        text = " ".join(str(value or "").split())
        key = text_key(text)
        if not key:
            return []
        tokens = [token for token in key.split() if token not in BUSINESS_NAME_STOP_TOKENS]
        all_tokens = key.split()
        category = next((token for token in tokens if token in BUSINESS_CATEGORY_TOKENS), "")
        commercial = next((token for token in tokens if token not in BUSINESS_CATEGORY_TOKENS and len(token) >= 4), "")
        structural_tokens = {
            "construcao",
            "construcoes",
            "construtora",
            "construtoras",
            "engenharia",
            "engenharias",
            "empreendimento",
            "empreendimentos",
        }
        distinctive_tokens = [
            token for token in tokens
            if token not in BUSINESS_CATEGORY_TOKENS
            and token not in structural_tokens
            and len(token) >= 4
        ]
        variants = [text]
        if category and commercial:
            variants.extend([
                f"{category} {commercial}",
                f"{category} do {commercial}",
                f"{commercial} {category}",
            ])
        if len(distinctive_tokens) >= 2:
            variants.append(" ".join(distinctive_tokens[:3]))
            variants.append("".join(distinctive_tokens[:3]))
            variants.append(" ".join(distinctive_tokens[-2:]))
            variants.append("".join(distinctive_tokens[-2:]))
        compact = "".join(token for token in [category, commercial] if token)
        if compact:
            variants.append(compact)
        if commercial and any(token in {"imobiliaria", "imobiliarias", "imoveis", "imovel", "corretor", "corretores"} for token in all_tokens):
            variants.extend([
                f"{commercial} imoveis",
                f"{commercial} imobiliaria",
                f"{commercial} imovel",
                f"{commercial}imoveis",
                f"{commercial}imobiliaria",
            ])
        return list(dict.fromkeys(variant for variant in variants if variant.strip()))

    def business_social_handle_candidates(self, value: str, city: str = "") -> list[str]:
        key = text_key(value)
        if not key:
            return []
        tokens = [token for token in key.split() if token not in BUSINESS_NAME_STOP_TOKENS and token not in {"e"}]
        city_key = self.compact_key(city)
        city_initials = self.city_initials_key(city)
        distinctive = self.distinctive_social_name_tokens(value)
        category = next((token for token in tokens if token in BUSINESS_CATEGORY_TOKENS), "")
        handle_prefix_tokens = {
            "clinica",
            "clinicas",
            "veterinaria",
            "veterinarias",
            "veterinario",
            "veterinarios",
        }
        brand_tokens = [token for token in tokens if token not in handle_prefix_tokens]
        brand_compact = "".join(brand_tokens)
        brand_bases = [brand_compact]
        if category and brand_compact:
            brand_bases.append(f"{category}{brand_compact}")
        candidates: list[str] = []
        category_brand_compact = f"{category}{brand_compact}" if category and brand_compact else ""
        priority_candidates = [
            f"{brand_compact}{city_key}" if brand_compact.startswith("vet") and city_key else "",
            brand_compact,
            f"{category_brand_compact}{city_initials}" if category_brand_compact and city_initials else "",
            f"{brand_compact}{city_key}" if brand_compact and city_key else "",
            category_brand_compact,
            f"{brand_compact}{city_initials}" if brand_compact and city_initials else "",
            f"{category_brand_compact}{city_key}" if category_brand_compact and city_key else "",
        ]
        for candidate in priority_candidates:
            if 5 <= len(candidate) <= 32:
                candidates.append(candidate)
        for variant in self.business_name_variants(value):
            compact = re.sub(r"[^a-z0-9]+", "", text_key(variant))
            if 5 <= len(compact) <= 32:
                candidates.append(compact)
        compact_all = "".join(tokens)
        if 5 <= len(compact_all) <= 32:
            candidates.append(compact_all)
            if len(compact_all) + len("oficial") <= 32:
                candidates.append(f"{compact_all}oficial")
        if category and distinctive:
            for token in distinctive[:2]:
                candidates.append(f"{category}{token}")
                candidates.append(f"{category}do{token}")
                candidates.append(f"{category}da{token}")
                candidates.append(f"{category}de{token}")
                candidates.append(f"{token}{category}")
                if not token.endswith("s"):
                    candidates.append(f"{token}s{category}")
                if len(f"{token}{category}oficial") <= 32:
                    candidates.append(f"{token}{category}oficial")
                if len(f"{category}{token}oficial") <= 32:
                    candidates.append(f"{category}{token}oficial")
        if any(token in {"imobiliaria", "imobiliarias", "imoveis", "imovel", "corretor", "corretores"} for token in key.split()):
            for token in distinctive[:2]:
                if 3 <= len(token) <= 24:
                    candidates.append(f"{token}imoveis")
                    candidates.append(f"{token}imobiliaria")
                    candidates.append(f"imobiliaria{token}")
                    candidates.append(f"imoveis{token}")
        for token in distinctive[:2]:
            if 4 <= len(token) <= 24:
                candidates.append(token)
                candidates.append(f"loja{token}")
                candidates.append(f"{token}loja")
                if len(f"{token}oficial") <= 32:
                    candidates.append(f"{token}oficial")
        return list(dict.fromkeys(candidates))

    def social_url_handle_key(self, url: str) -> str:
        normalized = normalize_social_url(url) or ""
        parsed = urlparse(normalized)
        parts = [part for part in parsed.path.split("/") if part]
        return re.sub(r"[^a-z0-9]+", "", text_key(parts[0] if parts else ""))

    def city_initials_key(self, city: str) -> str:
        tokens = [token for token in text_key(city).split() if len(token) >= 3]
        if len(tokens) < 2:
            return ""
        return "".join(token[0] for token in tokens)

    def social_identity_tokens(self, contact: dict) -> tuple[list[str], list[str]]:
        name = str(contact.get("name") or "")
        segment = str(contact.get("segment") or "")
        name_tokens = self.social_name_tokens(name)
        segment_tokens = self.social_name_tokens(segment.replace("/", " "))
        category_tokens = [
            token
            for token in [*name_tokens, *segment_tokens]
            if token in BUSINESS_CATEGORY_TOKENS or token in SOCIAL_GENERIC_BUSINESS_TOKENS
        ]
        distinctive_tokens = self.distinctive_social_name_tokens(name)
        return list(dict.fromkeys(category_tokens)), list(dict.fromkeys(distinctive_tokens))

    def social_category_token_variants(self, token: str) -> list[str]:
        normalized = text_key(token)
        variants = [normalized]
        if len(normalized) >= 5 and normalized.endswith("s"):
            variants.append(normalized[:-1])
        if normalized in {"pizzaria", "pizzarias"}:
            variants.extend(["pizza", "pizzas"])
        if normalized in {"lanchonete", "lanchonetes"}:
            variants.append("lanches")
        if normalized in {"restaurante", "restaurantes"}:
            variants.extend(["restaurante", "restaurantes"])
        return list(dict.fromkeys(value for value in variants if value))

    def handle_matches_business_identity(self, handle_key: str, category_tokens: list[str], distinctive_tokens: list[str]) -> bool:
        if not handle_key or not category_tokens or not distinctive_tokens:
            return False
        strong_distinctive_tokens = [
            token
            for token in distinctive_tokens
            if len(token) >= 4 and token not in WEAK_SOCIAL_DISTINCTIVE_TOKENS
        ]
        if not strong_distinctive_tokens:
            return False
        category_variants = [
            variant
            for token in category_tokens
            for variant in self.social_category_token_variants(token)
        ]
        has_category = any(token and token in handle_key for token in category_variants)
        has_distinctive = any(token and token in handle_key for token in strong_distinctive_tokens)
        return has_category and has_distinctive

    def is_bad_social_candidate_name(self, name: str, city: str, segment: str) -> bool:
        key = text_key(name)
        if not key:
            return True
        if any(text_key(hint) in key for hint in SOCIAL_QUERY_BAD_NAME_HINTS):
            return True
        if key in {text_key(city), text_key(segment), "home", "contato", "telefone", "inicio", "pagina inicial"}:
            return True
        tokens = self.social_name_tokens(name)
        return len(tokens) == 0

    def should_try_social_enrichment(self, contact: dict, city: str, segment: str, required_social: set[str]) -> bool:
        if not contact.get("name"):
            return False
        if self.is_bad_social_candidate_name(str(contact.get("name") or ""), city, segment):
            return False
        if is_generic_name(contact.get("name"), city, "pj", segment):
            return False
        if int(contact.get("score") or 0) < 50 and not required_social:
            return False
        return True

    def text_variants(self, value: str) -> list[str]:
        text = " ".join(str(value or "").replace('"', " ").split())
        if not text:
            return []
        ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
        return list(dict.fromkeys([text, ascii_text]))

    def segment_query_variants(self, segment: str) -> list[str]:
        text = " ".join(str(segment or "").replace('"', " ").split())
        key = text_key(text)
        variants = [text] if text else []
        def add(items: list[str]) -> None:
            for item in items:
                if item and item not in variants:
                    variants.append(item)
        if re.search(r"salao|saloes|beleza|cabeleireiro|cabelo|estetica|manicure|pedicure|sobrancelha|esmalteria", key):
            add(["salao de beleza", "saloes de beleza", "cabeleireiro", "estetica", "manicure"])
        if re.search(r"barbearia|barbeiro|barber", key):
            add(["barbearia", "barbearias", "barbeiro", "barbershop"])
        if re.search(r"pet|veterin|banho|tosa", key):
            add(["pet shop", "clinica veterinaria", "banho e tosa"])
        if re.search(r"restaurante|pizzaria|lanchonete|hamburguer|delivery|choperia|bar", key):
            add(["restaurante", "delivery", "cardapio", "reservas"])
        if re.search(r"oficina|auto|pneu|mecanica|funilaria|borracharia", key):
            add(["oficina mecanica", "auto center", "borracharia", "pneus"])
        if re.search(r"clinica|medic|odont|saude|fisioterapia|psicolog", key):
            add(["clinica", "consultorio", "agendamento"])
        return variants[:8]

    def social_queries_for_contact(self, contact: dict, city: str, segment: str, channel: str) -> list[str]:
        name = " ".join(str(contact.get("name") or "").split())
        city_text = " ".join(str(city or "").split())
        state_text = " ".join(str(contact.get("state") or "").split()).upper()
        segment_text = " ".join(str(segment or "").split())
        if not name or not city_text or self.is_bad_social_candidate_name(name, city_text, segment_text):
            return []
        domain = "instagram.com" if channel == "instagram" else "facebook.com"
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
        website_domain = domain_from_url(contact.get("website"))
        website_stem = text_key(website_domain.split(".")[0] if website_domain else "")
        name_tokens = self.social_name_tokens(name)
        compact_name = "".join(name_tokens)
        segment_variants = self.segment_query_variants(segment_text)
        queries: list[str] = []
        if state_text:
            queries.append(f"{self.quote_query_part(name)} {self.quote_query_part(city_text)} {self.quote_query_part(state_text)} {channel}".strip())
            queries.append(f"site:{domain} {self.quote_query_part(name)} {self.quote_query_part(city_text)} {self.quote_query_part(state_text)}".strip())
        primary_brand_tokens = [
            token
            for token in self.distinctive_social_name_tokens(name)
            if len(token) >= 5
            and token not in WEAK_SOCIAL_DISTINCTIVE_TOKENS
            and token not in WEBSITE_GENERIC_HOST_TOKENS
        ]
        for name_variant in self.text_variants(name):
            q_name = self.quote_query_part(name_variant)
            if not q_name:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                queries.append(f"{q_name} {q_city} {channel}".strip())
                queries.append(f"site:{domain} {q_name} {q_city}".strip())
        for token in primary_brand_tokens[:1]:
            q_token = self.quote_query_part(token)
            if not q_token:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                queries.append(f"{q_token} {q_city} {channel}".strip())
                queries.append(f"site:{domain} {q_token} {q_city}".strip())
        for name_variant in self.text_variants(name):
            q_name = self.quote_query_part(name_variant)
            if not q_name:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                for segment_variant in segment_variants[:3]:
                    q_segment = self.quote_query_part(segment_variant)
                    if q_segment:
                        queries.append(f"{q_name} {q_city} {q_segment} {channel}".strip())
                        queries.append(f"site:{domain} {q_name} {q_city} {q_segment}".strip())
        top_handles = self.business_social_handle_candidates(name, city_text)[:10]
        for handle in top_handles:
            queries.append(f"{handle} {channel}")
        for handle in top_handles[:5]:
            queries.append(f"site:{domain} {handle}")
        for name_variant in self.text_variants(name):
            q_name = self.quote_query_part(name_variant)
            if not q_name:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                queries.append(f"{q_name} {q_city} {channel}".strip())
                queries.append(f"site:{domain} {q_name} {q_city}".strip())
                for segment_variant in segment_variants[:4]:
                    q_segment = self.quote_query_part(segment_variant)
                    if q_segment:
                        queries.append(f"{q_name} {q_segment} {q_city} {channel}".strip())
        for token in self.distinctive_social_name_tokens(name)[:2]:
            q_token = self.quote_query_part(token)
            if not q_token:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                queries.append(f"{q_token} {q_city} {channel}".strip())
                queries.append(f"site:{domain} {q_token} {q_city}".strip())
        if website_stem and len(website_stem) >= 4:
            queries.append(f"{website_stem} {channel}")
            queries.append(f"site:{domain} {website_stem}")
        for handle in self.business_social_handle_candidates(name, city_text):
            queries.append(f"{handle} {channel}")
            queries.append(f"site:{domain} {handle}")
        if phone_tail:
            queries.append(f"site:{domain} {self.quote_query_part(phone_tail)}")
            queries.append(f"{self.quote_query_part(phone_tail)} {channel}")
            queries.append(f"{self.quote_query_part(name)} {self.quote_query_part(phone_tail)} {channel}".strip())
        for business_variant in self.business_name_variants(name):
            q_variant = self.quote_query_part(business_variant)
            if not q_variant:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                queries.append(f"{q_variant} {q_city} {channel}".strip())
                queries.append(f"site:{domain} {q_variant} {q_city}".strip())
        for name_variant in self.text_variants(name):
            q_name = self.quote_query_part(name_variant)
            if not q_name:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                if segment_text:
                    queries.append(f"{q_name} {self.quote_query_part(segment_text)} {q_city} {channel}".strip())
            if phone_tail:
                queries.append(f"{q_name} {self.quote_query_part(phone_tail)} {channel}".strip())
            if website_domain:
                queries.append(f"{q_name} {self.quote_query_part(website_domain)} {channel}".strip())
        if compact_name:
            queries.append(f"{compact_name} {channel}")
            queries.append(f"site:{domain} {compact_name}")
        return list(dict.fromkeys(query.strip() for query in queries if query.strip()))[:36]

    def score_social_candidate(self, contact: dict, row: dict, url: str, channel: str, city: str, segment: str, query: str = "") -> int:
        score = 0
        normalized_url = normalize_social_url(url)
        if not normalized_url or social_field_for_url(normalized_url) != ("instagramUrl" if channel == "instagram" else "facebookUrl"):
            return -100
        raw_text = " ".join(
            str(row.get(key) or "")
            for key in ("title", "body", "snippet", "description", "href", "url")
        )
        parsed_url = urlparse(normalized_url)
        path_text = " ".join(part for part in parsed_url.path.split("/") if part)
        path_key = text_key(path_text)
        path_compact = re.sub(r"[^a-z0-9]+", "", path_key)
        combined = f"{raw_text} {normalized_url} {path_text}"
        combined_key = text_key(combined)
        combined_compact = re.sub(r"[^a-z0-9]+", "", combined_key)
        query_key = text_key(query)
        query_compact = re.sub(r"[^a-z0-9]+", "", query_key)
        name_key = text_key(contact.get("name"))
        name_compact = re.sub(r"[^a-z0-9]+", "", name_key)
        handle_prefix_tokens = {
            "clinica",
            "clinicas",
            "veterinaria",
            "veterinarias",
            "veterinario",
            "veterinarios",
        }
        brand_compact = "".join(
            token
            for token in name_key.split()
            if token not in BUSINESS_NAME_STOP_TOKENS
            and token not in handle_prefix_tokens
            and token != "e"
        )
        city_key = text_key(city)
        city_compact = self.compact_key(city)
        city_initials = self.city_initials_key(city)
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
        website_domain = domain_from_url(contact.get("website"))
        domain_key = text_key(website_domain)
        website_stem = text_key(website_domain.split(".")[0] if website_domain else "")
        name_tokens = self.social_name_tokens(str(contact.get("name") or ""))
        category_tokens, distinctive_tokens = self.social_identity_tokens(contact)
        strong_distinctive_tokens = [
            token
            for token in distinctive_tokens
            if len(token) >= 4 and token not in WEAK_SOCIAL_DISTINCTIVE_TOKENS
        ]
        business_distinctive_tokens = [
            token
            for token in strong_distinctive_tokens
            if token not in SOCIAL_GENERIC_BUSINESS_TOKENS
            and token not in WEBSITE_GENERIC_HOST_TOKENS
        ]
        handle_key = self.social_url_handle_key(normalized_url)
        variant_compacts = [
            re.sub(r"[^a-z0-9]+", "", text_key(variant))
            for variant in self.business_name_variants(str(contact.get("name") or ""))
        ]
        exact_name_match = bool(
            name_key and name_key in combined_key
            or name_compact and len(name_compact) >= 8 and name_compact in combined_compact
        )
        variant_match = any(
            compact and len(compact) >= 6 and (compact in path_compact or compact in combined_compact)
            for compact in variant_compacts
        )
        distinctive_combined_matches = sum(1 for token in distinctive_tokens if token in combined_key)
        strong_distinctive_combined_matches = sum(1 for token in strong_distinctive_tokens if token in combined_key)
        distinctive_path_matches = sum(1 for token in distinctive_tokens if token in path_key or token in path_compact)
        strong_distinctive_path_matches = sum(1 for token in strong_distinctive_tokens if token in path_key or token in path_compact)
        generic_matches = sum(1 for token in name_tokens if token in combined_key)
        category_match = any(token in combined_key or token in path_key or token in path_compact for token in category_tokens)
        handle_identity_match = self.handle_matches_business_identity(handle_key, category_tokens, distinctive_tokens)
        handle_distinctive_match = any(token and token in handle_key for token in distinctive_tokens)
        strong_handle_distinctive_match = any(token and token in handle_key for token in strong_distinctive_tokens)
        business_variant_compacts = [
            compact
            for compact in variant_compacts
            if compact not in set(strong_distinctive_tokens)
        ]
        handle_business_variant_match = any(
            compact and len(compact) >= 6 and (compact in handle_key or handle_key in compact)
            for compact in business_variant_compacts
        )
        handle_city_initials_match = bool(city_initials and handle_key.endswith(city_initials))
        query_name_match = bool(
            name_key and name_key in query_key
            or name_compact and len(name_compact) >= 8 and name_compact in query_compact
        )
        query_city_match = bool(city_key and city_key in query_key)
        query_category_match = any(token in query_key for token in category_tokens)
        query_distinctive_match = any(token in query_key for token in distinctive_tokens)
        hidden_social_identity = bool(
            strong_handle_distinctive_match
            and (handle_business_variant_match or handle_city_initials_match)
            and query_city_match
            and (
                query_name_match
                or (query_distinctive_match and (query_category_match or any(len(token) >= 6 and token in query_key for token in strong_distinctive_tokens)))
            )
        )
        has_name_match = bool(exact_name_match or variant_match or strong_distinctive_combined_matches >= 1)
        path_token_matches = sum(1 for token in name_tokens if token in path_key)
        path_has_name = bool(
            name_compact and len(name_compact) >= 8 and name_compact in path_compact
            or variant_match
            or strong_distinctive_path_matches >= 2
            or (strong_distinctive_path_matches >= 1 and category_match)
        )
        phone_match = bool(phone_tail and phone_tail in re.sub(r"\D", "", combined))
        domain_match = bool(domain_key and (domain_key in combined_key or website_domain in combined.lower()))
        city_match = bool(
            city_key and city_key in combined_key
            or city_compact and city_compact in combined_compact
            or city_compact and city_compact in handle_key
        )
        handle_has_business_identity = bool(
            handle_identity_match
            or handle_business_variant_match
            or any(token and token in handle_key for token in business_distinctive_tokens)
        )
        if handle_key and not handle_has_business_identity and not phone_match and not domain_match:
            return -100
        if (
            brand_compact.startswith("vet")
            and city_key
            and handle_key
            and city_key not in handle_key
            and not (city_initials and handle_key.endswith(city_initials))
            and not phone_match
            and not domain_match
        ):
            return -100
        has_min_similarity = bool(
            phone_match
            or domain_match
            or ((exact_name_match or variant_match or path_has_name) and (city_match or category_match))
            or (handle_identity_match and (city_match or variant_match or category_match))
            or (strong_distinctive_combined_matches >= 1 and city_match and category_match)
            or hidden_social_identity
        )
        if exact_name_match or (name_compact and len(name_compact) >= 8 and name_compact in combined_compact):
            score += 50
        elif variant_match or path_has_name or has_name_match:
            score += 42
        if city_match:
            score += 30
        if category_match:
            score += 20
        if phone_match:
            score += 40
        if domain_match:
            score += 30
        if website_stem and website_stem in path_key:
            score += 15
        if handle_identity_match:
            score += 30
        if hidden_social_identity:
            score = max(score, 75)
        if generic_matches and not hidden_social_identity and (not distinctive_tokens or not category_match):
            score -= 15
        if not is_valid_social_profile_url(normalized_url):
            return -100
        if not has_min_similarity:
            return -100
        return min(score, 100)

    def clean_search_result_text(self, value: str) -> str:
        text = re.sub(r"<[^>]+>", " ", str(value or ""))
        return " ".join(html.unescape(text).split())

    def decode_search_result_url(self, raw_url: str) -> str:
        raw = html.unescape(str(raw_url or "").strip())
        if not raw:
            return ""
        if raw.startswith("//"):
            raw = f"https:{raw}"
        parsed = urlparse(raw)
        if "bing.com" in parsed.netloc.lower() and parsed.path.startswith("/ck/"):
            encoded = parse_qs(parsed.query).get("u", [""])[0]
            if encoded.startswith("a1"):
                payload = encoded[2:]
                payload += "=" * (-len(payload) % 4)
                try:
                    decoded = base64.urlsafe_b64decode(payload.encode()).decode("utf-8", "ignore")
                    if decoded.startswith("http"):
                        return decoded
                except Exception:
                    pass
        return raw

    def search_bing_social_rows(self, query: str, deadline: float | None = None, max_results: int = 6) -> list[dict]:
        if self.time_budget_expired(deadline):
            return []
        timeout = min(SOCIAL_ENRICH_SEARCH_TIMEOUT_SECONDS, self.remaining_budget_seconds(deadline, SOCIAL_ENRICH_SEARCH_TIMEOUT_SECONDS))
        if timeout <= 0.2:
            return []
        try:
            response = httpx.get(
                "https://www.bing.com/search",
                params={"q": query, "setlang": "pt-BR", "cc": "BR"},
                timeout=httpx.Timeout(timeout, connect=min(timeout, 2.0), read=timeout, write=min(timeout, 2.0), pool=min(timeout, 2.0)),
                follow_redirects=True,
                headers={
                    "accept": "text/html,application/xhtml+xml",
                    "user-agent": self.settings.user_agent or "Mozilla/5.0",
                },
            )
            if response.status_code >= 400:
                return []
            body = response.text
        except Exception as error:
            print(f"[social_enrich] bing falhou: {query} error={error}")
            return []

        rows: list[dict] = []
        for match in re.finditer(r'<li[^>]+class="[^"]*\bb_algo\b[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>([\s\S]*?)(?=<li[^>]+class="[^"]*\bb_algo\b|</ol>|$)', body, flags=re.I):
            url = self.decode_search_result_url(match.group(1))
            title = self.clean_search_result_text(match.group(2))
            snippet_match = re.search(r"<p[^>]*>([\s\S]*?)</p>", match.group(3), flags=re.I)
            snippet = self.clean_search_result_text(snippet_match.group(1) if snippet_match else "")
            if url and title:
                rows.append({"href": url, "url": url, "title": title, "body": snippet, "snippet": snippet})
            if len(rows) >= max_results:
                return rows

        for match in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,300}?)</a>', body, flags=re.I):
            url = self.decode_search_result_url(match.group(1))
            if not re.search(r"(instagram|facebook)\.com", url, flags=re.I):
                continue
            title = self.clean_search_result_text(match.group(2))
            if url and title:
                rows.append({"href": url, "url": url, "title": title, "body": "", "snippet": ""})
            if len(rows) >= max_results:
                return rows
        return rows

    def search_ddgs_social_rows(self, query: str, deadline: float | None = None, max_results: int = 6) -> list[dict] | None:
        if self.time_budget_expired(deadline):
            return []
        timeout = min(6.0, self.remaining_budget_seconds(deadline, 6.0))
        if timeout <= 0.5:
            return []
        try:
            try:
                ddgs = DDGS(timeout=timeout)
            except TypeError:
                ddgs = DDGS()
            with ddgs as client:
                rows = list(client.text(query, region="br-pt", safesearch="off", max_results=max_results) or [])
        except Exception as error:
            print(f"[social_enrich] ddgs falhou: {query} error={error}")
            return None
        output: list[dict] = []
        for row in rows:
            url = str(row.get("href") or row.get("url") or "").strip()
            title = self.clean_search_result_text(str(row.get("title") or ""))
            snippet = self.clean_search_result_text(str(row.get("body") or row.get("snippet") or row.get("description") or ""))
            if url and title:
                output.append({"href": url, "url": url, "title": title, "body": snippet, "snippet": snippet})
            if len(output) >= max_results:
                break
        return output

    def row_has_social_or_instagram_mirror(self, row: dict, channel: str) -> bool:
        raw_url = str(row.get("href") or row.get("url") or "").lower()
        text = " ".join(str(row.get(key) or "").lower() for key in ("title", "body", "snippet", "description", "href", "url"))
        if channel in raw_url or channel in text:
            return True
        if channel == "instagram" and any(part in raw_url for part in INSTAGRAM_MIRROR_HOST_PARTS):
            return True
        return False

    def search_social_profile_candidates(self, contact: dict, query: str, channel: str, city: str, segment: str, deadline: float | None = None) -> list[dict]:
        candidates: list[dict] = []
        if self.time_budget_expired(deadline):
            return candidates
        try:
            ddgs_rows = self.search_ddgs_social_rows(query, deadline, 6)
            rows = list(ddgs_rows or [])
            allow_bing_on_empty = os.getenv("HBX_BING_FALLBACK_ON_EMPTY", "").lower() in {"1", "true", "yes", "on"}
            if ddgs_rows is None or (not rows and allow_bing_on_empty):
                rows = [*rows, *self.search_bing_social_rows(query, deadline, 6)]
            for row in rows or []:
                if self.time_budget_expired(deadline):
                    break
                raw_url = str(row.get("href") or row.get("url") or "").strip()
                url = normalize_social_url(raw_url)
                bridge_social_urls: list[str] = []
                if not url or channel not in url.lower():
                    bridge_social_urls = self.extract_social_urls_from_bridge(raw_url, channel, deadline)
                    if not bridge_social_urls:
                        continue
                    for url_to_score in bridge_social_urls:
                        candidate_score = self.score_social_candidate(contact, row, url_to_score, channel, city, segment, query)
                        if candidate_score < 48:
                            continue
                        candidates.append(
                            {
                                "url": url_to_score,
                                "score": candidate_score,
                                "query": query,
                                "title": row.get("title") or "",
                                "snippet": row.get("body") or row.get("snippet") or "",
                            }
                        )
                    continue
                candidate_score = self.score_social_candidate(contact, row, url, channel, city, segment, query)
                combined = f"{row.get('title') or ''} {row.get('body') or ''} {row.get('snippet') or ''} {row.get('description') or ''} {url}"
                combined_digits = re.sub(r"\D", "", combined)
                phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
                phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
                website_domain = domain_from_url(contact.get("website"))
                website_stem = text_key(website_domain.split(".")[0] if website_domain else "")
                handle_key = self.social_url_handle_key(url)
                combined_key = text_key(combined)
                city_key = text_key(city)
                city_initials = self.city_initials_key(city)
                category_tokens, distinctive_tokens = self.social_identity_tokens(contact)
                strong_distinctive_tokens = [
                    token
                    for token in distinctive_tokens
                    if len(token) >= 4 and token not in WEAK_SOCIAL_DISTINCTIVE_TOKENS
                ]
                business_distinctive_tokens = [
                    token
                    for token in strong_distinctive_tokens
                    if token not in SOCIAL_GENERIC_BUSINESS_TOKENS
                    and token not in WEBSITE_GENERIC_HOST_TOKENS
                ]
                handle_identity_match = self.handle_matches_business_identity(handle_key, category_tokens, distinctive_tokens)
                handle_distinctive_match = any(token and token in handle_key for token in distinctive_tokens)
                strong_handle_distinctive_match = any(token and token in handle_key for token in strong_distinctive_tokens)
                business_handle_distinctive_match = any(token and token in handle_key for token in business_distinctive_tokens)
                variant_compacts = [
                    re.sub(r"[^a-z0-9]+", "", text_key(variant))
                    for variant in self.business_name_variants(str(contact.get("name") or ""))
                ]
                business_variant_compacts = [
                    compact
                    for compact in variant_compacts
                    if compact not in set(strong_distinctive_tokens)
                ]
                handle_business_variant_match = any(
                    compact and len(compact) >= 6 and (compact in handle_key or handle_key in compact)
                    for compact in business_variant_compacts
                )
                handle_city_initials_match = bool(city_initials and handle_key.endswith(city_initials))
                distinctive_match = any(token in combined_key for token in distinctive_tokens)
                query_key = text_key(query)
                query_compact = self.compact_key(query)
                query_handle_match = bool(handle_key and handle_key in query_compact)
                query_identity_match = bool(
                    (strong_handle_distinctive_match or business_handle_distinctive_match)
                    and (handle_business_variant_match or handle_city_initials_match)
                    and (
                        (city_key and city_key in query_key)
                        or query_handle_match
                    )
                    and (
                        any(token in query_key for token in business_distinctive_tokens or strong_distinctive_tokens)
                        and (
                            any(token in query_key for token in category_tokens)
                            or any(len(token) >= 6 and token in query_key for token in strong_distinctive_tokens)
                            or query_handle_match
                        )
                    )
                )
                has_identity_evidence = bool(
                    phone_tail and phone_tail in combined_digits
                    or website_domain and website_domain in combined.lower()
                    or website_stem and handle_key and (website_stem in handle_key or handle_key in website_stem)
                    or city_key and city_key in combined_key and (distinctive_match or handle_identity_match)
                    or query_identity_match
                    or (query_handle_match and (handle_identity_match or handle_business_variant_match or business_handle_distinctive_match))
                )
                if candidate_score >= 48 and has_identity_evidence:
                    candidates.append({
                        "url": url,
                        "score": candidate_score,
                        "query": query,
                        "status": "confirmed" if candidate_score >= 70 else "probable",
                    })
        except Exception as error:
            print(f"[social_enrich] query falhou: {query} error={error}")
        return candidates

    def extract_social_urls_from_bridge(self, raw_url: str, channel: str, deadline: float | None = None) -> list[str]:
        if self.time_budget_expired(deadline):
            return []
        parsed = urlparse(str(raw_url or ""))
        host = parsed.netloc.lower().removeprefix("www.")
        if not any(part in host for part in SOCIAL_BRIDGE_HOST_PARTS):
            return []
        if channel == "instagram" and any(part in host for part in INSTAGRAM_MIRROR_HOST_PARTS):
            path_parts = [unquote(part).strip("@/ ") for part in parsed.path.split("/") if part.strip("@/ ")]
            ignored = {
                "p",
                "reel",
                "reels",
                "tv",
                "explore",
                "tagged",
                "stories",
                "profile",
                "account",
                "user",
                "users",
            }
            for part in reversed(path_parts):
                handle = re.sub(r"[^A-Za-z0-9._]", "", part).strip("._")
                if handle and handle.lower() not in ignored and 2 <= len(handle) <= 30:
                    return [f"https://www.instagram.com/{handle}/"]
        try:
            response = httpx.get(
                str(raw_url),
                timeout=self.remaining_budget_seconds(deadline, 3),
                follow_redirects=True,
                headers={"user-agent": self.settings.user_agent},
            )
            if response.status_code >= 400:
                return []
            page_text = response.text.replace("\\/", "/").replace("&amp;", "&")
            pattern = r"https?://(?:www\.)?(?:instagram|facebook)\.com/[A-Za-z0-9._%+\-/]+"
            found: list[str] = []
            for match in re.findall(pattern, page_text, flags=re.I):
                normalized = normalize_social_url(match.rstrip(".,;:)"))
                if normalized and channel in normalized.lower() and is_valid_social_profile_url(normalized):
                    found.append(normalized)
            return list(dict.fromkeys(found))[:4]
        except Exception:
            return []

    def search_social_profile_url(self, contact: dict, query: str, channel: str, city: str, segment: str, deadline: float | None = None) -> tuple[str | None, int]:
        candidates = self.search_social_profile_candidates(contact, query, channel, city, segment, deadline)
        if not candidates:
            return None, 0
        best = max(candidates, key=lambda item: int(item.get("score") or 0))
        return str(best.get("url") or ""), int(best.get("score") or 0)

    def enrich_identity_search(
        self,
        contact: dict,
        city: str,
        segment: str,
        requested_channels: list[str] | tuple[str, ...] | set[str],
        deadline: float | None = None,
    ) -> dict[str, dict]:
        matches: dict[str, dict] = {}
        ordered_channels = [
            channel
            for channel in dict.fromkeys(requested_channels)
            if channel in {"instagram", "facebook"}
        ]
        for channel in ordered_channels:
            if channel not in requested_channels:
                continue
            field = "instagramUrl" if channel == "instagram" else "facebookUrl"
            if contact.get(field):
                matches[field] = {
                    "url": contact.get(field),
                    "score": 90,
                    "query": "existing_contact_field",
                    "status": "confirmed",
                }
                continue
            candidates: list[dict] = []
            for query in self.social_queries_for_contact(contact, city, segment, channel)[:SOCIAL_ENRICH_MAX_QUERIES_PER_CHANNEL]:
                if self.time_budget_expired(deadline):
                    break
                for candidate in self.search_social_profile_candidates(contact, query, channel, city, segment, deadline):
                    candidates.append(candidate)
                if any(int(candidate.get("score") or 0) >= 70 for candidate in candidates):
                    break
            if candidates:
                best = max(candidates, key=lambda item: int(item.get("score") or 0))
                matches[field] = {
                    "url": str(best.get("url") or ""),
                    "score": int(best.get("score") or 0),
                    "query": best.get("query"),
                    "status": "confirmed" if int(best.get("score") or 0) >= 70 else "probable",
                }
        return matches

    def validate_guessed_social_url(self, contact: dict, channel: str, handle: str, city: str = "", deadline: float | None = None) -> tuple[str | None, int]:
        if self.time_budget_expired(deadline):
            return None, 0
        handle = re.sub(r"[^a-z0-9_.]+", "", text_key(handle).replace(" ", ""))
        if len(handle) < 5:
            return None, 0
        category_tokens, distinctive_tokens = self.social_identity_tokens(contact)
        handle_key = re.sub(r"[^a-z0-9]+", "", text_key(handle))
        if not self.handle_matches_business_identity(handle_key, category_tokens, distinctive_tokens):
            return None, 0
        base = "https://www.instagram.com" if channel == "instagram" else "https://www.facebook.com"
        url = f"{base}/{handle}/"
        try:
            response = httpx.get(url, timeout=self.remaining_budget_seconds(deadline, 3), follow_redirects=True, headers={"user-agent": self.settings.user_agent})
            if response.status_code >= 400:
                return None, 0
            content_key = text_key(response.text[:250_000])
            distinctive_matches = sum(1 for token in distinctive_tokens if token in content_key)
            category_matches = sum(1 for token in category_tokens if token in content_key)
            city_key = text_key(city or contact.get("city"))
            city_match = bool(city_key and city_key in content_key)
            handle_match = handle in content_key
            has_strong_distinctive = any(
                token not in WEAK_SOCIAL_DISTINCTIVE_TOKENS and len(token) >= 5
                for token in distinctive_tokens
            )
            official_handle_match = bool(
                handle_match
                and has_strong_distinctive
                and self.handle_matches_business_identity(handle_key, category_tokens, distinctive_tokens)
                and ("oficial" in handle_key or handle_key.endswith("br"))
            )
            if handle_match and distinctive_matches >= 1 and category_matches >= 1 and (city_match or official_handle_match):
                normalized = normalize_social_url(url)
                if normalized and is_valid_social_profile_url(normalized):
                    return normalized, 78 if city_match else 72
        except Exception:
            return None, 0
        return None, 0

    def guessed_social_url_for_contact(self, contact: dict, channel: str, city: str = "", deadline: float | None = None) -> tuple[str | None, int]:
        if self.time_budget_expired(deadline):
            return None, 0
        if channel not in {"instagram", "facebook"}:
            return None, 0

        base = "https://www.instagram.com" if channel == "instagram" else "https://www.facebook.com"
        name = str(contact.get("name") or "")
        candidates = self.business_social_handle_candidates(name, city)[:18]
        if not candidates:
            return None, 0

        name_key = text_key(name)
        name_compact = self.compact_key(" ".join(token for token in name_key.split() if token not in BUSINESS_NAME_STOP_TOKENS))
        city_key = text_key(city or contact.get("city") or "")
        city_initials = self.city_initials_key(city or contact.get("city") or "")
        category_tokens, distinctive_tokens = self.social_identity_tokens(contact)
        local_identity_tokens = set(city_key.split()) | {"rio", "claro", "sp", "sao", "paulo"}
        strong_distinctive = [
            token for token in distinctive_tokens
            if len(token) >= 4 and token not in WEAK_SOCIAL_DISTINCTIVE_TOKENS
        ]
        nonlocal_strong_distinctive = [
            token for token in strong_distinctive
            if token not in local_identity_tokens
        ]
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
        unsafe_single_handle_tokens = {
            "marmitaria",
            "mercearia",
            "restaurante",
            "pizzaria",
            "pizza",
            "bar",
            "bares",
            "espetinho",
            "panela",
            "delivery",
            "rotisserie",
            "trattoria",
            "natural",
            "opcoes",
            "espaco",
        }

        best_url: str | None = None
        best_score = 0
        for handle in candidates:
            if self.time_budget_expired(deadline):
                break
            handle = re.sub(r"[^a-z0-9_.]+", "", text_key(handle).replace(" ", ""))
            handle_key = re.sub(r"[^a-z0-9]+", "", handle)
            if not handle_key or len(handle_key) < 5:
                continue
            url = f"{base}/{handle}/"
            try:
                response = httpx.get(
                    url,
                    timeout=self.remaining_budget_seconds(deadline, 4),
                    follow_redirects=True,
                    headers={"user-agent": self.settings.user_agent},
                )
            except Exception:
                continue
            if response.status_code >= 400:
                continue

            body = response.text[:350_000]
            body_key = text_key(body)
            title_match = re.search(r"<title[^>]*>(.*?)</title>", body, flags=re.I | re.S)
            title = self.clean_search_result_text(html.unescape(title_match.group(1) if title_match else ""))
            title_key = text_key(title)
            if channel == "instagram" and '"pageid":"httperrorpage"' in body.lower():
                continue
            if channel == "facebook" and title_key in {"facebook", "log into facebook", "entrar no facebook"}:
                continue
            if title_key in {"instagram", "facebook"}:
                continue
            if any(marker in title_key for marker in ["pagina nao encontrada", "page not found", "not found"]):
                continue
            if "sao paulo sp" in title_key and city_key and "sao paulo" not in city_key:
                continue

            handle_has_context_category = any(
                token in handle_key and handle_key != token
                for token in unsafe_single_handle_tokens
            )
            handle_has_category = any(token in handle_key for token in category_tokens) or handle_has_context_category
            handle_has_distinctive = any(token in handle_key for token in strong_distinctive)
            handle_has_city = bool(city_key and city_key.replace(" ", "") in handle_key)
            handle_has_city_initials = bool(city_initials and (handle_key.endswith(city_initials) or f".{city_initials}" in handle or f"_{city_initials}" in handle))
            handle_exact_name = bool(name_compact and handle_key == name_compact)
            title_has_city = bool(city_key and city_key in title_key)
            phone_match = bool(phone_tail and phone_tail in re.sub(r"\D", "", body))
            if handle_key in unsafe_single_handle_tokens:
                continue
            if category_tokens and not (handle_has_category or handle_exact_name or handle_has_city or phone_match):
                continue
            if len(strong_distinctive) <= 1 and not (
                (handle_has_category and handle_has_distinctive)
                or handle_has_city
                or phone_match
            ):
                continue

            score = 0
            if name_compact and handle_key == name_compact:
                score += 58 if handle_has_category else 42
            elif name_compact and (name_compact in handle_key or handle_key in name_compact):
                score += 48 if handle_has_category else 34
            if handle_key and handle_key in title_key:
                score += 18
            matched_strong = [token for token in strong_distinctive if token in handle_key or token in title_key]
            matched_nonlocal_strong = {
                token for token in nonlocal_strong_distinctive
                if token in handle_key or token in title_key
            }
            if (
                len(nonlocal_strong_distinctive) >= 2
                and not handle_exact_name
                and not phone_match
                and len(matched_nonlocal_strong) < 2
            ):
                continue
            score += min(36, len(set(matched_strong)) * 18)
            if handle_has_category or any(token in title_key for token in category_tokens):
                score += 10
            if city_key and (title_has_city or handle_has_city or city_key in body_key):
                score += 14
            if phone_match:
                score += 22

            has_local_evidence = bool(
                phone_match
                or title_has_city
                or handle_has_city
                or handle_has_city_initials
                or (city_key and city_key in body_key and any(token in body_key for token in category_tokens + strong_distinctive))
            )
            if not has_local_evidence:
                score = min(score, 68)
            exact_real_estate_alias = bool(
                channel == "instagram"
                and any(token in {"imobiliaria", "imobiliarias", "imoveis", "imovel"} for token in category_tokens)
                and any(
                    handle_key == self.compact_key(variant)
                    for variant in self.business_name_variants(name)
                    if any(real_estate in text_key(variant).split() or real_estate in self.compact_key(variant) for real_estate in ("imoveis", "imobiliaria"))
                )
            )
            if exact_real_estate_alias and handle_has_distinctive and handle_has_category:
                score = max(score, 72)
            if (
                not category_tokens
                and not has_local_evidence
                and handle_exact_name
                and not handle_has_context_category
                and len(nonlocal_strong_distinctive) >= 2
            ):
                continue

            # Exact compact handles are useful even when Instagram hides most profile text.
            if channel == "instagram" and handle_exact_name and matched_strong and has_local_evidence and (handle_has_category or handle_has_city or handle_has_city_initials or phone_match or len(strong_distinctive) >= 2):
                score = max(score, 72)
            if channel == "facebook" and handle_exact_name and matched_strong and has_local_evidence and (handle_has_category or handle_has_city or handle_has_city_initials or phone_match or len(strong_distinctive) >= 2):
                score = max(score, 68)

            if score > best_score:
                normalized = normalize_social_url(url)
                if normalized and is_valid_social_profile_url(normalized):
                    best_url = normalized
                    best_score = min(score, 100)
            if best_score >= 85:
                break
        if best_url and best_score >= 55:
            return best_url, best_score
        return None, 0

    def score_website_candidate(self, contact: dict, row: dict, url: str, city: str) -> int:
        parsed = urlparse(url)
        host = parsed.netloc.lower().replace("www.", "")
        if parsed.scheme not in {"http", "https"} or not host:
            return -100
        if any(host == domain or host.endswith(f".{domain}") for domain in OFFICIAL_WEBSITE_BLOCKED_DOMAINS):
            return -100
        if is_blocked_lead_source_domain(host) or is_social_signal_domain(host):
            return -100
        text = text_key(" ".join(str(row.get(key) or "") for key in ("title", "body", "snippet", "description", "href", "url")))
        host_stem = text_key(host.split(".")[0])
        host_compact = self.compact_key(host_stem)
        name_key = text_key(str(contact.get("name") or ""))
        name_tokens = [
            token for token in name_key.split()
            if (len(token) >= 4 or token == "vet")
            and token not in BUSINESS_NAME_STOP_TOKENS
            and token not in WEAK_SOCIAL_DISTINCTIVE_TOKENS
        ]
        category_tokens = [token for token in name_tokens if token in BUSINESS_CATEGORY_TOKENS]
        strong_tokens = [token for token in name_tokens if token not in BUSINESS_CATEGORY_TOKENS]
        compact_name = "".join(token for token in name_key.split() if token not in BUSINESS_NAME_STOP_TOKENS)
        strong_host_hits = {
            token for token in strong_tokens
            if len(token) >= 4 and token in host_compact
        }
        category_host_hits = {
            token for token in category_tokens
            if len(token) >= 4 and token in host_compact
        }
        distinctive_host_hits = {
            token for token in strong_host_hits
            if token not in WEBSITE_GENERIC_HOST_TOKENS
        }
        full_name_host_match = bool(compact_name and len(compact_name) >= 8 and compact_name in host_compact)
        has_distinctive_host_identity = bool(full_name_host_match or distinctive_host_hits)
        if not has_distinctive_host_identity:
            return -100
        host_identity_match = bool(
            full_name_host_match
            or (len(strong_host_hits) >= 2 and distinctive_host_hits)
            or (strong_host_hits and category_host_hits and distinctive_host_hits)
            or (len(strong_tokens) == 1 and len(name_tokens) <= 2 and next(iter(strong_host_hits), "") == strong_tokens[0] and distinctive_host_hits)
        )
        score = 0
        for variant in self.business_name_variants(str(contact.get("name") or "")):
            variant_key = text_key(variant)
            variant_compact = re.sub(r"[^a-z0-9]+", "", variant_key)
            if variant_key and variant_key in text:
                score += 30
            if variant_compact and len(variant_compact) >= 8 and variant_compact in host_compact:
                score += 45
            if variant_compact and variant_compact in re.sub(r"[^a-z0-9]+", "", text):
                score += 35
        if host_identity_match:
            score += 45
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_match = bool(len(phone_digits) >= 8 and phone_digits[-8:] in re.sub(r"\D", "", text))
        if phone_match:
            score += 20
        city_key = text_key(city)
        if city_key and city_key in text:
            score += 15
        if not host_identity_match:
            return -100
        if not phone_match and not (city_key and city_key in text) and len(strong_tokens) <= 1:
            return -100
        return score

    def discover_website_for_contact(self, contact: dict, city: str, deadline: float | None = None) -> tuple[str | None, int, str | None]:
        if self.time_budget_expired(deadline):
            return None, 0, None
        queries: list[str] = []
        q_city = self.quote_query_part(city)
        for variant in self.business_name_variants(str(contact.get("name") or "")):
            q_variant = self.quote_query_part(variant)
            if not q_variant:
                continue
            queries.append(f"{q_variant} {q_city} site oficial".strip())
            queries.append(f"{q_variant} {q_city}".strip())
        try:
            best_url: str | None = None
            best_score = -10_000
            best_query: str | None = None
            fetched_at = datetime.now(timezone.utc).isoformat()
            for query in list(dict.fromkeys(queries))[: max(SOCIAL_ENRICH_WEBSITE_MAX_QUERIES, 4)]:
                if self.time_budget_expired(deadline):
                    break
                errors: list[str] = []
                rows = self.web_search_service.collect_results(query, 10, fetched_at, errors)
                for row in rows or []:
                    if self.time_budget_expired(deadline):
                        break
                    raw_url = str(row.url or "").strip()
                    if not raw_url:
                        continue
                    normalized_row = {
                        "title": row.title,
                        "body": row.snippet,
                        "snippet": row.snippet,
                        "href": row.url,
                        "url": row.url,
                    }
                    score = self.score_website_candidate(contact, normalized_row, raw_url, city)
                    if score > best_score:
                        best_url = raw_url
                        best_score = score
                        best_query = query
            if best_url and best_score >= 35:
                parsed = urlparse(best_url)
                return f"{parsed.scheme}://{parsed.netloc}".rstrip("/"), best_score, best_query
        except Exception as error:
            print(f"[website_enrich] falhou name={contact.get('name')} error={error}")
        return self.probe_direct_website_for_contact(contact, city, deadline)

    def direct_website_candidate_urls(self, contact: dict) -> list[str]:
        compact_seen: set[str] = set()
        compacts: list[str] = []
        for variant in self.business_name_variants(str(contact.get("name") or "")):
            compact = self.compact_key(variant)
            if compact in compact_seen:
                continue
            compact_seen.add(compact)
            if len(compact) < 6:
                continue
            if len(compact) > 28:
                continue
            if compact in {"restaurante", "pizzaria", "choperia", "barbearia", "oficina", "autopecas"}:
                continue
            if compact.endswith(("pizzaria", "restaurante", "choperia", "barbearia", "oficina")):
                continue
            compacts.append(compact)

        seen: set[str] = set()
        urls: list[str] = []
        for tld in OFFICIAL_WEBSITE_PROBE_TLDS:
            for prefix in ("", "www."):
                for compact in compacts:
                    host = f"{prefix}{compact}.{tld}"
                    if host in seen:
                        continue
                    seen.add(host)
                    urls.append(f"https://{host}")
        return urls[:12]

    def probe_direct_website_for_contact(self, contact: dict, city: str, deadline: float | None = None) -> tuple[str | None, int, str | None]:
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
        city_key = text_key(city or contact.get("city"))
        variants = self.business_name_variants(str(contact.get("name") or ""))
        variant_keys = [text_key(variant) for variant in variants if text_key(variant)]
        variant_compacts = [self.compact_key(variant) for variant in variants if len(self.compact_key(variant)) >= 6]

        for url in self.direct_website_candidate_urls(contact):
            if self.time_budget_expired(deadline):
                break
            try:
                response = httpx.get(
                    url,
                    follow_redirects=True,
                    timeout=self.remaining_budget_seconds(deadline, 4),
                    headers={"User-Agent": "Mozilla/5.0 HBXLeadEnrichment/1.0"},
                )
            except Exception:
                continue
            if response.status_code >= 400:
                continue
            final_url = str(response.url or url)
            parsed = urlparse(final_url)
            host = parsed.netloc.lower().replace("www.", "")
            if not parsed.scheme or not host:
                continue
            if any(host == domain or host.endswith(f".{domain}") for domain in OFFICIAL_WEBSITE_BLOCKED_DOMAINS):
                continue
            html = response.text or ""
            title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
            title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", title_match.group(1))).strip() if title_match else ""
            body = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html[:80_000])).strip()
            content_key = text_key(f"{title} {body}")
            content_compact = self.compact_key(f"{title} {body}")
            identity_match = any(key and key in content_key for key in variant_keys) or any(
                compact and compact in content_compact for compact in variant_compacts
            )
            city_match = bool(city_key and city_key in content_key)
            phone_match = bool(phone_tail and phone_tail in re.sub(r"\D", "", body))
            if not identity_match or not (city_match or phone_match or len(content_key) > 120):
                continue
            score = self.score_website_candidate(
                contact,
                {"title": title, "body": body[:5000]},
                final_url,
                city,
            )
            if score >= 65:
                return f"{parsed.scheme}://{parsed.netloc}".rstrip("/"), score, f"direct_probe:{urlparse(url).netloc}"
        return None, 0, None

    def score_social_profile_for_contact(self, contact: dict, profile: dict, city: str, segment: str) -> int:
        url = str(profile.get("url") or "")
        title = str(profile.get("title") or "")
        snippet = str(profile.get("snippet") or "")
        combined = f"{url} {title} {snippet}"
        combined_key = text_key(combined)
        combined_compact = self.compact_key(combined)

        name = str(contact.get("name") or "")
        name_key = text_key(name)
        name_compact = self.compact_key(name)
        city_key = text_key(city)
        segment_key = text_key(segment)
        website_domain = domain_from_url(contact.get("website"))
        website_stem = text_key(website_domain.split(".")[0] if website_domain else "")
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""

        name_tokens = self.social_name_tokens(name)
        distinctive_tokens = self.distinctive_social_name_tokens(name)
        token_hits = sum(1 for token in distinctive_tokens if token in combined_key)

        score = 0
        if name_key and name_key in combined_key:
            score += 50
        if name_compact and name_compact in combined_compact:
            score += 45
        if distinctive_tokens and token_hits >= max(1, min(2, len(distinctive_tokens))):
            score += 35
        elif token_hits == 1:
            score += 18
        if city_key and city_key in combined_key:
            score += 20
        if segment_key and segment_key in combined_key:
            score += 10
        if website_stem and len(website_stem) >= 4 and website_stem in combined_key:
            score += 25
        if phone_tail and phone_tail in re.sub(r"\D", "", combined):
            score += 30

        if not distinctive_tokens and not website_stem:
            score -= 50
        if score <= 0:
            score = -20

        return score

    def attach_discovered_social_profiles(
        self,
        contacts: list[dict],
        profiles: list[dict],
        city: str,
        segment: str,
    ) -> dict:
        stats = {
            "profilesDiscovered": len(profiles),
            "profilesAttached": 0,
            "profilesUnmatched": 0,
            "profilesPromoted": 0,
        }

        for profile in profiles:
            channel = str(profile.get("channel") or "")
            field = "instagramUrl" if channel == "instagram" else "facebookUrl" if channel == "facebook" else None
            url = normalize_social_url(str(profile.get("url") or ""))
            if not field or not url:
                continue

            best_contact = None
            best_score = -999

            for contact in contacts:
                if contact.get(field):
                    continue
                if not self.should_try_social_enrichment(contact, city, segment, {"instagram", "facebook"}):
                    continue
                score = self.score_social_profile_for_contact(contact, profile, city, segment)
                if score > best_score:
                    best_contact = contact
                    best_score = score

            if best_contact and best_score >= 35:
                best_contact[field] = url
                best_contact.setdefault("_socialDiscovery", {})[field] = {
                    "score": best_score,
                    "title": profile.get("title"),
                    "query": profile.get("query"),
                }
                stats["profilesAttached"] += 1
            else:
                stats["profilesUnmatched"] += 1

        return stats

    def social_profile_name(self, profile: dict, city: str, segment: str) -> str:
        url = normalize_social_url(str(profile.get("url") or "")) or str(profile.get("url") or "")
        title = " ".join(str(profile.get("title") or "").split())
        for marker in ("|", "•", " - Instagram", " - Facebook", " Instagram", " Facebook"):
            if marker in title:
                title = title.split(marker, 1)[0].strip()
        title = re.sub(r"\(@[^)]+\)", "", title).strip(" -:|•")
        generic_title = text_key(title) in {"link to instagram com", "link to facebook com", "instagram", "facebook"}
        if title and not generic_title and not self.is_bad_social_candidate_name(title, city, segment):
            return title

        parsed = urlparse(url)
        parts = [part for part in parsed.path.split("/") if part]
        slug = parts[-1] if parts else ""
        slug = re.sub(r"[_\-.]+", " ", slug)
        slug = re.sub(r"\b\d{6,}\b", " ", slug)
        slug = re.sub(r"\s+", " ", slug).strip()
        if slug and not self.is_bad_social_candidate_name(slug, city, segment):
            return " ".join(token.capitalize() for token in slug.split())

        fallback = " ".join(part for part in [segment, city] if str(part or "").strip()).strip()
        return fallback or "Perfil social encontrado"

    def social_first_profile_score(self, profile: dict, url: str, city: str, segment: str) -> int:
        title = str(profile.get("title") or "")
        snippet = str(profile.get("snippet") or "")
        combined = f"{url} {title} {snippet}"
        combined_key = text_key(combined)
        combined_compact = self.compact_key(combined)
        city_key = text_key(city)
        city_compact = self.compact_key(city)
        segment_tokens = [token for token in text_key(segment).split() if len(token) >= 4]
        segment_compact = self.compact_key(segment)
        url_path = " ".join(part for part in urlparse(url).path.split("/") if part)
        path_key = text_key(url_path)
        generic_title = text_key(title) in {"link to instagram com", "link to facebook com", "instagram", "facebook"}

        score = 0
        if segment_tokens and any(token in combined_key for token in segment_tokens):
            score += 45
        if segment_compact and segment_compact in combined_compact:
            score += 30
        if city_key and city_key in combined_key:
            score += 30
        elif city_compact and city_compact in combined_compact:
            score += 20
        if segment_tokens and any(token in path_key for token in segment_tokens):
            score += 25
        if generic_title:
            score -= 45
        if not segment_tokens and not city_key:
            score -= 40
        return score

    def social_profile_candidates(
        self,
        profiles: list[dict],
        city: str,
        state: str,
        segment: str,
        required_social: set[str],
        limit: int,
        relax_for_required: bool = True,
    ) -> list[dict]:
        if not profiles or not required_social:
            return []
        candidates: list[dict] = []
        seen_urls: set[str] = set()
        for profile in profiles:
            channel = str(profile.get("channel") or "").strip().lower()
            field = "instagramUrl" if channel == "instagram" else "facebookUrl" if channel == "facebook" else None
            url = normalize_social_url(str(profile.get("url") or ""))
            if not field or not url or url in seen_urls:
                continue
            score = self.social_first_profile_score(profile, url, city, segment)
            min_score = 20 if relax_for_required and channel in required_social else 35
            if score < min_score:
                continue
            item = {
                "name": self.social_profile_name(profile, city, segment),
                "phone": "",
                "phoneDigits": "",
                "rating": None,
                "reviews": None,
                "address": " ".join(part for part in [city, state] if str(part or "").strip()).strip() or None,
                "website": None,
                field: url,
                "source": "hbx_scraping:social_discovery",
                "sourceEngine": "hbx_scraping_social",
                "sourceUrl": url,
                "score": max(70, score),
                "_pageUrl": url,
                "_socialSnippet": " ".join(str(profile.get(key) or "") for key in ("title", "snippet", "query")),
                "_socialFirst": True,
            }
            if not self.has_required_social_channels(item, required_social):
                continue
            seen_urls.add(url)
            candidates.append(item)
            if len(candidates) >= limit:
                break
        return candidates

    def build_social_first_response(
        self,
        request: SearchRequest,
        candidates: list[dict],
        social_discovery_stats: dict,
    ) -> SearchResponse:
        allowed_fields = {
            "name", "phone", "phoneDigits", "rating", "reviews", "address", "website",
            "email", "emailStatus", "emailSource", "emailConfidence",
            "instagramUrl", "facebookUrl", "socialStatus", "socialConfidence",
            "source", "sourceEngine", "sourceUrl", "score", "evidenceJson", "enrichmentJson",
            "rejectReasons", "qualityReason", "visibilityTier", "deliveryProduct", "recommendedChannel",
            "cnpj", "cnae", "razaoSocial",
        }
        public_items = [{key: value for key, value in item.items() if key in allowed_fields} for item in candidates[: request.limit]]
        valid = [ContactResult.model_validate(item).model_dump(exclude_none=True) for item in public_items]
        response_stats = {
            "parsed": 0,
            "approved": len(valid),
            "invalidPhone": 0,
            "blockedDomain": 0,
            "lowScore": 0,
            "missingRequiredChannel": 0,
            "rawFound": len(candidates),
            "deduped": len(candidates),
            "socialProfilesDiscovered": social_discovery_stats["profilesDiscovered"],
            "socialProfilesAttached": 0,
            "socialProfilesUnmatched": social_discovery_stats["profilesUnmatched"],
            "socialProfilesPromoted": len(valid),
        }
        social_stats = {
            "requestedChannels": [],
            "requiredChannels": [],
            "enrichmentRan": False,
            "mode": "off",
            "processed": 0,
            "skippedBadCandidate": 0,
            "enrichedCount": 0,
            "missingRequiredChannel": 0,
            "discovery": social_discovery_stats,
            "socialFirstCandidates": len(candidates),
        }
        print(
            "[social_first] "
            f"profiles={social_discovery_stats['profilesDiscovered']} "
            f"promoted={len(valid)} "
            "required=off"
        )
        return SearchResponse(
            query=QueryPayload(city=request.city, state=request.state, segment=request.segment, query=request.query, targetType=request.targetType, limit=request.limit),
            count=len(valid),
            results=[ContactResult.model_validate(item) for item in valid],
            status="completed",
            errors=[],
            stats=response_stats,
            social=social_stats,
        )

    def enrich_social_links_for_contacts(
        self,
        contacts: list[dict],
        city: str,
        state: str,
        segment: str,
        preferred_channels: list[str] | None = None,
        required_channels: list[str] | None = None,
        time_budget_seconds: float | None = None,
    ) -> tuple[list[dict], dict]:
        requested_channels = self.requested_social_channels(preferred_channels, required_channels)
        required_social = self.required_social_channels(required_channels)
        mode = "required" if required_social else "best_effort"
        deadline = time.monotonic() + time_budget_seconds if time_budget_seconds else None
        if not requested_channels:
            return contacts, {
                "requestedChannels": [],
                "requiredChannels": [],
                "enrichmentRan": False,
                "mode": "off",
                "processed": 0,
                "skippedBadCandidate": 0,
                "enrichedCount": 0,
                "missingRequiredChannel": 0,
                "timedOut": False,
                "matches": [],
                "possibleSocialCandidates": [],
            }
        stats = {
            "requestedChannels": sorted(requested_channels),
            "requiredChannels": sorted(required_social),
            "enrichmentRan": False,
            "mode": mode,
            "processed": 0,
            "skippedBadCandidate": 0,
            "enrichedCount": 0,
            "missingRequiredChannel": 0,
            "timedOut": False,
            "matches": [],
            "possibleSocialCandidates": [],
        }
        eligible_contacts = [
            contact
            for contact in contacts
            if self.should_try_social_enrichment(contact, city, segment, required_social)
        ]
        stats["skippedBadCandidate"] = max(0, len(contacts) - len(eligible_contacts))
        max_contacts = SOCIAL_ENRICH_MAX_CONTACTS_REQUIRED if required_social else SOCIAL_ENRICH_MAX_CONTACTS_PREFERRED
        for contact in eligible_contacts[:max_contacts]:
            contact.setdefault("city", city)
            contact.setdefault("state", state)
            contact.setdefault("segment", segment)
            if self.time_budget_expired(deadline):
                stats["timedOut"] = True
                break
            stats["processed"] += 1
            ordered_channels = [
                channel for channel in ("instagram", "facebook")
                if channel in required_social
            ] + [
                channel for channel in ("instagram", "facebook")
                if channel in requested_channels and channel not in required_social
            ]
            if not required_social:
                for channel in ordered_channels:
                    field = "instagramUrl" if channel == "instagram" else "facebookUrl"
                    if contact.get(field):
                        continue
                    url, score = self.guessed_social_url_for_contact(contact, channel, city, deadline)
                    if url:
                        if score >= 70:
                            contact[field] = url
                            contact.setdefault("_socialEnrichment", {})[field] = {
                                "score": score,
                                "query": "validated_handle_guess",
                                "status": "confirmed",
                            }
                            stats["matches"].append({
                                "field": field,
                                "url": url,
                                "score": score,
                                "status": "confirmed",
                                "query": "validated_handle_guess",
                            })
                        else:
                            self.record_possible_social_candidate(
                                contact,
                                stats,
                                field,
                                url,
                                score,
                                "Handle parecido, mas sem evidencia local forte para confirmar.",
                                "validated_handle_guess",
                                "handle_guess",
                            )
            identity_channels = [
                channel
                for channel in ordered_channels
                if not contact.get("instagramUrl" if channel == "instagram" else "facebookUrl")
            ]
            identity_matches = self.enrich_identity_search(contact, city, segment, identity_channels, deadline)
            for field, match in identity_matches.items():
                if match.get("url"):
                    score = int(match.get("score") or 0)
                    if score >= 70:
                        contact[field] = str(match["url"])
                        contact.setdefault("_socialEnrichment", {})[field] = {
                            "score": score,
                            "query": match.get("query"),
                            "status": "confirmed",
                            "method": "identity_search",
                        }
                        stats["matches"].append({
                            "field": field,
                            "url": contact[field],
                            "score": score,
                            "status": "confirmed",
                            "query": match.get("query"),
                        })
                    else:
                        self.record_possible_social_candidate(
                            contact,
                            stats,
                            field,
                            str(match["url"]),
                            score,
                            "Resultado de busca parecido, mas sem evidencia suficiente para confirmar.",
                            str(match.get("query") or ""),
                            "identity_search",
                        )
            for channel in ordered_channels:
                if self.time_budget_expired(deadline):
                    stats["timedOut"] = True
                    break
                field = "instagramUrl" if channel == "instagram" else "facebookUrl"
                if contact.get(field):
                    continue
                if not required_social:
                    url, score = self.guessed_social_url_for_contact(contact, channel, city, deadline)
                    if url:
                        if score >= 70:
                            contact[field] = url
                            contact.setdefault("_socialEnrichment", {})[field] = {
                                "score": score,
                                "query": "validated_handle_guess",
                                "status": "confirmed",
                            }
                            stats["matches"].append({
                                "field": field,
                                "url": url,
                                "score": score,
                                "status": "confirmed",
                                "query": "validated_handle_guess",
                            })
                            continue
                        else:
                            self.record_possible_social_candidate(
                                contact,
                                stats,
                                field,
                                url,
                                score,
                                "Handle parecido, mas sem evidencia local forte para confirmar.",
                                "validated_handle_guess",
                                "handle_guess",
                            )
                queries = self.social_queries_for_contact(contact, city, segment, channel)[:SOCIAL_ENRICH_MAX_QUERIES_PER_CHANNEL]
                candidates: list[dict] = []
                for query in queries:
                    if self.time_budget_expired(deadline):
                        stats["timedOut"] = True
                        break
                    url, score = self.search_social_profile_url(contact, query, channel, city, segment, deadline)
                    if url:
                        candidates.append({"url": url, "score": score, "query": query})
                        if score >= 85:
                            break
                if candidates:
                    best = max(candidates, key=lambda item: int(item.get("score") or 0))
                    best_score = int(best.get("score") or 0)
                    if best_score >= 70:
                        contact[field] = str(best["url"])
                        contact.setdefault("_socialEnrichment", {})[field] = {
                            "score": best_score,
                            "query": best.get("query"),
                            "status": "confirmed",
                        }
                        stats["matches"].append({
                            "field": field,
                            "url": contact[field],
                            "score": best_score,
                            "status": "confirmed",
                            "query": best.get("query"),
                        })
                    else:
                        self.record_possible_social_candidate(
                            contact,
                            stats,
                            field,
                            str(best["url"]),
                            best_score,
                            "Resultado de busca parecido, mas abaixo do corte de confirmacao.",
                            str(best.get("query") or ""),
                            "search_result",
                            {"title": best.get("title") or "", "snippet": best.get("snippet") or ""},
                        )
        for contact in contacts:
            has_social = any(contact.get("instagramUrl" if channel == "instagram" else "facebookUrl") for channel in requested_channels)
            if has_social:
                stats["enrichedCount"] += 1
            if required_social and not self.has_required_social_channels(contact, required_social):
                stats["missingRequiredChannel"] += 1
        stats["enrichmentRan"] = stats["processed"] > 0
        if requested_channels:
            print(
                "[social_enrich] "
                f"mode={mode} "
                f"requested={','.join(sorted(requested_channels))} "
                f"processed={stats['processed']} "
                f"skippedBadCandidate={stats['skippedBadCandidate']} "
                f"enriched={stats['enrichedCount']} "
                f"missingRequired={stats['missingRequiredChannel']}"
            )
        return contacts, stats

    def apply_public_enrichment_contract(self, item: dict) -> dict:
        social_enrichment = item.get("_socialEnrichment") if isinstance(item.get("_socialEnrichment"), dict) else {}
        social_scores: list[int] = []
        for value in social_enrichment.values():
            if isinstance(value, dict):
                try:
                    social_scores.append(int(value.get("score") or 0))
                except Exception:
                    pass
        has_social = bool(item.get("instagramUrl") or item.get("facebookUrl"))
        if has_social:
            confidence = max(social_scores) if social_scores else int(item.get("socialConfidence") or 82)
            item["socialConfidence"] = max(0, min(100, confidence))
            item["socialStatus"] = item.get("socialStatus") or ("found" if confidence >= 70 else "candidate_review")
        else:
            item["socialConfidence"] = int(item.get("socialConfidence") or 0)
            item["socialStatus"] = item.get("socialStatus") or "missing"

        if item.get("email") and not item.get("emailStatus"):
            status, confidence = self.email_status_for_candidate(str(item.get("email") or ""), item.get("website"), "website" if item.get("website") else "manual")
            item["emailStatus"] = status
            item["emailSource"] = item.get("emailSource") or ("website" if item.get("website") else "manual")
            item["emailConfidence"] = confidence
        elif not item.get("email"):
            item["emailStatus"] = item.get("emailStatus") or "missing"
            item["emailSource"] = item.get("emailSource") or "none"
            item["emailConfidence"] = int(item.get("emailConfidence") or 0)

        enrichment_json = item.get("enrichmentJson") if isinstance(item.get("enrichmentJson"), dict) else {}
        if social_enrichment:
            enrichment_json = {
                **enrichment_json,
                "social": social_enrichment,
            }
        if item.get("_websiteEnrichment"):
            enrichment_json = {
                **enrichment_json,
                "website": item.get("_websiteEnrichment"),
            }
        if enrichment_json:
            item["enrichmentJson"] = enrichment_json
        return item

    def normalize_email_candidate(self, value: str | None) -> str | None:
        email = " ".join(str(value or "").strip().split()).lower()
        match = EMAIL_RE.search(email)
        if not match:
            return None
        candidate = match.group(0).lower()
        local, _, domain = candidate.partition("@")
        if not local or not domain or domain in BAD_EMAIL_DOMAINS or local in BAD_EMAIL_LOCAL_PARTS:
            return None
        tld = domain.rsplit(".", 1)[-1]
        if tld in BAD_EMAIL_TLDS:
            return None
        return candidate

    def email_status_for_candidate(self, email: str | None, website: str | None, source: str) -> tuple[str, int]:
        normalized = self.normalize_email_candidate(email)
        if not normalized:
            return "missing", 0
        website_domain = domain_from_url(website)
        email_domain = normalized.split("@", 1)[1]
        same_domain = bool(website_domain and (email_domain == website_domain or email_domain.endswith(f".{website_domain}")))
        if source == "website":
            return "confirmed", 92 if same_domain else 82
        if source == "manual":
            return "confirmed" if same_domain or not website_domain else "unverified", 78 if same_domain else 62
        return "probable", 55

    async def discover_email_for_contact(self, contact: dict) -> tuple[str | None, str, str, int, dict]:
        supplied = self.normalize_email_candidate(contact.get("email"))
        if supplied:
            status, confidence = self.email_status_for_candidate(supplied, contact.get("website"), "manual")
            return supplied, status, "manual", confidence, {"pagesFetched": 0, "emailsFound": 1}

        website = str(contact.get("website") or "").strip()
        website_domain = domain_from_url(website)
        stats = {"pagesFetched": 0, "emailsFound": 0}
        if website:
            root = website if website.startswith(("http://", "https://")) else f"https://{website}"
            urls = list(dict.fromkeys([
                root,
                urljoin(root.rstrip("/") + "/", "contato"),
                urljoin(root.rstrip("/") + "/", "contact"),
                urljoin(root.rstrip("/") + "/", "sobre"),
            ]))
            fetcher = Fetcher(
                self.settings.user_agent,
                min(self.settings.timeout_seconds, 5),
                min(self.settings.concurrency, 3),
                self.settings.max_page_bytes,
            )
            pages = await fetcher.fetch_all(urls)
            stats["pagesFetched"] = len(pages)
            for page in pages:
                for match in EMAIL_RE.findall(page.html or ""):
                    email = self.normalize_email_candidate(match)
                    if not email:
                        continue
                    stats["emailsFound"] += 1
                    status, confidence = self.email_status_for_candidate(email, website, "website")
                    return email, status, "website", confidence, stats

        return None, "missing", "none", 0, stats

    async def extract_social_links_from_website(
        self,
        contact: dict,
        deadline: float,
        budget_seconds: float,
    ) -> dict:
        website_social_stats = {
            "attempted": False,
            "found": False,
            "url": contact.get("website"),
            "fields": [],
            "error": None,
        }
        if not contact.get("website") or self.time_budget_expired(deadline):
            return website_social_stats

        missing_from_site = [
            channel
            for channel in ("instagram", "facebook")
            if not contact.get("instagramUrl" if channel == "instagram" else "facebookUrl")
        ]
        if not missing_from_site:
            return website_social_stats

        website_social_stats["attempted"] = True
        try:
            remaining = self.remaining_budget_seconds(deadline, budget_seconds)
            if remaining < 1.0:
                website_social_stats["error"] = "time_budget_exhausted"
                return website_social_stats
            website_budget = min(8.0, remaining)
            pages = await Fetcher(
                self.settings.user_agent,
                website_budget,
                1,
                self.settings.max_page_bytes,
            ).fetch_all([str(contact.get("website"))])
            if pages:
                links = extract_social_links_from_html(pages[0].html, pages[0].url)
                for field, value in links.items():
                    if field in {"instagramUrl", "facebookUrl"} and value and not contact.get(field):
                        contact[field] = value
                        website_social_stats["fields"].append(field)
                website_social_stats["url"] = pages[0].url
                website_social_stats["found"] = bool(website_social_stats["fields"])
        except Exception as error:
            website_social_stats["error"] = str(error)[:180]
        return website_social_stats

    def parse_rating_reviews_from_identity_text(self, value: str) -> tuple[float | None, int | None]:
        text = " ".join(str(value or "").split())
        rating: float | None = None
        reviews: int | None = None
        rating_match = re.search(r"\b([0-5](?:[,.]\d)?)\s*(?:★|estrelas?|stars?)", text, flags=re.I)
        if not rating_match:
            rating_match = re.search(r"\bnota\s+([0-5](?:[,.]\d)?)\b", text, flags=re.I)
        if rating_match:
            try:
                rating = max(0.0, min(5.0, float(rating_match.group(1).replace(",", "."))))
            except Exception:
                rating = None
        reviews_match = re.search(r"\b(\d{1,6})\s+(?:avalia[cç][oõ]es|reviews?|coment[aá]rios)\b", text, flags=re.I)
        if reviews_match:
            try:
                reviews = max(0, int(reviews_match.group(1)))
            except Exception:
                reviews = None
        return rating, reviews

    def enrich_identity_lookup(self, contact: dict, city: str, state: str, segment: str, deadline: float | None = None) -> dict:
        name = " ".join(str(contact.get("name") or "").split())
        city_text = " ".join(str(city or contact.get("city") or "").split())
        state_text = " ".join(str(state or contact.get("state") or "").split()).upper()
        if not name or not city_text or self.time_budget_expired(deadline):
            return {"stats": {"queries": [], "rows": 0, "mode": "identity_first"}}

        q_name = self.quote_query_part(name)
        q_city = self.quote_query_part(city_text)
        queries = list(dict.fromkeys([
            f"{q_name} {q_city} {state_text}".strip(),
            f"{q_name} {q_city}".strip(),
            f"{q_name} {q_city} instagram facebook".strip(),
            f"{q_name} {q_city} cnpj".strip(),
        ]))
        result: dict = {"stats": {"queries": [], "rows": 0, "mode": "identity_first"}}
        best_social: dict[str, tuple[str, int, str]] = {}
        best_website: tuple[str | None, int, str | None] = (None, -10_000, None)

        try:
            fetched_at = datetime.now(timezone.utc).isoformat()
            for query in queries[:4]:
                if self.time_budget_expired(deadline):
                    break
                result["stats"]["queries"].append(query)
                errors: list[str] = []
                rows = self.web_search_service.collect_results(query, 10, fetched_at, errors)
                result["stats"]["rows"] += len(rows)
                for row in rows:
                    raw_url = str(row.url or "").strip()
                    row_dict = {
                        "title": row.title,
                        "body": row.snippet,
                        "snippet": row.snippet,
                        "description": row.snippet,
                        "href": row.url,
                        "url": row.url,
                    }
                    row_text = " ".join(str(row_dict.get(key) or "") for key in ("title", "body", "snippet", "description", "href", "url"))
                    if not result.get("cnpj"):
                        cnpj_match = CNPJ_RE.search(row_text)
                        if cnpj_match:
                            result["cnpj"] = cnpj_match.group(0)
                    rating, reviews = self.parse_rating_reviews_from_identity_text(row_text)
                    if rating is not None and result.get("rating") is None:
                        result["rating"] = rating
                    if reviews is not None and result.get("reviews") is None:
                        result["reviews"] = reviews
                    if raw_url and re.match(r"^https?://(?:www\.)?(?:google\.[^/]+/maps|maps\.app\.goo\.gl)/", raw_url, re.I):
                        result.setdefault("googleMapsUrl", raw_url)
                    for channel in ("instagram", "facebook"):
                        field = "instagramUrl" if channel == "instagram" else "facebookUrl"
                        if result.get(field):
                            continue
                        score = self.score_social_candidate(contact, row_dict, raw_url, channel, city_text, segment, query)
                        if score > best_social.get(field, ("", -10_000, ""))[1]:
                            normalized = normalize_social_url(raw_url)
                            if normalized:
                                best_social[field] = (normalized, score, query)
                    if raw_url and not is_social_signal_domain(raw_url):
                        website_score = self.score_website_candidate(contact, row_dict, raw_url, city_text)
                        if website_score > best_website[1]:
                            best_website = (raw_url, website_score, query)
                if best_social.get("instagramUrl") and best_social.get("facebookUrl") and best_website[1] >= 35:
                    break
        except Exception as error:
            print(f"[identity_enrich] falhou name={name} error={error}")

        for field, (url, score, query) in best_social.items():
            if score >= 55:
                result[field] = url
                result["stats"][field] = {"score": score, "query": query}
        if best_website[0] and best_website[1] >= 35:
            parsed = urlparse(best_website[0])
            result["website"] = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
            result["stats"]["website"] = {"score": best_website[1], "query": best_website[2]}
        return result

    async def enrich_lead(self, request: EnrichLeadRequest) -> EnrichLeadResponse:
        return await self.lead_provider_router.run(
            request,
            lambda: self._enrich_lead_core(request),
        )

    async def _enrich_lead_core(self, request: EnrichLeadRequest) -> EnrichLeadResponse:
        requested_budget = float(request.timeBudgetSeconds or 18)
        budget_seconds = max(5.0, min(SOCIAL_ENRICH_TOTAL_BUDGET_SECONDS, requested_budget))
        deadline = time.monotonic() + budget_seconds
        phone_digits = re.sub(r"\D", "", request.phoneDigits or request.phone or "")
        requested_preferred_channels = list(request.preferredChannels or [])
        if not requested_preferred_channels:
            requested_preferred_channels = ["instagram", "facebook"]
        requested_website_channels = set(requested_preferred_channels) | set(request.requiredChannels or []) | set(request.requestedFields or [])
        preferred_channels = [
            channel
            for channel in dict.fromkeys(requested_preferred_channels)
            if channel in {"instagram", "facebook"}
        ]
        required_channels = set(request.requiredChannels or [])
        required_social_channels = {"instagram", "facebook"} & required_channels
        website_requested = bool({"website", "email"} & requested_website_channels)
        website_required = "website" in required_channels
        social_required = bool(required_social_channels)
        contact = {
            "name": request.name,
            "phone": request.phone or phone_digits,
            "phoneDigits": phone_digits,
            "city": request.city,
            "state": request.state,
            "segment": request.segment,
            "website": request.website,
            "email": request.email,
            "instagramUrl": request.instagramUrl,
            "facebookUrl": request.facebookUrl,
            "source": "hbx_scraping:social_enrichment",
            "score": 70,
        }
        input_website_accepted = bool(contact.get("website"))
        early_social_stats = None
        if contact.get("website"):
            website_score = self.score_website_candidate(
                contact,
                {"title": contact.get("name"), "body": "", "url": contact.get("website"), "href": contact.get("website")},
                str(contact.get("website")),
                request.city,
            )
            if website_score < 35:
                contact["website"] = None
                input_website_accepted = False
        identity = self.enrich_identity_lookup(contact, request.city, request.state, request.segment, min(deadline, time.monotonic() + 12))
        identity_social_matches: list[dict] = []
        for key in ("website", "instagramUrl", "facebookUrl"):
            if social_required and key in {"instagramUrl", "facebookUrl"}:
                continue
            if identity.get(key) and not contact.get(key):
                if key in {"instagramUrl", "facebookUrl"}:
                    identity_score = int(((identity.get("stats") or {}).get(key) or {}).get("score") or 55)
                    identity_query = ((identity.get("stats") or {}).get(key) or {}).get("query") or "identity_search"
                    if identity_score >= 70:
                        contact[key] = identity.get(key)
                        contact.setdefault("_socialEnrichment", {})[key] = {
                            "score": identity_score,
                            "query": identity_query,
                            "status": "confirmed",
                            "method": "identity_search",
                        }
                        identity_social_matches.append({
                            "field": key,
                            "url": contact[key],
                            "score": identity_score,
                            "status": "confirmed",
                            "query": identity_query,
                            "method": "identity_search",
                        })
                    else:
                        contact.setdefault("possibleSocialCandidates", []).append({
                            "field": key,
                            "channel": "instagram" if key == "instagramUrl" else "facebook",
                            "url": identity.get(key),
                            "score": identity_score,
                            "status": "possible",
                            "reason": "Resultado de identidade abaixo do corte de confirmacao.",
                            "query": identity_query,
                            "method": "identity_search",
                        })
                else:
                    contact[key] = identity.get(key)
        should_find_website_before_social = (
            not contact.get("website")
            and not self.time_budget_expired(deadline)
            and (website_requested or website_required or (not social_required and not phone_digits))
        )
        if should_find_website_before_social:
            website_deadline = min(deadline, time.monotonic() + (10 if (website_requested or website_required) else 6))
            direct_deadline = min(website_deadline, time.monotonic() + 4)
            website, website_score, website_query = self.probe_direct_website_for_contact(contact, request.city, direct_deadline)
            if not website and not self.time_budget_expired(website_deadline):
                website, website_score, website_query = self.discover_website_for_contact(contact, request.city, website_deadline)
            if website:
                contact["website"] = website
                contact["_websiteEnrichment"] = {
                    "score": website_score,
                    "query": website_query,
                }
        if social_required:
            website_social_stats = {
                "attempted": False,
                "found": False,
                "url": contact.get("website"),
                "fields": [],
                "error": None,
                "skipped": "required_social_uses_focused_search",
            }
        else:
            website_social_stats = await self.extract_social_links_from_website(contact, deadline, budget_seconds)
        missing_social_channels = [
            channel
            for channel in preferred_channels
            if channel in {"instagram", "facebook"}
            and not contact.get("instagramUrl" if channel == "instagram" else "facebookUrl")
        ]
        if missing_social_channels and not self.time_budget_expired(deadline):
            contacts, late_social_stats = self.enrich_social_links_for_contacts(
                [contact],
                request.city,
                request.state,
                request.segment,
                missing_social_channels,
                list(required_channels),
                time_budget_seconds=self.remaining_budget_seconds(deadline, budget_seconds),
            )
            social_stats = late_social_stats
            if early_social_stats:
                social_stats["matches"] = [
                    *(early_social_stats.get("matches") or []),
                    *(late_social_stats.get("matches") or []),
                ]
                social_stats["possibleSocialCandidates"] = [
                    *(early_social_stats.get("possibleSocialCandidates") or []),
                    *(late_social_stats.get("possibleSocialCandidates") or []),
                ]
                social_stats["processed"] = int(early_social_stats.get("processed") or 0) + int(late_social_stats.get("processed") or 0)
                social_stats["enrichedCount"] = max(int(early_social_stats.get("enrichedCount") or 0), int(late_social_stats.get("enrichedCount") or 0))
                social_stats["timedOut"] = bool(early_social_stats.get("timedOut") or late_social_stats.get("timedOut"))
        else:
            contacts, social_stats = [contact], early_social_stats or {
                "matches": [],
                "possibleSocialCandidates": [],
                "identity": identity.get("stats"),
                "missingRequiredChannel": 1 if social_required and not self.has_required_social_channels(contact, required_social_channels) else 0,
            }
        if contact.get("possibleSocialCandidates"):
            existing_possible_urls = {
                str(item.get("url") or "").rstrip("/").lower()
                for item in (social_stats.get("possibleSocialCandidates") or [])
                if isinstance(item, dict)
            }
            social_stats["possibleSocialCandidates"] = [
                *(social_stats.get("possibleSocialCandidates") or []),
                *[
                    item
                    for item in (contact.get("possibleSocialCandidates") or [])
                    if isinstance(item, dict)
                    and str(item.get("url") or "").rstrip("/").lower() not in existing_possible_urls
                ],
            ]
        if identity_social_matches:
            existing_social_urls = {
                str(match.get("url") or "")
                for match in (social_stats.get("matches") or [])
                if isinstance(match, dict)
            }
            social_stats["matches"] = [
                *(social_stats.get("matches") or []),
                *[
                    match
                    for match in identity_social_matches
                    if str(match.get("url") or "") not in existing_social_urls
                ],
            ]
        social_stats["website"] = website_social_stats
        enriched = contacts[0] if contacts else contact
        if not enriched.get("website") and not self.time_budget_expired(deadline):
            website_deadline = min(deadline, time.monotonic() + 5)
            website, website_score, website_query = self.discover_website_for_contact(enriched, request.city, website_deadline)
            if website:
                enriched["website"] = website
                enriched["_websiteEnrichment"] = {
                    "score": website_score,
                    "query": website_query,
                }
                if not social_required and not (enriched.get("instagramUrl") or enriched.get("facebookUrl")):
                    late_website_social_stats = await self.extract_social_links_from_website(enriched, deadline, budget_seconds)
                    if late_website_social_stats.get("attempted"):
                        social_stats["lateWebsite"] = late_website_social_stats
        if self.time_budget_expired(deadline) or not enriched.get("website"):
            email, email_status, email_source, email_confidence, email_stats = None, "missing", "none", 0, {"pagesFetched": 0, "emailsFound": 0, "timedOut": True}
        else:
            email, email_status, email_source, email_confidence, email_stats = await self.discover_email_for_contact(enriched)
        has_social = bool(enriched.get("instagramUrl") or enriched.get("facebookUrl"))
        social_scores = [
            int(match.get("score") or 0)
            for match in (social_stats.get("matches") or [])
            if isinstance(match, dict)
        ]
        social_confidence = min(max(social_scores), 100) if social_scores else 90 if enriched.get("instagramUrl") and enriched.get("facebookUrl") else 82 if has_social else 0
        return EnrichLeadResponse(
            name=request.name,
            phone=request.phone or phone_digits,
            phoneDigits=phone_digits,
            rating=identity.get("rating"),
            reviews=identity.get("reviews"),
            website=enriched.get("website") or (request.website if input_website_accepted else None),
            email=email,
            emailStatus=email_status,
            emailSource=email_source,
            emailConfidence=email_confidence,
            instagramUrl=enriched.get("instagramUrl"),
            facebookUrl=enriched.get("facebookUrl"),
            possibleSocialCandidates=social_stats.get("possibleSocialCandidates") or enriched.get("possibleSocialCandidates") or [],
            googleMapsUrl=identity.get("googleMapsUrl"),
            cnpj=identity.get("cnpj"),
            socialStatus="found" if has_social else "missing",
            socialConfidence=social_confidence,
            stats={
                "identity": identity.get("stats"),
                "social": social_stats,
                "email": email_stats,
                "website": enriched.get("_websiteEnrichment"),
            },
        )

    async def search(self, request: SearchRequest) -> SearchResponse:
        intent = SearchIntent.from_request(request)
        excluded_phones = set(request.excludePhoneDigits or [])
        excluded_urls = set(request.excludeUrls or [])
        requested_social_channels = self.effective_requested_social_channels(request)
        required_social_channels = self.required_social_channels(request.requiredChannels)
        social_requested = bool(requested_social_channels)

        if request.targetType != "pj" and not request.fresh and not excluded_phones and not excluded_urls and not social_requested:
            cached = await asyncio.to_thread(self.storage.get_cached, request)
            if cached:
                return SearchResponse.model_validate(cached)

        if request.targetType == "agenda_pf":
            response = await self.search_agenda_pf(request)
            await asyncio.to_thread(self.storage.save_run, request, response.model_dump())
            return response

        queries_generated = build_intent_discovery_queries(
            request.segment,
            request.city,
            request.state,
            request.targetType,
            request.query,
            self.effective_discovery_channels(request),
            list(request.requiredChannels or []),
            intent,
        )
        social_profiles: list[dict] = []
        if request.targetType == "pj" and requested_social_channels:
            social_profiles = await asyncio.to_thread(
                discover_social_profiles,
                request.city,
                request.state,
                request.segment,
                request.limit,
                list(requested_social_channels),
                list(required_social_channels),
                None,
                request.query,
            )

        urls = await asyncio.to_thread(
            discover_urls,
            request.city,
            request.state,
            request.segment,
            request.limit,
            self.settings.max_discovery_results,
            request.targetType,
            len(excluded_phones),
            request.query,
            list(excluded_urls),
            self.effective_discovery_channels(request),
            list(request.requiredChannels or []),
            intent,
        )
        print(f"[search] URLs encontradas: {len(urls)}")

        fetcher = Fetcher(
            self.settings.user_agent,
            self.settings.timeout_seconds,
            self.settings.concurrency,
            self.settings.max_page_bytes,
        )
        pages = await fetcher.fetch_all(urls)
        print(f"[search] URLs baixadas: {len(pages)}")

        parsed: list[dict] = []
        errors: list[str] = []
        for page in pages:
            try:
                contacts, text = parse_page(page.html, page.url, request.targetType, request.city)
            except Exception as error:
                errors.append(f"parse_failed:{page.url}")
                print(f"[search] parse ignorado url={page.url} error={error}")
                continue
            for contact in contacts:
                legacy_score = score_contact(
                    contact,
                    request.city,
                    request.state,
                    request.segment,
                    text,
                    is_directory_url(page.url),
                    request.targetType,
                )
                evidence = self.evidence_scorer.score(contact, intent, text)
                contact["score"] = evidence.finalScore if request.targetType == "pj" else legacy_score
                contact["_legacyScore"] = legacy_score
                contact["evidenceJson"] = evidence.model_dump()
                contact["rejectReasons"] = evidence.penalties
                commercial_reasons = [reason for reason in evidence.reasons if "público-alvo" in reason or "segmentos-alvo" in reason]
                technical_reasons = [reason for reason in evidence.reasons if reason not in commercial_reasons]
                visible_reasons = [*commercial_reasons, *technical_reasons][:3]
                contact["qualityReason"] = "; ".join(visible_reasons) if visible_reasons else None
                contact["sourceEngine"] = "hbx_scraping"
                contact["sourceUrl"] = contact.get("sourceUrl") or page.url
                contact["_pageUrl"] = contact.get("_pageUrl") or page.url
                parsed.append(contact)

        deduped = dedupe_contacts(parsed, request.city, request.targetType)
        social_discovery_stats = {
            "profilesDiscovered": len(social_profiles),
            "profilesAttached": 0,
            "profilesUnmatched": 0,
            "profilesPromoted": 0,
        }
        if request.targetType == "pj" and social_profiles:
            social_discovery_stats = self.attach_discovered_social_profiles(
                deduped,
                social_profiles,
                request.city,
                request.segment,
            )
            attached_social_urls = {
                normalize_social_url(str(contact.get(field) or ""))
                for contact in deduped
                for field in ("instagramUrl", "facebookUrl")
                if contact.get(field)
            }
            profiles_for_social_first = [
                profile
                for profile in social_profiles
                if normalize_social_url(str(profile.get("url") or "")) not in attached_social_urls
            ]
            if required_social_channels:
                social_first_candidates = self.social_profile_candidates(
                    profiles_for_social_first,
                    request.city,
                    request.state,
                    request.segment,
                    required_social_channels,
                    request.limit,
                )
                if social_first_candidates:
                    deduped = dedupe_contacts([*social_first_candidates, *deduped], request.city, request.targetType)
                    social_discovery_stats["profilesPromoted"] = len([item for item in deduped if item.get("_socialFirst")])
            else:
                remaining = max(0, request.limit - len(deduped))
                if remaining <= 0:
                    social_first_candidates = []
                else:
                    social_first_candidates = self.social_profile_candidates(
                        profiles_for_social_first,
                        request.city,
                        request.state,
                        request.segment,
                        requested_social_channels,
                        remaining,
                        False,
                    )
                if social_first_candidates:
                    before_social_first = len(deduped)
                    deduped = dedupe_contacts([*deduped, *social_first_candidates], request.city, request.targetType)
                    social_discovery_stats["profilesPromoted"] = max(0, len(deduped) - before_social_first)
        effective_social_channels = requested_social_channels
        social_stats = {
            "requestedChannels": sorted(effective_social_channels),
            "requiredChannels": sorted(required_social_channels),
            "enrichmentRan": False,
            "mode": "off" if not requested_social_channels else "required" if required_social_channels else "best_effort",
            "processed": 0,
            "skippedBadCandidate": 0,
            "enrichedCount": 0,
            "missingRequiredChannel": 0,
            "discovery": social_discovery_stats,
        }
        inline_social_count = sum(1 for item in deduped if item.get("instagramUrl") or item.get("facebookUrl"))
        if inline_social_count and not requested_social_channels:
            social_stats.update({
                "enrichmentRan": True,
                "mode": "inline",
                "processed": inline_social_count,
                "enrichedCount": inline_social_count,
            })
        if request.targetType == "pj" and requested_social_channels:
            deduped, social_stats = await asyncio.to_thread(
                self.enrich_social_links_for_contacts,
                deduped,
                request.city,
                request.state,
                request.segment,
                list(requested_social_channels),
                list(required_social_channels),
            )
            social_stats["discovery"] = social_discovery_stats
        allowed_fields = {
            "name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "email",
            "emailStatus", "emailSource", "emailConfidence",
            "instagramUrl", "facebookUrl", "source", "sourceEngine", "sourceUrl", "score",
            "socialStatus", "socialConfidence",
            "evidenceJson", "rejectReasons", "qualityReason", "visibilityTier", "deliveryProduct",
            "recommendedChannel", "enrichmentJson",
            "cnpj", "cnae", "razaoSocial",
        }
        min_score = 0 if request.targetType == "pf" else 50
        public_items: list[dict] = []
        stats = {"parsed": len(parsed), "invalid_phone": 0, "blocked_domain": 0, "low_score": 0, "missing_required_channel": 0, "approved": 0, "rejected": 0}
        source_metrics: dict[str, dict[str, int | str | float]] = {}

        def bump_source(item: dict, key: str) -> None:
            domain = domain_from_url(item.get("sourceUrl") or item.get("_pageUrl") or item.get("website")) or "unknown"
            source_engine = str(item.get("sourceEngine") or item.get("source") or "hbx_scraping")
            metric_key = f"{source_engine}|{domain}"
            row = source_metrics.setdefault(metric_key, {
                "sourceEngine": source_engine,
                "domain": domain,
                "discovered": 0,
                "fetched": 0,
                "parsed": 0,
                "approved": 0,
                "rejected": 0,
                "approvalRate": 0,
            })
            row[key] = int(row.get(key, 0)) + 1

        def bump_source_url(url: str, source_engine: str, key: str) -> None:
            domain = domain_from_url(url) or "unknown"
            metric_key = f"{source_engine}|{domain}"
            row = source_metrics.setdefault(metric_key, {
                "sourceEngine": source_engine,
                "domain": domain,
                "discovered": 0,
                "fetched": 0,
                "parsed": 0,
                "approved": 0,
                "rejected": 0,
                "approvalRate": 0,
            })
            row[key] = int(row.get(key, 0)) + 1

        for url in urls:
            bump_source_url(url, "hbx_scraping", "discovered")
        for page in pages:
            bump_source_url(page.url, "hbx_scraping", "fetched")
        for profile in social_profiles:
            bump_source_url(str(profile.get("url") or ""), "hbx_scraping_social", "discovered")

        expected_local_ddds = expected_ddds(request.city, request.state) if request.targetType == "pj" else set()
        for item in deduped:
            if request.targetType == "pj" and (item.get("_directoryListingSource") or is_directory_listing_page(str(item.get("sourceUrl") or item.get("_pageUrl") or ""))):
                stats["low_score"] += 1
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            if request.targetType == "pj" and not item.get("evidenceJson"):
                evidence_text = " ".join(str(item.get(key) or "") for key in ("name", "address", "segment", "_socialSnippet", "_pageUrl", "sourceUrl"))
                evidence = self.evidence_scorer.score(item, intent, evidence_text)
                item["score"] = evidence.finalScore
                item["evidenceJson"] = evidence.model_dump()
                item["rejectReasons"] = evidence.penalties
                commercial_reasons = [reason for reason in evidence.reasons if "público-alvo" in reason or "segmentos-alvo" in reason]
                technical_reasons = [reason for reason in evidence.reasons if reason not in commercial_reasons]
                visible_reasons = [*commercial_reasons, *technical_reasons][:3]
                item["qualityReason"] = "; ".join(visible_reasons) if visible_reasons else None
                item["sourceEngine"] = item.get("sourceEngine") or "hbx_scraping"
                item["sourceUrl"] = item.get("sourceUrl") or item.get("_pageUrl")
            bump_source(item, "parsed")
            if not self.has_public_actionable_channel(item):
                stats["invalid_phone"] += 1
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            if item.get("phoneDigits") and item.get("phoneDigits") in excluded_phones:
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            if request.targetType == "pj" and item.get("phoneDigits") and expected_local_ddds:
                ddd = phone_ddd(item.get("phoneDigits"))
                if ddd and ddd not in expected_local_ddds:
                    stats["low_score"] += 1
                    stats["rejected"] += 1
                    bump_source(item, "rejected")
                    continue
            blocked_domain = (
                is_pf_technical_blocked_domain(item.get("website")) or is_pf_technical_blocked_domain(item.get("_pageUrl"))
                if request.targetType == "pf"
                else is_blocked_lead_source_domain(item.get("website")) or is_blocked_lead_source_domain(item.get("_pageUrl"))
            )
            if blocked_domain:
                stats["blocked_domain"] += 1
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            if not self.matches_channel_intent(item, request):
                stats["missing_required_channel"] += 1
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            if request.targetType != "pf" and is_generic_name(item.get("name"), request.city, request.targetType, request.segment):
                stats["low_score"] += 1
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            if request.targetType != "pf" and int(item.get("score") or 0) < min_score:
                stats["low_score"] += 1
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            if request.targetType == "pj":
                item = self.apply_public_enrichment_contract(item)
            public_item = {key: value for key, value in item.items() if key in allowed_fields}
            if requested_social_channels and request.query and not (
                public_item.get("instagramUrl") or public_item.get("facebookUrl")
            ):
                stats["missing_required_channel"] += 1
                stats["rejected"] += 1
                bump_source(item, "rejected")
                continue
            public_item["_technicalScore"] = int(item.get("score") or 0)
            if request.targetType == "pj":
                public_item["source"] = "hbx_scraping:free_pj"
            public_item["visibilityTier"] = "list_basic"
            public_item["recommendedChannel"] = self.recommended_channel_for_contact(item, request.requiredChannels)
            public_items.append(public_item)
            stats["approved"] += 1
            bump_source(item, "approved")
        if request.targetType == "pf":
            print(
                "[search:pf] "
                f"candidatos_parseados={stats['parsed']} "
                f"descartados_telefone_invalido={stats['invalid_phone']} "
                f"descartados_dominio_bloqueado={stats['blocked_domain']} "
                f"descartados_score_baixo=0 "
                f"aprovados={stats['approved']}"
            )
        if request.targetType == "pj":
            public_items.sort(
                key=lambda item: (
                    1 if item.get("phoneDigits") else 0,
                    1 if item.get("instagramUrl") or item.get("facebookUrl") else 0,
                    int(item.get("_technicalScore") or 0),
                ),
                reverse=True,
            )
        else:
            public_items.sort(key=lambda item: int(item.get("_technicalScore") or 0), reverse=True)
        valid = [
            ContactResult.model_validate({key: value for key, value in item.items() if key != "_technicalScore"}).model_dump(exclude_none=True)
            for item in public_items
        ]
        valid = valid[: request.limit]
        for row in source_metrics.values():
            approved = int(row.get("approved", 0))
            rejected = int(row.get("rejected", 0))
            total = approved + rejected
            row["approvalRate"] = round(approved / total, 4) if total else 0
        social_stats["missingRequiredChannel"] = stats["missing_required_channel"]
        parsed_count = max(stats["parsed"], len(deduped))
        response_stats = {
            "urlsDiscovered": len(urls),
            "pagesFetched": len(pages),
            "queriesGenerated": queries_generated,
            "parsed": parsed_count,
            "parsedContacts": parsed_count,
            "approved": stats["approved"],
            "invalidPhone": stats["invalid_phone"],
            "blockedDomain": stats["blocked_domain"],
            "lowScore": stats["low_score"],
            "missingRequiredChannel": stats["missing_required_channel"],
            "rejected": stats["rejected"],
            "rawFound": len(parsed),
            "deduped": len(deduped),
            "sourceMetrics": list(source_metrics.values()),
            "socialProfilesDiscovered": social_discovery_stats["profilesDiscovered"],
            "socialProfilesAttached": social_discovery_stats["profilesAttached"],
            "socialProfilesUnmatched": social_discovery_stats["profilesUnmatched"],
            "socialProfilesPromoted": social_discovery_stats.get("profilesPromoted", 0),
        }
        print(
            "[search] "
            f"parsed={response_stats['parsed']} "
            f"approved={response_stats['approved']} "
            f"invalid_phone={stats['invalid_phone']} "
            f"blocked_domain={stats['blocked_domain']} "
            f"low_score={stats['low_score']} "
            f"missing_required_channel={stats['missing_required_channel']}"
        )
        print(
            "[search:funnel] "
            f"urls_discovered={len(urls)} "
            f"pages_fetched={len(pages)} "
            f"raw_found={len(parsed)} "
            f"deduped={len(deduped)} "
            f"social_profiles={social_discovery_stats['profilesDiscovered']} "
            f"social_attached={social_discovery_stats['profilesAttached']} "
            f"approved={response_stats['approved']} "
            f"missing_required_channel={stats['missing_required_channel']}"
        )

        response = SearchResponse(
            query=QueryPayload(
                city=request.city,
                state=request.state,
                radiusKm=request.radiusKm,
                originLat=request.originLat,
                originLng=request.originLng,
                segment=request.segment,
                segments=request.segments,
                query=request.query,
                targetType=request.targetType,
                limit=request.limit,
                quantity=request.limit,
                preferredChannels=request.preferredChannels,
                requiredChannels=request.requiredChannels,
                channelMatchMode=request.channelMatchMode,
                freshness=request.freshness,
                salesProfile=intent.salesProfile,
            ),
            count=len(valid),
            results=[ContactResult.model_validate(item) for item in valid],
            status="completed_with_errors" if errors else "completed",
            errors=errors,
            stats=response_stats,
            social=social_stats,
        )
        await asyncio.to_thread(self.storage.save_run, request, response.model_dump())
        return response

    async def search_agenda_pf(self, request: SearchRequest) -> SearchResponse:
        excluded_phones = set(request.excludePhoneDigits or [])
        excluded_urls = set(request.excludeUrls or [])
        print("[search:agenda_pf] fontes_tentadas=abctelefonos,web")
        contacts = await search_abctelefonos(
            request.city,
            request.state,
            request.limit,
            self.settings.user_agent,
            self.settings.timeout_seconds,
            self.settings.agenda_max_pages,
            self.settings.agenda_request_delay_ms,
        )
        abc_count = len(contacts)

        remaining = max(0, request.limit - len(contacts))
        discovered_count = 0
        downloaded_count = 0
        parsed_web_count = 0
        if remaining > 0:
            urls = await asyncio.to_thread(
                discover_urls,
                request.city,
                request.state,
                request.segment,
                max(request.limit, remaining),
                self.settings.max_discovery_results,
                "agenda_pf",
                0,
                request.query,
                list(excluded_urls),
                [],
                [],
            )
            discovered_count = len(urls)
            print(f"[search:agenda_pf] urls_descobertas={discovered_count}")
            fetcher = Fetcher(
                self.settings.user_agent,
                self.settings.timeout_seconds,
                self.settings.concurrency,
                self.settings.max_page_bytes,
            )
            pages = await fetcher.fetch_all(urls)
            downloaded_count = len(pages)
            print(f"[search:agenda_pf] paginas_baixadas={downloaded_count}")
            web_contacts: list[dict] = []
            for page in pages:
                parsed_contacts, text = parse_page(page.html, page.url, "agenda_pf", request.city)
                for contact in parsed_contacts:
                    contact["source"] = "hbx_agenda:web"
                    contact["rating"] = None
                    contact["reviews"] = None
                    contact["address"] = None
                    contact["website"] = None
                    contact["score"] = score_contact(
                        contact,
                        request.city,
                        request.state,
                        request.segment,
                        text,
                        is_directory_url(page.url),
                        "pf",
                    )
                    web_contacts.append(contact)
            parsed_web_count = len(web_contacts)
            contacts = dedupe_by_phone([*contacts, *web_contacts])

        allowed_fields = {"name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "email", "instagramUrl", "facebookUrl", "source", "score"}
        public_items = [
            {key: value for key, value in item.items() if key in allowed_fields}
            for item in contacts
            if item.get("name")
            and item.get("phone")
            and item.get("phoneDigits")
            and item.get("phoneDigits") not in excluded_phones
        ]
        public_items.sort(key=lambda item: int(item.get("score") or 0), reverse=True)
        public_items = public_items[: request.limit]
        print(
            "[search:agenda_pf] "
            f"contatos_abctelefonos={abc_count} "
            f"urls_descobertas={discovered_count} "
            f"paginas_baixadas={downloaded_count} "
            f"contatos_parseados={abc_count + parsed_web_count} "
            f"contatos_aprovados={len(public_items)}"
        )
        return SearchResponse(
            query=QueryPayload(city=request.city, state=request.state, segment=request.segment, query=request.query, targetType=request.targetType, limit=request.limit),
            count=len(public_items),
            results=[ContactResult.model_validate(item) for item in public_items],
        )

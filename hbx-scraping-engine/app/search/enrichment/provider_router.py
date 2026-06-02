from __future__ import annotations

import os
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable
from urllib.parse import urlparse

import httpx

from app.schemas import EnrichLeadRequest, EnrichLeadResponse
from app.services.filters import text_key
from app.services.social import normalize_social_url, social_field_for_url
from app.services.web_search_service import WebSearchService


CONFIDENCE_TARGET = 70
PROVIDER_CACHE_TTL = timedelta(hours=24)
PROVIDER_ROUTER_VERSION = "lead-link-enrichment-v1"
ROUTER_LEGAL_STOP_TOKENS = {
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
    "negocios",
    "participacoes",
    "servico",
    "servicos",
    "spe",
}
ROUTER_REAL_ESTATE_TOKENS = {"imobiliaria", "imobiliarias", "imoveis", "imovel", "corretor", "corretores"}
ROUTER_DIRECTORY_HOSTS = {
    "acheiempresa.com.br",
    "applocal.com.br",
    "br.todosnegocios.com",
    "brazilguide.net",
    "cylex.com.br",
    "eguias.net",
    "econodata.com.br",
    "guia.provik.com.br",
    "listamais.com.br",
    "misterwhat.com.br",
    "paginaamarela.com.br",
    "sneps.com.br",
    "solutudo.com.br",
    "serasaexperian.com.br",
}
ROUTER_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
ROUTER_CNPJ_RE = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")


def normalize_channel_list_for_router(values: list[str] | None) -> list[str]:
    aliases = {
        "site": "website",
        "web": "website",
        "facebookUrl": "facebook",
        "instagramUrl": "instagram",
        "linkedinUrl": "linkedin",
    }
    output: list[str] = []
    for value in values or []:
        channel = aliases.get(str(value or "").strip(), str(value or "").strip().lower())
        if channel and channel not in output:
            output.append(channel)
    return output


@dataclass(frozen=True)
class ProviderDefinition:
    name: str
    enabled: bool
    priority: int
    freeQuotaMonthly: int = 0
    costPerRequest: float = 0.0
    dailyLimit: int = 0
    monthlyLimit: int = 0
    supportsSearch: bool = False
    supportsExtraction: bool = False
    supportsSemanticSearch: bool = False
    requiresApiKey: bool = False
    tier: str = "local"
    envKey: str | None = None


@dataclass
class ProviderRun:
    provider: str
    status: str
    reason: str = ""
    cost: float = 0.0
    confidenceBefore: int = 0
    confidenceAfter: int = 0
    missingChannels: list[str] = field(default_factory=list)
    results: list[dict] = field(default_factory=list)
    error: str | None = None


@dataclass
class CachedEnrichment:
    created_at: datetime
    response: dict


class LeadEnrichmentProviderRouter:
    _cache: dict[str, CachedEnrichment] = {}
    _usage: dict[str, dict[str, int | str]] = {}

    def __init__(self) -> None:
        self.web_search_service = WebSearchService()
        self.providers = [
            ProviderDefinition("LocalCacheProvider", True, 10, supportsSearch=False),
            ProviderDefinition("HbxDatabaseProvider", bool(self.backend_internal_url()), 20, supportsSearch=False),
            ProviderDefinition("HbxEngineProvider", True, 30, supportsSearch=True),
            ProviderDefinition("DuckDuckGoProvider", True, 40, freeQuotaMonthly=10_000, supportsSearch=True, tier="free"),
            ProviderDefinition("BraveSearchProvider", bool(os.getenv("BRAVE_SEARCH_API_KEY")), 50, freeQuotaMonthly=2_000, costPerRequest=0.001, supportsSearch=True, requiresApiKey=True, tier="free", envKey="BRAVE_SEARCH_API_KEY"),
            ProviderDefinition("SerperProvider", bool(os.getenv("SERPER_API_KEY")), 60, costPerRequest=0.001, supportsSearch=True, requiresApiKey=True, tier="paid", envKey="SERPER_API_KEY"),
            ProviderDefinition("ScrapingDogProvider", bool(os.getenv("SCRAPINGDOG_API_KEY")), 70, costPerRequest=0.002, supportsSearch=True, requiresApiKey=True, tier="paid", envKey="SCRAPINGDOG_API_KEY"),
            ProviderDefinition("TavilyProvider", bool(os.getenv("TAVILY_API_KEY")), 80, costPerRequest=0.002, supportsSearch=True, supportsSemanticSearch=True, requiresApiKey=True, tier="paid", envKey="TAVILY_API_KEY"),
            ProviderDefinition("ExaProvider", bool(os.getenv("EXA_API_KEY")), 90, costPerRequest=0.003, supportsSearch=True, supportsSemanticSearch=True, requiresApiKey=True, tier="premium", envKey="EXA_API_KEY"),
            ProviderDefinition("FirecrawlExtractorProvider", bool(os.getenv("FIRECRAWL_API_KEY")), 100, costPerRequest=0.004, supportsExtraction=True, requiresApiKey=True, tier="premium", envKey="FIRECRAWL_API_KEY"),
            ProviderDefinition("SerpApiProvider", bool(os.getenv("SERPAPI_KEY")), 110, costPerRequest=0.005, supportsSearch=True, requiresApiKey=True, tier="premium", envKey="SERPAPI_KEY"),
        ]

    async def run(
        self,
        request: EnrichLeadRequest,
        hbx_engine_provider: Callable[[], Awaitable[EnrichLeadResponse]],
    ) -> EnrichLeadResponse:
        started = time.monotonic()
        runs: list[ProviderRun] = []
        cache_key = self.cache_key(request)
        cached = self.get_cached(cache_key)
        if cached:
            response = EnrichLeadResponse.model_validate(cached)
            self.attach_router_stats(response, runs, started, cache_hit=True)
            return response

        runs.append(ProviderRun(
            provider="LocalCacheProvider",
            status="empty",
            reason="cache miss",
            missingChannels=self.missing_channels(None),
        ))
        database_response, database_run = await self.run_hbx_database_provider(request)
        runs.append(database_run)
        response: EnrichLeadResponse | None = database_response
        if response and self.is_sufficient(response, request):
            self.cache_set(cache_key, response)
            self.attach_router_stats(response, runs, started, cache_hit=False)
            return response

        confidence_before = int(response.socialConfidence or 0) if response else 0
        engine_response = await hbx_engine_provider()
        if response:
            self.merge_response(response, engine_response)
        else:
            response = engine_response
        runs.append(ProviderRun(
            provider="HbxEngineProvider",
            status="success",
            confidenceBefore=confidence_before,
            confidenceAfter=int(response.socialConfidence or 0),
            missingChannels=self.missing_channels(response),
            results=self.provider_results_from_response(response),
        ))

        if not self.is_sufficient(response, request):
            for provider in sorted(self.providers, key=lambda item: item.priority):
                if provider.name in {"LocalCacheProvider", "HbxDatabaseProvider", "HbxEngineProvider"}:
                    continue
                if provider.tier == "paid" and not request.allowPaid:
                    runs.append(self.skipped_run(provider, response, "allowPaid=false"))
                    continue
                if provider.tier == "premium" and not request.allowPremium:
                    runs.append(self.skipped_run(provider, response, "allowPremium=false"))
                    continue
                if provider.requiresApiKey and not provider.enabled:
                    runs.append(self.skipped_run(provider, response, f"missing api key {provider.envKey or ''}".strip()))
                    continue
                if not provider.enabled:
                    runs.append(self.skipped_run(provider, response, "provider disabled"))
                    continue
                quota_reason = self.quota_block_reason(provider)
                if quota_reason:
                    runs.append(self.skipped_run(provider, response, quota_reason))
                    continue
                provider_run = await self.run_provider(provider, request, response)
                runs.append(provider_run)
                if provider_run.status in {"success", "empty", "error"}:
                    self.record_usage(provider)
                if provider_run.status == "success":
                    self.merge_provider_results(response, provider_run.results)
                if self.is_sufficient(response, request):
                    break

        self.cache_set(cache_key, response)
        self.attach_router_stats(response, runs, started, cache_hit=False)
        return response

    def provider_definitions(self) -> list[dict]:
        items: list[dict] = []
        for provider in sorted(self.providers, key=lambda item: item.priority):
            data = asdict(provider)
            data["usage"] = self.usage_snapshot(provider)
            items.append(data)
        return items

    def usage_snapshot(self, provider: ProviderDefinition) -> dict:
        self.reset_usage_window_if_needed(provider)
        usage = self._usage.get(provider.name) or {}
        return {
            "dailyUsed": int(usage.get("dailyUsed") or 0),
            "monthlyUsed": int(usage.get("monthlyUsed") or 0),
            "dailyRemaining": None if not provider.dailyLimit else max(0, provider.dailyLimit - int(usage.get("dailyUsed") or 0)),
            "monthlyRemaining": None if not provider.monthlyLimit and not provider.freeQuotaMonthly else max(0, (provider.monthlyLimit or provider.freeQuotaMonthly) - int(usage.get("monthlyUsed") or 0)),
        }

    def reset_usage_window_if_needed(self, provider: ProviderDefinition) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        usage = self._usage.setdefault(provider.name, {
            "day": today,
            "month": month,
            "dailyUsed": 0,
            "monthlyUsed": 0,
        })
        if usage.get("day") != today:
            usage["day"] = today
            usage["dailyUsed"] = 0
        if usage.get("month") != month:
            usage["month"] = month
            usage["monthlyUsed"] = 0

    def quota_block_reason(self, provider: ProviderDefinition) -> str | None:
        self.reset_usage_window_if_needed(provider)
        usage = self._usage.get(provider.name) or {}
        daily_used = int(usage.get("dailyUsed") or 0)
        monthly_used = int(usage.get("monthlyUsed") or 0)
        monthly_limit = provider.monthlyLimit or provider.freeQuotaMonthly
        if provider.dailyLimit and daily_used >= provider.dailyLimit:
            return "daily quota exceeded"
        if monthly_limit and monthly_used >= monthly_limit:
            return "monthly quota exceeded"
        return None

    def record_usage(self, provider: ProviderDefinition) -> None:
        self.reset_usage_window_if_needed(provider)
        usage = self._usage.setdefault(provider.name, {})
        usage["dailyUsed"] = int(usage.get("dailyUsed") or 0) + 1
        usage["monthlyUsed"] = int(usage.get("monthlyUsed") or 0) + 1

    def backend_internal_url(self) -> str:
        return str(
            os.getenv("HBX_BACKEND_INTERNAL_URL")
            or os.getenv("HBX_BACKEND_URL")
            or os.getenv("BACKEND_INTERNAL_URL")
            or ""
        ).strip().rstrip("/")

    def cache_key(self, request: EnrichLeadRequest) -> str:
        phone = re.sub(r"\D", "", request.phoneDigits or request.phone or "")
        return "|".join([
            PROVIDER_ROUTER_VERSION,
            text_key(request.name),
            phone,
            text_key(request.city),
            text_key(request.state),
            ",".join(normalize_channel_list_for_router(request.preferredChannels)),
            ",".join(normalize_channel_list_for_router(request.requiredChannels)),
            ",".join(normalize_channel_list_for_router(request.requestedFields)),
            "paid" if request.allowPaid else "free",
            "premium" if request.allowPremium else "standard",
        ])

    def get_cached(self, key: str) -> dict | None:
        cached = self._cache.get(key)
        if not cached:
            return None
        if datetime.now(timezone.utc) - cached.created_at > PROVIDER_CACHE_TTL:
            self._cache.pop(key, None)
            return None
        return cached.response

    def cache_set(self, key: str, response: EnrichLeadResponse) -> None:
        self._cache[key] = CachedEnrichment(
            created_at=datetime.now(timezone.utc),
            response=response.model_dump(),
        )

    def is_sufficient(self, response: EnrichLeadResponse | None, request: EnrichLeadRequest | None = None) -> bool:
        if response is None:
            return False
        required_channels = normalize_channel_list_for_router(request.requiredChannels if request else [])
        preferred_channels = normalize_channel_list_for_router(request.preferredChannels if request else [])
        requested_fields = normalize_channel_list_for_router(request.requestedFields if request else [])
        wants_social = bool({"instagram", "facebook", "linkedin"} & set(required_channels + preferred_channels + requested_fields))
        for channel in required_channels:
            if channel == "instagram" and not response.instagramUrl:
                return False
            if channel == "facebook" and not response.facebookUrl:
                return False
            if channel == "linkedin" and not response.linkedinUrl:
                return False
            if channel == "site" and not response.website:
                return False
            if channel == "website" and not response.website:
                return False
            if channel == "email" and not response.email:
                return False
        if int(response.socialConfidence or 0) >= CONFIDENCE_TARGET:
            return True
        if wants_social and not (response.instagramUrl or response.facebookUrl or response.linkedinUrl):
            return False
        return bool(response.instagramUrl or response.facebookUrl or response.linkedinUrl or response.website or response.email)

    def missing_channels(self, response: EnrichLeadResponse | None) -> list[str]:
        if response is None:
            return ["instagram", "facebook", "linkedin", "website", "email"]
        missing: list[str] = []
        if not response.instagramUrl:
            missing.append("instagram")
        if not response.facebookUrl:
            missing.append("facebook")
        if not response.linkedinUrl:
            missing.append("linkedin")
        if not response.website:
            missing.append("website")
        if not response.email:
            missing.append("email")
        return missing

    def provider_results_from_response(self, response: EnrichLeadResponse) -> list[dict]:
        results: list[dict] = []
        for field_name, channel in [
            ("instagramUrl", "instagram"),
            ("facebookUrl", "facebook"),
            ("linkedinUrl", "linkedin"),
            ("website", "website"),
            ("email", "email"),
        ]:
            value = getattr(response, field_name, None)
            if value:
                results.append({"channel": channel, "field": field_name, "value": value, "status": "confirmed"})
        for candidate in response.possibleSocialCandidates or []:
            if isinstance(candidate, dict):
                results.append({**candidate, "status": candidate.get("status") or "possible"})
        return results

    def skipped_run(self, provider: ProviderDefinition, response: EnrichLeadResponse, reason: str) -> ProviderRun:
        return ProviderRun(
            provider=provider.name,
            status="skipped",
            reason=reason,
            missingChannels=self.missing_channels(response),
        )

    async def run_hbx_database_provider(self, request: EnrichLeadRequest) -> tuple[EnrichLeadResponse | None, ProviderRun]:
        provider = next(item for item in self.providers if item.name == "HbxDatabaseProvider")
        url = self.backend_internal_url()
        if not url:
            return None, ProviderRun(
                provider=provider.name,
                status="skipped",
                reason="HBX_BACKEND_INTERNAL_URL not configured",
                missingChannels=self.missing_channels(None),
            )
        token = str(
            os.getenv("HBX_INTERNAL_API_TOKEN")
            or os.getenv("HBX_ENGINE_INTERNAL_TOKEN")
            or os.getenv("INTERNAL_API_TOKEN")
            or ""
        ).strip()
        payload = {
            "name": request.name,
            "phone": request.phone,
            "phoneDigits": request.phoneDigits,
            "city": request.city,
            "state": request.state,
            "segment": request.segment,
            "sourceUrl": request.sourceUrl,
        }
        try:
            timeout = min(max(float(request.timeBudgetSeconds or 10), 2.0), 5.0)
            headers = {"Accept": "application/json"}
            if token:
                headers["x-hbx-internal-token"] = token
            async with httpx.AsyncClient(timeout=timeout) as client:
                http_response = await client.post(
                    f"{url}/webscraping/radar/internal/lead-pool-lookup",
                    json=payload,
                    headers=headers,
                )
            if http_response.status_code == 404:
                return None, ProviderRun(
                    provider=provider.name,
                    status="skipped",
                    reason="backend internal lookup endpoint unavailable",
                    missingChannels=self.missing_channels(None),
                )
            if http_response.status_code >= 400:
                return None, ProviderRun(
                    provider=provider.name,
                    status="error",
                    reason=f"backend returned {http_response.status_code}",
                    missingChannels=self.missing_channels(None),
                    error=http_response.text[:240],
                )
            data = http_response.json()
            candidates = data.get("candidates") if isinstance(data, dict) else []
            if not isinstance(data, dict) or not data.get("found") or not data.get("result"):
                return None, ProviderRun(
                    provider=provider.name,
                    status="empty",
                    reason="no compatible row in radarLeadPool",
                    missingChannels=self.missing_channels(None),
                    results=candidates if isinstance(candidates, list) else [],
                )
            response = self.response_from_hbx_database(request, data.get("result") or {})
            return response, ProviderRun(
                provider=provider.name,
                status="success",
                reason="radarLeadPool returned compatible lead",
                confidenceBefore=0,
                confidenceAfter=int(response.socialConfidence or 0),
                missingChannels=self.missing_channels(response),
                results=self.provider_results_from_response(response),
            )
        except Exception as error:
            return None, ProviderRun(
                provider=provider.name,
                status="error",
                reason="backend internal lookup failed",
                missingChannels=self.missing_channels(None),
                error=str(error)[:240],
            )

    def response_from_hbx_database(self, request: EnrichLeadRequest, result: dict) -> EnrichLeadResponse:
        response = EnrichLeadResponse(
            name=str(result.get("name") or request.name or ""),
            phone=str(result.get("phone") or request.phone or ""),
            phoneDigits=str(result.get("phoneDigits") or request.phoneDigits or ""),
            address=result.get("address"),
            website=result.get("website"),
            email=result.get("email"),
            emailStatus=str(result.get("emailStatus") or "missing"),
            emailSource=str(result.get("emailSource") or "none"),
            emailConfidence=int(result.get("emailConfidence") or 0),
            instagramUrl=result.get("instagramUrl"),
            facebookUrl=result.get("facebookUrl"),
            linkedinUrl=result.get("linkedinUrl"),
            googleMapsUrl=result.get("googleMapsUrl"),
            socialStatus=str(result.get("socialStatus") or "missing"),
            socialConfidence=int(result.get("socialConfidence") or 0),
            evidenceJson=result.get("evidenceJson") if isinstance(result.get("evidenceJson"), dict) else {},
        )
        possible = result.get("possibleSocialCandidates")
        nearby = result.get("nearbyResults")
        response.possibleSocialCandidates = possible if isinstance(possible, list) else []
        response.nearbyResults = nearby if isinstance(nearby, list) else []
        response.stats = {
            "sourceEngine": result.get("sourceEngine") or "hbx_database",
            "sourceUrl": result.get("sourceUrl"),
        }
        return response

    async def run_provider(self, provider: ProviderDefinition, request: EnrichLeadRequest, response: EnrichLeadResponse) -> ProviderRun:
        confidence_before = int(response.socialConfidence or 0)
        try:
            if provider.name == "DuckDuckGoProvider":
                results = await self.search_duckduckgo(request)
            elif provider.name == "BraveSearchProvider":
                results = await self.search_brave(request, provider)
            else:
                results = []
            return ProviderRun(
                provider=provider.name,
                status="success" if results else "empty",
                reason="" if results else "no usable candidate",
                cost=provider.costPerRequest,
                confidenceBefore=confidence_before,
                confidenceAfter=confidence_before,
                missingChannels=self.missing_channels(response),
                results=results,
            )
        except Exception as error:
            return ProviderRun(
                provider=provider.name,
                status="error",
                reason="provider failed",
                cost=provider.costPerRequest,
                confidenceBefore=confidence_before,
                confidenceAfter=confidence_before,
                missingChannels=self.missing_channels(response),
                error=str(error)[:240],
            )

    async def search_duckduckgo(self, request: EnrichLeadRequest) -> list[dict]:
        queries = self.queries_for_request(request)
        allowed_channels = self.allowed_channels_for_request(request)
        if allowed_channels and allowed_channels <= {"instagram", "facebook", "linkedin"}:
            social_markers = {
                "instagram": "site:instagram.com",
                "facebook": "site:facebook.com",
                "linkedin": "site:linkedin.com",
            }
            queries = [
                query
                for query in queries
                if any(marker in query for channel, marker in social_markers.items() if channel in allowed_channels)
            ] or queries
        rows: list[dict] = []
        max_queries = 2 if allowed_channels and allowed_channels <= {"instagram", "facebook", "linkedin"} else 4
        max_results = 4 if max_queries == 2 else 8
        fetched_at = datetime.now(timezone.utc).isoformat()
        for query in queries[:max_queries]:
            errors: list[str] = []
            for row in self.web_search_service.collect_results(query, max_results, fetched_at, errors):
                rows.append(self.normalize_search_row({
                    "href": row.url,
                    "title": row.title,
                    "body": row.snippet,
                }, row.source or "DuckDuckGoProvider", query))
        return self.classify_rows(request, rows)

    async def search_brave(self, request: EnrichLeadRequest, provider: ProviderDefinition) -> list[dict]:
        key = os.getenv(provider.envKey or "")
        if not key:
            return []
        rows: list[dict] = []
        async with httpx.AsyncClient(timeout=8.0) as client:
            for query in self.queries_for_request(request)[:4]:
                response = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params={"q": query, "country": "BR", "search_lang": "pt-br", "count": 6},
                    headers={"X-Subscription-Token": key, "Accept": "application/json"},
                )
                if response.status_code >= 400:
                    continue
                data = response.json()
                for row in (data.get("web") or {}).get("results") or []:
                    rows.append(self.normalize_search_row({
                        "href": row.get("url"),
                        "title": row.get("title"),
                        "body": row.get("description"),
                    }, provider.name, query))
        return self.classify_rows(request, rows)

    def queries_for_request(self, request: EnrichLeadRequest) -> list[str]:
        name = " ".join(str(request.name or "").split())
        city = " ".join(str(request.city or "").split())
        state = " ".join(str(request.state or "").split())
        phone = " ".join(str(request.phone or request.phoneDigits or "").split())
        segment = " ".join(str(request.segment or "").split())
        normalized_name = re.sub(r"[^a-zA-Z0-9 ]+", " ", name)
        base = f"{name} {city} {state}".strip()
        queries = [
            base,
            f'"{name}" "{city}" "{state}"'.strip(),
            f"{name} {phone}".strip(),
            f"{name} site:instagram.com",
            f"{name} site:facebook.com",
            f"{name} site:linkedin.com",
            f"{name} {city} {segment}".strip(),
            f"{normalized_name} {city} {state}".strip(),
        ]
        for alias in self.business_aliases_for_request(request):
            queries.extend([
                f"{alias} {city} {state}".strip(),
                f"{alias} site:instagram.com",
                f"{alias} site:facebook.com",
                f'"{alias}" "{city}"'.strip(),
            ])
        return list(dict.fromkeys(query for query in queries if query))

    def business_aliases_for_request(self, request: EnrichLeadRequest) -> list[str]:
        name_key = text_key(request.name)
        if not name_key:
            return []
        tokens = [token for token in name_key.split() if token]
        distinctive = [
            token
            for token in tokens
            if len(token) >= 3 and token not in ROUTER_LEGAL_STOP_TOKENS and token not in ROUTER_REAL_ESTATE_TOKENS
        ]
        aliases: list[str] = []
        if any(token in ROUTER_REAL_ESTATE_TOKENS for token in tokens):
            for token in distinctive[:2]:
                aliases.extend([
                    f"{token} imoveis",
                    f"{token} imobiliaria",
                    f"{token}imoveis",
                    f"{token}imobiliaria",
                ])
        if distinctive:
            aliases.append(" ".join(distinctive[:2]))
        return list(dict.fromkeys(alias for alias in aliases if alias.strip()))

    def normalize_search_row(self, row: dict, provider: str, query: str) -> dict:
        return {
            "provider": provider,
            "query": query,
            "url": str(row.get("href") or row.get("url") or "").strip(),
            "title": str(row.get("title") or "").strip(),
            "snippet": str(row.get("body") or row.get("snippet") or row.get("description") or "").strip(),
        }

    def classify_rows(self, request: EnrichLeadRequest, rows: list[dict]) -> list[dict]:
        output: list[dict] = []
        seen: set[str] = set()
        allowed_channels = self.allowed_channels_for_request(request)
        for row in rows:
            url = row.get("url") or ""
            if not url or url in seen:
                continue
            seen.add(url)
            score, reason = self.score_row(request, row)
            if score < 35:
                continue
            channel = self.channel_from_url(url)
            if not channel:
                continue
            if allowed_channels and channel not in allowed_channels:
                continue
            output.append({
                "channel": channel,
                "field": self.field_for_channel(channel),
                "url": self.clean_candidate_url(url, channel),
                "title": row.get("title") or "",
                "snippet": row.get("snippet") or "",
                "query": row.get("query") or "",
                "provider": row.get("provider") or "",
                "score": score,
                "status": "confirmed" if score >= CONFIDENCE_TARGET else "possible",
                "reason": reason,
            })
        return output

    def allowed_channels_for_request(self, request: EnrichLeadRequest) -> set[str]:
        requested = normalize_channel_list_for_router([
            *(request.preferredChannels or []),
            *(request.requiredChannels or []),
            *(request.requestedFields or []),
        ])
        if not requested:
            return set()
        allowed: set[str] = set()
        for channel in requested:
            if channel in {"instagram", "facebook", "linkedin", "website", "email"}:
                allowed.add(channel)
        return allowed

    def score_row(self, request: EnrichLeadRequest, row: dict) -> tuple[int, str]:
        text = text_key(" ".join(str(row.get(key) or "") for key in ("title", "snippet", "url")))
        name = text_key(request.name)
        city = text_key(request.city)
        state = text_key(request.state)
        phone_digits = re.sub(r"\D", "", request.phoneDigits or request.phone or "")
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
        score = 0
        reasons: list[str] = []
        name_tokens = [token for token in name.split() if len(token) >= 4 and token not in {"restaurante", "pizzaria", "lanchonete", "marmitaria", "delivery", "ltda"}]
        alias_keys = [
            re.sub(r"[^a-z0-9]+", "", text_key(alias))
            for alias in self.business_aliases_for_request(request)
        ]
        name_hits = sum(1 for token in name_tokens if token in text)
        if name and name in text:
            score += 40
            reasons.append("nome completo aparece no resultado")
        elif any(alias and alias in re.sub(r"[^a-z0-9]+", "", text) for alias in alias_keys):
            score += 38
            reasons.append("alias comercial aparece no resultado")
        elif name_hits >= max(1, min(2, len(name_tokens))):
            score += 25
            reasons.append("tokens do nome aparecem no resultado")
        if city and city in text:
            score += 25
            reasons.append("cidade aparece no resultado")
        if state and state in text:
            score += 8
        if phone_tail and phone_tail in re.sub(r"\D", "", text):
            score += 20
            reasons.append("telefone bate")
        channel = self.channel_from_url(row.get("url") or "")
        if channel in {"instagram", "facebook", "linkedin"}:
            score += 10
            reasons.append(f"resultado de {channel}")
        if channel == "website" and not self.is_directory_like_url(row.get("url") or ""):
            host_key = re.sub(r"[^a-z0-9]+", "", urlparse(row.get("url") or "").netloc.lower().removeprefix("www."))
            distinctive = [
                token for token in name_tokens
                if token not in {"construtora", "construtoras", "imobiliaria", "imobiliarias", "imoveis"}
            ]
            host_hits = [token for token in distinctive if token in host_key]
            if len(host_hits) >= 2:
                score += 24
                reasons.append("dominio proprio bate com nome comercial")
        elif channel == "website" and self.is_directory_like_url(row.get("url") or ""):
            score = min(score, 64)
            reasons.append("diretorio usado apenas como evidencia")
        if not city or city not in text:
            score -= 15
            reasons.append("sem cidade no snippet/titulo")
        return max(0, min(100, score)), "; ".join(reasons) or "resultado relacionado"

    def is_directory_like_url(self, url: str) -> bool:
        host = urlparse(str(url or "")).netloc.lower().removeprefix("www.")
        return any(host == item or host.endswith(f".{item}") for item in ROUTER_DIRECTORY_HOSTS)

    def channel_from_url(self, url: str) -> str | None:
        host = urlparse(url).netloc.lower()
        if "instagram.com" in host:
            return "instagram"
        if "facebook.com" in host:
            return "facebook"
        if "linkedin.com" in host:
            return "linkedin"
        if "mailto:" in url:
            return "email"
        if host:
            return "website"
        return None

    def field_for_channel(self, channel: str) -> str:
        return {
            "instagram": "instagramUrl",
            "facebook": "facebookUrl",
            "linkedin": "linkedinUrl",
            "website": "website",
            "email": "email",
        }.get(channel, "website")

    def clean_candidate_url(self, url: str, channel: str) -> str:
        if channel in {"instagram", "facebook"}:
            return normalize_social_url(url) or url.split("?", 1)[0].rstrip("/")
        return url.split("?", 1)[0].rstrip("/")

    def merge_provider_results(self, response: EnrichLeadResponse, results: list[dict]) -> None:
        for result in results:
            field = result.get("field")
            url = result.get("url")
            score = int(result.get("score") or 0)
            status = result.get("status")
            if not response.cnpj:
                cnpj_match = ROUTER_CNPJ_RE.search(" ".join(str(result.get(key) or "") for key in ("title", "snippet", "url")))
                if cnpj_match:
                    response.cnpj = cnpj_match.group(0)
            if not field or not url:
                continue
            current_value = getattr(response, field, None) if hasattr(response, field) else None
            can_replace_directory_website = field == "website" and current_value and self.is_directory_like_url(str(current_value)) and not self.is_directory_like_url(str(url))
            if status == "confirmed" and score >= CONFIDENCE_TARGET and hasattr(response, field) and (not current_value or can_replace_directory_website):
                setattr(response, field, url)
                if field in {"instagramUrl", "facebookUrl", "linkedinUrl"}:
                    response.socialConfidence = max(int(response.socialConfidence or 0), score)
                    response.socialStatus = "found"
                elif field == "email":
                    response.emailConfidence = max(int(response.emailConfidence or 0), score)
                    response.emailStatus = "confirmed"
                    response.emailSource = response.emailSource or "provider"
                elif field == "website":
                    self.extract_fields_from_website(response, str(url))
            elif status == "possible":
                candidate = {
                    "field": field,
                    "channel": result.get("channel"),
                    "url": url,
                    "score": score,
                    "status": "possible",
                    "reason": result.get("reason") or "",
                    "title": result.get("title") or "",
                    "snippet": result.get("snippet") or "",
                    "query": result.get("query") or "",
                    "provider": result.get("provider") or "",
                }
                if field in {"instagramUrl", "facebookUrl", "linkedinUrl"}:
                    response.possibleSocialCandidates.append(candidate)
                response.nearbyResults.append(candidate)
        if response.website and (not response.email or not response.facebookUrl or not response.instagramUrl):
            self.extract_fields_from_website(response, str(response.website))

    def extract_fields_from_website(self, response: EnrichLeadResponse, website: str) -> None:
        if self.is_directory_like_url(website):
            return
        try:
            page = httpx.get(
                website,
                timeout=8.0,
                follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 HBXLeadEnrichment/1.0"},
            )
            if page.status_code >= 400:
                return
            html = (page.text or "").replace("\\/", "/").replace("&amp;", "&")
            if not response.email:
                for match in ROUTER_EMAIL_RE.findall(html):
                    email = str(match or "").strip().lower()
                    if email and not email.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")):
                        response.email = email
                        response.emailStatus = "confirmed"
                        response.emailSource = "website"
                        response.emailConfidence = max(int(response.emailConfidence or 0), 92)
                        break
            for raw in re.findall(r"https?://(?:www\.)?(?:instagram|facebook|linkedin)\.com/[A-Za-z0-9._%+\-/]+", html, flags=re.I):
                normalized = normalize_social_url(raw.rstrip(".,;:)")) or raw.rstrip(".,;:)")
                field = social_field_for_url(normalized)
                if field in {"instagramUrl", "facebookUrl", "linkedinUrl"}:
                    setattr(response, field, normalized)
            if response.instagramUrl or response.facebookUrl or response.linkedinUrl:
                response.socialStatus = "found"
                response.socialConfidence = max(int(response.socialConfidence or 0), 86)
        except Exception:
            return

    def merge_response(self, base: EnrichLeadResponse, other: EnrichLeadResponse) -> None:
        for field_name in [
            "phone",
            "phoneDigits",
            "rating",
            "reviews",
            "address",
            "website",
            "email",
            "emailStatus",
            "emailSource",
            "emailConfidence",
            "instagramUrl",
            "facebookUrl",
            "linkedinUrl",
            "googleMapsUrl",
            "cnpj",
            "socialStatus",
            "socialConfidence",
        ]:
            current = getattr(base, field_name, None)
            incoming = getattr(other, field_name, None)
            if field_name in {"emailConfidence", "socialConfidence"}:
                setattr(base, field_name, max(int(current or 0), int(incoming or 0)))
            elif field_name == "emailStatus":
                if incoming and (not current or str(current).lower() in {"missing", "none", "unknown"}):
                    setattr(base, field_name, incoming)
            elif field_name == "emailSource":
                if incoming and (not current or str(current).lower() in {"none", "unknown"}):
                    setattr(base, field_name, incoming)
            elif field_name == "socialStatus":
                if (base.instagramUrl or base.facebookUrl or base.linkedinUrl or other.instagramUrl or other.facebookUrl or other.linkedinUrl) and (current or "missing") in {"missing", "unknown"} and incoming:
                    setattr(base, field_name, incoming)
            elif field_name == "socialConfidence":
                if base.instagramUrl or base.facebookUrl or base.linkedinUrl or other.instagramUrl or other.facebookUrl or other.linkedinUrl:
                    setattr(base, field_name, max(int(current or 0), int(incoming or 0)))
            elif field_name == "website" and incoming and self.is_directory_like_url(str(incoming)):
                continue
            elif field_name == "website" and current and incoming and self.is_directory_like_url(str(current)) and not self.is_directory_like_url(str(incoming)):
                setattr(base, field_name, incoming)
            elif not current and incoming:
                setattr(base, field_name, incoming)
        base.possibleSocialCandidates.extend(other.possibleSocialCandidates or [])
        base.nearbyResults.extend(other.nearbyResults or [])
        base.discardedResults.extend(other.discardedResults or [])
        base.stats = {**(other.stats or {}), **(base.stats or {})}
        base.evidenceJson = {**(other.evidenceJson or {}), **(base.evidenceJson or {})}

    def attach_router_stats(
        self,
        response: EnrichLeadResponse,
        runs: list[ProviderRun],
        started: float,
        cache_hit: bool,
    ) -> None:
        stats = response.stats if isinstance(response.stats, dict) else {}
        stats["providerRouter"] = {
            "version": PROVIDER_ROUTER_VERSION,
            "cacheHit": cache_hit,
            "confidenceTarget": CONFIDENCE_TARGET,
            "elapsedMs": int((time.monotonic() - started) * 1000),
            "providers": self.provider_definitions(),
            "runs": [asdict(run) for run in runs],
        }
        response.stats = stats
        response.evidenceJson = {
            **(response.evidenceJson or {}),
            "providerRouter": stats["providerRouter"],
        }

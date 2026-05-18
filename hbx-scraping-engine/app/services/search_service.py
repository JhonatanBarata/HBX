import asyncio

from ddgs import DDGS

from app.config import DB_PATH, get_settings
from app.schemas import ContactResult, QueryPayload, SearchRequest, SearchResponse

from .agenda_sources import dedupe_by_phone, search_abctelefonos
from .discovery import _is_valid_social_profile_url, discover_urls
from .fetcher import Fetcher
from .filters import is_blocked_lead_source_domain, is_generic_name, is_pf_technical_blocked_domain, is_social_signal_domain
from .normalizer import dedupe_contacts
from .parser import is_directory_url, parse_page
from .scoring import score_contact
from .storage import Storage


class SearchService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.storage = Storage(DB_PATH, self.settings.cache_ttl_hours)

    def requested_social_channels(
        self,
        preferred_channels: list[str] | None = None,
        required_channels: list[str] | None = None,
    ) -> set[str]:
        values = [*(preferred_channels or []), *(required_channels or [])]
        return {str(channel or "").strip().lower() for channel in values if str(channel or "").strip().lower() in {"instagram", "facebook"}}

    def required_social_channels(self, required_channels: list[str] | None = None) -> set[str]:
        return {str(channel or "").strip().lower() for channel in (required_channels or []) if str(channel or "").strip().lower() in {"instagram", "facebook"}}

    def has_required_social_channels(self, contact: dict, required_channels: set[str]) -> bool:
        if not required_channels:
            return True
        available = {
            "instagram": bool(contact.get("instagramUrl")),
            "facebook": bool(contact.get("facebookUrl")),
        }
        if required_channels == {"instagram", "facebook"}:
            return available["instagram"] or available["facebook"]
        return all(available[channel] for channel in required_channels)

    def social_queries_for_contact(self, contact: dict, city: str, segment: str, channel: str) -> list[str]:
        name = " ".join(str(contact.get("name") or "").split())
        city_text = " ".join(str(city or "").split())
        segment_text = " ".join(str(segment or "").split())
        if not name or not city_text:
            return []
        domain = "instagram.com" if channel == "instagram" else "facebook.com"
        return [
            f'site:{domain} "{name}" "{city_text}"',
            f'"{name}" "{segment_text}" "{city_text}" {channel}'.replace('"" ', ""),
        ][:2]

    def search_social_profile_url(self, query: str, channel: str) -> str | None:
        try:
            try:
                ddgs = DDGS(timeout=4)
            except TypeError:
                ddgs = DDGS()
            with ddgs as client:
                rows = client.text(query, region="br-pt", safesearch="off", max_results=4)
                for row in rows or []:
                    url = str(row.get("href") or row.get("url") or "").strip().rstrip("/")
                    if channel not in url.lower():
                        continue
                    if _is_valid_social_profile_url(url):
                        return url
        except Exception as error:
            print(f"[social_enrich] query falhou: {query} error={error}")
        return None

    def enrich_social_links_for_contacts(
        self,
        contacts: list[dict],
        city: str,
        state: str,
        segment: str,
        preferred_channels: list[str] | None = None,
        required_channels: list[str] | None = None,
    ) -> list[dict]:
        requested_channels = self.requested_social_channels(preferred_channels, required_channels)
        required_social = self.required_social_channels(required_channels)
        if not requested_channels:
            requested_channels = {"instagram", "facebook"}
        enriched = 0
        processed = 0
        for contact in contacts:
            if not required_social and processed >= 20:
                break
            if not contact.get("name") or not contact.get("phone"):
                continue
            processed += 1
            touched = False
            for channel in ("instagram", "facebook"):
                if channel not in requested_channels:
                    continue
                field = "instagramUrl" if channel == "instagram" else "facebookUrl"
                if contact.get(field):
                    continue
                for query in self.social_queries_for_contact(contact, city, segment, channel):
                    url = self.search_social_profile_url(query, channel)
                    if url:
                        contact[field] = url
                        touched = True
                        break
            if touched:
                enriched += 1
        if requested_channels:
            print(f"[social_enrich] canais={','.join(sorted(requested_channels))} contatos_enriquecidos={enriched}")
        return contacts

    async def search(self, request: SearchRequest) -> SearchResponse:
        excluded_phones = set(request.excludePhoneDigits or [])
        excluded_urls = set(request.excludeUrls or [])
        social_requested = request.targetType == "pj" or bool(self.requested_social_channels(request.preferredChannels, request.requiredChannels))

        if not request.fresh and not excluded_phones and not excluded_urls and not social_requested:
            cached = await asyncio.to_thread(self.storage.get_cached, request)
            if cached:
                return SearchResponse.model_validate(cached)

        if request.targetType == "agenda_pf":
            response = await self.search_agenda_pf(request)
            await asyncio.to_thread(self.storage.save_run, request, response.model_dump())
            return response

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
            request.preferredChannels,
            request.requiredChannels,
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
                contact["score"] = score_contact(
                    contact,
                    request.city,
                    request.state,
                    request.segment,
                    text,
                    is_directory_url(page.url),
                    request.targetType,
                )
                parsed.append(contact)

        deduped = dedupe_contacts(parsed, request.city, request.targetType)
        required_social_channels = self.required_social_channels(request.requiredChannels)
        if request.targetType == "pj":
            deduped = await asyncio.to_thread(
                self.enrich_social_links_for_contacts,
                deduped,
                request.city,
                request.state,
                request.segment,
                request.preferredChannels,
                request.requiredChannels,
            )
        allowed_fields = {"name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "instagramUrl", "facebookUrl", "source", "score"}
        min_score = 0 if request.targetType == "pf" else 50
        public_items: list[dict] = []
        stats = {"parsed": len(parsed), "invalid_phone": 0, "blocked_domain": 0, "low_score": 0, "approved": 0}
        for item in deduped:
            if not item.get("phone") or not item.get("phoneDigits"):
                stats["invalid_phone"] += 1
                continue
            if item.get("phoneDigits") in excluded_phones:
                continue
            requested_channels = {str(channel or "").lower() for channel in [*(request.preferredChannels or []), *(request.requiredChannels or [])]}
            social_requested = bool(requested_channels & {"instagram", "facebook"})
            social_page_allowed = request.targetType == "pj" and social_requested and is_social_signal_domain(item.get("_pageUrl"))
            blocked_domain = (
                is_pf_technical_blocked_domain(item.get("website")) or is_pf_technical_blocked_domain(item.get("_pageUrl"))
                if request.targetType == "pf"
                else is_blocked_lead_source_domain(item.get("website")) or (is_blocked_lead_source_domain(item.get("_pageUrl")) and not social_page_allowed)
            )
            if blocked_domain:
                stats["blocked_domain"] += 1
                continue
            if request.targetType != "pf" and is_generic_name(item.get("name"), request.city, request.targetType, request.segment):
                stats["low_score"] += 1
                continue
            if request.targetType != "pf" and int(item.get("score") or 0) < min_score:
                stats["low_score"] += 1
                continue
            if request.targetType == "pj" and not self.has_required_social_channels(item, required_social_channels):
                stats["low_score"] += 1
                continue
            public_item = {key: value for key, value in item.items() if key in allowed_fields}
            if request.targetType == "pj":
                public_item["source"] = "hbx_scraping:free_pj"
            public_items.append(public_item)
            stats["approved"] += 1
        if request.targetType == "pf":
            print(
                "[search:pf] "
                f"candidatos_parseados={stats['parsed']} "
                f"descartados_telefone_invalido={stats['invalid_phone']} "
                f"descartados_dominio_bloqueado={stats['blocked_domain']} "
                f"descartados_score_baixo=0 "
                f"aprovados={stats['approved']}"
            )
        valid = [ContactResult.model_validate(item).model_dump() for item in public_items]
        valid.sort(key=lambda item: item["score"], reverse=True)
        valid = valid[: request.limit]
        print(f"[search] contatos aproveitados: {len(valid)}")

        response = SearchResponse(
            query=QueryPayload(city=request.city, state=request.state, segment=request.segment, query=request.query, targetType=request.targetType, limit=request.limit),
            count=len(valid),
            results=[ContactResult.model_validate(item) for item in valid],
            status="completed_with_errors" if errors else "completed",
            errors=errors,
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
                request.preferredChannels,
                request.requiredChannels,
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

        allowed_fields = {"name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "instagramUrl", "facebookUrl", "source", "score"}
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

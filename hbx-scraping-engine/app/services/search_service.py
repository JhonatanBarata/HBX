import asyncio

from app.config import DB_PATH, get_settings
from app.schemas import ContactResult, QueryPayload, SearchRequest, SearchResponse

from .agenda_sources import dedupe_by_phone, search_abctelefonos
from .discovery import discover_urls
from .fetcher import Fetcher
from .filters import is_blocked_domain, is_generic_name, is_pf_technical_blocked_domain
from .normalizer import dedupe_contacts
from .parser import is_directory_url, parse_page
from .scoring import score_contact
from .storage import Storage


class SearchService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.storage = Storage(DB_PATH, self.settings.cache_ttl_hours)

    async def search(self, request: SearchRequest) -> SearchResponse:
        if not request.fresh:
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
        for page in pages:
            contacts, text = parse_page(page.html, page.url, request.targetType, request.city)
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
        allowed_fields = {"name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "source", "score"}
        min_score = 0 if request.targetType == "pf" else 50
        public_items: list[dict] = []
        stats = {"parsed": len(parsed), "invalid_phone": 0, "blocked_domain": 0, "low_score": 0, "approved": 0}
        for item in deduped:
            if not item.get("phone") or not item.get("phoneDigits"):
                stats["invalid_phone"] += 1
                continue
            blocked_domain = (
                is_pf_technical_blocked_domain(item.get("website")) or is_pf_technical_blocked_domain(item.get("_pageUrl"))
                if request.targetType == "pf"
                else is_blocked_domain(item.get("website")) or is_blocked_domain(item.get("_pageUrl"))
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
            public_items.append({key: value for key, value in item.items() if key in allowed_fields})
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
            query=QueryPayload(city=request.city, state=request.state, segment=request.segment, targetType=request.targetType, limit=request.limit),
            count=len(valid),
            results=[ContactResult.model_validate(item) for item in valid],
        )
        await asyncio.to_thread(self.storage.save_run, request, response.model_dump())
        return response

    async def search_agenda_pf(self, request: SearchRequest) -> SearchResponse:
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

        allowed_fields = {"name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "source", "score"}
        public_items = [
            {key: value for key, value in item.items() if key in allowed_fields}
            for item in contacts
            if item.get("name") and item.get("phone") and item.get("phoneDigits")
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
            query=QueryPayload(city=request.city, state=request.state, segment=request.segment, targetType=request.targetType, limit=request.limit),
            count=len(public_items),
            results=[ContactResult.model_validate(item) for item in public_items],
        )

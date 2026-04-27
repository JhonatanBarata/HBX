import asyncio

from app.config import DB_PATH, get_settings
from app.schemas import ContactResult, QueryPayload, SearchRequest, SearchResponse

from .discovery import discover_urls
from .fetcher import Fetcher
from .filters import is_blocked_domain, is_generic_name
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
            contacts, text = parse_page(page.html, page.url)
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
        public_items = [
            {key: value for key, value in item.items() if key in allowed_fields}
            for item in deduped
            if not is_blocked_domain(item.get("website"))
            and not is_blocked_domain(item.get("_pageUrl"))
            and not is_generic_name(item.get("name"), request.city, request.targetType, request.segment)
        ]
        min_score = 35 if request.targetType == "pf" else 50
        valid = [
            ContactResult.model_validate(item).model_dump()
            for item in public_items
            if item.get("name") and item.get("phone") and item.get("phoneDigits") and int(item.get("score") or 0) >= min_score
        ]
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

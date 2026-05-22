import asyncio
from dataclasses import dataclass

import httpx


@dataclass
class FetchedPage:
    url: str
    html: str
    content_type: str


class Fetcher:
    def __init__(self, user_agent: str, timeout_seconds: float, concurrency: int, max_page_bytes: int) -> None:
        self.user_agent = user_agent
        self.timeout_seconds = timeout_seconds
        self.semaphore = asyncio.Semaphore(max(1, concurrency))
        self.max_page_bytes = max_page_bytes

    async def _get(self, client: httpx.AsyncClient, url: str) -> FetchedPage | None:
        response = await client.get(url)
        content_type = response.headers.get("content-type", "").lower()
        if response.status_code >= 400 or ("text/html" not in content_type and "application/xhtml" not in content_type):
            return None
        content = response.content[: self.max_page_bytes]
        encoding = response.encoding or "utf-8"
        return FetchedPage(url=str(response.url), html=content.decode(encoding, errors="ignore"), content_type=content_type)

    async def fetch_all(self, urls: list[str]) -> list[FetchedPage]:
        headers = {"User-Agent": self.user_agent, "Accept": "text/html,application/xhtml+xml"}
        page_timeout = max(2.0, min(float(self.timeout_seconds or 4), 4.0))
        timeout = httpx.Timeout(page_timeout, connect=min(page_timeout, 3.0), read=page_timeout, write=min(page_timeout, 3.0), pool=min(page_timeout, 3.0))
        limits = httpx.Limits(max_connections=max(1, self.semaphore._value), max_keepalive_connections=5)
        pages: list[FetchedPage] = []
        async with httpx.AsyncClient(headers=headers, timeout=timeout, follow_redirects=True, max_redirects=5, limits=limits) as client:
            async def fetch_one(url: str) -> None:
                async with self.semaphore:
                    try:
                        page = await self._get(client, url)
                    except Exception as error:
                        print(f"[fetcher] ignorando url={url} error={error}")
                        return
                    if page:
                        pages.append(page)

            await asyncio.gather(*(fetch_one(url) for url in urls))
        return pages

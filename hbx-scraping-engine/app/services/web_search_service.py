import asyncio
import html
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

from app.schemas import WebSearchRequest, WebSearchResponse, WebSearchResult
from app.services.filters import text_key


DEFAULT_CACHE_PATH = Path(os.getenv("HBX_WEB_SEARCH_CACHE_PATH", "/app/data/web_search_cache.json"))
WEB_SEARCH_CACHE_VERSION = 2


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _bool_env(name: str, default: bool = False) -> bool:
    value = str(os.getenv(name, "true" if default else "false")).strip().lower()
    return value in {"1", "true", "yes", "sim", "on"}


def normalize_web_query(query: str) -> str:
    return text_key(" ".join(str(query or "").split()))


class WebSearchService:
    def __init__(self, cache_path: Path | None = None) -> None:
        self.cache_path = cache_path or DEFAULT_CACHE_PATH
        self.max_results = _int_env("HBX_WEB_SEARCH_MAX_RESULTS", 10, 1, 10)
        self.cache_ttl_seconds = _int_env("HBX_WEB_SEARCH_CACHE_TTL_HOURS", 72, 1, 720) * 3600
        self.timeout_seconds = _int_env("HBX_WEB_SEARCH_TIMEOUT_SECONDS", 30, 3, 90)
        self.google_html_enabled = _bool_env("HBX_GOOGLE_HTML_ENABLED", False)
        self.searxng_url = str(os.getenv("HBX_SEARXNG_URL") or "").strip().rstrip("/")
        self.user_agent = os.getenv(
            "HBX_SCRAPING_USER_AGENT",
            "HBX-Scraping/0.1 contato@hbxsystem.com.br",
        )
        self._cache: dict[str, dict[str, Any]] | None = None
        self._lock = asyncio.Lock()

    async def search(self, request: WebSearchRequest) -> WebSearchResponse:
        query = " ".join(request.query.split())
        limit = max(1, min(int(request.limit or 5), self.max_results, 10))
        cache_key = normalize_web_query(query)

        if not request.fresh:
            cached = await self._get_cached(cache_key, limit)
            if cached:
                return WebSearchResponse(
                    query=query,
                    count=len(cached["results"][:limit]),
                    cached=True,
                    results=[WebSearchResult(**item) for item in cached["results"][:limit]],
                    errors=cached.get("errors", []),
                    stats={"cacheKey": cache_key, "source": "cache"},
                )

        fetched_at = datetime.now(timezone.utc).isoformat()
        errors: list[str] = []
        results = await asyncio.to_thread(self.collect_results, query, limit, fetched_at, errors)
        response = WebSearchResponse(
            query=query,
            count=len(results),
            cached=False,
            results=results,
            errors=errors,
            stats={"cacheKey": cache_key, "maxResults": self.max_results},
        )
        await self._set_cached(cache_key, response)
        return response

    def collect_results(
        self,
        query: str,
        limit: int,
        fetched_at: str,
        errors: list[str],
    ) -> list[WebSearchResult]:
        candidates: list[WebSearchResult] = []
        seen: set[str] = set()
        provider_limit = max(limit * 2, 10)

        providers = []
        if self.searxng_url:
            providers.append(self._search_searxng)
        providers.extend([self._search_duckduckgo, self._search_bing])
        if self.google_html_enabled:
            providers.append(self._search_google_html)

        for provider in providers:
            try:
                for item in provider(query, provider_limit, fetched_at):
                    key = self._url_key(item.url)
                    if not key or key in seen:
                        continue
                    seen.add(key)
                    candidates.append(item)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{provider.__name__.removeprefix('_search_')}: {type(exc).__name__}")

        ranked = sorted(
            candidates,
            key=lambda item: self._candidate_score(query, item),
            reverse=True,
        )
        for index, item in enumerate(ranked[:limit], start=1):
            item.rank = index
        return ranked[:limit]

    def _search_searxng(self, query: str, limit: int, fetched_at: str) -> list[WebSearchResult]:
        data = self._http_get_json(
            f"{self.searxng_url}/search",
            params={"q": query, "format": "json", "language": "pt-BR", "safesearch": 0},
        )
        rows: list[WebSearchResult] = []
        for row in data.get("results") or []:
            result_url = str(row.get("url") or "").strip()
            if not self._is_useful_url(result_url):
                continue
            rows.append(WebSearchResult(
                title=self._clean_text(row.get("title") or result_url),
                url=result_url,
                snippet=self._clean_text(row.get("content") or ""),
                rank=len(rows) + 1,
                source="searxng",
                fetchedAt=fetched_at,
            ))
            if len(rows) >= limit:
                break
        return rows

    def _search_duckduckgo(self, query: str, limit: int, fetched_at: str) -> list[WebSearchResult]:
        from ddgs import DDGS

        rows: list[WebSearchResult] = []
        with DDGS(timeout=min(self.timeout_seconds, 15)) as client:
            for row in client.text(query, region="br-pt", safesearch="off", max_results=limit):
                url = str(row.get("href") or row.get("url") or "").strip()
                if not self._is_useful_url(url):
                    continue
                rows.append(WebSearchResult(
                    title=self._clean_text(row.get("title") or url),
                    url=url,
                    snippet=self._clean_text(row.get("body") or ""),
                    rank=len(rows) + 1,
                    source="duckduckgo",
                    fetchedAt=fetched_at,
                ))
        return rows

    def _search_bing(self, query: str, limit: int, fetched_at: str) -> list[WebSearchResult]:
        url = f"https://www.bing.com/search?q={quote_plus(query)}&count={min(limit, 10)}&setlang=pt-BR&cc=BR"
        html_text = self._http_get(url)
        soup = BeautifulSoup(html_text, "lxml")
        rows: list[WebSearchResult] = []
        for item in soup.select("li.b_algo"):
            link = item.select_one("h2 a[href]")
            if not link:
                continue
            result_url = str(link.get("href") or "").strip()
            if not self._is_useful_url(result_url):
                continue
            snippet_node = item.select_one(".b_caption p") or item.select_one("p")
            rows.append(WebSearchResult(
                title=self._clean_text(link.get_text(" ", strip=True) or result_url),
                url=result_url,
                snippet=self._clean_text(snippet_node.get_text(" ", strip=True) if snippet_node else ""),
                rank=len(rows) + 1,
                source="bing",
                fetchedAt=fetched_at,
            ))
            if len(rows) >= limit:
                break
        return rows

    def _search_google_html(self, query: str, limit: int, fetched_at: str) -> list[WebSearchResult]:
        url = f"https://www.google.com/search?q={quote_plus(query)}&num={min(limit, 10)}&hl=pt-BR&gl=br"
        html_text = self._http_get(url)
        lowered = html_text.lower()
        if "unusual traffic" in lowered or "captcha" in lowered:
            raise RuntimeError("google_html_blocked")

        soup = BeautifulSoup(html_text, "lxml")
        rows: list[WebSearchResult] = []
        for node in soup.select("a[href]"):
            result_url = self._extract_google_url(str(node.get("href") or ""))
            if not self._is_useful_url(result_url):
                continue
            title = self._clean_text(node.get_text(" ", strip=True))
            if not title or len(title) < 4:
                continue
            rows.append(WebSearchResult(
                title=title,
                url=result_url,
                snippet="",
                rank=len(rows) + 1,
                source="google_html",
                fetchedAt=fetched_at,
            ))
            if len(rows) >= limit:
                break
        return rows

    def _http_get(self, url: str) -> str:
        with httpx.Client(
            timeout=self.timeout_seconds,
            headers={
                "User-Agent": self.user_agent,
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6",
            },
            follow_redirects=True,
        ) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.text

    def _http_get_json(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        with httpx.Client(
            timeout=self.timeout_seconds,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/json",
            },
            follow_redirects=True,
        ) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else {}

    async def _get_cached(self, key: str, limit: int) -> dict[str, Any] | None:
        async with self._lock:
            cache = self._load_cache()
            item = cache.get(key)
            if not item:
                return None
            if (time.time() - float(item.get("savedAt", 0))) > self.cache_ttl_seconds:
                cache.pop(key, None)
                self._save_cache(cache)
                return None
            if int(item.get("version", 0) or 0) != WEB_SEARCH_CACHE_VERSION:
                cache.pop(key, None)
                self._save_cache(cache)
                return None
            if len(item.get("results", [])) < limit:
                return None
            return item

    async def _set_cached(self, key: str, response: WebSearchResponse) -> None:
        async with self._lock:
            cache = self._load_cache()
            cache[key] = {
                "version": WEB_SEARCH_CACHE_VERSION,
                "savedAt": time.time(),
                "results": [item.model_dump() for item in response.results],
                "errors": response.errors,
            }
            self._save_cache(cache)

    def _load_cache(self) -> dict[str, dict[str, Any]]:
        if self._cache is not None:
            return self._cache
        try:
            if self.cache_path.exists():
                parsed = json.loads(self.cache_path.read_text(encoding="utf-8"))
                self._cache = parsed if isinstance(parsed, dict) else {}
            else:
                self._cache = {}
        except Exception:
            self._cache = {}
        return self._cache

    def _save_cache(self, cache: dict[str, dict[str, Any]]) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    def _url_key(self, url: str) -> str:
        try:
            parsed = urlparse(url)
        except Exception:
            return ""
        host = parsed.netloc.lower().removeprefix("www.")
        path = re.sub(r"/+$", "", parsed.path.lower())
        return f"{host}{path}"

    def _is_useful_url(self, url: str) -> bool:
        if not url:
            return False
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return False
        host = parsed.netloc.lower().removeprefix("www.")
        blocked_hosts = {
            "bing.com",
            "google.com",
            "duckduckgo.com",
            "search.yahoo.com",
            "webcache.googleusercontent.com",
        }
        return host not in blocked_hosts

    def _extract_google_url(self, raw_url: str) -> str:
        if raw_url.startswith("/url?"):
            query = parse_qs(urlparse(raw_url).query)
            return unquote(str((query.get("q") or [""])[0]))
        if raw_url.startswith("http"):
            return raw_url
        return ""

    def _clean_text(self, value: Any) -> str:
        text = html.unescape(str(value or ""))
        return " ".join(text.split())

    def _candidate_score(self, query: str, item: WebSearchResult) -> int:
        query_key = normalize_web_query(query)
        haystack = text_key(f"{item.title} {item.url} {item.snippet}")
        tokens = [
            token
            for token in query_key.split()
            if len(token) >= 3 and token not in {"com", "para", "das", "dos", "ltda"}
        ]
        score = 0
        if query_key and query_key in haystack:
            score += 80
        score += sum(12 for token in tokens if token in haystack)
        parsed = urlparse(item.url)
        host = parsed.netloc.lower().removeprefix("www.")
        path = parsed.path.lower()
        if any(token in host for token in tokens):
            score += 18
        if any(token in path for token in tokens):
            score += 8
        if item.source == "google_html":
            score += 3
        return score

import asyncio
import logging
import os
import re
from dataclasses import dataclass

import httpx

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

logger = logging.getLogger(__name__)

_META_CHARSET = re.compile(rb"""charset\s*=\s*["']?\s*([a-zA-Z0-9_\-]+)""", re.I)
# Charset que NAO consegue representar portugues. Servidor que declara isto e
# manda byte alto esta mentindo -- e obedecer a mentira e o que apaga a letra.
_MENTIRAS = {"ascii", "us-ascii", "ansi_x3.4-1968", "iso646-us"}


def _decode_html(content: bytes, declarado: str | None) -> str:
    """Bytes -> texto SEM apagar caractere em silencio.

    O que havia aqui era `content.decode(encoding, errors="ignore")`, e ele tem
    duas armadilhas medidas em 04/08/2026:

    1. `errors="ignore"` DELETA o que nao consegue decodificar. Se o servidor
       declara `charset=us-ascii` e manda UTF-8, "Agua" (com A acentuado) sao
       os bytes C3 81 67 75 61 -- os dois primeiros somem e sobra "gua".
       Reproduzido byte a byte. Nao e teoria.
    2. `response.content[:max_page_bytes]` corta BYTE, nao caractere: a cauda
       de um UTF-8 multibyte partido no meio tambem sumia sem deixar rastro.

    Agora: UTF-8 estrito primeiro (sequencia UTF-8 valida praticamente nao
    acontece por acaso em texto latin-1, entao passar no estrito E prova), o
    que a pagina declara, e por ultimo cp1252 com `errors="replace"` -- que
    DEIXA MARCA (U+FFFD) em vez de apagar. A marca e o alarme que faltava:
    best-effort que engole erro em silencio ja custou caro nesta casa.
    """
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        pass

    m = _META_CHARSET.search(content[:4096])
    do_html = m.group(1).decode("ascii", "ignore").lower() if m else None
    cabecalho = (declarado or "").strip().lower().replace("_", "-") or None
    for enc in (do_html, cabecalho):
        if not enc or enc in _MENTIRAS or enc.replace("-", "") == "utf8":
            continue
        try:
            return content.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue

    texto = content.decode("cp1252", errors="replace")
    quebrados = texto.count("�")
    if quebrados:
        logger.warning(
            "fetcher_decode_degradado: %d caractere(s) ilegivel(is) (declarado=%r, meta=%r) — "
            "pagina entrou com marca, nao apagada",
            quebrados, declarado, do_html,
        )
    return texto


@dataclass
class FetchedPage:
    url: str
    html: str
    content_type: str


class Fetcher:
    def __init__(self, user_agent: str, timeout_seconds: float, concurrency: int, max_page_bytes: int, attempts: int | None = None) -> None:
        self.user_agent = user_agent
        self.timeout_seconds = timeout_seconds
        self.semaphore = asyncio.Semaphore(max(1, concurrency))
        self.max_page_bytes = max_page_bytes
        if attempts is None:
            try:
                attempts = int(os.getenv("HBX_SCRAPING_FETCH_ATTEMPTS", "2") or 2)
            except ValueError:
                attempts = 2
        self.attempts = max(1, min(4, attempts))

    async def _get(self, client: httpx.AsyncClient, url: str) -> FetchedPage | None:
        response = None
        for attempt in range(self.attempts):
            try:
                response = await client.get(url)
            except (httpx.TimeoutException, httpx.TransportError):
                if attempt + 1 >= self.attempts:
                    raise
                await asyncio.sleep(0.25 * (attempt + 1))
                continue
            if response.status_code in RETRYABLE_STATUS_CODES and attempt + 1 < self.attempts:
                await asyncio.sleep(0.25 * (attempt + 1))
                continue
            break
        if response is None:
            return None
        content_type = response.headers.get("content-type", "").lower()
        if response.status_code >= 400 or ("text/html" not in content_type and "application/xhtml" not in content_type):
            return None
        content = response.content[: self.max_page_bytes]
        return FetchedPage(url=str(response.url), html=_decode_html(content, response.encoding), content_type=content_type)

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

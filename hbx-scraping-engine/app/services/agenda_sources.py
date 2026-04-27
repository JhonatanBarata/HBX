import asyncio
import re
import unicodedata
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from .filters import expected_ddds, is_mobile_phone, phone_ddd
from .normalizer import format_phone, normalize_phone_digits

ABC_SOURCE = "hbx_agenda:abctelefonos"
ABC_BASE_URL = "https://pt.abctelefonos.com"
PHONE_RE = re.compile(r"(?<!\d)(?:\+?55\s*)?(?:\(\d{2}\)|\d{2}[\s.-]+)\s*9?\d{4}[-.\s]+\d{4}(?!\d)")


def slugify_city(city: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(city or "").strip().lower())
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_text)).strip("-")


def build_abctelefonos_urls(city: str, state: str, max_pages: int) -> list[str]:
    state_slug = str(state or "").strip().lower()
    city_slug = slugify_city(city)
    base_path = f"/indice_brasil/{state_slug}/{city_slug}"
    urls = [urljoin(ABC_BASE_URL, base_path)]
    urls.extend(urljoin(ABC_BASE_URL, f"{base_path}/pag_{page}") for page in range(1, max(1, max_pages) + 1))
    return urls


def _clean_agenda_name(raw: str, phone_text: str, city: str) -> str:
    text = re.sub(re.escape(phone_text), " ", raw, flags=re.I)
    text = PHONE_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip(" -|:/\t\r\n")
    if not text:
        return f"Contato encontrado - {city}"
    text = re.split(r"\s{2,}|[\|•]", text)[0].strip(" -|:")
    return text[:160] or f"Contato encontrado - {city}"


def _candidate_blocks(soup: BeautifulSoup) -> list:
    selectors = ["article", "li", "tr", ".result", ".resultado", ".contact", ".telefone", "p", "div"]
    blocks = []
    seen_ids: set[int] = set()
    for selector in selectors:
        for block in soup.select(selector):
            block_id = id(block)
            if block_id in seen_ids:
                continue
            text = block.get_text(" ", strip=True)
            if PHONE_RE.search(text):
                seen_ids.add(block_id)
                blocks.append(block)
    return blocks


def parse_abctelefonos_contacts(html: str, source_url: str, city: str = "", state: str = "") -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    contacts: list[dict] = []
    expected = expected_ddds(city, state)
    blocks = _candidate_blocks(soup) or [soup]
    for block in blocks:
        text = block.get_text(" ", strip=True)
        for match in PHONE_RE.finditer(text):
            digits = normalize_phone_digits(match.group(0))
            if not digits:
                continue
            name_source = ""
            for selector in ("h1", "h2", "h3", "a", "strong", "b"):
                node = block.select_one(selector)
                if node and node.get_text(" ", strip=True):
                    name_source = node.get_text(" ", strip=True)
                    break
            if not name_source:
                name_source = text[:300]
            ddd = phone_ddd(digits)
            score = 40
            if is_mobile_phone(digits):
                score += 25
            if expected and ddd in expected:
                score += 20
            contacts.append(
                {
                    "name": _clean_agenda_name(name_source, match.group(0), city),
                    "phone": format_phone(digits),
                    "phoneDigits": digits,
                    "rating": None,
                    "reviews": None,
                    "address": None,
                    "website": None,
                    "source": ABC_SOURCE,
                    "score": max(0, min(100, score)),
                    "_pageUrl": source_url,
                    "_domain": "pt.abctelefonos.com",
                }
            )
    return contacts


def dedupe_by_phone(contacts: list[dict]) -> list[dict]:
    seen: set[str] = set()
    deduped: list[dict] = []
    for contact in contacts:
        digits = normalize_phone_digits(contact.get("phoneDigits") or contact.get("phone"))
        if not digits or digits in seen:
            continue
        item = dict(contact)
        item["phoneDigits"] = digits
        item["phone"] = item.get("phone") or format_phone(digits)
        seen.add(digits)
        deduped.append(item)
    return deduped


async def search_abctelefonos(
    city: str,
    state: str,
    limit: int,
    user_agent: str,
    timeout_seconds: float,
    max_pages: int,
    delay_ms: int,
) -> list[dict]:
    urls = build_abctelefonos_urls(city, state, max_pages)
    headers = {"User-Agent": user_agent, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9"}
    contacts: list[dict] = []
    async with httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(timeout_seconds), follow_redirects=True, max_redirects=3) as client:
        for url in urls:
            try:
                response = await client.get(url)
            except Exception as error:
                print(f"[agenda:abctelefonos] ignorando url={url} error={error}")
                continue
            if response.status_code >= 400:
                print(f"[agenda:abctelefonos] ignorando url={url} status={response.status_code}")
                continue
            content_type = response.headers.get("content-type", "").lower()
            if "text/html" not in content_type and "application/xhtml" not in content_type:
                continue
            contacts.extend(parse_abctelefonos_contacts(response.text, str(response.url), city, state))
            contacts = dedupe_by_phone(contacts)
            print(f"[agenda:abctelefonos] url={url} contatos={len(contacts)}")
            if len(contacts) >= limit:
                break
            if delay_ms > 0:
                await asyncio.sleep(delay_ms / 1000)
    contacts.sort(key=lambda item: int(item.get("score") or 0), reverse=True)
    return contacts[:limit]

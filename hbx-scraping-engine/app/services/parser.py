import json
import re
import unicodedata
from collections.abc import Iterable
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .filters import domain_from_url, is_blocked_domain, is_directory_domain, is_directory_listing_url, is_social_signal_domain, looks_like_list_page_title
from .normalizer import clean_name, extract_phone_from_url, fallback_name, format_phone, normalize_phone_digits
from .social import extract_social_links_from_html, is_valid_social_profile_url, normalize_social_url, social_field_for_url

PHONE_RE = re.compile(r"(?<!\d)(?:\+?55\s*)?(?:\(\d{2}\)|\d{2}[\s.-]+)\s*9?\d{4}[-.\s]+\d{4}(?!\d)")
# CNPJ: 14 dígitos no formato XX.XXX.XXX/YYYY-ZZ (pontuação opcional)
CNPJ_RE = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
# Razão social próxima ao CNPJ — ex.: "Razão Social: Foo Bar Ltda", "Empresa: Foo Bar ME"
_RAZAO_RE = re.compile(
    r"(?:raz[aã]o\s+social|empresa|denominação|denominacao)\s*[:\-–]\s*([^\n\r\|]{4,80})",
    re.I,
)


def _as_list(value) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _flatten_jsonld(value) -> Iterable[dict]:
    if isinstance(value, list):
        for item in value:
            yield from _flatten_jsonld(item)
    elif isinstance(value, dict):
        if isinstance(value.get("@graph"), list):
            yield from _flatten_jsonld(value["@graph"])
        if isinstance(value.get("itemListElement"), list):
            for element in value["itemListElement"]:
                if isinstance(element, dict) and isinstance(element.get("item"), (dict, list)):
                    item = element["item"]
                    if isinstance(item, dict) and element.get("url") and not item.get("url"):
                        item = {**item, "url": element.get("url")}
                    yield from _flatten_jsonld(item)
                else:
                    yield from _flatten_jsonld(element)
        if isinstance(value.get("item"), (dict, list)):
            yield from _flatten_jsonld(value["item"])
        yield value


def _address_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    # mantem espacos (vira 1 espaco) em vez de colapsar tudo -- precisa de
    # fronteira de palavra pra nao confundir UF "GO" com o "go" dentro de "Goiania".
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", ascii_text.lower())).strip()


def _address_part_already_present(part_key: str, accumulated_key: str) -> bool:
    if not part_key:
        return False
    # partes com "espacos" (nomes/CEP com >=4 chars) -- basta a substring aparecer
    # em fronteira de palavra; siglas curtas (UF de 2 letras) exigem token exato
    # pra nao bater em substring de outra palavra (ex.: "go" dentro de "goiania").
    if len(part_key) <= 3:
        return part_key in accumulated_key.split()
    return re.search(rf"(?:^|\s){re.escape(part_key)}(?:\s|$)", accumulated_key) is not None


def _jsonld_address(address) -> str | None:
    if isinstance(address, str):
        return address.strip() or None
    if not isinstance(address, dict):
        return None
    street = str(address.get("streetAddress") or "").strip()
    tail_parts = [
        address.get("addressLocality"),
        address.get("addressRegion"),
        address.get("postalCode"),
    ]
    parts = [street] if street else []
    for part in tail_parts:
        text = str(part or "").strip()
        if not text:
            continue
        # Evita concatenacao duplicada quando o streetAddress ja veio "sujo" do
        # site com cidade/UF/CEP embutidos (ex.: schema.org mal preenchido) --
        # so acrescenta o que ainda nao esta contido no texto acumulado.
        part_key = _address_key(text)
        accumulated_key = _address_key(", ".join(parts))
        if _address_part_already_present(part_key, accumulated_key):
            continue
        parts.append(text)
    text = ", ".join(parts)
    return text or None


def _jsonld_rating(item: dict) -> tuple[float | None, int | None]:
    rating = item.get("aggregateRating")
    if not isinstance(rating, dict):
        return None, None
    rating_value = None
    reviews = None
    try:
        if rating.get("ratingValue") is not None:
            rating_value = float(str(rating.get("ratingValue")).replace(",", "."))
    except (TypeError, ValueError):
        rating_value = None
    for key in ("reviewCount", "ratingCount"):
        try:
            if rating.get(key) is not None:
                reviews = max(0, int(float(str(rating.get(key)).replace(",", "."))))
                break
        except (TypeError, ValueError):
            continue
    return rating_value, reviews


def is_directory_url(url: str) -> bool:
    return is_directory_domain(url)


def is_directory_listing_page(url: str) -> bool:
    return is_directory_listing_url(url)


def _validate_cnpj_digits(raw: str) -> bool:
    """Valida os dois dígitos verificadores do CNPJ (proteção anti-falso-positivo)."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) != 14:
        return False
    if len(set(digits)) == 1:
        return False  # sequência tipo 00000000000000

    def _check(d: str, n: int) -> bool:
        weights = list(range(n - 7, 1, -1)) + list(range(9, 1, -1))
        total = sum(int(d[i]) * weights[i] for i in range(n - 1))
        remainder = total % 11
        expected = 0 if remainder < 2 else 11 - remainder
        return int(d[n - 1]) == expected

    return _check(digits, 13) and _check(digits, 14)


def _extract_cnpj_and_razao(text: str) -> tuple[str | None, str | None]:
    """Extrai o primeiro CNPJ válido e, se presente, a razão social próxima."""
    cnpj: str | None = None
    razao: str | None = None
    for match in CNPJ_RE.finditer(text):
        raw = match.group(0)
        if not _validate_cnpj_digits(raw):
            continue
        cnpj = raw
        # Procura razão social numa janela de ±300 chars ao redor do CNPJ
        start = max(0, match.start() - 300)
        end = min(len(text), match.end() + 300)
        window = text[start:end]
        razao_match = _RAZAO_RE.search(window)
        if razao_match:
            candidate = razao_match.group(1).strip().strip(".,;:")
            # Descarta se a "razão" é obviamente lixo (número de telefone, URL etc.)
            if candidate and not re.search(r"https?://|@|\d{9,}", candidate):
                razao = candidate[:120]
        break  # primeiro CNPJ válido é suficiente
    return cnpj, razao


def _apply_social_links(contact: dict, links: dict[str, str]) -> dict:
    for field, value in links.items():
        contact.setdefault(field, value)
    return contact


def _official_website(page_url: str, jsonld_url: str | None, directory: bool) -> str | None:
    page_host = urlparse(page_url).netloc.lower().removeprefix("www.")
    if jsonld_url:
        jsonld_host = urlparse(jsonld_url).netloc.lower().removeprefix("www.")
        if jsonld_host and not is_social_signal_domain(jsonld_host) and not is_blocked_domain(jsonld_host) and (not directory or jsonld_host != page_host):
            return jsonld_url
    return None if directory or is_social_signal_domain(page_host) else f"{urlparse(page_url).scheme}://{urlparse(page_url).netloc}"


def _external_website_from_links(soup: BeautifulSoup, page_url: str) -> str | None:
    page_host = urlparse(page_url).netloc.lower().removeprefix("www.")
    for link in soup.find_all("a", href=True):
        href = str(link.get("href") or "").strip()
        parsed = urlparse(href)
        host = parsed.netloc.lower().removeprefix("www.")
        if parsed.scheme not in ("http", "https") or not host:
            continue
        if host == page_host or is_social_signal_domain(host) or is_blocked_domain(host):
            continue
        return f"{parsed.scheme}://{parsed.netloc}"
    return None


TITLE_SEPARATOR_RE = re.compile(r"\s+[–—|]\s+|\s+-\s+")


def _title_business_side(raw_title: str, target_type: str = "pj") -> str | None:
    """Quando o titulo tem separador (-, |, – ou —) e um dos lados carrega o nome
    proprio do negocio e o outro e slogan/descricao, prefere o lado curto que
    parece nome comercial (M2) em vez do titulo inteiro com o slogan junto."""
    parts = [part.strip() for part in TITLE_SEPARATOR_RE.split(raw_title) if part.strip()]
    if len(parts) < 2:
        return None
    # lado "nome de negocio" = curto (<=6 palavras), sem terminar em frase (ponto
    # final de slogan) e sem ser so uma preposicao/artigo vazio.
    candidates = []
    for part in parts:
        words = part.split()
        if not words or len(words) > 6:
            continue
        if part.rstrip().endswith((".", "!", "?")):
            continue
        candidates.append(part)
    if not candidates:
        return None
    # entre os candidatos curtos, prefere o mais informativo (mais palavras, ate 6)
    best = max(candidates, key=lambda part: len(part.split()))
    return clean_name(best, allow_generic=target_type == "pf")


def _jsonld_business_name(soup: BeautifulSoup, city: str | None, target_type: str) -> str | None:
    """Identidade do negocio via schema.org (LocalBusiness/Organization) fora do
    padrao ItemList -- e a fonte mais confiavel de nome (M2), preferida antes de
    qualquer titulo/h1/og:title que possa carregar slogan."""
    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        # ItemList (pagina-lista com varios negocios) nao representa UMA identidade
        # de negocio -- ignora aqui, quem trata isso e o loop de contacts por item.
        top_types = {str(t).lower() for t in _as_list(data.get("@type"))} if isinstance(data, dict) else set()
        if "itemlist" in top_types:
            continue
        for item in _flatten_jsonld(data):
            types = {str(t).lower() for t in _as_list(item.get("@type"))}
            if not types & {"localbusiness", "organization", "professionalservice", "store", "autorepair", "restaurant"}:
                continue
            name = fallback_name(item.get("name"), city, target_type)
            if name:
                return name
    return None


def _title_name(soup: BeautifulSoup, target_type: str = "pj", city: str | None = None, jsonld_name: str | None = None) -> str | None:
    # M2 -- identidade do negocio, nao titulo de pagina com slogan. Ordem:
    # schema.org name -> og:site_name -> h1 -> lado util do titulo (separador) -> titulo puro.
    # jsonld_name e opcionalmente pre-calculado por quem chama (parse_page precisa
    # capturar antes do decompose remover os <script> do soup); se nao vier,
    # tenta calcular na hora (soup ainda intacto, ex.: chamada direta/testes).
    if jsonld_name is None:
        jsonld_name = _jsonld_business_name(soup, city, target_type)
    if jsonld_name:
        return jsonld_name

    og_site_name = soup.find("meta", attrs={"property": "og:site_name"})
    if og_site_name:
        name = clean_name(og_site_name.get("content"), allow_generic=target_type == "pf")
        if name:
            return name

    h1 = soup.find("h1")
    if h1:
        name = clean_name(h1.get_text(" ", strip=True), allow_generic=target_type == "pf")
        if name:
            return name

    og_title = soup.find("meta", attrs={"property": "og:title"})
    raw_og_title = str(og_title.get("content") or "").strip() if og_title else ""
    if raw_og_title:
        business_side = _title_business_side(raw_og_title, target_type)
        if business_side:
            return business_side
        name = clean_name(raw_og_title, allow_generic=target_type == "pf")
        if name:
            return name

    raw_title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if raw_title:
        business_side = _title_business_side(raw_title, target_type)
        if business_side:
            return business_side
    return clean_name(raw_title, allow_generic=target_type == "pf")


def parse_page(html: str, url: str, target_type: str = "pj", city: str | None = None) -> tuple[list[dict], str]:
    soup = BeautifulSoup(html, "lxml")
    directory = is_directory_url(url)
    directory_listing = is_directory_listing_page(url)
    page_domain = domain_from_url(url)
    social_field = social_field_for_url(url)
    social_links = extract_social_links_from_html(html, url) if not directory else {}
    if social_field and is_valid_social_profile_url(url):
        social_links.setdefault(social_field, normalize_social_url(url) or url.rstrip("/"))
    contacts: list[dict] = []

    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for item in _flatten_jsonld(data):
            types = {str(t).lower() for t in _as_list(item.get("@type"))}
            if not (types & {"localbusiness", "organization", "professionalservice", "store", "autorepair", "restaurant"} or item.get("telephone")):
                continue
            name = fallback_name(item.get("name"), city, target_type)
            address = _jsonld_address(item.get("address"))
            rating, reviews = _jsonld_rating(item)
            website = _official_website(url, item.get("url"), directory)
            item_url = str(item.get("url") or "").strip()
            page_source_url = item_url if directory_listing and item_url.startswith(("http://", "https://")) else url
            for phone in _as_list(item.get("telephone")):
                digits = normalize_phone_digits(str(phone))
                if digits and name:
                    contact = {
                        "name": name,
                        "phone": format_phone(digits),
                        "phoneDigits": digits,
                        "rating": rating,
                        "reviews": reviews,
                        "address": address,
                        "website": website,
                        "source": "hbx_scraping:web",
                        "_domain": page_domain,
                        "_pageUrl": page_source_url,
                        "sourceUrl": page_source_url,
                    }
                    if directory_listing and page_source_url == url:
                        contact["_directoryListingSource"] = True
                    if social_field:
                        contact["website"] = website
                    contacts.append(_apply_social_links(contact, social_links))

    # precisa capturar ANTES do decompose abaixo remover os <script type=ld+json>
    # do soup -- senao _title_name nunca mais enxerga o schema.org (M2).
    jsonld_business_name = _jsonld_business_name(soup, city, target_type)

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    visible_text = soup.get_text(" ", strip=True)[:20000]

    # M1 -- pagina-lista/artigo ("10 melhores barbearias...", "guia de...") nao
    # tem UMA identidade de negocio: o titulo e do artigo, nao de uma empresa.
    # Contato minerado do texto (telefone de QUALQUER empresa citada no artigo)
    # nao pode sair carimbado com o nome do artigo -- e o pior tipo de lixo,
    # porque passa em filtro de "tem contato" com dado roubado de outra empresa.
    raw_page_title = str(
        (soup.title.get_text(" ", strip=True) if soup.title else "")
        or (soup.find("meta", attrs={"property": "og:title"}) or {}).get("content", "")
        or ""
    )
    is_list_page = looks_like_list_page_title(raw_page_title)

    resolved_fallback_name = None if is_list_page else fallback_name(_title_name(soup, target_type, city, jsonld_business_name), city, target_type)
    fallback_website = _external_website_from_links(soup, url) if social_field else _official_website(url, None, directory)
    phones: set[str] = set()
    for link in soup.find_all("a", href=True):
        digits = extract_phone_from_url(str(link.get("href")))
        if digits:
            phones.add(digits)
    for match in PHONE_RE.finditer(visible_text):
        digits = normalize_phone_digits(match.group(0))
        if digits:
            phones.add(digits)

    for digits in phones:
        if resolved_fallback_name:
            contact = {
                "name": resolved_fallback_name,
                "phone": format_phone(digits),
                "phoneDigits": digits,
                "rating": None,
                "reviews": None,
                "address": None,
                "website": fallback_website,
                "source": "hbx_scraping:web",
                "_domain": page_domain,
                "_pageUrl": url,
                # M1(b) -- nome veio do titulo da pagina (nao de JSON-LD/schema.org),
                # marca pra deteccao de dominio-com-varios-titulos-de-artigo no
                # search_service (mesmo dominio produzindo 2+ "leads" com nomes de
                # artigos diferentes na mesma busca == pagina de conteudo, nao lead).
                "_fromArticleFallback": True,
            }
            if directory_listing:
                contact["_directoryListingSource"] = True
            if social_field:
                contact[social_field] = normalize_social_url(url) or url.rstrip("/")
            contacts.append(_apply_social_links(contact, social_links))

    has_actionable_channel = bool(fallback_website or social_links or (social_field and is_valid_social_profile_url(url)))
    if target_type == "pj" and not contacts and resolved_fallback_name and has_actionable_channel:
        contact = {
            "name": resolved_fallback_name,
            "phone": "",
            "phoneDigits": "",
            "_fromArticleFallback": True,
            "rating": None,
            "reviews": None,
            "address": None,
            "website": fallback_website,
            "source": "hbx_scraping:web",
            "_domain": page_domain,
            "_pageUrl": url,
        }
        if directory_listing:
            contact["_directoryListingSource"] = True
        if social_field:
            contact[social_field] = normalize_social_url(url) or url.rstrip("/")
        contacts.append(_apply_social_links(contact, social_links))

    # L2: extrair CNPJ + razão social do texto visível da página (rodapé incluído).
    # Só tenta em páginas PJ (não é PF/agenda).  Não descarta contato por ausência.
    if contacts and target_type == "pj":
        page_cnpj, page_razao = _extract_cnpj_and_razao(visible_text)
        if page_cnpj:
            for contact in contacts:
                contact.setdefault("cnpj", page_cnpj)
                if page_razao:
                    contact.setdefault("razaoSocial", page_razao)

    return contacts, visible_text

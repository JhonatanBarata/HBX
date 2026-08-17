import unicodedata
import base64
import html
import os
import re
import time
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

import httpx
from ddgs import DDGS

from .filters import is_blocked_lead_source_domain
from .social import is_valid_social_profile_url, normalize_social_url, social_channel_for_url

BLOCKED_HOST_PARTS = ("pinterest.", "linkedin.com")
BLOCKED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".zip", ".rar")
PJ_DISCOVERY_MIN_TARGET = 200
PJ_DISCOVERY_LIMIT_MULTIPLIER = 10
SOCIAL_DISCOVERY_MIN_TARGET = 80
SOCIAL_DISCOVERY_LIMIT_MULTIPLIER = 12
SOCIAL_DISCOVERY_MAX_RESULTS_PER_QUERY = 50
SOCIAL_DISCOVERY_FORCED_QUERY_LIMIT_PER_CHANNEL = 3
# 17/08 (L3 da faxina da busca) — "bing" NUNCA foi backend de texto do ddgs (os validos sao
# brave/duckduckgo/google/grokipedia/mojeek/startpage/wikipedia/yahoo/yandex). Chave invalida faz
# o ddgs cair no rodizio "auto", que promove WIKIPEDIA/GROKIPEDIA pra frente da fila — e como
# enciclopedia volta NAO-vazia, o retorno suprimia o scraper do Bing. So vale se alguem religar o
# ddgs por HBX_DISCOVERY_DDGS_ENABLED; a ordem padrao de hoje e searxng -> Bing scraper.
# 'brave' fica FORA da lista de proposito: a palavra esta na geladeira por decisao do dono.
DISCOVERY_QUERY_BACKEND = os.getenv("HBX_DISCOVERY_QUERY_BACKEND", "google,startpage,yahoo")
PJ_DISCOVERY_TIMEOUT_SECONDS = 8
SOCIAL_DISCOVERY_TIMEOUT_SECONDS = 12
DISCOVERY_SEARCH_TIMEOUT_SECONDS = 4
PJ_DISCOVERY_MAX_QUERIES = 4


def discovery_budget(name: str, default: float, minimum: float = 1, maximum: float = 900) -> float:
    # Orcamentos configuraveis por env: night_factory/deep podem rodar com folga
    # sem mudar o comportamento padrao da busca interativa.
    try:
        value = float(os.getenv(name, "") or default)
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))
SocialProfileCandidate = dict[str, str]
HEALTH_SENIOR_DISCOVERY_SEGMENTS = (
    "clínicas geriátricas",
    "cuidadores de idosos",
    "farmácias",
    "laboratórios",
    "fisioterapia",
    "óticas",
    "casas de repouso",
    "associações terceira idade",
)
SENIOR_TERMS = ("idosos", "60+", "aposentados", "melhor idade", "terceira idade")
HEALTH_PLAN_TERMS = ("plano de saúde", "plano de saude", "convênio médico", "convenio medico", "saúde", "saude")


def slugify_path_part(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_text)).strip("-")


def build_directory_seed_urls(segment: str, city: str, state: str) -> list[str]:
    segment_slug = slugify_path_part(segment)
    city_slug = slugify_path_part(city)
    state_slug = slugify_path_part(state)
    if not segment_slug or not city_slug or not state_slug:
        return []

    query_slug = quote(f"{segment_slug}-{city_slug}-{state_slug}", safe="-")
    return [
        f"https://www.solutudo.com.br/empresas/{state_slug}/{city_slug}/{segment_slug}",
        f"https://listaamarela.com.br/busca/{query_slug}",
        f"https://www.apontador.com.br/local/{state_slug}/{city_slug}/{segment_slug}.html",
        f"https://www.guiamais.com.br/busca/{segment_slug}/{city_slug}-{state_slug}",
    ]


def build_queries(segment: str, city: str, state: str, target_type: str = "pj", query: str = "") -> list[str]:
    explicit_query = " ".join(str(query or "").split())
    if explicit_query:
        return [explicit_query]
    location = " ".join(part for part in [city, state] if str(part or "").strip()).strip()
    if target_type == "agenda_pf":
        return [
            f"{city} {state} telefone",
            f"agenda telefônica {city} {state}",
            f"lista telefônica {city} {state}",
            f"contatos {city} {state} telefone",
            f"telefones úteis {city} {state}",
            f"nomes telefone {city} {state}",
            f"whatsapp {city} {state}",
        ]
    if target_type == "pf":
        return [
            f"consultor {segment} {city} {state} telefone",
            f"corretor {segment} {city} {state} whatsapp",
            f"vendedor {segment} {city} {state} telefone",
            f"representante {segment} {city} {state} whatsapp",
            f"consultor {segment} {city} telefone",
            f"corretor {segment} {city} telefone",
            f"vendedor {segment} {city} whatsapp",
            f"{segment} {city} {state} whatsapp",
        ]
    if location:
        segment_variants = discovery_segment_variants(segment)
        # 17/08 (L3 da faxina da busca) — cidade entre ASPAS ancora o Bing na cidade: medido 10/10
        # resultados locais com '"Valinhos" ... telefone' contra 0/10 sem aspas (sem aspas o Bing
        # ancorava na 1a palavra e devolvia Wikipedia "Agua" + Sabesp). Variavel NOVA dentro do
        # ramo pj de proposito: pf/agenda_pf retornam antes daqui e a linha do `location` original
        # continua servindo de fallback quando a cidade vem vazia.
        city_text = " ".join(str(city or "").split())
        state_text = " ".join(str(state or "").split())
        # O guarda de cidade vazia e obrigatorio: `if location:` tambem passa com SO o estado
        # preenchido, e um f'"{city}"' direto emitiria um token `""` solto na query.
        quoted_location = " ".join(part for part in [f'"{city_text}"' if city_text else "", state_text] if part).strip() or location
        queries: list[str] = []
        for variant in segment_variants:
            queries.extend([
                # A 1a forma reproduz o experimento que mediu 10/10 (cidade entre aspas NA FRENTE)
                # e tem que continuar sendo a primeira: HBX_PJ_DISCOVERY_MAX_QUERIES corta em 4.
                f"{quoted_location} {variant} telefone",
                f"{variant} {quoted_location} contato",
                f"{variant} {quoted_location} whatsapp",
                f"{variant} em {quoted_location}",
                f"{variant} {quoted_location} site oficial",
            ])
        return list(dict.fromkeys(queries))
    return [
        f"{segment} telefone",
        f"{segment} contato",
        f"{segment} whatsapp",
        f"{segment} site oficial",
        f"{segment} empresas telefone",
    ]


def discovery_segment_variants(segment: str) -> list[str]:
    text = " ".join(str(segment or "").split())
    key = slugify_path_part(text)
    variants = [text] if text else []

    def add(items: list[str]) -> None:
        for item in items:
            if item and item not in variants:
                variants.append(item)

    if re.search(r"beleza|salao|saloes|cabelo|cabeleireiro|estetica|sobrancelha|makeup|maquiagem", key):
        add(["salao de beleza", "instituto de beleza", "estetica", "cabeleireiro", "sobrancelhas", "makeup"])
    if re.search(r"barba|barbearia", key):
        add(["barbearia", "barbeiro"])
    if re.search(r"cosmetico|perfumaria", key):
        add(["cosmeticos", "perfumaria"])
    return variants[:8]


def profile_labels(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item or "").strip() for item in value if str(item or "").strip()]
    if isinstance(value, dict):
        labels = value.get("labels") if isinstance(value.get("labels"), list) else []
        hard = value.get("hardReject") if isinstance(value.get("hardReject"), list) else []
        return [str(item or "").strip() for item in [*labels, *hard] if str(item or "").strip()]
    return []


def intent_sales_profile(intent: Any = None, sales_profile: dict | None = None) -> dict:
    if sales_profile:
        return sales_profile
    profile = getattr(intent, "salesProfile", None)
    return profile if isinstance(profile, dict) else {}


def is_senior_health_profile(intent: Any = None, sales_profile: dict | None = None) -> bool:
    profile = intent_sales_profile(intent, sales_profile)
    what = " ".join(str(profile.get(key) or "") for key in ("whatDoYouSell", "offerCategory")).lower()
    audience = " ".join(profile_labels(profile.get("targetAudience"))).lower()
    return any(term in what for term in HEALTH_PLAN_TERMS) and any(term in audience for term in SENIOR_TERMS)


def build_channel_discovery_queries(
    segment: str,
    city: str,
    state: str,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> list[str]:
    channels = {str(value or "").strip().lower() for value in [*(preferred_channels or []), *(required_channels or [])] if str(value or "").strip()}
    location = " ".join(part for part in [city, state] if str(part or "").strip()).strip()
    base = " ".join(part for part in [segment, location] if part).strip()
    queries: list[str] = []

    if {"instagram", "facebook"} & channels:
        queries.extend(build_social_queries(segment, city, state, requested_social_channels(preferred_channels, required_channels)))
        queries.extend([
            f"{base} instagram site oficial",
            f"{base} facebook contato",
            f"{base} redes sociais contato",
        ])
    if {"website", "email"} & channels:
        queries.extend([
            f"{base} site oficial",
            f"{base} página oficial",
            f"{base} contato email",
            f"{base} fale conosco",
            f"{base} sobre",
            f"{base} endereço telefone site",
        ])
    return list(dict.fromkeys(" ".join(query.split()) for query in queries if query.strip()))


def build_commercial_fit_discovery_queries(segment: str, city: str, state: str, intent: Any = None, sales_profile: dict | None = None) -> list[str]:
    if not is_senior_health_profile(intent, sales_profile):
        return []
    location = " ".join(part for part in [city, state] if str(part or "").strip()).strip()
    queries: list[str] = []
    for compatible_segment in HEALTH_SENIOR_DISCOVERY_SEGMENTS:
        queries.extend([
            f"{compatible_segment} {location} telefone",
            f"{compatible_segment} {location} contato",
            f"{compatible_segment} {location} site oficial",
        ])
    if segment:
        queries.append(f"{segment} {location} idosos plano de saúde")
    return list(dict.fromkeys(" ".join(query.split()) for query in queries if query.strip()))


def build_intent_discovery_queries(
    segment: str,
    city: str,
    state: str,
    target_type: str = "pj",
    query: str = "",
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
    intent: Any = None,
    sales_profile: dict | None = None,
) -> list[str]:
    intent_queries = [
        *build_commercial_fit_discovery_queries(segment, city, state, intent, sales_profile),
        *build_channel_discovery_queries(segment, city, state, preferred_channels, required_channels),
    ]
    base_queries = build_queries(segment, city, state, target_type, query)
    return list(dict.fromkeys([*intent_queries, *base_queries]))


def _is_allowed_url(
    url: str,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    full = url.lower()
    if parsed.scheme not in ("http", "https") or not host:
        return False
    social_channel = social_channel_for_url(url)
    if social_channel:
        return False
    if is_blocked_lead_source_domain(host) or any(part in host for part in BLOCKED_HOST_PARTS):
        return False
    if "google.com/maps" in full or "/login" in path or "signin" in path:
        return False
    if path.endswith(BLOCKED_EXTENSIONS):
        return False
    return True


def requested_social_channels(
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> set[str]:
    values = [*(preferred_channels or []), *(required_channels or [])]
    return {str(value or "").strip().lower() for value in values if str(value or "").strip().lower() in {"instagram", "facebook"}}


def text_variants(value: str) -> list[str]:
    text = " ".join(str(value or "").split())
    if not text:
        return []
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return list(dict.fromkeys([text, ascii_text]))


def clean_search_result_text(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    return " ".join(html.unescape(text).split())


def decode_search_result_url(raw_url: str) -> str:
    raw = html.unescape(str(raw_url or "").strip())
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


def search_searxng_rows(query: str, deadline: float, max_results: int = 8) -> list[dict[str, str]] | None:
    base_url = str(os.getenv("HBX_SEARXNG_URL") or "").strip().rstrip("/")
    if not base_url or time.monotonic() >= deadline:
        return None
    timeout = min(discovery_budget("HBX_DISCOVERY_SEARCH_TIMEOUT_SECONDS", DISCOVERY_SEARCH_TIMEOUT_SECONDS), max(0.2, deadline - time.monotonic()))
    try:
        response = httpx.get(
            f"{base_url}/search",
            params={"q": query, "format": "json", "language": "pt-BR", "safesearch": 0},
            timeout=httpx.Timeout(timeout, connect=min(timeout, 2.0), read=timeout, write=min(timeout, 2.0), pool=min(timeout, 2.0)),
            headers={"accept": "application/json", "user-agent": "Mozilla/5.0"},
        )
        if response.status_code >= 400:
            return None
        data = response.json()
    except (httpx.ConnectError, httpx.ConnectTimeout):
        # searxng configurado (env HBX_SEARXNG_URL) mas host indisponivel localmente
        # (ex.: default do docker-compose apontando pra um servico que nao sobe fora
        # da VPS) -- degradar pro DDG/Bing em silencio, sem logar como erro real.
        return None
    except Exception as error:
        print(f"[discovery] searxng falhou: {query} error={error}")
        return None

    rows: list[dict[str, str]] = []
    for row in (data.get("results") if isinstance(data, dict) else None) or []:
        url = str(row.get("url") or "").strip()
        title = clean_search_result_text(str(row.get("title") or ""))
        snippet = clean_search_result_text(str(row.get("content") or ""))
        if url:
            rows.append({"href": url, "url": url, "title": title, "body": snippet, "snippet": snippet})
        if len(rows) >= max_results:
            break
    return rows


def search_bing_rows(query: str, deadline: float, max_results: int = 8) -> list[dict[str, str]]:
    if time.monotonic() >= deadline:
        return []
    timeout = min(discovery_budget("HBX_DISCOVERY_SEARCH_TIMEOUT_SECONDS", DISCOVERY_SEARCH_TIMEOUT_SECONDS), max(0.2, deadline - time.monotonic()))
    try:
        response = httpx.get(
            "https://www.bing.com/search",
            params={"q": query, "setlang": "pt-BR", "cc": "BR"},
            timeout=httpx.Timeout(timeout, connect=min(timeout, 2.0), read=timeout, write=min(timeout, 2.0), pool=min(timeout, 2.0)),
            follow_redirects=True,
            headers={"accept": "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0"},
        )
        if response.status_code >= 400:
            return []
        body = response.text
    except Exception as error:
        print(f"[discovery] bing falhou: {query} error={error}")
        return []

    rows: list[dict[str, str]] = []
    for match in re.finditer(r'<li[^>]+class="[^"]*\bb_algo\b[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>([\s\S]*?)(?=<li[^>]+class="[^"]*\bb_algo\b|</ol>|$)', body, flags=re.I):
        url = decode_search_result_url(match.group(1))
        title = clean_search_result_text(match.group(2))
        snippet_match = re.search(r"<p[^>]*>([\s\S]*?)</p>", match.group(3), flags=re.I)
        snippet = clean_search_result_text(snippet_match.group(1) if snippet_match else "")
        if url and title:
            rows.append({"href": url, "url": url, "title": title, "body": snippet, "snippet": snippet})
        if len(rows) >= max_results:
            return rows

    for match in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,300}?)</a>', body, flags=re.I):
        url = decode_search_result_url(match.group(1))
        title = clean_search_result_text(match.group(2))
        if url and title:
            rows.append({"href": url, "url": url, "title": title, "body": "", "snippet": ""})
        if len(rows) >= max_results:
            return rows
    return rows


def search_ddgs_rows(query: str, deadline: float, max_results: int = 8) -> list[dict[str, str]] | None:
    if time.monotonic() >= deadline:
        return []
    timeout = min(1.2, max(0.2, deadline - time.monotonic()))
    try:
        try:
            ddgs = DDGS(timeout=timeout)
        except TypeError:
            ddgs = DDGS()
        with ddgs as client:
            rows = list(client.text(query, region="br-pt", safesearch="off", max_results=max_results, backend=DISCOVERY_QUERY_BACKEND) or [])
    except Exception as error:
        print(f"[discovery] ddgs falhou: {query} error={error}")
        return None

    output: list[dict[str, str]] = []
    for row in rows:
        url = str(row.get("href") or row.get("url") or "").strip()
        title = clean_search_result_text(str(row.get("title") or ""))
        snippet = clean_search_result_text(str(row.get("body") or row.get("snippet") or row.get("description") or ""))
        if url:
            output.append({"href": url, "url": url, "title": title, "body": snippet, "snippet": snippet})
        if len(output) >= max_results:
            break
    return output


def search_discovery_rows(query: str, deadline: float, max_results: int = 8) -> list[dict[str, str]]:
    searx_rows = search_searxng_rows(query, deadline, max_results)
    if searx_rows:
        return searx_rows
    # 17/08 (L3 da faxina da busca) — DISCOVERY_QUERY_BACKEND="bing" nunca foi backend de texto
    # valido do ddgs, entao o ddgs caia no rodizio "auto", que promove WIKIPEDIA/GROKIPEDIA pra
    # frente da fila. Como enciclopedia volta NAO-vazia, o retorno do ddgs SUPRIMIA o scraper do
    # Bing (26 de ~50 lotes com approved=0) — e HBX_BING_FALLBACK_ON_EMPTY nao salvava, porque so
    # age quando o ddgs devolve lista VAZIA. DDG e Mojeek continuam TCP-mortos da VPS. Ordem nova:
    # searxng (so se HBX_SEARXNG_URL existir) -> Bing scraper. O ddgs NAO morre e nao e apagado:
    # volta inteiro com HBX_DISCOVERY_DDGS_ENABLED=1, pra medir de novo sem reescrever nada.
    if os.getenv("HBX_DISCOVERY_DDGS_ENABLED", "").lower() not in {"1", "true", "yes", "on"}:
        return search_bing_rows(query, deadline, max_results)
    rows = search_ddgs_rows(query, deadline, max_results)
    if rows is not None and (rows or os.getenv("HBX_BING_FALLBACK_ON_EMPTY", "").lower() not in {"1", "true", "yes", "on"}):
        return rows
    return search_bing_rows(query, deadline, max_results)


def build_social_queries(segment: str, city: str, state: str, channels: set[str]) -> list[str]:
    city_text = " ".join(str(city or "").split())
    state_text = " ".join(str(state or "").split())
    segment_text = " ".join(str(segment or "").split())
    location = " ".join(part for part in [city_text, state_text] if part).strip()
    queries: list[str] = []

    for channel in ("instagram", "facebook"):
        if channel not in channels:
            continue
        domain = "instagram.com" if channel == "instagram" else "facebook.com"

        if channel == "instagram":
            for city_variant in text_variants(city_text):
                profile_term = " ".join(part for part in [segment_text, city_variant] if part).strip()
                if profile_term:
                    queries.append(f"site:{domain} {profile_term} -/p/ -/reel/ -/stories/")

        base_terms = [
            f"{segment_text} {location}",
            f"{segment_text} {city_text}",
            f"{segment_text} em {city_text}",
            f"{segment_text} perto {city_text}",
            f"{segment_text} {state_text}",
        ]

        commercial_terms = [
            "telefone",
            "whatsapp",
            "contato",
            "agendamento",
            "oficial",
        ]

        for term in base_terms:
            if not term.strip():
                continue
            queries.append(f"site:{domain} {term}")
            queries.append(f"{term} {channel}")
            for extra in commercial_terms:
                queries.append(f"site:{domain} {term} {extra}")

    return list(dict.fromkeys(" ".join(query.split()) for query in queries if query.strip()))


def discover_social_profiles(
    city: str,
    state: str,
    segment: str,
    limit: int,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
    target_override: int | None = None,
    query: str = "",
) -> list[SocialProfileCandidate]:
    channels = requested_social_channels(preferred_channels, required_channels)
    if not channels:
        return []

    explicit_query = " ".join(str(query or "").split())
    queries = [explicit_query] if explicit_query else build_social_queries(segment, city, state, channels)
    target = max(1, int(target_override)) if target_override is not None else max(SOCIAL_DISCOVERY_MIN_TARGET, limit * SOCIAL_DISCOVERY_LIMIT_MULTIPLIER)
    if target_override is not None:
        channels_count = max(1, len(channels))
        queries = queries[: max(1, channels_count * SOCIAL_DISCOVERY_FORCED_QUERY_LIMIT_PER_CHANNEL)]
    per_query_results = min(8, max(target * 2, 6)) if target_override is not None else SOCIAL_DISCOVERY_MAX_RESULTS_PER_QUERY
    seen: set[str] = set()
    profiles: list[SocialProfileCandidate] = []

    deadline = time.monotonic() + (6 if target_override is not None else discovery_budget("HBX_SOCIAL_DISCOVERY_TIMEOUT_SECONDS", SOCIAL_DISCOVERY_TIMEOUT_SECONDS))

    for query in queries:
        if time.monotonic() >= deadline:
            print("[social_discovery] budget esgotado")
            break
        rows = search_discovery_rows(query, deadline, per_query_results)

        for row in rows or []:
            raw_url = str(row.get("href") or row.get("url") or "").strip()
            url = normalize_social_url(raw_url)
            channel = social_channel_for_url(url or "")
            if not url or not channel or channel not in channels:
                continue
            if url in seen:
                continue
            if not is_valid_social_profile_url(url):
                continue

            seen.add(url)
            profiles.append({
                "url": url,
                "channel": channel,
                "title": str(row.get("title") or ""),
                "snippet": str(row.get("body") or row.get("snippet") or row.get("description") or ""),
                "query": query,
            })

            if len(profiles) >= target:
                return profiles

    return profiles


def discovery_target(limit: int, max_discovery_results: int, target_type: str = "pj", exclude_count: int = 0) -> int:
    if target_type == "agenda_pf":
        return min(max_discovery_results, max(60, limit * 4))
    if target_type == "pj":
        return min(max_discovery_results, max(12, limit * 4))
    multiplier = 5 if target_type == "pf" else 4
    minimum = 60 if target_type == "pf" else 40
    return min(max_discovery_results, max(minimum, limit * multiplier))


def discover_urls(
    city: str,
    state: str,
    segment: str,
    limit: int,
    max_discovery_results: int,
    target_type: str = "pj",
    exclude_count: int = 0,
    query: str = "",
    exclude_urls: list[str] | None = None,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
    intent: Any = None,
    sales_profile: dict | None = None,
) -> list[str]:
    effective_preferred = [str(value or "").strip().lower() for value in (preferred_channels or []) if str(value or "").strip()]
    effective_required = [str(value or "").strip().lower() for value in (required_channels or []) if str(value or "").strip()]
    queries = build_intent_discovery_queries(
        segment,
        city,
        state,
        target_type,
        query,
        effective_preferred,
        effective_required,
        intent,
        sales_profile,
    )
    social_channels = requested_social_channels(effective_preferred, effective_required)
    required_channel_set = set(effective_required)
    base_queries = build_queries(segment, city, state, target_type, query)
    intent_sensitive = bool(queries[: max(0, len(queries) - len(base_queries))] or required_channel_set)
    if target_type == "pj" and social_channels:
        target = min(max_discovery_results, max(PJ_DISCOVERY_MIN_TARGET, limit * PJ_DISCOVERY_LIMIT_MULTIPLIER))
    else:
        target = discovery_target(limit, max_discovery_results, target_type, exclude_count)
    if target_type == "pj" and social_channels:
        per_query = max(30, target // len(queries) + 5)
    else:
        per_query = min(6, max(3, target // len(queries) + 2))
    seen: set[str] = {str(url or "").strip().rstrip("/") for url in (exclude_urls or []) if str(url or "").strip()}
    urls: list[str] = []

    deadline = time.monotonic() + discovery_budget("HBX_PJ_DISCOVERY_TIMEOUT_SECONDS", PJ_DISCOVERY_TIMEOUT_SECONDS)
    query_budget = queries
    if target_type == "pj" and not social_channels:
        query_budget = queries[: int(discovery_budget("HBX_PJ_DISCOVERY_MAX_QUERIES", PJ_DISCOVERY_MAX_QUERIES, 1, 50))]

    for query in query_budget:
        if time.monotonic() >= deadline:
            print("[discovery] budget esgotado")
            break
        results = search_discovery_rows(query, deadline, per_query)
        for row in results or []:
            url = str(row.get("href") or row.get("url") or "").strip()
            normalized = url.rstrip("/")
            if social_channel_for_url(normalized) and is_valid_social_profile_url(normalized):
                continue
            if normalized in seen or not _is_allowed_url(normalized, effective_preferred, effective_required):
                continue
            seen.add(normalized)
            urls.append(normalized)
            if len(urls) >= target:
                return urls

    if target_type == "pj" and len(urls) < target:
        for url in build_directory_seed_urls(segment, city, state):
            normalized = url.rstrip("/")
            if normalized in seen or not _is_allowed_url(normalized, effective_preferred, effective_required):
                continue
            seen.add(normalized)
            urls.append(normalized)

    return urls

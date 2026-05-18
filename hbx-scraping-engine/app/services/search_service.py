import asyncio
import re
import unicodedata
from urllib.parse import urlparse

from ddgs import DDGS

from app.config import DB_PATH, get_settings
from app.schemas import ContactResult, QueryPayload, SearchRequest, SearchResponse

from .agenda_sources import dedupe_by_phone, search_abctelefonos
from .discovery import discover_social_profiles, discover_urls
from .fetcher import Fetcher
from .filters import domain_from_url, is_blocked_lead_source_domain, is_generic_name, is_pf_technical_blocked_domain, is_social_signal_domain, text_key
from .normalizer import dedupe_contacts
from .parser import is_directory_url, parse_page
from .scoring import score_contact
from .social import is_valid_social_profile_url, normalize_social_url, social_field_for_url
from .storage import Storage

SOCIAL_ENRICH_MAX_RESULTS_PER_QUERY = 30

SOCIAL_QUERY_BAD_NAME_HINTS = (
    "confira as melhores",
    "todos os estabelecimentos",
    "melhores opcoes",
    "melhores opções",
    "diversos",
    "papai noel",
    "guia",
    "lista",
    "catalogo",
    "catálogo",
)

SOCIAL_QUERY_STOP_TOKENS = {
    "confira",
    "melhores",
    "opcoes",
    "opções",
    "opcao",
    "opção",
    "todos",
    "estabelecimentos",
    "diversos",
    "cidade",
    "telefone",
    "contato",
    "guia",
    "lista",
}


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

    def compact_key(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", text_key(value))

    def quote_query_part(self, value: str) -> str:
        text = " ".join(str(value or "").replace('"', " ").replace("'", " ").split())
        return f'"{text}"' if text else ""

    def social_name_tokens(self, value: str) -> list[str]:
        key = text_key(value)
        return [token for token in key.split() if len(token) >= 4 and token not in SOCIAL_QUERY_STOP_TOKENS]

    def is_bad_social_candidate_name(self, name: str, city: str, segment: str) -> bool:
        key = text_key(name)
        if not key:
            return True
        if any(text_key(hint) in key for hint in SOCIAL_QUERY_BAD_NAME_HINTS):
            return True
        if key in {text_key(city), text_key(segment), "home", "contato", "telefone", "inicio", "pagina inicial"}:
            return True
        tokens = self.social_name_tokens(name)
        return len(tokens) == 0

    def should_try_social_enrichment(self, contact: dict, city: str, segment: str, required_social: set[str]) -> bool:
        if not contact.get("name") or not contact.get("phone"):
            return False
        if self.is_bad_social_candidate_name(str(contact.get("name") or ""), city, segment):
            return False
        if is_generic_name(contact.get("name"), city, "pj", segment):
            return False
        if int(contact.get("score") or 0) < 50 and not required_social:
            return False
        return True

    def text_variants(self, value: str) -> list[str]:
        text = " ".join(str(value or "").replace('"', " ").split())
        if not text:
            return []
        ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
        return list(dict.fromkeys([text, ascii_text]))

    def social_queries_for_contact(self, contact: dict, city: str, segment: str, channel: str) -> list[str]:
        name = " ".join(str(contact.get("name") or "").split())
        city_text = " ".join(str(city or "").split())
        segment_text = " ".join(str(segment or "").split())
        if not name or not city_text or self.is_bad_social_candidate_name(name, city_text, segment_text):
            return []
        domain = "instagram.com" if channel == "instagram" else "facebook.com"
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
        website_domain = domain_from_url(contact.get("website"))
        website_stem = text_key(website_domain.split(".")[0] if website_domain else "")
        name_tokens = self.social_name_tokens(name)
        compact_name = "".join(name_tokens)
        queries: list[str] = []
        for name_variant in self.text_variants(name):
            q_name = self.quote_query_part(name_variant)
            if not q_name:
                continue
            for city_variant in self.text_variants(city_text):
                q_city = self.quote_query_part(city_variant)
                queries.append(f"site:{domain} {q_name} {q_city}".strip())
                queries.append(f"{q_name} {q_city} {channel}".strip())
                if segment_text:
                    queries.append(f"{q_name} {self.quote_query_part(segment_text)} {q_city} {channel}".strip())
            if phone_tail:
                queries.append(f"{q_name} {self.quote_query_part(phone_tail)} {channel}".strip())
            if website_domain:
                queries.append(f"{q_name} {self.quote_query_part(website_domain)} {channel}".strip())
        if compact_name:
            queries.append(f"site:{domain} {compact_name}")
            queries.append(f"{compact_name} {channel}")
        if website_stem and len(website_stem) >= 4:
            queries.append(f"site:{domain} {website_stem}")
        return list(dict.fromkeys(query.strip() for query in queries if query.strip()))[:10]

    def score_social_candidate(self, contact: dict, row: dict, url: str, channel: str, city: str, segment: str) -> int:
        score = 0
        normalized_url = normalize_social_url(url)
        if not normalized_url or social_field_for_url(normalized_url) != ("instagramUrl" if channel == "instagram" else "facebookUrl"):
            return -100
        raw_text = " ".join(
            str(row.get(key) or "")
            for key in ("title", "body", "snippet", "description", "href", "url")
        )
        parsed_url = urlparse(normalized_url)
        path_text = " ".join(part for part in parsed_url.path.split("/") if part)
        path_key = text_key(path_text)
        path_compact = re.sub(r"[^a-z0-9]+", "", path_key)
        combined = f"{raw_text} {normalized_url} {path_text}"
        combined_key = text_key(combined)
        combined_compact = re.sub(r"[^a-z0-9]+", "", combined_key)
        name_key = text_key(contact.get("name"))
        name_compact = re.sub(r"[^a-z0-9]+", "", name_key)
        city_key = text_key(city)
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""
        website_domain = domain_from_url(contact.get("website"))
        domain_key = text_key(website_domain)
        website_stem = text_key(website_domain.split(".")[0] if website_domain else "")
        name_tokens = self.social_name_tokens(str(contact.get("name") or ""))
        has_name_match = bool(
            name_key and name_key in combined_key
            or name_compact and name_compact in combined_compact
            or name_tokens and sum(1 for token in name_tokens if token in combined_key) >= max(1, min(2, len(name_tokens)))
        )
        path_token_matches = sum(1 for token in name_tokens if token in path_key)
        path_has_name = bool(
            name_compact and name_compact in path_compact
            or path_token_matches >= max(1, min(2, len(name_tokens)))
        )
        has_min_similarity = has_name_match or path_has_name or bool(name_tokens and any(token in combined_key for token in name_tokens))
        if has_name_match:
            score += 40
        if path_has_name:
            score += 35
        if city_key and city_key in combined_key:
            score += 25
        if phone_tail and phone_tail in re.sub(r"\D", "", combined):
            score += 25
        if domain_key and (domain_key in combined_key or website_domain in combined.lower()):
            score += 15
        if website_stem and website_stem in path_key:
            score += 15
        if not is_valid_social_profile_url(normalized_url):
            return -100
        if not has_min_similarity:
            score -= 30
        return score

    def search_social_profile_url(self, contact: dict, query: str, channel: str, city: str, segment: str) -> tuple[str | None, int]:
        try:
            try:
                ddgs = DDGS(timeout=6)
            except TypeError:
                ddgs = DDGS()
            best_url: str | None = None
            best_score = -10_000
            with ddgs as client:
                rows = client.text(query, region="br-pt", safesearch="off", max_results=SOCIAL_ENRICH_MAX_RESULTS_PER_QUERY)
                for row in rows or []:
                    raw_url = str(row.get("href") or row.get("url") or "").strip()
                    url = normalize_social_url(raw_url)
                    if not url or channel not in url.lower():
                        continue
                    candidate_score = self.score_social_candidate(contact, row, url, channel, city, segment)
                    if candidate_score > best_score:
                        best_url = url
                        best_score = candidate_score
            if best_url and best_score >= 35:
                return best_url, best_score
        except Exception as error:
            print(f"[social_enrich] query falhou: {query} error={error}")
        return None, 0

    def score_social_profile_for_contact(self, contact: dict, profile: dict, city: str, segment: str) -> int:
        url = str(profile.get("url") or "")
        title = str(profile.get("title") or "")
        snippet = str(profile.get("snippet") or "")
        combined = f"{url} {title} {snippet}"
        combined_key = text_key(combined)
        combined_compact = self.compact_key(combined)

        name = str(contact.get("name") or "")
        name_key = text_key(name)
        name_compact = self.compact_key(name)
        city_key = text_key(city)
        segment_key = text_key(segment)
        website_domain = domain_from_url(contact.get("website"))
        website_stem = text_key(website_domain.split(".")[0] if website_domain else "")
        phone_digits = re.sub(r"\D", "", str(contact.get("phoneDigits") or contact.get("phone") or ""))
        phone_tail = phone_digits[-8:] if len(phone_digits) >= 8 else ""

        name_tokens = self.social_name_tokens(name)
        token_hits = sum(1 for token in name_tokens if token in combined_key)

        score = 0
        if name_key and name_key in combined_key:
            score += 50
        if name_compact and name_compact in combined_compact:
            score += 45
        if name_tokens and token_hits >= max(1, min(2, len(name_tokens))):
            score += 35
        elif token_hits == 1:
            score += 18
        if city_key and city_key in combined_key:
            score += 20
        if segment_key and segment_key in combined_key:
            score += 10
        if website_stem and len(website_stem) >= 4 and website_stem in combined_key:
            score += 25
        if phone_tail and phone_tail in re.sub(r"\D", "", combined):
            score += 30

        if not name_tokens and not website_stem:
            score -= 50
        if score <= 0:
            score = -20

        return score

    def attach_discovered_social_profiles(
        self,
        contacts: list[dict],
        profiles: list[dict],
        city: str,
        segment: str,
    ) -> dict:
        stats = {
            "profilesDiscovered": len(profiles),
            "profilesAttached": 0,
            "profilesUnmatched": 0,
            "profilesPromoted": 0,
        }

        for profile in profiles:
            channel = str(profile.get("channel") or "")
            field = "instagramUrl" if channel == "instagram" else "facebookUrl" if channel == "facebook" else None
            url = normalize_social_url(str(profile.get("url") or ""))
            if not field or not url:
                continue

            best_contact = None
            best_score = -999

            for contact in contacts:
                if contact.get(field):
                    continue
                if not self.should_try_social_enrichment(contact, city, segment, {"instagram", "facebook"}):
                    continue
                score = self.score_social_profile_for_contact(contact, profile, city, segment)
                if score > best_score:
                    best_contact = contact
                    best_score = score

            if best_contact and best_score >= 35:
                best_contact[field] = url
                best_contact.setdefault("_socialDiscovery", {})[field] = {
                    "score": best_score,
                    "title": profile.get("title"),
                    "query": profile.get("query"),
                }
                stats["profilesAttached"] += 1
            else:
                stats["profilesUnmatched"] += 1

        return stats

    def social_profile_name(self, profile: dict, city: str, segment: str) -> str:
        url = normalize_social_url(str(profile.get("url") or "")) or str(profile.get("url") or "")
        title = " ".join(str(profile.get("title") or "").split())
        for marker in ("|", "•", " - Instagram", " - Facebook", " Instagram", " Facebook"):
            if marker in title:
                title = title.split(marker, 1)[0].strip()
        title = re.sub(r"\(@[^)]+\)", "", title).strip(" -:|•")
        if title and not self.is_bad_social_candidate_name(title, city, segment):
            return title

        parsed = urlparse(url)
        parts = [part for part in parsed.path.split("/") if part]
        slug = parts[-1] if parts else ""
        slug = re.sub(r"[_\-.]+", " ", slug)
        slug = re.sub(r"\s+", " ", slug).strip()
        if slug and not self.is_bad_social_candidate_name(slug, city, segment):
            return " ".join(token.capitalize() for token in slug.split())

        fallback = " ".join(part for part in [segment, city] if str(part or "").strip()).strip()
        return fallback or "Perfil social encontrado"

    def social_first_profile_score(self, profile: dict, url: str, city: str, segment: str) -> int:
        title = str(profile.get("title") or "")
        snippet = str(profile.get("snippet") or "")
        combined = f"{url} {title} {snippet}"
        combined_key = text_key(combined)
        combined_compact = self.compact_key(combined)
        city_key = text_key(city)
        city_compact = self.compact_key(city)
        segment_tokens = [token for token in text_key(segment).split() if len(token) >= 4]
        segment_compact = self.compact_key(segment)
        url_path = " ".join(part for part in urlparse(url).path.split("/") if part)
        path_key = text_key(url_path)
        generic_title = text_key(title) in {"link to instagram com", "link to facebook com", "instagram", "facebook"}

        score = 0
        if segment_tokens and any(token in combined_key for token in segment_tokens):
            score += 45
        if segment_compact and segment_compact in combined_compact:
            score += 30
        if city_key and city_key in combined_key:
            score += 30
        elif city_compact and city_compact in combined_compact:
            score += 20
        if segment_tokens and any(token in path_key for token in segment_tokens):
            score += 25
        if generic_title:
            score -= 45
        if not segment_tokens and not city_key:
            score -= 40
        return score

    def social_profile_candidates(
        self,
        profiles: list[dict],
        city: str,
        state: str,
        segment: str,
        required_social: set[str],
        limit: int,
    ) -> list[dict]:
        if not profiles or not required_social:
            return []
        candidates: list[dict] = []
        seen_urls: set[str] = set()
        for profile in profiles:
            channel = str(profile.get("channel") or "").strip().lower()
            field = "instagramUrl" if channel == "instagram" else "facebookUrl" if channel == "facebook" else None
            url = normalize_social_url(str(profile.get("url") or ""))
            if not field or not url or url in seen_urls:
                continue
            if self.social_first_profile_score(profile, url, city, segment) < 35:
                continue
            item = {
                "name": self.social_profile_name(profile, city, segment),
                "phone": "",
                "phoneDigits": "",
                "rating": None,
                "reviews": None,
                "address": " ".join(part for part in [city, state] if str(part or "").strip()).strip() or None,
                "website": None,
                field: url,
                "source": "hbx_scraping:social_discovery",
                "score": 70,
                "_pageUrl": url,
                "_socialFirst": True,
            }
            if not self.has_required_social_channels(item, required_social):
                continue
            seen_urls.add(url)
            candidates.append(item)
            if len(candidates) >= limit:
                break
        return candidates

    def build_social_first_response(
        self,
        request: SearchRequest,
        candidates: list[dict],
        social_discovery_stats: dict,
    ) -> SearchResponse:
        allowed_fields = {"name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "instagramUrl", "facebookUrl", "source", "score"}
        public_items = [{key: value for key, value in item.items() if key in allowed_fields} for item in candidates[: request.limit]]
        valid = [ContactResult.model_validate(item).model_dump() for item in public_items]
        response_stats = {
            "parsed": 0,
            "approved": len(valid),
            "invalidPhone": 0,
            "blockedDomain": 0,
            "lowScore": 0,
            "missingRequiredChannel": 0,
            "rawFound": len(candidates),
            "deduped": len(candidates),
            "socialProfilesDiscovered": social_discovery_stats["profilesDiscovered"],
            "socialProfilesAttached": 0,
            "socialProfilesUnmatched": social_discovery_stats["profilesUnmatched"],
            "socialProfilesPromoted": len(valid),
        }
        social_stats = {
            "requestedChannels": sorted(self.requested_social_channels(request.preferredChannels, request.requiredChannels)),
            "requiredChannels": sorted(self.required_social_channels(request.requiredChannels)),
            "enrichmentRan": False,
            "mode": "required",
            "processed": 0,
            "skippedBadCandidate": 0,
            "enrichedCount": 0,
            "missingRequiredChannel": 0,
            "discovery": social_discovery_stats,
            "socialFirstCandidates": len(candidates),
        }
        print(
            "[social_first] "
            f"profiles={social_discovery_stats['profilesDiscovered']} "
            f"promoted={len(valid)} "
            f"required={','.join(sorted(self.required_social_channels(request.requiredChannels)))}"
        )
        return SearchResponse(
            query=QueryPayload(city=request.city, state=request.state, segment=request.segment, query=request.query, targetType=request.targetType, limit=request.limit),
            count=len(valid),
            results=[ContactResult.model_validate(item) for item in valid],
            status="completed",
            errors=[],
            stats=response_stats,
            social=social_stats,
        )

    def enrich_social_links_for_contacts(
        self,
        contacts: list[dict],
        city: str,
        state: str,
        segment: str,
        preferred_channels: list[str] | None = None,
        required_channels: list[str] | None = None,
    ) -> tuple[list[dict], dict]:
        requested_channels = self.requested_social_channels(preferred_channels, required_channels)
        required_social = self.required_social_channels(required_channels)
        mode = "required" if required_social else "best_effort"
        if not requested_channels:
            requested_channels = {"instagram", "facebook"}
        stats = {
            "requestedChannels": sorted(requested_channels),
            "requiredChannels": sorted(required_social),
            "enrichmentRan": True,
            "mode": mode,
            "processed": 0,
            "skippedBadCandidate": 0,
            "enrichedCount": 0,
            "missingRequiredChannel": 0,
        }
        processed = 0
        for contact in contacts:
            if not required_social and processed >= 20:
                break
            if not self.should_try_social_enrichment(contact, city, segment, required_social):
                stats["skippedBadCandidate"] += 1
                continue
            processed += 1
            stats["processed"] = processed
            had_social = any(contact.get("instagramUrl" if channel == "instagram" else "facebookUrl") for channel in requested_channels)
            touched = False
            for channel in ("instagram", "facebook"):
                if channel not in requested_channels:
                    continue
                field = "instagramUrl" if channel == "instagram" else "facebookUrl"
                if contact.get(field):
                    continue
                for query in self.social_queries_for_contact(contact, city, segment, channel):
                    url, _score = self.search_social_profile_url(contact, query, channel, city, segment)
                    if url:
                        contact[field] = url
                        touched = True
                        break
            has_social = any(contact.get("instagramUrl" if channel == "instagram" else "facebookUrl") for channel in requested_channels)
            if has_social and (touched or had_social):
                stats["enrichedCount"] += 1
            if required_social and not self.has_required_social_channels(contact, required_social):
                stats["missingRequiredChannel"] += 1
        if requested_channels:
            print(
                "[social_enrich] "
                f"mode={mode} "
                f"requested={','.join(sorted(requested_channels))} "
                f"processed={stats['processed']} "
                f"skippedBadCandidate={stats['skippedBadCandidate']} "
                f"enriched={stats['enrichedCount']} "
                f"missingRequired={stats['missingRequiredChannel']}"
            )
        return contacts, stats

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

        required_social_channels = self.required_social_channels(request.requiredChannels)
        requested_social_channels = self.requested_social_channels(request.preferredChannels, request.requiredChannels)
        social_profiles: list[dict] = []
        if request.targetType == "pj" and requested_social_channels:
            social_profiles = await asyncio.to_thread(
                discover_social_profiles,
                request.city,
                request.state,
                request.segment,
                request.limit,
                request.preferredChannels,
                request.requiredChannels,
                target_override=max(request.limit * 12, 12) if required_social_channels else None,
            )
            print(f"[social_discovery] profiles={len(social_profiles)} channels={','.join(sorted(requested_social_channels))}")
            social_first_candidates = self.social_profile_candidates(
                social_profiles,
                request.city,
                request.state,
                request.segment,
                required_social_channels,
                request.limit,
            )
            if required_social_channels and social_first_candidates:
                social_discovery_stats = {
                    "profilesDiscovered": len(social_profiles),
                    "profilesAttached": 0,
                    "profilesUnmatched": max(0, len(social_profiles) - len(social_first_candidates)),
                    "profilesPromoted": len(social_first_candidates),
                }
                return self.build_social_first_response(request, social_first_candidates, social_discovery_stats)

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
        social_discovery_stats = {
            "profilesDiscovered": len(social_profiles),
            "profilesAttached": 0,
            "profilesUnmatched": 0,
            "profilesPromoted": 0,
        }
        if request.targetType == "pj" and social_profiles:
            social_discovery_stats = self.attach_discovered_social_profiles(
                deduped,
                social_profiles,
                request.city,
                request.segment,
            )
        effective_social_channels = requested_social_channels or ({"instagram", "facebook"} if request.targetType == "pj" else set())
        social_stats = {
            "requestedChannels": sorted(effective_social_channels),
            "requiredChannels": sorted(required_social_channels),
            "enrichmentRan": False,
            "mode": "required" if required_social_channels else "best_effort",
            "processed": 0,
            "skippedBadCandidate": 0,
            "enrichedCount": 0,
            "missingRequiredChannel": 0,
            "discovery": social_discovery_stats,
        }
        if request.targetType == "pj":
            deduped, social_stats = await asyncio.to_thread(
                self.enrich_social_links_for_contacts,
                deduped,
                request.city,
                request.state,
                request.segment,
                request.preferredChannels,
                request.requiredChannels,
            )
            social_stats["discovery"] = social_discovery_stats
        allowed_fields = {"name", "phone", "phoneDigits", "rating", "reviews", "address", "website", "instagramUrl", "facebookUrl", "source", "score"}
        min_score = 0 if request.targetType == "pf" else 50
        public_items: list[dict] = []
        stats = {"parsed": len(parsed), "invalid_phone": 0, "blocked_domain": 0, "low_score": 0, "missing_required_channel": 0, "approved": 0}
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
                stats["missing_required_channel"] += 1
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
        social_stats["missingRequiredChannel"] = stats["missing_required_channel"]
        response_stats = {
            "parsed": stats["parsed"],
            "approved": stats["approved"],
            "invalidPhone": stats["invalid_phone"],
            "blockedDomain": stats["blocked_domain"],
            "lowScore": stats["low_score"],
            "missingRequiredChannel": stats["missing_required_channel"],
            "rawFound": len(parsed),
            "deduped": len(deduped),
            "socialProfilesDiscovered": social_discovery_stats["profilesDiscovered"],
            "socialProfilesAttached": social_discovery_stats["profilesAttached"],
            "socialProfilesUnmatched": social_discovery_stats["profilesUnmatched"],
            "socialProfilesPromoted": social_discovery_stats.get("profilesPromoted", 0),
        }
        print(
            "[search] "
            f"parsed={response_stats['parsed']} "
            f"approved={response_stats['approved']} "
            f"invalid_phone={stats['invalid_phone']} "
            f"blocked_domain={stats['blocked_domain']} "
            f"low_score={stats['low_score']} "
            f"missing_required_channel={stats['missing_required_channel']}"
        )
        print(
            "[search:funnel] "
            f"raw_found={len(parsed)} "
            f"deduped={len(deduped)} "
            f"social_profiles={social_discovery_stats['profilesDiscovered']} "
            f"social_attached={social_discovery_stats['profilesAttached']} "
            f"approved={response_stats['approved']} "
            f"missing_required_channel={stats['missing_required_channel']}"
        )

        response = SearchResponse(
            query=QueryPayload(city=request.city, state=request.state, segment=request.segment, query=request.query, targetType=request.targetType, limit=request.limit),
            count=len(valid),
            results=[ContactResult.model_validate(item) for item in valid],
            status="completed_with_errors" if errors else "completed",
            errors=errors,
            stats=response_stats,
            social=social_stats,
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

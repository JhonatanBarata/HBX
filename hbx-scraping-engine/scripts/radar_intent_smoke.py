from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from app.schemas import SearchIntent, SearchRequest
from app.services.discovery import build_intent_discovery_queries, discover_urls
from app.services.filters import domain_from_url
from app.services.parser import is_directory_url
from app.services.search_service import SearchService
from app.services.social import social_channel_for_url


def request_payload(**overrides) -> SearchRequest:
    base = {
        "city": "Rio Claro",
        "state": "SP",
        "segment": "serviços",
        "targetType": "pj",
        "limit": 10,
        "fresh": True,
        "qualityMode": "lead_plus",
        "freshness": "live",
    }
    base.update(overrides)
    return SearchRequest(**base)


SCENARIOS = [
    {
        "name": "plano_saude_idosos_rio_claro",
        "request": request_payload(
            segment="serviços de saúde",
            whatDoYouSell="plano de saúde",
            offerCategory="convênio médico",
            targetAudience={"labels": ["idosos", "60+", "aposentados"]},
        ),
        "urls": [
            "https://clinicageriatricavida.com.br",
            "https://farmaciabemestar.com.br",
            "https://www.guiamais.com.br/busca/servicos-de-saude/rio-claro-sp",
        ],
        "pages": {
            "https://clinicageriatricavida.com.br": {
                "text": "Clínica Geriátrica Vida em Rio Claro SP. Geriatria, fisioterapia, cuidadores de idosos e atendimento para terceira idade.",
                "contacts": [
                    {
                        "name": "Clínica Geriátrica Vida",
                        "phone": "(19) 99999-1000",
                        "phoneDigits": "19999991000",
                        "address": "Rio Claro SP",
                        "website": "https://clinicageriatricavida.com.br",
                        "email": "contato@clinicageriatricavida.com.br",
                    }
                ],
            },
            "https://farmaciabemestar.com.br": {
                "text": "Farmácia Bem Estar Rio Claro SP. Medicamentos, idosos, atenção farmacêutica e convênios.",
                "contacts": [
                    {
                        "name": "Farmácia Bem Estar",
                        "phone": "(19) 99999-2000",
                        "phoneDigits": "19999992000",
                        "address": "Rio Claro SP",
                        "website": "https://farmaciabemestar.com.br",
                    }
                ],
            },
            "https://www.guiamais.com.br/busca/servicos-de-saude/rio-claro-sp": {
                "text": "Lista de serviços de saúde em Rio Claro.",
                "contacts": [
                    {
                        "name": "Serviços de saúde em Rio Claro",
                        "phone": "",
                        "phoneDigits": "",
                        "address": "Rio Claro SP",
                    }
                ],
            },
        },
    },
    {
        "name": "pizzarias_instagram_rio_claro",
        "request": request_payload(
            segment="pizzarias",
            requiredChannels=["instagram"],
            channelMatchMode="any_required",
        ),
        "urls": [
            "https://pizzariafornorio.com.br",
            "https://pizzariasemrede.com.br",
        ],
        "socialProfiles": [
            {
                "url": "https://instagram.com/pizzariafornorio",
                "channel": "instagram",
                "title": "Pizzaria Forno Rio",
                "snippet": "Pizzaria em Rio Claro SP",
                "query": "site:instagram.com pizzarias Rio Claro",
            }
        ],
        "pages": {
            "https://pizzariafornorio.com.br": {
                "text": "Pizzaria Forno Rio em Rio Claro SP. Delivery, telefone, Instagram oficial @pizzariafornorio.",
                "contacts": [
                    {
                        "name": "Pizzaria Forno Rio",
                        "phone": "(19) 99999-3000",
                        "phoneDigits": "19999993000",
                        "address": "Rio Claro SP",
                        "website": "https://pizzariafornorio.com.br",
                        "instagramUrl": "https://instagram.com/pizzariafornorio",
                    }
                ],
            },
            "https://pizzariasemrede.com.br": {
                "text": "Pizzaria Sem Rede em Rio Claro SP. Telefone e cardápio.",
                "contacts": [
                    {
                        "name": "Pizzaria Sem Rede",
                        "phone": "(19) 99999-4000",
                        "phoneDigits": "19999994000",
                        "address": "Rio Claro SP",
                        "website": "https://pizzariasemrede.com.br",
                    }
                ],
            },
        },
    },
    {
        "name": "clinicas_website_email_rio_claro",
        "request": request_payload(
            segment="clínicas",
            requiredChannels=["website", "email"],
            channelMatchMode="all_required",
        ),
        "urls": [
            "https://clinicarioclaro.com.br",
            "https://clinicaboavista.com.br",
        ],
        "pages": {
            "https://clinicarioclaro.com.br": {
                "text": "Clínica Rio Claro SP. Site oficial, contato e email contato@clinicarioclaro.com.br.",
                "contacts": [
                    {
                        "name": "Clínica Rio Claro",
                        "phone": "(19) 99999-5000",
                        "phoneDigits": "19999995000",
                        "address": "Rio Claro SP",
                        "website": "https://clinicarioclaro.com.br",
                        "email": "contato@clinicarioclaro.com.br",
                    }
                ],
            },
            "https://clinicaboavista.com.br": {
                "text": "Clínica Boa Vista em Rio Claro SP. Site oficial e telefone.",
                "contacts": [
                    {
                        "name": "Clínica Boa Vista",
                        "phone": "(19) 99999-6000",
                        "phoneDigits": "19999996000",
                        "address": "Rio Claro SP",
                        "website": "https://clinicaboavista.com.br",
                    }
                ],
            },
        },
    },
    {
        "name": "diretorio_vs_oficial_social",
        "request": request_payload(
            segment="oficinas",
            requiredChannels=["instagram"],
            channelMatchMode="any_required",
        ),
        "urls": [
            "https://oficinacentralrc.com.br",
            "https://instagram.com/oficinacentralrc",
            "https://www.guiamais.com.br/busca/oficinas/rio-claro-sp",
        ],
        "pages": {
            "https://www.guiamais.com.br/busca/oficinas/rio-claro-sp": {
                "text": "Lista de oficinas em Rio Claro SP. Guia genérico e diretório.",
                "contacts": [
                    {
                        "name": "Auto Center Silva",
                        "phone": "(19) 99999-7100",
                        "phoneDigits": "19999997100",
                        "address": "Rio Claro SP",
                    }
                ],
            },
            "https://oficinacentralrc.com.br": {
                "text": "Oficina Central RC Rio Claro SP. Site oficial, mecânica, telefone, WhatsApp e Instagram.",
                "contacts": [
                    {
                        "name": "Oficina Central RC",
                        "phone": "(19) 99999-7000",
                        "phoneDigits": "19999997000",
                        "address": "Rio Claro SP",
                        "website": "https://oficinacentralrc.com.br",
                        "instagramUrl": "https://instagram.com/oficinacentralrc",
                    }
                ],
            },
            "https://instagram.com/oficinacentralrc": {
                "text": "Oficina Central RC no Instagram. Rio Claro SP.",
                "contacts": [
                    {
                        "name": "Oficina Central RC",
                        "phone": "(19) 99999-7000",
                        "phoneDigits": "19999997000",
                        "address": "Rio Claro SP",
                        "instagramUrl": "https://instagram.com/oficinacentralrc",
                    }
                ],
            },
        },
    },
    {
        "name": "intent_sensitive_nao_retorna_directory_seed_cedo",
        "request": request_payload(
            segment="clínicas",
            requiredChannels=["website"],
            channelMatchMode="any_required",
        ),
        "urls": [
            "https://clinicavidaoficial.com.br",
            "https://www.solutudo.com.br/empresas/sp/rio-claro/clinicas",
        ],
        "pages": {
            "https://clinicavidaoficial.com.br": {
                "text": "Clínica Vida Oficial Rio Claro SP. Site oficial e contato.",
                "contacts": [
                    {
                        "name": "Clínica Vida Oficial",
                        "phone": "(19) 99999-8000",
                        "phoneDigits": "19999998000",
                        "address": "Rio Claro SP",
                        "website": "https://clinicavidaoficial.com.br",
                    }
                ],
            },
            "https://www.solutudo.com.br/empresas/sp/rio-claro/clinicas": {
                "text": "Diretório de clínicas em Rio Claro SP.",
                "contacts": [
                    {
                        "name": "Clínicas em Rio Claro",
                        "phone": "",
                        "phoneDigits": "",
                        "address": "Rio Claro SP",
                    }
                ],
            },
        },
    },
]


def classify_url(url: str) -> str:
    channel = social_channel_for_url(url)
    if channel:
        return f"social:{channel}"
    if is_directory_url(url):
        return "directory"
    host = domain_from_url(url) or urlparse(url).netloc or "unknown"
    return f"web:{host}"


def group_urls(urls: list[str], social_profiles: list[dict] | None = None) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for url in urls:
        grouped.setdefault(classify_url(url), []).append(url)
    for profile in social_profiles or []:
        grouped.setdefault(f"social:{profile.get('channel') or 'profile'}", []).append(str(profile.get("url") or ""))
    return {key: value for key, value in grouped.items() if value}


def contact_channels(result: dict) -> list[str]:
    evidence = result.get("evidenceJson") or {}
    channels = list(evidence.get("channels") or [])
    if channels:
        return channels
    inferred = []
    if result.get("phoneDigits") or result.get("phone"):
        inferred.extend(["phone", "whatsapp"])
    if result.get("website"):
        inferred.append("website")
    if result.get("email"):
        inferred.append("email")
    if result.get("instagramUrl"):
        inferred.append("instagram")
    if result.get("facebookUrl"):
        inferred.append("facebook")
    return list(dict.fromkeys(inferred))


def top_rows(results: list[dict]) -> list[dict]:
    rows = []
    for result in results[:10]:
        evidence = result.get("evidenceJson") or {}
        rows.append(
            {
                "name": result.get("name"),
                "score": result.get("score") or evidence.get("finalScore"),
                "commercialFitScore": evidence.get("commercialFitScore"),
                "sourceScore": evidence.get("sourceScore"),
                "channels": contact_channels(result),
                "qualityReason": result.get("qualityReason"),
                "sourceUrl": result.get("sourceUrl"),
            }
        )
    return rows


async def run_mock_scenario(scenario: dict) -> dict:
    request: SearchRequest = scenario["request"]
    intent = SearchIntent.from_request(request)
    pages_by_url = scenario["pages"]
    urls = list(scenario["urls"])
    social_profiles = list(scenario.get("socialProfiles") or [])

    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_all(self, fetch_urls):
            return [SimpleNamespace(html=f"<html>{pages_by_url[url]['text']}</html>", url=url) for url in fetch_urls if url in pages_by_url]

    def fake_parse_page(html, url, target_type, city):
        page = pages_by_url[url]
        contacts = []
        for contact in page["contacts"]:
            contacts.append(
                {
                    **contact,
                    "source": "hbx_scraping:web",
                    "sourceEngine": "hbx_scraping",
                    "_pageUrl": url,
                }
            )
        return contacts, page["text"]

    def fake_social_enrichment(self, contacts, city, state, segment, requested_channels, required_channels):
        return contacts, {
            "requestedChannels": sorted(requested_channels),
            "requiredChannels": sorted(required_channels),
            "enrichmentRan": False,
            "mode": "mock",
            "processed": len(contacts),
            "skippedBadCandidate": 0,
            "enrichedCount": 0,
            "missingRequiredChannel": 0,
            "discovery": {
                "profilesDiscovered": len(social_profiles),
                "profilesAttached": 0,
                "profilesUnmatched": 0,
                "profilesPromoted": 0,
            },
        }

    with (
        patch("app.services.search_service.discover_urls", return_value=urls),
        patch("app.services.search_service.discover_social_profiles", return_value=social_profiles),
        patch("app.services.search_service.Fetcher", FakeFetcher),
        patch("app.services.search_service.parse_page", fake_parse_page),
        patch.object(SearchService, "enrich_social_links_for_contacts", fake_social_enrichment),
    ):
        response = await SearchService().search(request)

    stats = response.stats or {}
    queries_generated = stats.get("queriesGenerated") or build_intent_discovery_queries(
        request.segment,
        request.city,
        request.state,
        request.targetType,
        request.query,
        request.preferredChannels,
        request.requiredChannels,
        intent,
    )
    pages_fetched = max(int(stats.get("pagesFetched") or 0), len([url for url in urls if url in pages_by_url]))
    return {
        "scenario": scenario["name"],
        "mode": "deterministic",
        "queriesGeradas": queries_generated,
        "urlsDescobertasPorFonte": group_urls(urls, social_profiles),
        "paginasBaixadas": pages_fetched,
        "parsed": stats.get("parsed", 0),
        "approved": stats.get("approved", 0),
        "rejected": stats.get("rejected", 0),
        "missingRequiredChannel": stats.get("missingRequiredChannel", 0),
        "directorySeedReturnedEarly": bool(urls and is_directory_url(urls[0]) and (request.requiredChannels or request.preferredChannels)),
        "sourceMetrics": stats.get("sourceMetrics", []),
        "top10": top_rows(response.model_dump().get("results", [])),
    }


async def run_live_scenario(scenario: dict) -> dict:
    request: SearchRequest = scenario["request"]
    intent = SearchIntent.from_request(request)
    queries = build_intent_discovery_queries(
        request.segment,
        request.city,
        request.state,
        request.targetType,
        request.query,
        request.preferredChannels,
        request.requiredChannels,
        intent,
    )
    urls = await asyncio.to_thread(
        discover_urls,
        request.city,
        request.state,
        request.segment,
        request.limit,
        SearchService().settings.max_discovery_results,
        request.targetType,
        0,
        request.query,
        [],
        request.preferredChannels,
        request.requiredChannels,
        intent,
    )
    response = await SearchService().search(request)
    stats = response.stats or {}
    queries_generated = stats.get("queriesGenerated") or queries
    return {
        "scenario": scenario["name"],
        "mode": "live",
        "queriesGeradas": queries_generated,
        "urlsDescobertasPorFonte": group_urls(urls),
        "paginasBaixadas": stats.get("pagesFetched", 0),
        "parsed": stats.get("parsed", 0),
        "approved": stats.get("approved", 0),
        "rejected": stats.get("rejected", 0),
        "missingRequiredChannel": stats.get("missingRequiredChannel", 0),
        "directorySeedReturnedEarly": bool(urls and is_directory_url(urls[0]) and (request.requiredChannels or request.preferredChannels)),
        "sourceMetrics": stats.get("sourceMetrics", []),
        "top10": top_rows(response.model_dump().get("results", [])),
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke comparativo intent-aware do Radar/HBX.")
    parser.add_argument("--live", action="store_true", help="Roda contra busca/fetch reais. Sem esta flag usa fixtures determinísticos.")
    parser.add_argument("--scenario", action="append", help="Filtra pelo nome de um cenário. Pode repetir.")
    args = parser.parse_args()

    selected = [scenario for scenario in SCENARIOS if not args.scenario or scenario["name"] in set(args.scenario)]
    for scenario in selected:
        report = await (run_live_scenario(scenario) if args.live else run_mock_scenario(scenario))
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

from fastapi import FastAPI

from app.schemas import (
    EnrichLeadRequest,
    EnrichLeadResponse,
    SearchRequest,
    SearchResponse,
    WebSearchRequest,
    WebSearchResponse,
)
from app.services.search_service import SearchService
from app.services.web_search_service import WebSearchService

app = FastAPI(title="HBX Scraping Engine", version="0.1.0")
service = SearchService()
web_search_service = WebSearchService()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "engine": "hbx_scraping", "status": "online"}


@app.post("/search", response_model=SearchResponse, response_model_exclude_none=True)
async def search(request: SearchRequest) -> SearchResponse:
    return await service.search(request)


@app.post("/web-search", response_model=WebSearchResponse)
async def web_search(request: WebSearchRequest) -> WebSearchResponse:
    return await web_search_service.search(request)


@app.post("/enrich-lead", response_model=EnrichLeadResponse)
async def enrich_lead(request: EnrichLeadRequest) -> EnrichLeadResponse:
    return await service.enrich_lead(request)

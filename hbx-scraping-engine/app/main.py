from fastapi import FastAPI

from app.schemas import EnrichLeadRequest, EnrichLeadResponse, SearchRequest, SearchResponse
from app.services.search_service import SearchService

app = FastAPI(title="HBX Scraping Engine", version="0.1.0")
service = SearchService()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "engine": "hbx_scraping", "status": "online"}


@app.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    return await service.search(request)


@app.post("/enrich-lead", response_model=EnrichLeadResponse)
async def enrich_lead(request: EnrichLeadRequest) -> EnrichLeadResponse:
    return await service.enrich_lead(request)

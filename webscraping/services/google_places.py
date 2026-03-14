from __future__ import annotations

import os
from typing import Any

import requests


PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


def get_api_key() -> str:
    if os.getenv("MOCK_MODE") == "1":
        return "MOCK"
    return os.getenv("GOOGLE_PLACES_API_KEY", "").strip()


def search_places(query: str, limit: int = 20) -> list[dict[str, Any]]:
    if os.getenv("MOCK_MODE") == "1":
        sample = [
            {"place_id": "mock_1", "name": "Padaria Exemplo"},
            {"place_id": "mock_2", "name": "Lanchonete Ficticia"},
            {"place_id": "mock_3", "name": "Bar Teste"},
            {"place_id": "mock_4", "name": "Academia Mock"},
        ]
        return sample[:limit]

    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY não configurada.")

    params = {"query": query, "key": api_key, "language": "pt-BR"}
    resp = requests.get(PLACES_TEXT_SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    results = data.get("results", [])
    return results[:limit]


def get_place_details(place_id: str) -> dict[str, Any]:
    if os.getenv("MOCK_MODE") == "1":
        demos = {
            "mock_1": {
                "name": "Padaria Exemplo",
                "international_phone_number": "+55 11 91234-5678",
                "formatted_phone_number": "(11) 91234-5678",
                "website": "https://padaria.exemplo",
                "formatted_address": "Rua Falsa, 123 - Sao Paulo",
                "url": "https://maps.google.com/?q=padaria+exemplo",
                "rating": 4.2,
                "user_ratings_total": 55,
            },
            "mock_2": {
                "name": "Lanchonete Ficticia",
                "international_phone_number": "+55 21 99876-5432",
                "formatted_phone_number": "(21) 99876-5432",
                "website": "",
                "formatted_address": "Av. Imaginaria, 50 - Rio de Janeiro",
                "url": "https://maps.google.com/?q=lanchonete+ficticia",
                "rating": 3.8,
                "user_ratings_total": 12,
            },
            "mock_3": {
                "name": "Bar Teste",
                "international_phone_number": "+55 31 91234-0000",
                "formatted_phone_number": "(31) 91234-0000",
                "website": "",
                "formatted_address": "Praça Exemplo, 1 - Belo Horizonte",
                "url": "https://maps.google.com/?q=bar+teste",
                "rating": 4.6,
                "user_ratings_total": 200,
            },
            "mock_4": {
                "name": "Academia Mock",
                "international_phone_number": "+55 41 91211-2222",
                "formatted_phone_number": "(41) 91211-2222",
                "website": "https://academia.mock",
                "formatted_address": "Rua do Exemplo, 7 - Curitiba",
                "url": "https://maps.google.com/?q=academia+mock",
                "rating": 4.0,
                "user_ratings_total": 80,
            },
        }
        return demos.get(place_id, {})

    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY não configurada.")

    params = {
        "place_id": place_id,
        "key": api_key,
        "language": "pt-BR",
        "fields": ",".join(
            [
                "name",
                "formatted_phone_number",
                "international_phone_number",
                "website",
                "formatted_address",
                "url",
                "types",
                "rating",
                "user_ratings_total",
            ]
        ),
    }
    resp = requests.get(PLACES_DETAILS_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("result", {})

from __future__ import annotations

import os
from typing import Any

import requests


PLACES_NEW_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_NEW_DETAILS_URL = "https://places.googleapis.com/v1/places"
PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


class GooglePlacesError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def inspect_google_places_runtime() -> dict[str, Any]:
    mock_mode = os.getenv("MOCK_MODE") == "1"
    api_key = os.getenv("GOOGLE_PLACES_API_KEY", "").strip()

    if mock_mode:
        return {
            "service": "webscraping",
            "status": "online",
            "code": "mock_mode",
            "message": "Servico online em MOCK_MODE; resultados sao demonstrativos.",
            "googleApiKeyConfigured": bool(api_key),
            "mockMode": True,
        }

    if not api_key:
        return {
            "service": "webscraping",
            "status": "degraded",
            "code": "missing_google_api_key",
            "message": "GOOGLE_PLACES_API_KEY ausente no ambiente do servico webscraping.",
            "googleApiKeyConfigured": False,
            "mockMode": False,
        }

    return {
        "service": "webscraping",
        "status": "online",
        "code": "ok",
        "message": "Servico webscraping pronto para consultar Google Places.",
        "googleApiKeyConfigured": True,
        "mockMode": False,
    }


def _build_google_api_error(http_status: int, data: dict[str, Any]) -> GooglePlacesError:
    api_status = str(data.get("status") or "").strip().upper()
    error_message = str(data.get("error_message") or "").strip()
    normalized_message = error_message.lower()

    if http_status == 429 or api_status == "OVER_QUERY_LIMIT":
        return GooglePlacesError(
            "google_quota_exceeded",
            "Google Places recusou a consulta por limite de quota.",
        )

    if api_status == "REQUEST_DENIED":
        if "api key" in normalized_message and ("invalid" in normalized_message or "not valid" in normalized_message):
            return GooglePlacesError(
                "google_api_key_invalid",
                "Google Places rejeitou a chave configurada; valide a credencial master.",
            )
        if (
            "referer" in normalized_message
            or "ip" in normalized_message
            or "restriction" in normalized_message
            or "authorized" in normalized_message
        ):
            return GooglePlacesError(
                "google_api_key_restricted",
                "Google Places bloqueou a chave por restricao de IP, referrer ou API.",
            )
        if "billing" in normalized_message:
            return GooglePlacesError(
                "google_billing_required",
                "Google Places exige billing ativo para atender esta consulta.",
            )
        if "not enabled" in normalized_message or "not authorized to use this api" in normalized_message:
            return GooglePlacesError(
                "google_api_not_enabled",
                "Google Places API nao esta habilitada para a credencial configurada.",
            )
        return GooglePlacesError(
            "google_request_denied",
            error_message or "Google Places recusou a consulta atual.",
        )

    if api_status == "INVALID_REQUEST":
        return GooglePlacesError(
            "google_invalid_request",
            "Google Places recusou a consulta por parametros invalidos.",
        )

    return GooglePlacesError(
        "google_upstream_error",
        error_message or f"Google Places retornou status {api_status or 'desconhecido'}.",
    )


def _parse_google_response(resp: requests.Response) -> dict[str, Any]:
    resp.raise_for_status()
    data = resp.json()
    api_status = str(data.get("status") or "OK").strip().upper()
    if api_status not in {"OK", "ZERO_RESULTS"}:
        raise _build_google_api_error(resp.status_code, data)
    return data


def _build_new_places_headers(api_key: str, field_mask: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": field_mask,
    }


def _parse_new_places_response(resp: requests.Response) -> dict[str, Any]:
    data = resp.json()
    if resp.ok:
        return data

    error_data = data.get("error") if isinstance(data, dict) else {}
    message = str((error_data or {}).get("message") or "").strip()
    status = str((error_data or {}).get("status") or "").strip().upper()
    legacy_like = {
        "status": "REQUEST_DENIED" if status in {"PERMISSION_DENIED", "FAILED_PRECONDITION"} else status,
        "error_message": message,
    }
    raise _build_google_api_error(resp.status_code, legacy_like)


def _normalize_new_search_result(place: dict[str, Any]) -> dict[str, Any]:
    return {
        "place_id": str(place.get("id") or "").strip(),
        "name": str(((place.get("displayName") or {}).get("text") or "")).strip(),
    }


def _normalize_new_place_details(place: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": str(((place.get("displayName") or {}).get("text") or "")).strip(),
        "international_phone_number": str(place.get("internationalPhoneNumber") or "").strip(),
        "formatted_phone_number": str(place.get("nationalPhoneNumber") or "").strip(),
        "website": str(place.get("websiteUri") or "").strip(),
        "formatted_address": str(place.get("formattedAddress") or "").strip(),
        "url": str(place.get("googleMapsUri") or "").strip(),
        "types": place.get("types") or [],
        "rating": place.get("rating"),
        "user_ratings_total": place.get("userRatingCount"),
    }


def _search_places_new_api(query: str, limit: int, api_key: str) -> list[dict[str, Any]]:
    headers = _build_new_places_headers(api_key, "places.id,places.displayName")
    payload = {
        "textQuery": query,
        "languageCode": "pt-BR",
        "pageSize": max(1, min(int(limit), 20)),
    }
    resp = requests.post(PLACES_NEW_TEXT_SEARCH_URL, headers=headers, json=payload, timeout=30)
    data = _parse_new_places_response(resp)
    places = data.get("places") or []
    return [_normalize_new_search_result(place) for place in places][:limit]


def _get_place_details_new_api(place_id: str, api_key: str) -> dict[str, Any]:
    headers = _build_new_places_headers(
        api_key,
        ",".join(
            [
                "id",
                "displayName",
                "nationalPhoneNumber",
                "internationalPhoneNumber",
                "websiteUri",
                "formattedAddress",
                "googleMapsUri",
                "types",
                "rating",
                "userRatingCount",
            ]
        ),
    )
    resp = requests.get(
        f"{PLACES_NEW_DETAILS_URL}/{place_id}",
        headers=headers,
        params={"languageCode": "pt-BR"},
        timeout=30,
    )
    data = _parse_new_places_response(resp)
    return _normalize_new_place_details(data)


def get_api_key() -> str:
    runtime = inspect_google_places_runtime()
    if runtime["mockMode"]:
        return "MOCK"
    if not runtime["googleApiKeyConfigured"]:
        raise GooglePlacesError(runtime["code"], runtime["message"])
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

    try:
        return _search_places_new_api(query=query, limit=limit, api_key=api_key)
    except GooglePlacesError as error:
        if error.code not in {"google_api_not_enabled", "google_request_denied", "google_upstream_error"}:
            raise

    params = {"query": query, "key": api_key, "language": "pt-BR"}
    resp = requests.get(PLACES_TEXT_SEARCH_URL, params=params, timeout=30)
    data = _parse_google_response(resp)

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

    try:
        return _get_place_details_new_api(place_id=place_id, api_key=api_key)
    except GooglePlacesError as error:
        if error.code not in {"google_api_not_enabled", "google_request_denied", "google_upstream_error"}:
            raise

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
    data = _parse_google_response(resp)
    return data.get("result", {})

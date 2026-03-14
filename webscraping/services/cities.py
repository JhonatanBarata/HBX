from __future__ import annotations

from functools import lru_cache

import os
import requests


IBGE_CITIES_URL = (
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome"
)


@lru_cache(maxsize=1)
def load_brazilian_cities() -> list[str]:
    if os.getenv("MOCK_MODE") == "1":
        return [
            "São Paulo - SP",
            "Rio de Janeiro - RJ",
            "Belo Horizonte - MG",
            "Curitiba - PR",
        ]

    resp = requests.get(IBGE_CITIES_URL, timeout=30)
    resp.raise_for_status()
    try:
        cities = resp.json()
    except ValueError:
        raise RuntimeError("Resposta não é JSON válida do IBGE")

    if not isinstance(cities, list):
        raise RuntimeError(f"Resposta inesperada do IBGE (esperado lista): {type(cities).__name__}")

    names: list[str] = []
    for city in cities:
        if not isinstance(city, dict):
            continue
        city_name = city.get("nome", "")
        micror = city.get("microrregiao") or {}
        mesor = micror.get("mesorregiao") or {}
        uf = (mesor.get("UF") or {}).get("sigla", "")
        if city_name and uf:
            names.append(f"{city_name} - {uf}")
    return names

import time

from app.services import discovery
from app.services.discovery import build_queries, search_discovery_rows

# Backends de TEXTO que o ddgs 9.14 realmente conhece (conferido em runtime:
# ddgs.engines.ENGINES["text"].keys()). "bing" nunca esteve nessa lista — era o furo B1.
BACKENDS_VALIDOS_DO_DDGS = {
    "brave",
    "duckduckgo",
    "google",
    "grokipedia",
    "mojeek",
    "startpage",
    "wikipedia",
    "yahoo",
    "yandex",
}


def _provedor_proibido(*args, **kwargs):
    # Guarda do lote: provedor chamado fora da ordem mata o teste na hora. O furo de 17/08
    # era exatamente o ddgs responder ANTES do Bing e suprimir o scraper com lixo.
    raise AssertionError("provedor chamado fora da ordem searxng -> Bing")


def _linha(url: str) -> dict[str, str]:
    return {"href": url, "url": url, "title": "t", "body": "", "snippet": ""}


def test_descoberta_pula_o_ddgs_e_vai_direto_ao_bing(monkeypatch) -> None:
    monkeypatch.delenv("HBX_SEARXNG_URL", raising=False)
    monkeypatch.delenv("HBX_DISCOVERY_DDGS_ENABLED", raising=False)
    monkeypatch.setattr(discovery, "search_ddgs_rows", _provedor_proibido)
    monkeypatch.setattr(discovery, "search_bing_rows", lambda *a, **k: [_linha("https://valinagua.com.br")])

    rows = search_discovery_rows("distribuidora de agua", time.monotonic() + 5)

    assert [row["url"] for row in rows] == ["https://valinagua.com.br"]


def test_searxng_continua_na_frente_quando_a_env_existe(monkeypatch) -> None:
    monkeypatch.setattr(discovery, "search_searxng_rows", lambda *a, **k: [_linha("https://searx.local/1")])
    monkeypatch.setattr(discovery, "search_ddgs_rows", _provedor_proibido)
    monkeypatch.setattr(discovery, "search_bing_rows", _provedor_proibido)

    rows = search_discovery_rows("distribuidora de agua", time.monotonic() + 5)

    assert rows[0]["url"] == "https://searx.local/1"


def test_ddgs_volta_so_com_env_explicita(monkeypatch) -> None:
    monkeypatch.delenv("HBX_SEARXNG_URL", raising=False)
    monkeypatch.setenv("HBX_DISCOVERY_DDGS_ENABLED", "1")
    monkeypatch.setattr(discovery, "search_ddgs_rows", lambda *a, **k: [_linha("https://ddgs.local/1")])
    monkeypatch.setattr(discovery, "search_bing_rows", _provedor_proibido)

    rows = search_discovery_rows("distribuidora de agua", time.monotonic() + 5)

    assert rows[0]["url"] == "https://ddgs.local/1"


def test_ddgs_desligado_com_a_env_em_false(monkeypatch) -> None:
    # Valor versionado no docker-compose.hostinger.yml e "false" — tem que continuar DESLIGADO.
    monkeypatch.delenv("HBX_SEARXNG_URL", raising=False)
    monkeypatch.setenv("HBX_DISCOVERY_DDGS_ENABLED", "false")
    monkeypatch.setattr(discovery, "search_ddgs_rows", _provedor_proibido)
    monkeypatch.setattr(discovery, "search_bing_rows", lambda *a, **k: [_linha("https://bing.local/1")])

    rows = search_discovery_rows("distribuidora de agua", time.monotonic() + 5)

    assert rows[0]["url"] == "https://bing.local/1"


def test_backend_do_ddgs_e_valido_e_sem_enciclopedia() -> None:
    partes = [parte.strip() for parte in discovery.DISCOVERY_QUERY_BACKEND.split(",") if parte.strip()]

    assert partes
    assert all(parte in BACKENDS_VALIDOS_DO_DDGS for parte in partes)
    # wikipedia/grokipedia eram o lixo promovido pelo rodizio "auto"; 'brave' esta na geladeira.
    assert not ({"wikipedia", "grokipedia", "brave"} & set(partes))


def test_query_pj_poe_a_cidade_entre_aspas_na_frente() -> None:
    queries = build_queries("distribuidora de agua", "Valinhos", "SP")

    # Forma PROVADA no experimento de 17/08 (10/10 resultados locais) tem que ser a PRIMEIRA:
    # HBX_PJ_DISCOVERY_MAX_QUERIES corta a lista em 4.
    assert queries[0] == '"Valinhos" SP distribuidora de agua telefone'
    assert all('"Valinhos"' in query for query in queries)
    assert any("site oficial" in query for query in queries)


def test_query_pf_nao_ganha_aspas() -> None:
    queries = build_queries("plano de saude", "Americana", "SP", "pf")

    assert '"' not in " ".join(queries)
    assert queries[0] == "consultor plano de saude Americana SP telefone"


def test_query_agenda_pf_nao_ganha_aspas() -> None:
    queries = build_queries("", "Americana", "SP", "agenda_pf")

    assert '"' not in " ".join(queries)
    assert queries[0] == "Americana SP telefone"


def test_query_pj_sem_cidade_nao_gera_aspas_vazias() -> None:
    # `if location:` passa com SO o estado preenchido — sem o guarda sairia um token `""` solto.
    queries = build_queries("distribuidora de agua", "", "SP")

    assert queries
    assert all('"' not in query for query in queries)

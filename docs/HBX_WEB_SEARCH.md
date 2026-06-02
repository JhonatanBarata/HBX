# HBX Web Search

Busca web interna para enriquecimento gradual. A primeira versao roda no `hbx-scraping-engine`, usa cache por query normalizada e e exposta pelo backend autenticado.

## Endpoint backend

`POST /webscraping/web-search`

```json
{
  "query": "Schio imoveis Rio Claro SP",
  "limit": 5,
  "fresh": false
}
```

Resposta:

```json
{
  "query": "Schio imoveis Rio Claro SP",
  "count": 5,
  "cached": true,
  "results": [
    {
      "title": "Schio Imoveis",
      "url": "https://schioimoveis.com.br/",
      "snippet": "",
      "rank": 1,
      "source": "duckduckgo",
      "fetchedAt": "2026-06-01T20:00:00+00:00"
    }
  ],
  "errors": [],
  "stats": {
    "cacheKey": "schio imoveis rio claro sp"
  }
}
```

## Endpoint interno do engine

`POST {HBX_SCRAPING_ENGINE_URL}/web-search`

O backend chama esse endpoint com timeout controlado. A rota do backend continua protegida pelos guards atuais do modulo `webscraping`.

## Envs

```env
HBX_WEB_SEARCH_MAX_RESULTS=10
HBX_WEB_SEARCH_CACHE_TTL_HOURS=72
HBX_WEB_SEARCH_TIMEOUT_SECONDS=30
HBX_WEB_SEARCH_CONCURRENCY=1
HBX_GOOGLE_HTML_ENABLED=false
```

`HBX_GOOGLE_HTML_ENABLED` fica desligado por padrao. Quando ligado, tenta HTML publico do Google como mais uma fonte, sem API paga; se bloquear, o provider falha isolado e os outros continuam.

## Chaves pagas opcionais

Essas chaves nao sao obrigatorias para a busca aberta atual. Elas ficam prontas para o ProviderRouter usar quando `allowPaid=true` ou `allowPremium=true`.

```env
BRAVE_SEARCH_API_KEY=
SERPER_API_KEY=
SCRAPINGDOG_API_KEY=
TAVILY_API_KEY=
EXA_API_KEY=
FIRECRAWL_API_KEY=
SERPAPI_KEY=
```

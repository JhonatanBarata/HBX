# HBX Scraping Engine

Motor Python isolado para pesquisas reais de contatos públicos via scraping HTTP + HTML. Ele não usa Google Places API, não altera o backend NestJS, não altera o frontend e não grava no banco principal do HBX.

## Contrato

Cada resultado válido retorna obrigatoriamente:

- `name`
- `phone`
- `phoneDigits`

Campos opcionais retornam `null` quando não forem encontrados:

- `rating`
- `reviews`
- `address`
- `website`
- `score`
- `source`

Campos removidos do contrato não são emitidos:

- `probableWhatsApp`
- `googleMapsUrl`
- `cpf`
- `cnpj`
- `document`
- `CNAE`

## Instalação no Windows PowerShell

```powershell
cd hbx-scraping-engine
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Opcionalmente copie `.env.example` para `.env` e ajuste:

```env
HBX_SCRAPING_USER_AGENT="HBX-Scraping/0.1 contato@hbxsystem.com.br"
HBX_SCRAPING_TIMEOUT_SECONDS=10
HBX_SCRAPING_CONCURRENCY=5
HBX_SCRAPING_CACHE_TTL_HOURS=24
HBX_SCRAPING_MAX_DISCOVERY_RESULTS=120
```

## Testar CLI

```powershell
python -m app.cli --city "Americana" --state "SP" --segment "oficina mecanica" --limit 10 --fresh
```

Use `--target-type pj` para empresas locais ou `--target-type pf` para garimpo de nome + telefone de pessoa física, sem CPF/documento:

```powershell
python -m app.cli --city "Americana" --state "SP" --segment "oficina mecanica" --target-type pj --limit 10 --fresh
python -m app.cli --city "Americana" --state "SP" --segment "plano de saúde" --target-type pf --limit 50 --fresh
```

O CLI imprime JSON formatado:

```json
{
  "engine": "hbx_scraping",
  "query": {
    "city": "Americana",
    "state": "SP",
    "segment": "oficina mecanica",
    "targetType": "pj",
    "limit": 10
  },
  "count": 0,
  "results": []
}
```

## Subir API

```powershell
uvicorn app.main:app --reload --port 8001
```

## Testar health

```powershell
curl http://localhost:8001/health
```

Resposta:

```json
{
  "ok": true,
  "engine": "hbx_scraping",
  "status": "online"
}
```

## Testar search no PowerShell

```powershell
curl -X POST http://localhost:8001/search `
  -H "Content-Type: application/json" `
  -d "{\"city\":\"Americana\",\"state\":\"SP\",\"segment\":\"oficina mecanica\",\"targetType\":\"pj\",\"limit\":10,\"fresh\":true}"
```

## Cache local

O motor cria um SQLite local em:

```text
hbx-scraping-engine/data/hbx_scraping.sqlite
```

Tabelas:

- `search_runs`
- `contacts`

Quando `fresh=false`, o motor pode reutilizar uma pesquisa recente com mesma `city`, `state`, `segment`, `targetType` e `limit`. Quando `fresh=true`, ele faz nova descoberta e scraping.

## Como funciona

1. Monta queries reais com `segment`, `city` e `state`.
2. Usa `ddgs` para descobrir URLs públicas.
3. Filtra Google, Maps, vídeo, login, PDF, imagens e duplicados.
4. Baixa HTML com `httpx.AsyncClient`, timeout curto, poucos retries e concorrência limitada.
5. Extrai dados de JSON-LD schema.org, meta/title/h1, links `tel:`, links WhatsApp e telefones visíveis.
6. Normaliza telefones brasileiros para `phoneDigits` com DDD, sem `+55`.
7. Remove contatos sem `name`, `phone` e `phoneDigits`.
8. Deduplica por `phoneDigits`, calcula `score` e ordena por score desc.

Sites que bloqueiam scraping, exigem login, captcha, Cloudflare ou proteção antibot são ignorados.

## Testes

```powershell
pytest
```

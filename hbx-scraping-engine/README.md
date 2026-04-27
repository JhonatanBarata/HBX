# HBX Scraping Engine

Motor próprio de prospecção para o HBX, separado do motor oficial Webscraping/Google.

Objetivo desta primeira versão:

- Rodar 100% em localhost.
- Permitir testar pesquisas pelo terminal.
- Expor uma API HTTP simples para o backend HBX chamar depois.
- Retornar apenas campos aproveitáveis pelo fluxo de vendas.
- Não depender do Google Places.

## Campos retornados

```json
{
  "name": "Nome da empresa",
  "phone": "(19) 99999-9999",
  "phoneDigits": "5519999999999",
  "rating": null,
  "reviews": null,
  "address": "Endereço quando encontrado",
  "website": "https://site.com.br",
  "email": "contato@site.com.br",
  "source": "hbx_scraping:web",
  "score": 70
}
```

Campos removidos nesta versão:

- `probableWhatsApp`
- `googleMapsUrl`
- `cnae`

## Instalação local

```bash
cd hbx-scraping-engine
python -m venv .venv
```

Windows PowerShell:

```bash
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Linux/macOS:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

## Testar pelo prompt

```bash
python -m app.cli search --segment "oficina mecanica" --city "Americana" --state SP --limit 10
```

Outro exemplo:

```bash
python -m app.cli search --segment "ar condicionado automotivo" --city "Campinas" --state SP --limit 10
```

## Rodar API local

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Healthcheck:

```bash
curl http://localhost:8001/health
```

Pesquisa:

```bash
curl -X POST http://localhost:8001/search ^
  -H "Content-Type: application/json" ^
  -d "{\"segment\":\"oficina mecanica\",\"city\":\"Americana\",\"state\":\"SP\",\"limit\":10}"
```

No Linux/macOS:

```bash
curl -X POST http://localhost:8001/search \
  -H "Content-Type: application/json" \
  -d '{"segment":"oficina mecanica","city":"Americana","state":"SP","limit":10}'
```

## Como funciona agora

1. Gera buscas com segmento + cidade.
2. Consulta páginas públicas via busca web.
3. Entra nos sites encontrados.
4. Procura telefone, e-mail, site, endereço simples e nome.
5. Remove duplicados por `phoneDigits`.
6. Retorna até `limit`, máximo 50.

Esta versão é propositalmente simples para validar o motor separado antes de mexer no frontend do HBX.

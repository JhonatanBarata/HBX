# Regras — MOTOR (Radar, scraping e enriquecimento)

> Leia este arquivo antes de tocar no Radar (`backend/src/webscraping/radar/`),
> no motor Python (`hbx-scraping-engine/`), no legado (`webscraping/`)
> ou no Local Lab (`hbx-local-lab/`).

## Regra de ouro

**Histórico negativo do Radar nunca é apagado.** Resultado negativo protege o sistema
de retrabalho e é parte da memória de leads.

## Fases do Radar (separação rígida — `backend/src/webscraping/radar/`)

| Fase | Entra | Sai | PROIBIDO aqui |
|---|---|---|---|
| `01-search` | pedido de busca | lista bruta de candidatos | matching social, score, entrega p/ Vendas, presenter |
| `02-filter` | candidato bruto (busca ou banco) | aprovado / rejeitado / p/ enriquecimento | chamada a provider, lookup social, importação p/ Vendas |
| `03-enrichment` | lead aprovado | lead com sinais, qualidade, payload enriquecido | queries sociais específicas, entrega p/ Vendas, polling |

Providers (`radar/providers/`):
- `google-search`: request normalizado → resultado bruto mapeável. Sem score/Vendas/social.
- `hbx-engine`: request normalizado → lote bruto + métricas. Sem filtro final/polling/social.

## Motor Python (`hbx-scraping-engine/`)

- Isolado: não usa Google Places API, não altera backend/frontend, não grava no banco HBX.
- Contrato de resultado — obrigatórios: `name`, `phone`, `phoneDigits`.
  Opcionais retornam `null`: `rating`, `reviews`, `address`, `website`, `score`, `source`.
  Removidos (NUNCA emitir): `probableWhatsApp`, `googleMapsUrl`, `cpf`, `cnpj`, `document`, `CNAE`.
- CLI: `python -m app.cli --city "X" --state "SP" --segment "y" --limit 10 --fresh`
  com `--target-type pj | pf | agenda_pf`.

## Legado e laboratório

- `webscraping/`: app Streamlit legado (Google Places API ou `MOCK_MODE=1`). Não evoluir.
- `hbx-local-lab/`: serviço local experimental de descoberta de e-mails
  (`127.0.0.1:3098`, jobs via `POST /local-lab/jobs`, export JSONL).
  Importação oficial para a VPS só via `/webscraping/lead-harvest/import` (orquestrada
  pelo Ops Control — ver docs/Rules/INFRA.md).

## Frota de motores

- Local: `npm run engines:up` (default 3, `-- -Count N`) / `npm run engines:down`.
  A frota `hbx-engine-*` fica FORA do `npm run up` padrão.
- Produção: capacidade elástica declarada no publish (default 20, warm 3);
  o governor do backend (`HBX_ENGINE_GOVERNOR_ENABLED=true` na VPS) decide quantos
  vivem conforme fila, janela noturna e pressão de memória.

## Cards do Radar (frontend) — regras absolutas

- Não alterar hero, rotas públicas, payload antigo, `importedCount` nem regra comercial.
- Campos novos do card são sempre OPCIONAIS; card antigo sem eles continua renderizando.
- Social pendente/erro NUNCA aparece como erro do card (badge discreto).
- Delivery e social são status separados.
- `whatsappStatus=confirmed` só vem do Webwhats ou dado já confirmado; crawl de site
  sugere no máximo `probable`/`unverified` — nunca promove sozinho para `confirmed`.
- Fallbacks: sem `qualityScore` → usar `score`/`commercialScore` ou ocultar gauge;
  sem `opportunityReason` → ocultar painel; sem `recommendedChannel` → inferir por
  prioridade WhatsApp confirmado > Instagram > telefone > e-mail > site.
- Assets e tokens visuais: `docs/ICONES/CARDS/` (sprite SVG + design tokens JSON +
  referências light/dark). Manter os symbol IDs `hbx-icon-*`.
- Card só nasce de empresa/oportunidade real — nunca de fonte genérica.

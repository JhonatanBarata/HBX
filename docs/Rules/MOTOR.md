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
  **CAPTURA tudo que for localizado** (`ContactResult` é `extra="allow"`): `cnpj`, `cnae`,
  `razaoSocial` e quaisquer outros sinais públicos NÃO são descartados — dado de graça não se
  joga fora (decisão do dono 25/06). **Exibir é decisão de quem consome**: o SaaS do cliente
  NÃO expõe dado pessoal sensível por padrão; o cockpit Owner mostra CNPJ. (Antes a regra
  proibia emitir cnpj/cpf/document/CNAE — revogada; captura ≠ exposição.)
- CLI: `python -m app.cli --city "X" --state "SP" --segment "y" --limit 10 --fresh`
  com `--target-type pj | pf | agenda_pf`.

## Organograma do enriquecimento (L0→L5 · grátis primeiro · captura TUDO · cadeado por plano)

Regra do dono: enriquecer = rodar TUDO que é de graça e **ACUMULAR**; só PARA de subir quando já tem
o alvo; só paga pro que o grátis comprovadamente não alcança. Nunca descarta ouro (CNPJ). Sem forçar
rede social. O **PLANO decide o que o usuário VÊ** (cadeado), não o que se enche. Um botão = um pipeline.

| Camada | O que faz | Onde mora (backend) | Estado |
|---|---|---|---|
| L0 · busca | capta tudo no crawl (nome/tel + CNPJ/CNAE/razão do rodapé) | motor Python `01-search` | no ar |
| L1 · parse | DDD/região · provável-WhatsApp · dor (do segmento) | `03-enrichment/radar-public-data` + `lead-signals.util` | no ar |
| L2 · crawl do site | abre o site → email · IG · FB · CNPJ rodapé · razão | `03-enrichment/radar-web-enrichment` | no ar |
| L3 · descoberta | acha SITE e CNPJ por nome+cidade p/ quem só tem telefone | `radar-web-enrichment.searchWeb` | **Brave (grátis)** |
| L4 · cofre CNPJ | CNPJ → razão/CNAE/**sócio**/endereço/situação (dataset local + BrasilAPI/qsa) | `03-enrichment/radar-cnpj-l4-enrichment` | no ar |
| L5 · whatsapp-check | número tem WhatsApp? (motor interno) | `applyRadarWhatsappCheck` (05-delivery) | no ar · **risco ban → NÃO mexer na reconexão** |
| 🔒 gate | `canSeeLeadIntelligence = tier !== 'list'`; card borra+cadeado p/ List | `commercial-plans` + `DetalhesNegocio` | no ar |

**L3 = Brave Search API (grátis, IP-safe).** Substitui o scrape de Bing/DuckDuckGo (risco de bloqueio
de IP). `BRAVE_SEARCH_API_KEY` no `.env` do **backend** — sem chave, cai no Bing/DDG. **Nunca reservar
API paga** (decisão do dono 25/06): Brave cobre o L3. Pago (P1 dados pessoais do sócio / P2 social
premium) só pro **ALÉM** e só quando ligado por env (`HBX_ENRICH_ALLOW_PAID/PREMIUM`, default off).

**Controle = HBX Owner** (o master saiu do controle do motor, 25/06): backfill da cadeia inteira pelo
cockpit → owner agent (`/owner/ops/cnpj-backfill`) → ops-control (`/api/opscontrol/cnpj-backfill`) →
backend (`/modules/owner/radar/cnpj-backfill`). O backfill roda L1→L4 grátis (NÃO inclui L5 no lote).

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

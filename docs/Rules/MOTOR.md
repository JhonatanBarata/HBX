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

## Pipeline canônico: localizar mascarado, debitar, revelar e enriquecer

Todo lead operacional passa pelas duas fontes canônicas: **RFB e motor HBX**. Isso significa tentativa
e telemetria das duas fontes, sem falsificar a origem que realmente descobriu o lead.

Na pesquisa, o sistema apenas localiza, cruza, deduplica e qualifica o candidato o suficiente para a
vitrine. Contatos permanecem omitidos/mascarados no payload público. Não existe pré-enriquecimento
adicional para montar estoque.

Ao puxar o lead, a ordem é rígida:

1. validar tenant, RBAC, módulo, saldo e idempotência;
2. debitar 1 crédito;
3. reivindicar o lead;
4. hidratar RFB (telefone 1, telefone 2, e-mail cadastral, QSA e dados oficiais);
5. revelar o contato base;
6. rodar o motor e acumular o que for localizado (até 3 telefones e 3 e-mails na projeção);
7. transferir para Vendas;
8. concluir, ou desfazer reivindicação e reembolsar em falha pós-débito.

| Etapa pós-débito | O que faz | Onde mora |
|---|---|---|
| RFB | telefone 1/2, e-mail cadastral, CNPJ/CNAE/QSA/endereço/situação | `cnpj-public` + `radar-cnpj-l4-enrichment` |
| Crawl do site | site, e-mails, telefones, IG/FB e sinais públicos | `radar-web-enrichment` / `website-crawl` |
| Busca permitida | descobre presença oficial e evidências | Google e Brave |
| WhatsApp | verifica cada número individualmente | `applyRadarWhatsappCheck` (risco ban: não mexer na reconexão) |
| Persistência | deduplica e ordena contatos com origem | `LeadContact` |

**Provedores pagos permitidos: somente Google e Brave.** Serper, ScrapingDog, Tavily, Exa,
Firecrawl, SerpApi e fallback pago de e-mail não podem existir em código, configuração ou painel.
Cache local, base HBX, motor próprio e fontes gratuitas podem permanecer. Não há `allowPaid`,
`allowPremium`, tier ou plano controlando enriquecimento. O governor físico de Google/Brave é
global, fail-closed e igual para todos.

### Night Factory local

A Night Factory não é um worker do backend. O único executor fica no HBX Owner, ligado em
`127.0.0.1:3107`, e só inicia por ação manual com orçamento. Ela não inicia no boot, não tem cron,
não possui rota de execução no VPS e para quando o Owner/PC desliga. O crawl sai do Local Lab/IP
residencial; o VPS apenas fornece e recebe registros. A seleção é limitada a leads com
`ownerCompanyId`, isto é, já puxados após débito — nunca pré-enriquece a vitrine.

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

- Não alterar hero ou rotas públicas sem necessidade do fluxo aprovado.
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
- Antes do débito, nenhum telefone/e-mail pode existir no payload público, inclusive arrays,
  `people`, `ownerPhone` e metadados estruturados. Depois da compra, telefone sem WhatsApp continua
  visível; o status de WhatsApp controla somente a ação de WhatsApp.
- **Origem do card = DESCOBERTA, não enriquecimento (medidor honesto, 03/07).** `sourceChain`
  (`rfb`/`web`/`rfb+web`) reflete só quem **DESCOBRIU** o lead; quem apenas **ENRIQUECEU** vai no
  campo OPCIONAL `enrichedBy` (lanes) + `enrichmentEngines` (rótulos crus). Enriquecimento **NUNCA**
  vira fusão de descoberta. Lanes rfb/web moram num lugar só: `radar/shared/radar-source-lanes.ts`
  (conhece os rótulos reais do motor Python — `hbx_scraping:free_pj`, `hbx_scraping:*`, `hbx_agenda:*`).
  Engine de corrida (`hbx`/`hbx_mass_data`/`hbx_campaign`) processa, **não descobre** — fica fora do
  `sourceEngines` persistido (segue registrado em `sourceEngine`/`metadataJson.lastSourceEngine`).

# PLANO-FECHAMENTO — terminar a árvore mestra (injetado 02/07/2026 noite)

> Substitui o "Plano de conclusão" do [ARVORE-MESTRA.md](./ARVORE-MESTRA.md).
> **Decisão do dono 02/07:** a fábrica de DESCOBERTA de hoje **morre** — foi construída
> pra um ideal que mudou. A fábrica nova é de **ENRIQUECIMENTO**, sobre a fila S4, rodando LOCAL.
> Desenho da pesquisa na VPS (como está + o que falta): [pesquisa-vps.svg](./pesquisa-vps.svg).

## Estado de partida (pós-publish 02/07 tarde)
No ar: ordem fixa RFB→web, `sourceChain` no card, `HBX_LEGACY_SOURCES` OFF, PARAR corta
brave/ddg/bing, zap-gate porta 8 (default ON) c/ freio físico (cache 168h + 20/min + disjuntor),
fusão c/ chave p/ informais, IA 7b pós-entrega só-aditiva (flag OFF). Faltando: RFB na VPS,
fábrica nova, :3107 como cockpit da árvore, cofre em regime, desmonte do legado.

## Gates do dono
- **G1** — rodar a carga RFB local (P0, 7,3GB, madrugada). Tudo do F1 espera isso.
- **G2** — aprovar o **extrato magro** na VPS. (Não fere "VPS não recebe o dump": a lei era
  sobre o dump CRU de 7,3GB com sócios/emails; o extrato é só coluna de busca.)
- **G3** — ligar `HBX_MISSION_QUEUE_ENABLED` depois da validação local da fila.

## Sprints (1 worker Sonnet por `.md` na pasta do dia; `.md` some ao concluir)

### F0 — Demolição da fábrica antiga (escoteiro; pode rodar JÁ)
Remover fisicamente: modo `night_factory` (planner/strategy), `radar-core-mass-data.mixin`,
`radar-core-campaign-planner.mixin`, `radar-core-factory-admin.mixin`, rotas de campanha
autônoma no backend e botões da fábrica no :3107 (`btn-factory`/`btn-ft-*`); a flag
`HBX_FACTORY_AUTONOMOUS_DISABLED` fica sem função e some junto.
- **NÃO dropar tabelas** (`RadarFactoryCursor`/`RadarFactoryWorkLog` ficam órfãs até faxina
  posterior — histórico não se apaga). `reprocess_*` NÃO é fábrica (vira missão no F2, não deletar).
- Risco real: os mixins do core são entrelaçados — worker mapeia imports/chamadas ANTES de cortar.
- Aceite: nenhum caminho de descoberta autônoma compila; typecheck+testes verdes; VPS se
  comporta igual (autônomo já estava OFF por flag).

### F1 — RFB de verdade na VPS (mata a falha nº1) · depende G1+G2
1. Extrato magro da `CnpjPublicCompany` local: só cnpj, razão, fantasia, cnae, município/UF,
   situação, fone — SEM sócio/email. ~28M linhas ≈ 4-6GB indexado (índice composto município+cnae).
2. Transporte: `pg_dump -Fc` do subset → scp → restore no `hbx-postgres` (tabela nova,
   zero downtime; janela de madrugada).
3. `HBX_RADAR_CNPJ_PUBLIC_ENABLED=true` na VPS (recreate do backend pelo método
   docker inspect→run do INFRA.md — recreate ingênuo perde os `-e` e quebra a frota).
- Aceite: busca de cliente na VPS loga `rfb→web`, card nasce `sourceChain: rfb+web`,
  SELECT cidade+cnae <500ms NA VPS. Refresh mensal = re-gerar extrato após a carga local.

### F2 — Fábrica de ENRIQUECIMENTO (a nova; roda LOCAL via PONTE) · depende F0; ideal após F1
- Missão `enrich_lead` M1-M6: M1 crawl profundo → M2 caça-contato web → M3 sociais →
  M4 pagos (governor, fail-closed, último recurso) → M5 30b extração + **nota ICP 7b**
  (Ollama local — supre a etapa 7 que a VPS não roda) → M6 zap-gate (freio W4 já cobre).
- **Alimentador por DEMANDA**: prioriza cidade×nicho por buscas recentes × coverage fraco ×
  estoque baixo. Nunca varre a base em ordem — CPU local é o ativo escasso.
- PONTE: worker local pulla `/modules/owner/missions/lease` → `complete` devolve
  contatos+nota pro pool da VPS. PARAR pausa fila E contadores.
- Validação local (roteiro do S4) → **G3** → flag ON.
- Aceite: PC ligado drena; estoque cresce com R$ 0; card na VPS ganha nota ICP vinda de
  missão; M4 count ínfimo no gauge.

### F3 — Front :3107 = cockpit da árvore (incremental; começa junto do F1)
Stack real: `hbx-owner/local-agent` — server.js (Node http, token) + web vanilla JS em IIFE
(`app.js`, `tree.js` c/ TREE_CONTRACT.md). **Sem framework novo**; seguir o padrão IIFE + tokens
visuais do próprio :3107.
- **Home nova "Árvore do motor"**: a MESMA grade do desenho, viva — cada caixa mostra número
  real e clique abre o drill-down:
  | Caixa | Número vivo | Fonte |
  |---|---|---|
  | 1 semente | buscas hoje | backend agregador |
  | 2 rfb | linhas do extrato + p95 SELECT | idem |
  | 3 motor web | engines vivos/teto · fila | `/api/overview` (existe) |
  | 4 portas | aceitos × rejeitados hoje (+link p/ log) | agregador |
  | 5 fusão | % cards com 2 fontes | agregador |
  | 6 l1-l4 | fill-rate email/insta/sócio | agregador |
  | 8 zap-gate | passa/bloqueia · cache-hit · disjuntor | `ZapCheckGuard` stats |
  | card | entregues hoje + split sourceChain | agregador |
  | fábrica | lag fila · leased · dead-letter (+redrive) | `/modules/owner/missions/stats` (existe) |
  | cofre | gauges brave/serper/places | governor S3 (existe) |
- **1 endpoint agregador novo** no backend: `/modules/owner/radar/tree-status` (tudo numa
  chamada, cache 10s), proxied pelo server.js — a árvore NÃO faz 12 fetches.
- Ações na árvore: **PARAR TUDO** com estado vivo; redrive dead-letter; toggles de flag via
  `/api/opscontrol/env-set` (existe) com confirmação explícita.
- Cockpit Leads e transferência VPS↔local ficam como estão; botões da fábrica antiga saem no F0.
- Aceite: dono abre o :3107 e responde em 10s "o que rodou, o que travou, quanto gastou,
  quanto tem no estoque" sem abrir log.

### F4 — Cofre em regime + frescor do estoque
- Brave volta 01/08 (ou cap sobe); Serper: recomendação OFF até medir M2 (se caça-contato
  grátis resolve >80%, nem liga); A/B do teto 8 da frota.
- TTL de frescor: **task em background do dono já está avaliando (02/07)** — integrar o
  resultado dela aqui, não duplicar trabalho.
- Aceite: mês fecha com gasto conhecido; nenhum card entregue com validação de zap velha.

### F5 — Desmonte contínuo + L2 (por último)
- Remover FISICAMENTE o legado atrás de `HBX_LEGACY_SOURCES` (google_textual,
  local_directory, vertical_source, radar_database-first) após 1 semana de F1 estável.
- Fix da suíte `webscraping.service.test` que trava no Windows (setInterval não limpo).
- Playwright L2 só se M1 provar falha em % relevante de site JS.
- Meta: 12 → <6 mixins no core.

## Ordem e dependências
F0 já · F1 espera G1+G2 · F2 espera F0 (e rende mais após F1) · F3 incremental desde já ·
F4 tem datas externas (01/08) · F5 por último. Nada aqui liga flag nova na VPS sem gate.

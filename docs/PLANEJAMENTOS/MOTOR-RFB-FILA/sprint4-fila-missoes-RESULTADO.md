# SPRINT 4 — Fila de missões real (MOTOR-RFB-FILA) — RESULTADO 02/07/2026

> Executado por Claude Fable 5 na branch `claude/confident-ramanujan-d836bc` (worktree).
> **Working tree, NÃO publicado.** Tudo aditivo/reversível: flag `HBX_MISSION_QUEUE_ENABLED`
> default **OFF** = comportamento de produção idêntico ao de hoje, byte a byte de fluxo.

## Pré-requisitos (verificados antes de começar; NUANCE descoberta no fim)
- **No código PUBLICADO (minha base):** `FREIO AUTO 1-3` (`radar-core-factory-admin.mixin.ts`),
  gate `RadarFactoryCursor.enabled===true` no pump, freio combo-morto no planner, disjuntor
  mensal Brave (`BraveApiUsage`), teto de orçamento pago (`enrichment-cost`). ✅
- **⚠️ NUANCE (via memória, fim da sessão):** os sprints 1 e 3 COMPLETOS foram executados HOJE em
  branches irmãs NÃO publicadas — Sprint 1 (`factoryEmergencyStopped()` no searchBrave) em
  `claude/cranky-volhard-ae62d6`; Sprint 3 (`SourceBudgetService`+`SourceApiUsage`, clamp frota 8)
  em `claude/keen-bardeen-f17f8a`. **Este sprint 4 não depende deles pra EXISTIR** (flag OFF =
  dormente), mas **ligar a flag em produção só DEPOIS de 1 e 3 aterrissarem**. No merge, atenção a
  `radar-core-mass-data.mixin.ts` (pump) e `hbx-engine-pool.service.ts` (clamp do sprint 3 × lag
  do sprint 4 — compõem por `min()`, semanticamente compatíveis, mas o conflito textual é provável).

## Decisão A/B — dono escolheu **B (fila própria em Prisma)**
Analisado com fato checado: Postgres 15 confirmado; pg-boss atual TEM `touch()`/dead-letter
(não foi esse o motivo). B venceu porque: (1) o consumidor é remoto (pull HTTP) → o controller é
escrito à mão nas duas opções e a maquinaria de worker do pg-boss ficaria sem uso; (2) pg-boss faz
DDL automático no boot — corpo estranho num ambiente de migration à mão + `migrate deploy`;
(3) cockpit lê fila via Prisma; claim otimista + revive de lease já são padrão provado na casa.
O contrato HTTP é idêntico — dá pra trocar o miolo por pg-boss depois sem tocar o nó local.

## O que foi entregue

### 1. Fila de missões (`RadarMission`) — o coração
`backend/src/webscraping/radar/missions/radar-mission-queue.service.ts`
- **Lease com TTL (~2min, `HBX_MISSION_LEASE_TTL_SECONDS`) + heartbeat**: claim otimista
  (`updateMany queued→leased`), `attempts` incrementa NO lease (crash sem `fail()` ainda conta).
- **Retry com backoff exponencial**: 30s·2^(n-1), teto 15min (`nextAttemptAt`).
- **Dead-letter**: `status='dead'` quando tentativas esgotam ou erro não-retryable; redrive via
  endpoint (volta pra fila com tentativas zeradas).
- **Lease vencido volta sozinho**: sweeper de 60s + revive lazy dentro do `lease()`; guarda pelo
  `leaseExpiresAt` lido → heartbeat concorrente nunca é derrubado.
- **Idempotência**: `complete`/`fail` repetidos com o MESMO `leaseId` = ok sem efeito; lease alheio
  = `stale_lease`. Emissão idempotente por `dedupeKey` (vivo não duplica; terminal re-arma).
- **Pausa REAL**: fonte única = `RadarFactoryCursor.enabled` (o interruptor do PARAR TUDO/PAINEL
  ABSOLUTO). Cursor ausente/false ⇒ `lease()` devolve vazio ⇒ **nada drena**, contadores de fonte
  congelados. Gate do sprint 1 no pump continua como cinto.
- **Estágios do pipeline travado** (payload versionado, `payloadVersion=1`):
  `alvo → receita → base_rica → cerebro → validacao_zap → card`. Sprint 4 solda o worker do
  estágio `alvo` (fábrica — onde os bugs moram); os demais estágios já podem ser puxados pelo nó
  local via HTTP quando ganharem produtor.

### 2. Contrato PULL da PONTE
`backend/src/webscraping/radar/missions/radar-missions.controller.ts` — guardas `JwtAuthGuard +
MasterGuard` (mesma cadeia do cnpj-backfill: cockpit → owner agent → ops-control → backend):
```
POST /modules/owner/missions/lease          { workerId, stages?, batchSize?, leaseTtlSeconds? }
POST /modules/owner/missions/:id/heartbeat  { leaseId }
POST /modules/owner/missions/:id/complete   { leaseId, result? }          (idempotente)
POST /modules/owner/missions/:id/fail       { leaseId, error?, retryable? } (idempotente)
GET  /modules/owner/missions/stats
POST /modules/owner/missions/redrive        { stage?, ids? }
```
PC local desligado ⇒ missões acumulam no banco sem loop de CPU (pull puro) e drenam ao religar.

### 3. Plano de cobertura (`RadarCoverage`)
- Migration à mão `20260702150000_add_radar_mission_queue` (2 tabelas novas, aditiva) —
  aplicar com `prisma migrate deploy` (migrate dev quebrado, padrão da casa).
- **Grava** no caminho de SUCESSO do lote (`recordRadarCoverageResult` no mass-data mixin):
  0 aprovado ⇒ `exhausted` + `nextRevisitAt` (+`HBX_RADAR_COVERAGE_REVISIT_DAYS`, default 90d);
  duplicado >50% ⇒ `partial`; senão `fresh`. Erro/timeout NÃO grava (não prova cidade vazia).
- **Lê** no ranqueador autônomo (`rankAutonomousMassDataWorkCandidates`): combo `exhausted`
  não re-emite antes do `nextRevisitAt`; vencido o prazo **REABRE** — inclusive combo `dead` do
  freio clássico (que era permanente). EVOLUI o pool MAJOR_BR_CITIES/segment-major/cityRank
  existente, não recomeça nada.

### 4. Migração da fábrica — por estágio, sem big-bang
Com `HBX_MISSION_QUEUE_ENABLED=true`, o `processMassDataCampaignQueue` despacha via missões
(`processMassDataCampaignViaMissions`): emite missão `alvo` idempotente por tarefa
(`dedupeKey task:{id}`), arrenda **motor primeiro, missão depois** (nunca segura missão sem motor)
e executa pelo MESMO `processMassDataTask` de hoje — tarefa/lote/campanha/painel continuam sendo
escritos ⇒ `WebscrapingCampaign*` segue lendo até o cutover. Heartbeat automático durante o batch.
Resultado da TAREFA decide a missão: `queued` (erro retryable) ⇒ fail+backoff; `failed` ⇒
dead-letter; `completed/exhausted` ⇒ complete. **Busca manual do cliente continua síncrona, fora
da fila** (nada mudou em `radar_pull`/manual).

### 5. Escala da frota pelo LAG da fila (profundidade × idade)
`hbx-engine-pool.service.ts` → `resolveElasticDesiredRunningCount` ganha `missionLag`:
com a fila LIGADA, `automaticTarget = min(automaticAllowed, lagTarget)` onde fila vazia ⇒ 0
(frota fica no warm — **mata a demanda falsa religando motor**), item ≥10min ⇒ pressão total.
O teto por fonte/proteções (sprint 3) vale ACIMA de qualquer escala: o lag só REDUZ, nunca excede.

## Aceite × evidência
| Aceite | Como está coberto |
|---|---|
| Parar ⇒ fila pausada, zero missão drenada | `lease()` lê o cursor do PARAR TUDO e devolve vazio; teste `pausa real` verde. Contadores de fonte só andam quando missão roda. |
| kill -9 com 20 missões no ar ⇒ ~2min re-enfileira | Lease TTL 120s + sweeper 60s + revive lazy; testes `lease vencido volta…` verdes. |
| PC local OFF ⇒ acumula sem loop de CPU, drena ao religar | Pull HTTP puro; backend não itera missão de estágio remoto. |
| Cidade esgotada nunca volta antes do nextRevisitAt | Gate de cobertura no ranqueador; grava só em resultado real. |

## Checks (todos VERDES)
- `prisma generate` 5.22 OK (schema válido com os 2 modelos novos).
- `tsc -p tsconfig.json` (typecheck estrito do backend): **0 erros**.
- `npm run test:mission-queue` (novo script): **15/15**.
- Regressão: `hbx-engine-pool` + `hbx-engine-governor`: **70/70**; `factory-admin.abandon` +
  `master-routes`: **6/6**.
- `package-lock.json`: ruído de 1 linha do npm revertido (diff limpo).

## Arquivos
- **Novos**: `backend/src/webscraping/radar/missions/{radar-mission-queue.service.ts,
  radar-missions.controller.ts, radar-mission-queue.service.test.ts}`,
  `backend/prisma/migrations/20260702150000_add_radar_mission_queue/migration.sql`,
  este doc.
- **Editados**: `schema.prisma` (+2 modelos), `webscraping.module.ts` (registro),
  `radar-core-mass-data.mixin.ts` (dispatch via missões + cobertura),
  `radar-core-campaign-planner.mixin.ts` (gate de cobertura),
  `radar-webscraping-core.service.ts` (`getMissionQueue()` lazy),
  `hbx-engine-pool.service.ts` (escala por lag), `backend/package.json` (script de teste).

## O que NÃO foi feito (e por quê)
- **Validação ao vivo local com a flag LIGADA** (migrate deploy local → `HBX_MISSION_QUEUE_ENABLED=true`
  → `npm run engines:up` → conferir aceite no cockpit): exige subir o stack local
  (`npm run up`), que recriaria os containers que o dono pode estar usando agora — decisão de
  não atropelar o ambiente vivo numa sessão autônoma. Com a flag OFF e sem a migration aplicada,
  **nada muda** (guardas `hasTable` mantêm tudo dormindo). É o próximo passo, em sessão com o dono.
- **Workers dos estágios receita/cérebro/validacao-zap/card**: o contrato pull já os atende;
  produtores/executores entram por estágio nos próximos sprints (migração por estágio, fábrica
  primeiro — como manda o plano).
- **Nada de VPS/publish/Webwhats** tocado.

## Como ligar (quando o dono quiser, local primeiro)
1. `cd backend && npm run prisma:migrate:deploy` (cria `RadarMission`/`RadarCoverage`).
2. `HBX_MISSION_QUEUE_ENABLED=true` no env do backend (reiniciar backend — hasTable é cacheado).
3. `npm run engines:up` e acompanhar `[factoryPump] (missões)` / `[mission-queue]` no log.
4. Aceite manual: PARAR TUDO no cockpit → `GET /modules/owner/missions/stats` deve mostrar
   `paused:true` e nada saindo de `queued`; matar o backend com missões `leased` → em ~2min
   voltam pra `queued`.
Rollback: flag OFF (ou nem aplicar a migration) — rota clássica intacta.

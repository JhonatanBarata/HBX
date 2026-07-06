# RESULTADO CHIP E3 — Visibilidade do CLIENTE (05/07/2026)

**Status: CONCLUÍDO (código + testes). Validação visual NÃO executada ao vivo** — Docker Desktop
não estava rodando neste ambiente e subir `npm run up` (backend em container) ficou fora do escopo
seguro deste chip (custo de tempo + risco de conflitar com o dono trabalhando em paralelo). Backend
validado por typecheck ESTRITO + 185 testes verdes (135 webscraping.service + 37 missions + 13
cnpj-xray/gate); frontend validado por typecheck + `npm run build` + `npm run lint` (check-pele
0 violações) — nenhum erro/warning novo introduzido. Roteiro de validação manual no §5 pro dono
rodar com `npm run up` + Chrome.

## TL;DR

O cliente agora vê a IA trabalhando em **3 lugares** (vitrine de leads, estoque de Vendas — kanban
+ lista densa + lista mobile, e o detalhe do card nos dois módulos), todos lendo o **mesmo**
endpoint novo e leve: `POST /webscraping/radar/ai-status { leadIds: [...] }` → devolve por lead
`queued` (posição aproximada) / `processing` / `done` (com resumo do que chegou) / `none`. Fonte:
`RadarMission` (stages `enrich_lead`/`xray_note` da PONTE, CHIP E1) — **não confundir** com o
`enrichmentStatus` do pipeline genérico (`RadarLeadEnrichment`/night-factory) que a vitrine já
expunha antes; são duas fontes diferentes e os dois selos podem coexistir sem briga visual (o novo
mora no `crownSlot`/badge de card, o antigo no header do detalhe). Flag `HBX_MISSION_QUEUE_ENABLED`
OFF → tudo `none`, nenhuma tela muda (degrade invisível, D1 ainda não ligou a fila em produção).

## 1. O que o cliente VÊ, estado por estado

| Estado | Texto (badge) | Onde aparece | Cor/animação |
|---|---|---|---|
| `queued` (fresco) | "⏳ Na fila da IA — posição N" | vitrine + estoque + detalhe | âmbar, sem pulsar |
| `queued` (stale ≥15min) | "⏳ Na fila — a IA processa fora do horário de pico" | idem | âmbar, sem pulsar |
| `processing` | "✨ IA enriquecendo agora" | idem | âmbar, **pulsando** (reusa a animação `dn-enriching-pulse` do detalhe) |
| `done` | "✓ Enriquecido por IA" + linha 2 "+2 telefones · +1 e-mail · nota da IA" | idem | verde/teal, **fixo** (nunca pulsa, nunca some) |
| `none` | (nada — badge não renderiza) | — | — |

**Honestidade PC-off (anti-spinner-eterno, PLANO §6 E3):** uma missão `queued` sem progredir por
≥15min (`STALE_QUEUE_MS` no backend) troca o texto sozinha — nunca fica girando pra sempre fingindo
progresso. `done` é **permanente**: uma vez que o resumo grava, o polling do card pra de bater
(`useRadarAiStatusPoll` detecta que não sobrou ninguém `queued`/`processing` no lote e cancela o
`setInterval`) e o badge fica ali, verde, estático.

## 2. Onde trocar a copy (o dono ajusta vendo a tela)

Um arquivo só, comentado, sem precisar mexer em componente:

**`frontend/src/lib/radar-ai-status.ts`** → constante `RADAR_AI_STATUS_COPY`:
```ts
export const RADAR_AI_STATUS_COPY = {
  queued: (position: number) => `⏳ Na fila da IA — posição ${position}`,
  queuedStale: "⏳ Na fila — a IA processa fora do horário de pico",
  processing: "✨ IA enriquecendo agora",
  done: "✓ Enriquecido por IA",
  doneSummary: (summary) => "+N telefone(s) · +N e-mail(s) · nota da IA",
};
```
Trocar o texto aqui reflete nos 2 módulos (leads + vendas) e nos 3 formatos de card (grade, kanban,
tabela/lista) automaticamente — nenhuma outra tela tem string solta.

## 3. Arquitetura (o que foi construído)

### 3.1 Backend — endpoint leve de status em lote
- **`backend/src/webscraping/radar/missions/radar-ponte-status.service.ts`** (novo) —
  `RadarPonteStatusService.getStatusForLeads(leadIds)`: 1 `findMany` em `RadarMission` (stages
  `PONTE_MISSION_STAGES` = `enrich_lead`/`xray_note`) casado por `payloadJson.radarLeadId`, nunca
  N+1. Resolve:
  - `queued` → posição ORDINAL entre as missões `queued` da PONTE (aproximada, conforme o plano
    pedia — não é contagem exata de workers).
  - `leased` → `processing` (stage + `startedAt` do heartbeat).
  - `completed` → `done`, com resumo buscado em 2 queries agregadas (não N+1): `LeadContact` filtrado
    por `source: 'ai_extraction'` (conta phone/email) + `RadarLeadPool.metadataJson.aiNote` (nota
    ICP gravada pelo `MissionResultApplyService` do E1).
  - Sem missão nenhuma → `none`.
  - Flag da fila OFF (`RadarPonteStatusService.enabled()` = `isMissionQueueEnabled()`) → `none` pra
    tudo, **sem tocar o banco de missões** (curto-circuito antes do `hasTable`).
- **RBAC** — `getRadarAiStatusForUser(user, leadIds)` (novo método no mixin
  `radar-core-presentation.mixin.ts`, ao lado de `getRadarLeadForUser`): resolve `context.companyId`
  via `resolveContext`, busca os leads em LOTE (`radarLeadPool.findMany({ where: { id: { in } } })`)
  com `ownerCompanyId` + `companyStates`, e filtra pelo MESMO critério de posse que o resto do Radar
  usa (`enrichRadarLeadForUser`/L3): `ownerCompanyId` bate com o tenant OU existe
  `RadarLeadCompanyState` do tenant. Lead de outra empresa **nem aparece** na resposta (não é
  `state:'none'` disfarçado — o `id` simplesmente não está no mapa `items`).
- **Endpoint HTTP:** `POST /webscraping/radar/ai-status` no `WebscrapingController` (guard
  `JwtAuthGuard` + `ModuleAccessGuard` já existentes na classe, mesmo controller do resto do Radar
  do cliente — **não** é rota `modules/owner/*` de Master). DTO `RadarPonteStatusDto { leadIds:
  string[] }`, teto de 200 ids por chamada (`.slice(0, 200)` no service).
- **Registro no core service:** `getRadarPonteStatus()` lazy em `radar-webscraping-core.service.ts`
  (mesmo padrão `new X(this.prisma)` do `getMissionQueue()` já existente — nenhuma mudança no
  `webscraping.module.ts`, pois o serviço nunca é resolvido via DI do Nest, só instanciado sob
  demanda dentro do core service, igual ao vizinho).

### 3.2 Frontend — hook + componente + copy central
- **`frontend/src/lib/radar-ai-status.ts`** (novo) — `useRadarAiStatusPoll(leadIds)`: polling leve
  (6s, `setInterval` simples — **nenhum WebSocket novo**, mesmo espírito do poll de search-runs que
  a vitrine já tinha) por LOTE de leadIds da página atual. Para sozinho quando `leadIds` fica vazio
  OU quando todos os leads do lote já viraram `done`/`none` (nada mais pra observar). Exporta
  `RADAR_AI_STATUS_COPY`, `radarAiStatusLabel()`, `radarAiStatusSummaryLabel()`.
- **`frontend/src/components/hbx/radar-ai-badge.tsx`** (novo) — `<RadarAiBadge status={...} />`:
  componente único usado nas 2 telas, nenhum visual próprio (só a classe central `.radar-ai-badge*`).
- **`frontend/src/app/hbx-theme/kit.css`** — classes `.radar-ai-badge`, `.radar-ai-badge--processing`
  (reusa `@keyframes dn-enriching-pulse` já existente do detalhe), `.radar-ai-badge--done`,
  `.radar-ai-badge__summary`. Zero hex/inline novo (`check-pele.mjs`: 0 violações, catraca não
  subiu — 495/495 igual antes).
- **`frontend/src/app/(app)/leads/page.client.tsx`** — `useRadarAiStatusPoll(items.map(row =>
  row.id))`; badge no card da grade (`be-card`, logo abaixo do badge de origem) e no detalhe
  (`renderLeadDetail` → prop `crownSlot` do `DetalhesNegocio`, ao lado do nome no header — o mobile
  reusa a mesma função, então o card-overlay swipe já ganha o badge de graça).
- **`frontend/src/app/(app)/vendas/page.client.tsx`** — `useRadarAiStatusPoll(flatLeads.map(card =>
  card.id))`; badge nos **3** formatos de visualização do estoque: kanban (`vnd-card`, entre o nome
  e a fileira de termômetro/valor/prazo), lista densa desktop (`tbl`, dentro da célula da empresa),
  lista agrupada mobile (`vnd-row`); e no detalhe (desktop + mobile, via `crownSlot`, `card.id` ==
  `radarLeadId`).

## 4. Testes (todos novos, todos verdes)

- **`backend/src/webscraping/radar/missions/radar-ponte-status.service.test.ts`** (10 testes,
  unitário/isolado com fake prisma): flag OFF → `none`; sem missão → `none`; `queued` com posição
  ordinal; `queued` stale (TTL honestidade); `leased` → `processing`; `completed` → `done` com
  resumo (+telefones/+emails/nota); `done` permanente mesmo sem contato/nota (worker degradou);
  lote de 2 leads resolve em 1 `findMany` (sem N+1 — contado por instrumentação no teste); sem
  tabela `RadarMission` → degrade pra `none` sem lançar; `leadIds` vazio não toca o banco.
- **`backend/src/webscraping/webscraping.service.test.ts`** (+3 testes de RBAC, sufixo `E3`): card
  de OUTRA empresa (`ownerCompanyId` diferente) não aparece no lote da resposta; flag OFF devolve
  `none` pros leads do PRÓPRIO tenant (degrade invisível, não vaza "a fila existe" pra quem não
  devia ver); lista vazia de `leadIds` devolve `items` vazio sem tocar o banco.
- **Resultado agregado:** `npx tsx --test src/webscraping/radar/missions/*.test.ts` → **37/37**
  (10 novos E3 + 27 pré-existentes de E1, todos seguem verdes); `webscraping.service.test.ts` →
  **135/136** passam (1 skip pré-existente, não relacionado); `cnpj-xray.service.test.ts` +
  `lead-contact-gate.test.ts` (suítes tocadas indiretamente) → **13/13**.

## 5. Checks executados

| Check | Resultado |
|---|---|
| `cd backend && npx tsc --noEmit -p tsconfig.json` (estrito) | verde |
| Testes backend (missions + webscraping.service + cnpj-xray/gate) | **185/186** (1 skip pré-existente) |
| `cd frontend && npx tsc --noEmit -p tsconfig.json` | verde |
| `cd frontend && npm run lint` (eslint + check-pele) | 0 erro/warning NOVO — os 76 problemas reportados são todos pré-existentes em arquivos não tocados por este chip ou linhas não tocadas (`loadUsage` missing-dep em leads e `waStartError`/`fecharMsg` unused em vendas já existiam antes) |
| `node frontend/scripts/check-pele.mjs` | `0 violações duras; catraca: 495/495 (meta 0)` — igual antes, nenhum hex/inline novo |
| `cd frontend && npm run build` | verde, 42 rotas geradas, `/leads` e `/vendas` incluídas |
| Validação visual (Chrome, `npm run up`, `.test-login.local.md`) | **NÃO executada** — Docker Desktop parado neste ambiente; roteiro manual abaixo |

### Roteiro de validação manual (pro dono, com `npm run up` + Chrome `localhost:3001`)

1. Login com a conta de `.test-login.local.md`.
2. **Sem a flag ligada** (`HBX_MISSION_QUEUE_ENABLED` ausente/false no `backend/.env`): abrir
   `/leads` e `/vendas` — nenhum badge novo deve aparecer em lugar nenhum (comportamento idêntico a
   hoje). Isso PROVA o degrade invisível.
3. **Com a flag ligada** localmente + fila com missões reais (rodar o xray ou a fábrica de
   enriquecimento sobre um lead de teste, que enfileira `enrich_lead`/`xray_note` — ver
   `RESULTADO-E1.md` §4 pro fluxo local completo com o worker da ponte):
   - Puxar/abrir um lead recém-materializado → esperado ver **"⏳ Na fila da IA — posição N"** no
     card da vitrine (grade) e no header do detalhe (ao lado do nome).
   - Deixar o worker local da ponte processar (ou simular `leased` direto no banco) → o card muda
     pra **"✨ IA enriquecendo agora"** (badge pulsa — reusa a mesma pulsação âmbar do selo do
     detalhe já existente).
   - Missão `completed` → badge vira **"✓ Enriquecido por IA"** verde, com a linha de resumo
     (+telefones/+e-mails/nota) — conferir que o polling PARA depois disso (Network tab: sem mais
     `POST /webscraping/radar/ai-status` pro mesmo lote depois que todos os leads da tela viram
     `done`).
   - Repetir em `/vendas` nos 3 formatos (kanban, alternar pra "Lista densa", e redimensionar pra
     mobile — `preview_resize` ou DevTools) — mesmo badge, mesmo texto.
4. **Honestidade PC-off:** forçar uma missão `queued` com `createdAt` ≥15min atrás (editar direto no
   banco de teste) → o texto deve trocar sozinho pra "processa fora do horário de pico" no próximo
   poll (6s), sem qualquer spinner infinito.
5. Zero scroll / zero hex: conferir visualmente que o badge não estoura o card (grade `be-card`,
   kanban `vnd-card`, linha `tbl`) em 100% zoom, 1366×768.

## 6. Decisões tomadas sozinho (declaradas)

1. **Endpoint no controller do CLIENTE (`WebscrapingController`), não em `modules/owner/*`.** O
   plano pede visibilidade PRO CLIENTE — o `RadarMissionQueueService`/rota `modules/owner/missions`
   é `MasterGuard` (só o dono via :3107/HBX Owner), errada pra esse propósito. Criei
   `POST /webscraping/radar/ai-status` no mesmo controller que já serve `/webscraping/radar/leads`
   pro tenant, com o mesmo par de guards (`JwtAuthGuard` + `ModuleAccessGuard`).
2. **RBAC em LOTE, não reaproveitando `getRadarLeadForUser` linha a linha.** O padrão existente
   busca 1 lead por vez; pra "por lote de leads" (pedido explícito do plano) escrevi o filtro de
   posse (`ownerCompanyId`/`companyStates`) operando sobre um `findMany` único — mesma REGRA de
   `enrichRadarLeadForUser`, sem o custo de N chamadas.
3. **Posição de fila é ORDINAL sobre `queued` da PONTE, não fila-por-tenant.** O plano diz
   "ordinal entre missões pending do tenant basta" — implementei ordinal GLOBAL (entre todas as
   missões `queued` da ponte, de qualquer tenant) porque a fila é short-lived e compartilhada (não
   há isolamento de fila por empresa hoje no `RadarMissionQueueService`); a posição ainda é
   informativa/aproximada como o plano pede, só não filtra por tenant na contagem — decisão
   pragmática pra não inventar um conceito de "fila por tenant" que a fila real não tem.
4. **Resumo de "done" busca 2 queries agregadas, não guarda no `RadarMission.resultJson`.** O
   `MissionResultApplyService` (E1) já grava o resultado real no destino final (`LeadContact` +
   `metadataJson.aiNote`) — reconstruir o resumo lendo essas duas fontes (em vez de parsear
   `resultJson` da missão, que é o BRUTO do 30B antes do gate) garante que o card mostra exatamente
   o que foi GRAVADO (pós-gate anti-alucinação), nunca o que o modelo "achou" antes da validação.
5. **Nenhum `RadarMissionQueueService` novo, nenhuma migration.** Tudo aditivo sobre o schema/fila
   que o E1 já criou — `RadarPonteStatusService` só LÊ `RadarMission`/`LeadContact`/
   `RadarLeadPool.metadataJson`, nunca escreve.
6. **Badge usa `crownSlot` do `DetalhesNegocio`, não uma nova prop.** O componente já reserva esse
   slot pro selo de "enriquecido" genérico (`PLAN-C`, comentário na prop) — encaixa exatamente no
   mesmo lugar visual (header, ao lado do nome) sem herdar a semântica do `enriching`/`enriched`
   (que continuam servindo o pipeline `RadarLeadEnrichment` antigo, sem conflito).
7. **Validação visual não executada ao vivo** (Docker Desktop parado) — compensado com typecheck
   estrito + suíte de testes ampliada (RBAC + lógica de estado) + roteiro manual detalhado (§5) pro
   dono rodar quando subir o ambiente.

## 7. Arquivos

Novos:
- `backend/src/webscraping/radar/missions/radar-ponte-status.service.ts`
- `backend/src/webscraping/radar/missions/radar-ponte-status.service.test.ts` (10 testes)
- `frontend/src/lib/radar-ai-status.ts`
- `frontend/src/components/hbx/radar-ai-badge.tsx`

Tocados:
- `backend/src/webscraping/radar/radar-webscraping-core.service.ts` — `getRadarPonteStatus()` lazy.
- `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts` —
  `getRadarAiStatusForUser(user, leadIds)`.
- `backend/src/webscraping/webscraping.controller.ts` — `RadarPonteStatusDto` +
  `POST /webscraping/radar/ai-status`.
- `backend/src/webscraping/webscraping.service.test.ts` — +3 testes de RBAC (`E3`).
- `frontend/src/app/hbx-theme/kit.css` — `.radar-ai-badge*`.
- `frontend/src/app/(app)/leads/page.client.tsx` — hook + badge (grade + detalhe).
- `frontend/src/app/(app)/vendas/page.client.tsx` — hook + badge (kanban + lista densa + lista
  mobile + detalhe desktop/mobile).

# COCKPIT-MASTER — SPRINT 2: Cache do overview + tail de eventos + faixa de saúde

> Depende do Sprint 1 (tabela `MasterEvent` + `emitMasterEvent`).
> Executor: subagente Sonnet; apagar o .md ao concluir.

## Objetivo ($)
Cortar o custo do endpoint mais pesado do /master (full scan de até 500 empresas + todos
os vendedores a cada 30 s POR ABA) e dar ao dono, no mesmo painel do flywheel, a saúde da
operação que hoje só existe no HBX Owner :3107 — chip caído descoberto em minutos, não
horas.

## Entregas
1. **Cache in-memory no `MasterCockpitService`** (`backend/src/master-cockpit/`):
   - `overview()` guarda o resultado com TTL de 30 s (timestamp + payload em campo
     privado; 1 instância de backend, sem Redis). Requests dentro do TTL devolvem o
     snapshot; o campo `generatedAt` já existente informa a idade ao frontend.
   - Concorrência: se um rebuild está em voo, requests aguardam a MESMA promise
     (single-flight) — não empilhar rebuilds.
2. **Tail de eventos no payload**: bloco novo `events` no overview — últimos 40 de
   `MasterEvent` (`id, type, severity, companyId, companyName, payload, createdAt`),
   nomes resolvidos com os helpers já existentes (`resolveCompanyNames`).
3. **Faixa de saúde v1 (`health` no payload)** — SÓ leitura, best-effort por bloco
   (padrão do service: engole erro → bloco `null`):
   - `whatsapp`: contagem de chips por estado via **motor ao vivo**
     (`WebwhatsBridgeService` → `fetchInstances`; fonte única = motor, NUNCA o banco do
     app — regra dura de docs/Rules/WHATSAPP.md). Cache próprio de 60 s para não
     martelar o motor.
   - `billing`: timestamp do último webhook de pagamento processado (localizar a tabela
     de log de webhook em `backend/src/financeiro/` na execução; se não houver, expor
     `null` e registrar no .md de handoff — vira pré-requisito do Sprint 3).
   - `factory`: timestamp do último `RadarLeadPool.lastSeenAt` (novo lead) — fábrica
     "respirando" ou não.
4. **Frontend `janela-cockpit.tsx`**: faixa de saúde no topo (3 pills: zap, cobrança,
   fábrica — verde/âmbar/vermelho por idade do sinal) + feed passa a renderizar
   `events` quando presente (fallback pro feed atual se vazio). Visual 100% em
   classes/tokens do `hbx-theme` (5 Leis — nada de cor solta).

## Fora de escopo
Alertas/notificação (Sprint 3), digest (Sprint 4), mudanças nos builders atuais do
cockpit (roster/sellers/feed ficam como estão), SSE/websocket.

## Aceite
- `cd backend && npx tsc --noEmit` e lint do frontend verdes (`check-pele.mjs` passa).
- 2 abas do cockpit abertas → 1 rebuild por janela de 30 s (log ou contador em dev).
- Motor desligado em dev → `health.whatsapp = null`, overview continua respondendo.
- Payload antigo continua íntegro (campos existentes inalterados — só adições).

## Guardrails
- `fetchInstances` é LEITURA; jamais chamar connect/logout/delete do motor.
- Teste com o motor local; não encostar em chip real.

## PENDÊNCIAS (execução 02/07/2026 — Sprint 2 IMPLEMENTADO, aceite parcialmente verde)

**Entregue e verificado:**
- Cache TTL 30 s + single-flight no `overview()` (`master-cockpit.service.ts`), bloco `events`
  (últimos 40 MasterEvent c/ nome de empresa), bloco `health` (whatsapp via
  `WebwhatsBridgeService.listMotorInstances()` SÓ-GET novo + cache 60 s; billing =
  `max(FinanceiroCharge.lastWebhookAt)`; factory = `max(RadarLeadPool.lastSeenAt)`),
  faixa de saúde (3 pills) + aba Eventos no `janela-cockpit.tsx` (visual 100% em
  `cockpit-master.css`/tokens). Payload antigo intacto — só adições.
- `cd backend && npx tsc --noEmit` **VERDE**; `npm run test:master-cockpit` **6/6 pass**
  (cache, single-flight, TTL, contagem de chips, motor-off → whatsapp null, payload íntegro);
  `cd frontend && npx tsc --noEmit` **VERDE** (exit 0).

**Pendência 1 — lint do frontend VERMELHO por estado PRÉ-EXISTENTE do HEAD (não é do sprint):**
`npm run lint` reprova antes de chegar nos arquivos deste sprint. `git status` prova que só
`janela-cockpit.tsx` e `cockpit-master.css` foram tocados — e ambos passam (eslint escopado
no tsx = exit 0; check-pele não acusa nenhum dos dois). O vermelho vem de código já commitado:
- eslint (6 errors): `src/app/(app)/atendimento/page.client.tsx:731` (setState em effect),
  `src/components/hbx/bot-prosp-fields.tsx:168` (4× refs during render),
  `src/lib/voice-rubberband.ts:21` (no-assign-module-variable).
- check-pele R1 (14 violações): `hbx-theme/bot-builder.css:163`, `hbx-theme/screens.css:1543/1560/1599`,
  `hbx-theme/whatsapp.css` (10 linhas c/ rgba/hex).
Não corrigi por serem de outras frentes vivas (Bot REBUILD/WhatsApp) — risco de sobrescrever
trabalho paralelo do dono. Decidir: faxina própria ou absorver nas frentes donas dos arquivos.

**Pendência 2 — verificação ao vivo (dono):** 2 abas do cockpit → 1 rebuild por janela de 30 s
(log `overview rebuild #N` em DEBUG do `MasterCockpitService`); motor desligado em dev →
pill do zap "sem leitura do motor" e `health.whatsapp = null` (coberto por unit test, falta o ao-vivo).

**Sem pendência de billing:** fonte localizada — `FinanceiroCharge.lastWebhookAt` (carimbado a
cada webhook MP processado, inclusive assinatura). Banco sem webhook ainda → `lastWebhookAt: null`
(pill âmbar/cinza "sem webhook ainda"), comportamento esperado.

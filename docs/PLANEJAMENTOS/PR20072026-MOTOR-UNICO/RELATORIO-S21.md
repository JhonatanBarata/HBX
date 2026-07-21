# RELATÓRIO S21 — Verde total + revisão adversarial (Fable)

> Revisão FINAL pré-publish da frente MOTOR-ÚNICO (S01→S20), rodada em Fable por ordem do dono
> (20/07). Baseline de rollback: `127b9166`. HEAD revisado: `231a9100` (S20).
> Data: 21/07/2026. **Veredito no fim: GO-COM-RESSALVAS (zero P0; 3 P1 documentados).**

---

## A) VERDE TOTAL — resultado de cada check

| Check | Resultado | Evidência |
|---|---|---|
| `npm run prisma:validate` | ✅ VERDE | "The schema at prisma\schema.prisma is valid" |
| `npm run build` (backend, tsc estrito) | ✅ VERDE | exit 0 |
| `npm run test:automation` | ✅ **95/95 pass, 0 fail** | inclui os 2 juízes S01 (inbound-precedence + assistant-claim) + overview/agent/orchestrator/event-rule/backfill/resolver/plays |
| Suites de domínio (49 arquivos: automation, assistente, messaging, cadencia, bot, inbox, concierge, ai-gateway, hbx-recovery, vendas) | ✅ 626/635 pass — **9 falhas, TODAS PRÉ-EXISTENTES (provado)** | ver tabela abaixo |
| Boot `node dist/main.js` | ✅ DI ok + rotas mapeadas | Todos os módulos inicializaram (inclusive `AutomationModule`); mapeadas `/automation/overview|agent|agent/sandbox|agent/publish|plays|plays/:tipo/:id/toggle|plays/cadencia/:id/aplicar`, `/assistente/copiloto` + `rascunho|resumo|sugestao`, `/bot/activation*`, `/cadencia*`. Listen não completou por `P1001 Can't reach database server at localhost:5432` — **ambiental** (sem Postgres local de pé), não é DI. Rotas legadas `/assistente` (não-copiloto): **ausentes de propósito** (S20). |
| Frontend `rm -rf .next && npm run build` | ✅ VERDE | exit 0 |
| Frontend `npm run lint` (eslint) | ⚠️ 1 error + 20 warnings — **error é PRÉ-EXISTENTE** | `lead-cockpit-modal.tsx:382` (react-hooks/set-state-in-effect); arquivo com diff **VAZIO** desde `127b9166`; config eslint intocada |
| `check-pele` | ⚠️ 28 violações — **TODAS PRÉ-EXISTENTES, ZERO em arquivo da fusão** | todas em `kit.css` (--radar-ai-status-*) + `impersonation-banner.tsx`, ambos com diff vazio desde o baseline (vermelho conhecido da frente impersonação, memória 20/07). Obs.: `npm run lint` é `eslint && check-pele` — o error pré-existente do eslint impede o check-pele de rodar no lint encadeado; rodado standalone aqui. |

### Prova de pré-existência das 9 falhas de teste

Rebuild COMPLETO do backend no commit `127b9166` em diretório isolado (scratchpad, sem branch/
worktree no repo) + `node --test` nos 2 arquivos com falha. Resultado: **os MESMOS 9 testes
falham no baseline, nome a nome** — zero regressão de teste introduzida pela fusão.

- 8× `messaging/webwhats-bridge.service.test.ts` (WEBWHATS_NOT_CONNECTED / null id) — arquivo e service com diff vazio desde o baseline.
- 1× `inbox/inbox.service.test.ts` "Fase B (c): ADMIN company mode inclui conversa só-Meta quando metaActive" — idem.

---

## B) Diff-stat justificado (`127b9166..HEAD` — 119 arquivos, +12.274/−4.101)

### Fora de `automation/`/`automacao/` — justificativa por arquivo

**Frentes PARALELAS do dono (commits `d4eb91c7`, `240e2470` feat/fix logistica + `a9421ed0`/`f7b9e1ad` publish/new) — NÃO são da fusão, atribuição provada por `git log` por arquivo:**
- `EntregaShell/app/**` (app.js, app.css, build.gradle.kts, AndroidManifest.xml, NativeApiClient*.kt) — frente APK entregador do dono.
- `backend/src/nucleo/nucleo-cadastro.service.ts` (+3, campo `document`) — entrou via `a9421ed0` (chore: publish do dono, JÁ em prod).

**Da fusão, com motivo (1 linha cada):**
- `.gitignore` (+1) — des-ignora `migrations-hold/**/*.sql` (senão a migration em hold sumiria do git).
- `backend/package.json` (+1) — script `test:automation`.
- `prisma/schema.prisma` (+32) — SÓ adiciona model `AutomationAgent` (aditivo puro; drift alheio intocado).
- `prisma/migrations/20260721000000_automation_agent/` — CREATE TABLE + UNIQUE INDEX, nada mais (conferido linha a linha).
- `prisma/migrations-hold/pending_drop.../migration.sql` — DDL destrutivo FORA do caminho de deploy, com guarda de paridade que ABORTA (ver P1-2).
- `scripts/automation-agent-backfill.js` / `automation-pre-drop-dump.sh` — backfill idempotente (roda só por script) + dump seletivo pré-drop (nunca `cnpj_public`).
- `src/ai-gateway/ollama-client.ts|prompt-guards.ts` (+tests) — S05B: cliente Ollama ÚNICO (cego ao caller, sem env própria, sem flag nova) + guarda de prompt compartilhada.
- `src/app.module.ts` (+2) — registra `AutomationModule`.
- `src/assistente/*` — S05B (assistente-ollama delega no cliente único, cadeia de env preservada), S10 (runtime lê resolver), S20 (AssistenteController REMOVIDO — zero consumidor vivo provado; AssistenteService FICA, usado pelo AgentService via DI; **CopilotoController preservado e mapeado**).
- `src/bot/intent/ai-intent-classifier.service.ts` — S05B: delega no cliente único (mesma cadeia de env).
- `src/cadencia/*` — S07 (scheduler perde o timer próprio, vira 2 executores registrados no orquestrador — SEM tick duplo, timer antigo removido), S08 (gatilho emite via EventRuleService), S20 (flag nova com fallback).
- `src/concierge/concierge-ollama.ts|concierge-slots.ts` — S05B apenas: delega no cliente único + `wrapUntrustedUserText` compartilhado (mesma tag/limite, saída idêntica coberta por teste). Resto do Concierge intocado. Obs.: `concierge-slots.ts` é tratado como BINÁRIO pelo git (condição pré-existente — já era "Bin" no baseline); diff conferido com `--text`.
- `src/hbx-recovery/hbx-recovery.controller.ts` (+8) / `src/inbox/inbox.controller.ts` (+19) — só COMENTÁRIOS de decisão S20 (mantido/`@deprecated`); zero mudança de comportamento.
- `src/messaging/messaging.service.ts` — S06 (precedência extraída pro `InboundRouterService` — extração LITERAL conferida lado a lado: mesma ordem, mesmos guards, mesmo `void` no `dispatchCadenciaInbound`), S10 (origem do bot-config atrás do resolver, fallback legado), S20 (flag renomeada com fallback).
- `src/vendas/vendas-automation.service.ts` (+30) — SÓ comentário (decisão S07: prospecção fora do orquestrador, tick 15s próprio preservado).
- `src/vendas/vendas.service.ts` (+7) — troca leitura de flag por `automationFlag` (novo nome + fallback), zero mudança de valor com o env atual do VPS.
- Frontend: `shell.tsx`/`app-shell.tsx` (item único "Automação", gate OR de 3 chaves fail-closed — `hasAnyModuleAccess` só libera com `/modules/me` carregado), `so-logistica-gate.tsx` (+/automacao na lista), `vendas/page.client.tsx` (2 linhas: botão aponta pra `/automacao?secao=atendente&cerebro=ia`), `tutorial-coach-steps.ts` (3 passos velhos → 1 passo do hub), redirects `/bot|/automacoes|/assistente → /automacao?secao=…`, telas velhas deletadas (S18/S19), CSS: `automacao.css` novo + demolição `bot-onboarding.css`/enxugada `bot-builder.css` (check-pele ZERO violação nos arquivos da fusão).

**Zero arquivo órfão**: todo arquivo do diff tem dono (fusão ou frente paralela do dono).

### Foco obrigatório — item a item

1. **Precedência inbound (S01 é o juiz)**: `git diff 61760c8a..HEAD -- backend/src/automation/characterization/` = **VAZIO** (os testes nasceram NA S01, que é pós-baseline — o juiz correto é "sem edição desde S01", e está intacto). Passam sem edição (95/95). Obs.: `127b9166..HEAD` mostra +388 porque é a CRIAÇÃO deles na S01, não edição.
2. **Porta única de saída**: grep em `backend/src/automation/` → **zero** `fetch`/axios/webwhats/sendText; o único envio no router novo é via colaborador `conversations.queueOutboundForCompany` (mesmo payload/sourceModule de antes, byte a byte). Nenhum caminho novo escapou.
3. **Claim idempotente + interrupt**: intactos. `prepareReply` mantém a MESMA sequência de guardas (published→botArmedAt→conversation→claim P2002→modelo); `interruptForInbound` continua PRIMEIRO, awaited, idempotente (router linha 189-199). Cobertos pelos juízes S01.
4. **Gates fail-closed**: `/automation/*` = `JwtAuthGuard`+`ModuleAccessGuard`+`@ModuleAccess('atendimento','bot','vendas')` — guard implementa **OR** e nega no fim (fail-closed). `PUT /automation/agent` e `POST /automation/agent/publish` lançam `ForbiddenException` sem ADMIN/USERMASTER/master (`isAdminOrMaster`). Vendedor: GET/sandbox só (regra de produto). Plays: toggle/aplicar delegam o canManage pro service dono (cadência/vendas), sem reimplementar. Sidebar: item só aparece com `/modules/me` carregado + OR das 3 chaves.
5. **Flag `HBX_AUTOMATION_AGENT` default ON × `AutomationAgent` ausente**: **PROVADO no código** — `agent-runtime.resolver.ts:89-92`: `findUnique` com `?.` + `.catch(() => null)`; `if (!agent) return { source: 'legacy' }`. Empresa sem linha (backfill não rodado) OU erro de leitura ⇒ legado byte a byte. Coberto por `agent-runtime.resolver.test.ts` (nos 95 verdes). Kill-switch `HBX_AUTOMATION_AGENT=0|false|no|off` volta tudo pro legado. **Não é P0** — o pior caso pré-backfill é exatamente o comportamento de hoje.
6. **Migrations**: aditiva em `prisma/migrations/` (CREATE TABLE puro); destrutiva em `prisma/migrations-hold/` — `prisma migrate deploy` NÃO enxerga, nada destrutivo no auto-deploy. A hold ainda tem guarda de paridade em `DO $$` que ABORTA se alguma empresa legada não tiver `AutomationAgent` atualizado. Ver **P1-2** (incompatibilidade com o código atual se movida um dia).
7. **Copiloto vivo**: `CopilotoController` registrado no `AssistenteModule`, 4 rotas mapeadas no boot, service/dto intocados, consumidores do front (leads/cockpit) intactos.
8. **Webwhats**: `git diff 127b9166..HEAD --stat -- Webwhats/` = **VAZIO**. ✅
9. **Higiene**: zero `console.log` novo (o único `console.warn` novo é o warn-único-por-processo de flag deprecada em `automation-flags.ts`, com eslint-disable intencional); zero credencial/secret em código novo; flags novas = `HBX_AUTOMATION_IA_LIVE`/`_RUNNER_ENABLED`/`_COBRANCA_WORKER_ENABLED` (lêem a nova, **fallback pra velha** — com o env atual do VPS o valor efetivo não muda) + `HBX_AUTOMATION_AGENT` (a única default ON, autorizada pela S20 item 2). `HBX_AI_GATEWAY_ENABLED` default ON é PRÉ-EXISTENTE (frente governor 17/07, fora deste diff).

---

## C) ACHADOS

### P0 — bloqueia publish
**Nenhum.**

### P1 — corrigir logo (não bloqueiam ESTE publish, mas mordem depois)

1. **Flag do worker de Cobrança dessincronizada do painel.** `recovery-automation-worker.service.ts:14` lê SÓ a flag velha `HBX_RECOVERY_AUTOMATION_WORKER_ENABLED`; o overview (`automation-overview.service.ts:220-223`) lê `HBX_AUTOMATION_COBRANCA_WORKER_ENABLED` com fallback. Hoje (VPS: velha=true, nova ausente) os dois batem. No dia em que o env migrar pro nome novo, **o painel dirá "ligado" com o worker desligado** (ou o inverso, se a nova for usada como kill). Correção de 1 linha: worker passar a usar `automationFlag(nova, velha)`.
2. **`migrations-hold` é incompatível com o CÓDIGO atual — nunca mover sem sprint de limpeza antes.** O runtime mantém leituras VIVAS de `AssistenteConfig` de propósito (fallback/kill-switch): `messaging.service.ts:444` (gate de cancelamento do outbound da assistente), `vendas.service.ts:8113`, `conversation-assistant-runtime.service.ts:79` (ramo legado), `assistente.service.ts` (CRUD que o AgentService usa por baixo — o dual-write legado→agente é a COLA de consistência), `agent-backfill.service.ts`. Se a hold rodar com esse código no ar: empresa SEM linha em `AutomationAgent` quebra o `prepareReply` (P2021 em tabela dropada), o kill-switch `HBX_AUTOMATION_AGENT=0` vira suicídio, e o gate de `messaging:444` passa a lançar. O header da hold diz "pior caso: migration falha e o publish para" — **subestimado**: a paridade pode PASSAR e ainda assim o runtime quebrar depois. Pré-requisito real pra mover a hold: sprint que remova TODAS as leituras legadas (e aceite perder o kill-switch). Deixar registrado na S22/docs.
3. **`origin/master` está no MEIO da frente (`d4eb91c7` = pós-S14 + logistica).** S01–S14 já foram *pushed* (não deployados). Qualquer deploy manual que faça `git reset --hard origin/master` no VPS HOJE (ex.: o procedimento cirúrgico do Webwhats documentado no CLAUDE.md) sobe uma **fusão PARCIAL** (S01–S14 sem S15–S20 — backend novo sem casca/sem S20). O `npm run publish` normal (que push+deploya o HEAD completo) não tem esse problema. Regra até o publish: **nenhum deploy a partir de `origin/master` sem antes dar push do HEAD completo.**

### P2 — notas

- `frontend/src/components/casca/mobile-shell.tsx:50` mantém título `"/assistente": "Assistente IA"` no mapa da casca mobile — rota agora redireciona; cosmético, limpar na S22.
- Espelho best-effort pro `AutomationAgent` (`agent.service.ts::syncAutomationAgentFromLegacy`/`setAutomationAgentPublished`) nunca lança: se falhar, runtime+UI ficam coerentes entre si porém STALE vs. store legado (só log). Aceitável; ficar de olho no warn.
- Nomes de flag do CONTRATO.md §5.1 (`HBX_AUTOMATION_AGENT_PUBLISH_ENABLED`/`_PROSPECCAO_RUNNER_ENABLED`) foram SUPLANTADOS pelos nomes finais da S20 (`HBX_AUTOMATION_IA_LIVE`/`_RUNNER_ENABLED`) — atualizar o CONTRATO na S22 pra ninguém setar env com nome morto.
- `concierge-slots.ts` é visto como binário pelo git (pré-existente) — revisões futuras devem usar `--text`.
- Pré-existentes confirmados (NÃO são desta frente): 9 testes vermelhos (webwhats-bridge×8 + inbox Fase B (c)), 1 eslint error (lead-cockpit-modal), 28 check-pele (kit.css/impersonation-banner).
- Boot local para no Prisma `P1001` sem Postgres local — a prova "build verde ≠ boot ok" foi coberta até onde dá sem banco (DI completo + mapa de rotas); o boot REAL fica pro QA S22 no VPS (`docker ps` + logs pós-publish).
- Working tree tem edições NÃO commitadas do dono em `EntregaShell/` (frente dele). Atenção no rollback: `git reset --hard 127b9166` as destruiria — commitar/stashear antes de qualquer rollback.

### Sanidade de restauração (S21 item 7)

`git reset --hard 127b9166` + backup físico `Desktop\Backup 20-07 alteracaomotor` cobrem TODO o diff — nenhum arquivo novo vive fora do repo (scripts, migrations, hold e docs estão todos versionados; `.gitignore` foi ajustado pra hold não escapar). Banco: nada a restaurar (migration aditiva ainda não aplicada em lugar nenhum; hold nunca roda sozinha). Ressalva: o reset também apaga o trabalho paralelo do dono (P2 acima).

---

## O que o dono precisa saber antes do publish

1. **GO-COM-RESSALVAS.** Zero P0. O pacote é coeso: tudo verde, precedência juiz-aprovada, porta única intacta, gates fail-closed, Copiloto e Webwhats intocados.
2. Publicar com **`npm run publish` a partir do HEAD completo** (nunca deploy parcial de `origin/master` — P1-3).
3. Pós-publish, na ordem: conferir boot (`docker ps` + logs), rodar `node backend/scripts/automation-agent-backfill.js` (idempotente; até lá o runtime segue 100% legado — provado), e só considerar a migration da hold numa frente FUTURA, depois da limpeza de código do P1-2 + dump + burn-in.
4. Env: nada obrigatório a mudar no VPS agora (todas as flags novas caem no fallback das velhas). Quando migrar nomes, corrigir antes o P1-1 (worker de recovery).

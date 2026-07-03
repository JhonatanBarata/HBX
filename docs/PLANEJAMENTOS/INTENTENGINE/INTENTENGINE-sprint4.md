# INTENTENGINE — Sprint 4: outbox hardening (reaper + métricas)

> Plano auto-contido. Editar código = subagente Sonnet (1 por .md); Opus planeja.
> Independe dos outros sprints. Pequeno e cirúrgico — o outbox atual FUNCIONA
> (retry exponencial + jitter + respeita retry-after, verificado); só tem 2 furos.

## Objetivo
(1) Mensagem travada em `SENDING` durante um restart não fica órfã pra sempre.
(2) A fila ganha métricas visíveis no Ops Control (hoje ela é invisível).

## ESTADO ATUAL (verificado 01/07/2026)
`backend/src/messaging/messaging.service.ts`:
- Worker in-process: `onModuleInit` ~268 → `setInterval` 5s → `processDueMessages` ~7806
  (`status='PENDING' AND nextAttemptAt<=now`, lote 10, `sendOne`).
- `sendOne` ~7901: lock otimista `PENDING→SENDING`; falha retryável volta pra `PENDING`
  com `exponentialBackoffMs(attempt)+jitter` (~8394-8396); esgotou tentativas → FAILED.
- FURO 1: se o processo morre entre o lock e o resultado (deploy/restart — e `npm run
  publish` reinicia o backend), a linha fica `SENDING` eterna. Nenhum reaper existe
  (grep por SENDING: só o lock, nenhuma recuperação).
- FURO 2: nenhuma métrica de fila. `GET /inbox/metrics` já existe
  (`backend/src/inbox/inbox.controller.ts` ~55) — é o lugar natural de estender.

## O QUE FAZER (em ordem)
1. Reaper no boot + a cada N min (junto do poll existente, sem timer novo):
   `SENDING` com `updatedAt` mais velho que `HBX_OUTBOX_STUCK_MINUTES` (default 10):
   - SEM `outboundAttempt` registrado pra tentativa atual → seguro re-enfileirar:
     `status='PENDING'`, `nextAttemptAt=now+backoff`.
   - COM attempt registrado sem resultado (pode TER SIDO ENVIADA — o processo morreu
     antes de gravar) → NÃO reenviar às cegas (duplicata pro cliente = ruído e risco):
     marcar `FAILED` com erro `stuck_unknown_outcome` + expor no painel pra ação humana.
     Trade-off documentado: melhor 1 mensagem perdida visível que 2 enviadas invisíveis.
2. Estender `GET /inbox/metrics` com bloco `outbox`:
   `{ pending, failed24h, stuckSending, oldestPendingAgeSec }` (4 counts baratos).
3. Ops Control: card simples lendo esse bloco (se o Ops Control já pluga em metrics,
   só adicionar o bloco; não inventar tela nova).
4. Testes unit do reaper: os 2 caminhos (sem attempt → PENDING; com attempt → FAILED),
   e que mensagem saudável em SENDING recente NÃO é tocada.

## GUARDRAILS
- NÃO trocar o mecanismo do outbox (regra do WHATSAPP.md: não trocar sem plano explícito).
  Nada de fila externa/Redis — infra nova sem dor real no volume atual.
- Reaper conservador: na dúvida entre reenviar e marcar falha visível, marcar falha.
- Nenhuma mudança em conexão/reconexão de chip.

## PRONTO QUANDO
- tsc estrito 0 erros; testes verdes.
- Simulação em dev: matar o processo com mensagem SENDING → subir → reaper resolve nos
  2 caminhos conforme política.
- `GET /inbox/metrics` devolvendo o bloco outbox; card visível no Ops Control.

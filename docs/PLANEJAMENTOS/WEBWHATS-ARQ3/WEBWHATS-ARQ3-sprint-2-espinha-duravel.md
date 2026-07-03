# WEBWHATS-ARQ3 — Sprint 2: Espinha durável ON (consumer da outbox → matar o polling)

> Absorve o GATEWAY-WA Sprint 5 (parte "matar sync por polling"). É um sprint de **operação
> instrumentada com gates**, quase zero código novo: o software já está no ar dormente.
> Depende do Sprint 1 (motor são e fechado). Índice: [sprint 0](WEBWHATS-ARQ3-sprint-0-visao.md).

## Problema ($)
Evento motor→backend viaja por webhook HTTP com retry EM RAM (10 tentativas, backoff até 300 s —
`Webwhats/src/api/integrations/event/webhook/webhook.controller.ts:203`). Todo `npm run publish`
reinicia os dois lados e descarta retries pendentes: a mensagem fica no `webwhats_prod`, mas a
REAÇÃO se perde — **bot mudo em horário comercial = venda perdida sem sintoma**. A rede de
segurança atual é o sync por polling, que custa chamadas constantes ao motor e esconde o problema.

A solução inteira JÁ EXISTE e está desligada: outbox gravando (354 eventos/dia medidos) +
consumer idempotente com cursor persistido (`WebwhatsOutboxConsumerService`) + guard de polling.

## Fatos verificados
| Fato | Onde |
|---|---|
| Outbox grava TODO evento no choke point `EventManager.emit()` | `Webwhats/src/api/integrations/event/event.manager.ts:76` |
| Consumer: cursor durável, avança só em sucesso, tolera 404/timeout, página 200 | `backend/src/messaging/webwhats-outbox-consumer.service.ts` |
| Mesmo miolo do webhook (`processWebwhatsEventCore`) → idempotência absorve dupla entrega | `backend/src/messaging/messaging.service.ts:8545` |
| Guard de polling pronto (`HBX_WA_SYNC_POLLING_DISABLED` em `inbox.service`) | memória WHATSAPP.md (GATEWAY-WA S5-flag) |
| Retenção: outbox 7 dias, ConnectionEvent 30 dias, purge diário | `Webwhats/src/api/services/monitor.service.ts:352` |

## Entregas (fases com gate entre cada uma — NUNCA pular)
- **F1 — Consumer ON (dupla entrega).** `HBX_WEBWHATS_OUTBOX_CONSUMER_ENABLED=true` no `.env`
  do backend + recreate. Webhook continua LIGADO — consumer roda por cima, idempotência absorve.
- **F2 — Medir 2 semanas.** Métrica de lag (max id da outbox − cursor persistido) exposta no
  fleet-health do backend (`webwhats-fleet-health.service.ts` — adicionar leitura do cursor) e
  1 alerta MasterAlert se lag > N eventos por > 10 min. Comparar diariamente: nada que o webhook
  entregou pode faltar no consumer.
- **F3 — Polling OFF.** `HBX_WA_SYNC_POLLING_DISABLED=true`. Escape hatch manual continua:
  `POST /inbox/conversations/:id/backfill`. Observar 1 semana (inbox íntegra pós-publish).
- **F4 — Decisão com dado (dono):** manter dupla entrega webhook+outbox (custo ~zero, redundância)
  OU desligar o webhook e a outbox virar caminho único. Recomendação: MANTER dupla entrega — o
  custo é um POST local; redundância de caminho é o que os grandes fazem.

## Aceite
- [ ] F1: consumer processa em produção, cursor avança, zero mensagem duplicada visível na inbox.
- [ ] F2: gráfico/log de lag por 14 dias; publish no meio do período e NENHUMA reação perdida
      (teste dirigido: mandar msg pro bot DURANTE um publish → bot responde após boot).
- [ ] F3: polling desligado; inbox continua íntegra por 7 dias; carga de chamadas ao motor cai.
- [ ] Rollback ensaiado: flag OFF volta o comportamento anterior em 1 recreate.

## Riscos / rollback
- Dupla entrega gerar efeito colateral não-idempotente (ex.: side-effect de bot disparado 2×):
  o miolo é o mesmo do webhook e a ingestão é upsert por providerMessageId — mas o teste F1
  DEVE incluir: msg de cliente novo, msg repetida, reação, delete, mídia.
- Consumer atrás (lag alto) por motor reiniciando: comportamento previsto (recua sem crash);
  o alerta de F2 existe pra isso.
- Rollback em qualquer fase = flag OFF + recreate (sem migration, sem deploy de código).

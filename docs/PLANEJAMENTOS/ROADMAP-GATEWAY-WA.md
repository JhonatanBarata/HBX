# ROADMAP — GATEWAY-WA (frente PARADA de propósito)

> Consolidação dos sprints de `GATEWAY-WA/` (11/07/2026). Docs originais deletados — **git preserva**.
> Frente parada por decisão do dono; **não auto-construir** (toca WhatsApp/dinheiro/dep. externa).

## Visão
Arquitetura nº2 do motor WhatsApp (Webwhats): motor enxuto "gateway WA" burro + backend dono da conversa, ligados por fila durável (outbox no Postgres, sem Redis/Kafka), com o chip protegido por disjuntor (já existente) e freio de envio. Mesma infra física de hoje (motor systemd :8080, backend Docker, 172.18.0.1:8080); muda o CONTRATO, não a topologia. Todo o código S1..S5 foi entregue num único commit f0b2c1be (03/07) com TODAS as flags default OFF. Está parada porque as flags só ligam com o dono no loop: S2/S3 exigem validação em número descartável + calibração, e S5 tem pré-requisito duro (outbox estável ≥2 semanas em prod). Guardrails inegociáveis: disjuntor intocável, testar reconexão só em número descartável, 1 número = 1 conexão, motor ao vivo = fonte da verdade.

## Sprints

| Sprint | Estado | O que falta |
|---|---|---|
| Sprint 0 — Visão e regras (índice/contrato) | ✅ feito | Nada — é o índice/contrato da frente; consolidar no ROADMAP e preservar Guardrails + a seção 'O que NÃO fazer'. |
| Sprint 1 — Telemetria do disjuntor + /health de frota | ✅ feito | Código completo (motor: model ConnectionEvent, INSERTs fire-and-forget nos pontos de reconexão, GET /health/fleet, purge 30d; backend: WebwhatsFleetHealthService + GET /modules/owner/webwhats/fleet-health). Falta só confirmar a migração aplicada no webwhats_prod da VPS e, opcional, plugar o card no Ops Control/HBX Owner (endpoint já pronto, nenhum consumidor frontend hoje). |
| Sprint 2 — Event outbox durável + consumer idempotente | 🟡 parcial | Código completo e aditivo: motor grava EventOutbox no choke point EventManager.emit (dupla entrega, webhook segue ligado) + GET /events?cursor=&limit=; backend tem WebwhatsOutboxConsumerService + WebwhatsEventCursor. MAS o consumer está atrás da flag HBX_WEBWHATS_OUTBOX_CONSUMER_ENABLED (OFF) — nunca foi ligado. Falta: ligar a flag na VPS, provar entrega-exatamente-1x em número descartável e só depois desligar o webhook via /webhook/set. |
| Sprint 3 — Freio de envio por chip (chip guardian) | 🟡 parcial | Código completo e JÁ WIRED no dispatcher (messaging.service.ts ~L8484): tetos min/hora + espaçamento+jitter, curva de warm-up por connectedAt, isenção inbound-24h, estouro reagenda sem queimar attemptCount. MAS atrás da flag HBX_WA_SEND_THROTTLE_ENABLED (OFF). Falta: calibrar os envs de teto/warm-up com o dono, ligar a flag e testar rajada de 100 envios em número descartável. |
| Sprint 4 — Dieta do fork Evolution | 🟡 parcial | Feito: removidos 4 chatbots (evolutionBot/n8n/evoai/flowise) e 5 event providers (kafka/nats/sqs/rabbitmq/pusher); build/typecheck/lint verdes. PULADO por acoplamento ao canal Baileys: openai/typebot/dify/chatwoot e storage S3. Falta ainda: deps órfãs do package.json e drop das tabelas órfãs de chatbot no webwhats_prod (SÓ com backup + ordem do dono). |
| Sprint 5 — Fonte única da conversa + bridge fatiada | ⬜ não feito | Só entregue o andaime: flag HBX_WA_SYNC_POLLING_DISABLED (default OFF = polling segue ligado) + POST /inbox/conversations/:id/backfill (ressync manual). O grosso NÃO foi feito: matar o sync por polling de rotina e fatiar a bridge de 4.294 linhas (ainda monolítica, ~18 pontos de sync ativos). PRÉ-REQUISITO DURO: outbox (S2) rodando ≥2 semanas em prod sem perda antes de começar. |

## Flags / passos VPS pendentes
- Motor: aplicar migração 20260703000000_add_gateway_wa_telemetry_outbox (ConnectionEvent + EventOutbox) no webwhats_prod via db:deploy — confirmar que já subiu na VPS
- Backend: aplicar migração 20260703_100000_add_webwhats_event_cursor (WebwhatsEventCursor) via prisma migrate deploy
- S2: HBX_WEBWHATS_OUTBOX_CONSUMER_ENABLED=true na VPS (default OFF) — só após provar 1x-only em número descartável; envs auxiliares HBX_WEBWHATS_OUTBOX_POLL_MS (5000) e HBX_WEBWHATS_OUTBOX_LIMIT (200)
- S2 pós-prova: desligar o webhook HTTP via /webhook/set no motor, mantendo o código de recepção como fallback
- S3: HBX_WA_SEND_THROTTLE_ENABLED=true (default OFF) + calibrar com o dono: HBX_WA_SEND_MAX_PER_MINUTE(8), _MAX_PER_HOUR(120), _MIN_SPACING_MS(4000), _JITTER_MS(3000), _WARMUP_DAYS(14), _WARMUP_FLOOR_PCT(15), _INBOUND_EXEMPT_HOURS(24), _RESCHEDULE_MS(20000)
- S5: HBX_WA_SYNC_POLLING_DISABLED só pode ir a true DEPOIS de S2/outbox estável ≥2 semanas em prod (pré-requisito duro do dono)
- S4: drop das tabelas órfãs de chatbot no webwhats_prod só com backup + ordem explícita do dono

# GATEWAY-WA — Sprint 0: Visão e regras da arquitetura (índice)

> Arquitetura nº2 — Motor WhatsApp (Webwhats). Este arquivo é o índice e o contrato;
> os sprints 1–5 são ordens de serviço autocontidas (1 subagente por `.md`, apaga ao concluir).
> Planejado em 01/07/2026 a partir de auditoria do código real (worktree `stoic-meitner-f923fb`).

## O que É esta arquitetura

Motor enxuto ("gateway WA") + backend dono da conversa, ligados por fila durável, com o chip
protegido por um guardian de primeira classe. Mesma topologia física de hoje (motor systemd no
host `:8080`, backend Docker, `172.18.0.1:8080`) — muda o CONTRATO entre as partes, não a infra.

## Fatos verificados no código (base do plano — não repetir a auditoria)

| Fato | Onde |
|---|---|
| Disjuntor de reconexão: teto 4, backoff 15→120s+jitter, terminais não reconectam, circuito aberto = re-parear | `Webwhats/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts:254-262,467-555` |
| Disjuntor só LOGA; motor persiste apenas o último estado (`connectionStatus`, `disconnectionReasonCode`) | idem, `logger.warn [DISJUNTOR]` |
| Boot escalonado 8s/chip + número único no boot | `Webwhats/src/api/services/monitor.service.ts:404,470` |
| Webhook motor→backend tem retry EM MEMÓRIA (10 tent., backoff até 300s) — restart descarta pendentes | `Webwhats/src/api/integrations/event/webhook/webhook.controller.ts:203-270` |
| Motor grava TODA mensagem/chat/contato no `webwhats_prod` (SAVE_DATA forçado `true` no código) | `Webwhats/src/config/env.config.ts:464-469` |
| Bridge = 4.294 linhas, 6 responsabilidades, caches/throttles em RAM por processo | `backend/src/messaging/webwhats-bridge.service.ts` |
| Fila de saída = polling de tabela a cada 5s | `backend/src/messaging/messaging.service.ts:273` |
| Status da conexão JÁ reconcilia com motor ao vivo (reconciler central PR4-F3, cooldown por tenantKey) | `backend/src/companies/whatsapp-modal.service.ts:648-717` |
| NÃO existe freio de envio por chip em lugar nenhum (nem motor nem dispatcher) | grep `delay|throttle|rateLimit` no caminho de envio = vazio |

## Correções sobre a análise que originou o plano (revisão 01/07)

1. "Painel lê banco" está desatualizado para o STATUS (reconciler já existe). O gap real é
   telemetria histórica do disjuntor + visão de frota.
2. A "perda no deploy" é perda de REAÇÃO (bot mudo, inbox parado), não de dado — a mensagem
   fica no `webwhats_prod` e o sync por polling backfilla. Logo: **o sync por polling é a rede
   de segurança atual. Ele SÓ morre no Sprint 5, depois da outbox provada (Sprint 2).**
3. Outbox é consumida via API do motor (`GET /events?cursor=`), NUNCA leitura direta do banco
   do motor pelo backend (não acoplar schema).

## Ordem e dependências (por retorno $)

| Sprint | Entrega | Depende de |
|---|---|---|
| [1](GATEWAY-WA-sprint-1-telemetria.md) | Telemetria do disjuntor + /health de frota | — |
| [2](GATEWAY-WA-sprint-2-outbox.md) | Event outbox durável + consumer idempotente | — |
| [3](GATEWAY-WA-sprint-3-freio-envio.md) | Freio de envio por chip (warm-up/teto) | 1 (contadores no /health) |
| [4](GATEWAY-WA-sprint-4-dieta-fork.md) | Dieta do fork Evolution | — |
| [5](GATEWAY-WA-sprint-5-fonte-unica.md) | Matar sync por polling + fatiar bridge | 2 estável ≥2 semanas em produção |

## Guardrails INEGOCIÁVEIS (valem para TODOS os sprints)

- Chip banido não tem `git revert`. Conexão/reconexão SÓ se testa em número descartável
  (ver `open` estável por minutos), NUNCA em chip do dono/cliente.
- O disjuntor atual é intocável — nenhum sprint altera a lógica de reconexão. Sprint 1 só OBSERVA.
- Derrubar chip SEMPRE via `disconnectCompanySession`, nunca API crua do motor.
- 1 número = 1 conexão. Fonte da verdade = motor ao vivo.
- Todo sprint no motor passa `cd Webwhats && npm run typecheck` (o publish roda estrito).
- Nenhuma migração/deploy no VPS sem ordem explícita do dono.

## O que NÃO fazer (decisões tomadas — não reabrir)

- NÃO reescrever o motor do zero (risco >> retorno; ele segura chip conectado hoje).
- NÃO adotar Redis Streams/RabbitMQ/Kafka — VPS único, Postgres dá conta da outbox.
- NÃO containerizar o motor — processo isolado no host protege o socket de crash/deploy do app.
- NÃO mexer no modelo per-user de sessão (`company-{id}-user-{n}`).

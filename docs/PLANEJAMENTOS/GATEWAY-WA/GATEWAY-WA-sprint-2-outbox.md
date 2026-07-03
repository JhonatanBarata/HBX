# GATEWAY-WA — Sprint 2: Event outbox durável + consumer idempotente

## Por quê ($)
Hoje o evento motor→backend viaja por HTTP com retry EM MEMÓRIA
(`webhook.controller.ts:203-270` — 10 tentativas, backoff até 300s). Todo `npm run publish`
reinicia o `webwhats.service` e descarta retries pendentes. A mensagem NÃO se perde (fica no
`webwhats_prod`), mas a REAÇÃO se perde: bot mudo, inbox parado, auto-reply não dispara —
até alguém abrir a conversa e o sync por polling backfillar. Bot mudo em horário comercial
é venda perdida sem sintoma.

## Contexto verificado
- Idempotência de ingestão JÁ existe: upsert por `providerMessageId` na bridge
  (`webwhats-bridge.service.ts` → `ingestWebhookMessage`/`upsertConversationMessage`).
- Recepção atual: `POST /webhooks/webwhats/events` (`messaging.controller.ts:75`) → secret →
  auditoria `WhatsAppWebhookEvent` → reconcile conexão → statuses → mensagens → realtime → bot.
- **O sync por polling da bridge é a rede de segurança atual. NÃO desligar neste sprint.**

## Entrega
1. **Motor**: tabela `EventOutbox` no `webwhats_prod` (migração Prisma): `id` serial (cursor),
   `instanceName`, `eventName`, `payload` JSON, `createdAt`. O emissor de eventos grava na
   outbox ANTES de (ou em vez de) disparar o webhook HTTP. Purge > 7 dias após consumo.
2. **Motor**: `GET /events?cursor={lastId}&limit={n}` (apikey) — retorna eventos com `id > cursor`
   em ordem; leve, sem joins.
3. **Backend**: consumer com cursor persistido (tabela pequena `WebwhatsEventCursor`), loop
   curto (2–5s, alinhado ao worker de 5s existente), reaproveitando 100% o pipeline atual de
   `handleWebwhatsWebhookEvent` (extrair o miolo para função chamável pelos dois caminhos).
4. **Transição em dupla entrega**: webhook HTTP continua ligado durante o sprint; a idempotência
   absorve duplicata (evento chega pelo webhook E pela outbox). Só desligar o webhook depois do
   critério de aceite batido em produção. Desligar = configurar o `/webhook/set` para não enviar,
   mantendo o código de recepção como fallback.

## Fora de escopo
- Desligar sync por polling (Sprint 5).
- Mudar formato de payload dos eventos (consumer fala o dialeto atual do webhook).

## Critérios de aceite
- Teste em número DESCARTÁVEL: derrubar o backend por 10 min com mensagens entrando →
  religar → todas processadas exatamente 1x (sem duplicata em `CompanyMessage`), bot responde a fila.
- Restart do motor no meio (simular publish) não perde evento: outbox sobrevive ao processo.
- Latência do caminho feliz ≤ 5s da mensagem ao realtime do inbox.
- `cd Webwhats && npm run typecheck` verde nos dois lados; testes existentes da bridge passam.

## Riscos
- Ordem de eventos entre instâncias não é garantida globalmente — ok, o pipeline atual já
  tolera (cada evento é autocontido por tenantKey). Não prometer ordering global.
- Backpressure: se o backend ficar fora por horas, o catch-up processa em lote — limitar
  `limit` por página e iterar, sem estourar memória.

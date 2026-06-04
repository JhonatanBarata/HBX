# External Webhook Ledger

## Objetivo

Registrar recebimento, hash e estado de webhooks externos para dedupe e idempotencia.

Esta camada cria:

- model `ExternalWebhookEvent`;
- migration SQL idempotente;
- `ExternalWebhookLedgerService`;
- testes de dedupe, hash e status.

Ela ainda nao altera o processamento das rotas criticas.

## Campos

- `provider`: origem normalizada, como `mercadopago` ou `whatsapp`.
- `eventId`: identificador externo do evento. Quando nao houver, o service pode usar o hash do payload como fallback.
- `eventType`: tipo/topico do webhook.
- `signatureStatus`: `unknown`, `unchecked`, `valid`, `invalid` ou equivalente operacional.
- `payloadHash`: SHA-256 do payload serializado de forma estavel.
- `status`: `received`, `processed` ou `rejected`.
- `processedAt`: preenchido somente quando o evento foi processado.

## Pontos de integracao localizados

- `backend/src/financeiro/financeiro.webhook.controller.ts`
- `backend/src/hbx-recovery/hbx-recovery.webhook.controller.ts`
- `backend/src/messaging/messaging.controller.ts`

## Proxima etapa segura

1. Injetar `ExternalWebhookLedgerService` no controller alvo.
2. Calcular `eventId` antes de chamar o service de negocio.
3. Chamar `recordReceived(provider, eventId, payload, opts)`.
4. Se `wasProcessed(provider, eventId)` for true, retornar `received: true, duplicate: true`.
5. Se a assinatura falhar, chamar `markRejected`.
6. Depois do service de negocio concluir, chamar `markProcessed`.

## Cuidados

- Nao logar payload bruto nem segredo.
- Para Mercado Pago, prefira `data.id`, `id`, `resource` e topico como base do `eventId`.
- Para WhatsApp, prefira ids `statuses[].id`, `messages[].id` ou o hash do payload quando for evento agregado.
- Nao bloquear webhooks existentes ate validar telemetria em ambiente real.

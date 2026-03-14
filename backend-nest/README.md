# backend (WhatsApp Cloud API)

Este backend NestJS usa Prisma + SQLite para testes locais e implementa envio de mensagens via WhatsApp Cloud API com:

- Outbox (`OutboundMessage`) + tentativas (`OutboundAttempt`)
- Retry com backoff exponencial + jitter
- Webhook do WhatsApp Cloud para confirmação de entrega/leitura (statuses)

## Rodar local (dry-run)

1) Variáveis de ambiente

- Use [.env.example](.env.example) como base.
- Para dry-run, mantenha `WHATSAPP_ENABLED=false` (o sistema marca como enviado sem chamar a Meta).

2) Instalar + migrar (sem seeds)

```powershell
cd c:\Users\Jhonatan\Desktop\App\backend
npm install
npx prisma generate
$env:DATABASE_URL='file:./prisma/dev.db'
npx prisma migrate reset --force --skip-seed
```

3) Subir backend

```powershell
cd c:\Users\Jhonatan\Desktop\App\backend
npm run start:dev
```

4) Smoke test (signup + criar company + enfileirar + webhook)

```powershell
cd c:\Users\Jhonatan\Desktop\App\backend
npm run whatsapp:smoke
```

## Webhook WhatsApp Cloud API

- Verify: `GET /webhooks/whatsapp` (usa `WHATSAPP_VERIFY_TOKEN`)
- Eventos: `POST /webhooks/whatsapp`
  - Se `WHATSAPP_APP_SECRET` estiver definido, valida `x-hub-signature-256` usando `rawBody`.
  - Persistimos eventos em `WhatsAppWebhookEvent` e atualizamos `OutboundMessage` quando `providerMessageId` bater.

## Onde abstrair futuramente para um proxy interno

Se você quiser trocar a Meta por um “proxy interno” sem mudar regra de negócio, os pontos naturais são:

1) **Envio HTTP**

- Hoje: dentro de `MessagingService.sendOne()` fazemos `POST {GRAPH}/{phone_number_id}/messages` via `axios`.
- Futuro: extraia para um client `WhatsAppProviderClient` com método `sendText({ to, body, companyId })`.
- O proxy interno poderia expor um endpoint estável (`POST /internal/whatsapp/send`) e devolver `{ providerMessageId }`.

2) **Webhook normalizado**

- Hoje: `MessagingService.handleWhatsAppWebhook(payload, {rawBody, signature})` lê o payload do Cloud API e atualiza status.
- Futuro: o proxy pode normalizar eventos (delivery/read/failed) para um formato interno estável, e o backend só consumiria esse formato.

3) **Mapeamento de tenant**

- Hoje: correlaciona por `Company.whatsappPhoneNumberId` (preferencial) ou `Company.whatsappNumber` (fallback).
- Futuro: o proxy pode resolver o tenant e mandar `companyId` no evento já resolvido, simplificando o handler.

4) **Retry/Backoff**

- Hoje: worker leve via `setInterval` + campos `nextAttemptAt/attemptCount/maxAttempts`.
- Futuro: proxy pode assumir retry/limites (429), e o backend manteria apenas o log/outbox.

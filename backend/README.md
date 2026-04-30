# backend (WhatsApp Cloud API)

Este backend NestJS usa Prisma + PostgreSQL e implementa envio de mensagens via WhatsApp Cloud API com:

- Outbox (`OutboundMessage`) + tentativas (`OutboundAttempt`)
- Retry com backoff exponencial + jitter
- Webhook do WhatsApp Cloud para confirmação de entrega/leitura (statuses)

## Rodar local (dry-run)

1) Variáveis de ambiente

- Use [.env.example](.env.example) como base.
- Defina `DATABASE_URL` e `DIRECT_URL`.
- Em ambiente local com um único Postgres, as duas podem apontar para a mesma URL.
- Na VPS Hostinger, use o Postgres local do Docker (`hbx-postgres`) e o banco `hbx_prod`.
- Para dry-run, mantenha `WHATSAPP_ENABLED=false` (o sistema marca como enviado sem chamar a Meta).

2) Instalar + migrar (sem seeds)

```powershell
cd c:\Users\Jhonatan\Desktop\App\backend
npm install
npx prisma generate
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/hbx_dev?schema=public'
$env:DIRECT_URL=$env:DATABASE_URL
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

## Deploy manual Docker na Hostinger

- Produção: `https://api.hbxsystem.com.br`
- Proxy: Nginx encaminhando para o backend em `127.0.0.1:3000`
- Runtime: Docker via `docker-compose`
- Container esperado: `hbx-backend`

Variáveis mínimas esperadas na VPS:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `INTEGRATION_SECRET_KEY`
- `FRONTEND_URL`
- `PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` no frontend para tokenizacao segura de cartao
- `MERCADO_PAGO_ACCESS_TOKEN` apenas quando o token Mercado Pago nao estiver configurado na biblioteca MASTER do HBX
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM` (ou `MAIL_FROM_NAME` com `SMTP_USER`)
- `NODE_ENV=production`

Na VPS atual, o rebuild manual é:

```sh
git pull
docker-compose down
docker-compose up -d --build
docker ps
```

Sem SMTP real em producao, o cadastro pode ate ser salvo em `pending_email_confirmation`, mas o e-mail nao sera entregue e o trial ficara bloqueado ate a confirmacao.

Se quiser endurecer a verificacao de deploy, defina tambem no ambiente operacional local:

- `PROD_INTERNAL_SECRET` com o mesmo valor de `INTERNAL_SECRET` do backend publicado.

Assim o `scripts/verify-prod.js` consegue consultar o endpoint interno protegido e falhar o publish quando o SMTP de producao nao estiver pronto.

Se `INTEGRATION_SECRET_KEY` estiver ausente, o backend ainda sobe, mas os fluxos de conexao e sincronizacao de integracoes permanecem bloqueados ate a variavel ser configurada no ambiente.

Se AUVO ou TagPlus forem usados com chamadas HTTP reais, configure tambem as variaveis do contrato adotado no ambiente:

- AUVO: `AUVO_API_BASE_URL`, `AUVO_TEST_PATH` e `AUVO_TASKS_PATH`; adicione `AUVO_CUSTOMERS_PATH` se houver endpoint dedicado de clientes.
- AUVO: `AUVO_AUTH_MODE`, `AUVO_APP_KEY`, `AUVO_EXTERNAL_ACCOUNT_ID`, `AUVO_TIMEOUT_MS`, `AUVO_RETRY_ATTEMPTS`, `AUVO_RETRY_BACKOFF_MS` conforme o contrato homologado.
- TagPlus: `TAGPLUS_API_BASE_URL`, `TAGPLUS_TEST_PATH` e `TAGPLUS_RECEIVABLES_PATH`; adicione `TAGPLUS_CUSTOMERS_PATH` se houver endpoint dedicado de clientes.
- TagPlus: `TAGPLUS_AUTH_MODE`, `TAGPLUS_EXTERNAL_ACCOUNT_ID`, `TAGPLUS_TIMEOUT_MS`, `TAGPLUS_RETRY_ATTEMPTS`, `TAGPLUS_RETRY_BACKOFF_MS` conforme o contrato homologado.

Para Postgres local da Hostinger:

- Use `hbx-postgres:5432` em `DATABASE_URL`.
- Use o banco `hbx_prod`.
- Mantenha `connection_limit=10` e `pool_timeout=60` em `DATABASE_URL`.
- Use a mesma URL também em `DIRECT_URL` para o fluxo de `prisma migrate deploy` e runtime.

O container sobe com o `CMD` do Dockerfile:

```sh
npx prisma migrate deploy --schema=./prisma/schema.prisma && npm run start:prod
```

## Webhook WhatsApp Cloud API

- Verify: `GET /webhooks/whatsapp` (usa `WHATSAPP_VERIFY_TOKEN`)
- Eventos: `POST /webhooks/whatsapp`
  - Se `WHATSAPP_APP_SECRET` estiver definido, valida `x-hub-signature-256` usando `rawBody`.
  - Persistimos eventos em `WhatsAppWebhookEvent` e atualizamos `OutboundMessage` quando `providerMessageId` bater.

## Onboarding obrigatório (por empresa)

Este sistema **não faz login via WhatsApp**. O login é **email/senha** no SaaS.

Para o WhatsApp funcionar de verdade (envio/recebimento), cada empresa precisa estar configurada com dados da **Meta WhatsApp Cloud API**:

- `whatsappPhoneNumberId` (Meta: `phone_number_id`) **vem da Meta** e é obrigatório.
- `whatsappAccessToken` pode ser global (`WHATSAPP_ACCESS_TOKEN`) ou por empresa (`Company.whatsappAccessToken`).
- O backend **nunca retorna** token em responses (campo sanitizado).

Sem `whatsappPhoneNumberId`, o sistema considera o WhatsApp **não configurado** e bloqueia envio.

### Status do WhatsApp

Endpoint (seguro, tenant-safe):

- `GET /companies/me/whatsapp-status`
  - Sempre resolve `companyId` pelo JWT (não vem do cliente)
  - Retorna algo como:
    - `configured`: boolean
    - `connected`: boolean
    - `status`: `CONNECTED | DISCONNECTED | ERROR`
    - `displayNumber` (quando disponível)

Para forçar revalidação com a Meta:

- `GET /companies/me/whatsapp-status?refresh=true`

### Envio outbound

- `POST /whatsapp/send`
  - Bloqueado se `status != CONNECTED` ou se `whatsappPhoneNumberId` estiver ausente
  - Retorna erro claro para orientar o onboarding

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

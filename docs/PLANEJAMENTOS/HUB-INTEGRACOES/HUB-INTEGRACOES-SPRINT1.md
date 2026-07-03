# HUB-INTEGRACOES — SPRINT 1: Dinheiro seguro (Mercado Pago)

> Arquitetura nº12 — Hub de Integrações (`backend/src/integrations`). Plano revisado em 01/07/2026
> após auditoria da análise original. Frente financeira → **Opus edita direto + revisão obrigatória de diff**.

## Veredito da auditoria (o que a análise original errou — vale para todas as sprints)

1. **"Guard de concorrência ilusório (P2002 nunca dispara)" = FALSO.** Existe unique index **parcial**
   criado em SQL cru: `IntegrationSyncRun_connectionId_running_key ... WHERE status = 'RUNNING'`
   (`backend/prisma/migrations/20260329_align_auvo_scaffold_schema/migration.sql:42`). Não aparece no
   `schema.prisma` porque Prisma não expressa unique parcial. O guard FUNCIONA. Risco real é outro:
   run RUNNING zumbi trava syncs futuros para sempre (sem reaper) → Sprint 2.
2. **"Retry do MP reprocessa pagamento" = EXAGERADO.** `syncMercadoPagoPayment`
   (`backend/src/hbx-recovery/hbx-recovery.service.ts:3162`) re-busca o pagamento na API MP e aplica
   delta convergente (`targetNetPaid` vs `currentNet`) — retry sequencial converge. O risco real é
   **entrega concorrente**: 2 requests simultâneas leem o mesmo estado → `applyPayment` em dobro +
   `notifyApprovedPayment` (WhatsApp) em dobro.
3. **"Ligar o CredentialResolverService do hub no financeiro" = ERRADO como está.** Existe um segundo
   resolvedor VIVO e mais rico: `resolveCompanyMercadoPagoAccess`
   (`backend/src/modules/master-global-integrations.util.ts:282`) — conhece token MASTER,
   `useMasterMercadoPagoToken`, credencial por empresa e fallbacks. O resolver do hub não conhece nada
   disso; plugá-lo quebraria cobrança. O caminho é o INVERSO: o resolvedor master vira o único e
   aprende a ler `IntegrationConnection` cifrada; o do hub é absorvido/aposentado.
4. **O texto plano é pior que o descrito:** além de `Company.mercadoPagoAccessToken` /
   `whatsappAccessToken`, a biblioteca MASTER (`masterGlobalIntegrationConfig.mercadoPagoLibrary` /
   `whatsappLibrary`) guarda tokens em JSON **plano** no banco. São 4 cofres, não 3.

## Objetivo

Fechar os dois riscos que tocam dinheiro real hoje: corrida concorrente no webhook MP e segredo MP
em texto plano, reutilizando peças já construídas (ledger + secrets do hub).

## Fatos verificados

- Webhooks MP sem ledger de idempotência: `backend/src/hbx-recovery/hbx-recovery.webhook.controller.ts`
  e `backend/src/financeiro/financeiro.webhook.controller.ts` (assinatura é opt-in via
  `MERCADO_PAGO_WEBHOOK_SECRET`; processamento síncrono no request).
- Ledger pronto e testado: `backend/src/integrations/external-webhook-ledger.service.ts`
  (`recordReceived` já devolve `duplicate: true`).
- `CredentialResolverService` (`backend/src/integrations/credential-resolver.service.ts`): exportado,
  zero consumidores fora do próprio teste.

## Tarefas

1. **Ledger nos 2 webhooks MP** (recovery + financeiro):
   - `recordReceived('mercadopago', eventId, payload, { companyId })` no início; `eventId` estável =
     `x-request-id` ou `data.id` + `type` do query (fallback: hash do payload, já é o default do ledger).
   - Se `duplicate` e já `processed` → responder 200 curto sem reprocessar.
   - `markProcessed` ao fim do processamento com sucesso.
   - Importar via `IntegrationsModule` (exporta `ExternalWebhookLedgerService`) — NÃO re-registrar o
     provider como o mail fez (`backend/src/mail/mail.module.ts:27`, antipadrão).
2. **Guard anti-corrida na aplicação do pagamento e na notificação:**
   - Transição `lifecycle → paid` via `updateMany` condicional (`where: { id, NOT: { lifecycle: 'paid' } }`)
     e só notificar se `count === 1`; o ledger `duplicate` serve de curto-circuito para a corrida HTTP.
3. **Unificação do resolvedor MP (fase 1):** `resolveCompanyMercadoPagoAccess` ganha degrau 0 =
   `IntegrationConnection` ativa com provider MERCADOPAGO e `secretCiphertext` (decriptação via
   `IntegrationSecretsService`). Ordem final: connection cifrada → master (quando
   `useMasterMercadoPagoToken`) → company plaintext → master fallback. **Comportamento master
   permanece intacto.** `CredentialResolverService` do hub: rebaixar a helper interno do resolvedor
   unificado ou deletar (hoje ninguém consome).
4. **Expand da biblioteca master:** novo campo cifrado (`mercadoPagoLibraryCiphertext`) escrito em
   paralelo ao plano; leitura dupla (cifrado primeiro). Contract (dropar o plano) fica na Sprint 5.

## Critérios de aceite

- Teste: mesmo `eventId` entregue 2x → segundo retorna `duplicate`, zero `applyPayment` extra.
- Teste: 2 entregas concorrentes do mesmo pagamento → 1 única notificação e 1 único apply.
- Testes existentes de financeiro/master passam sem mudança de comportamento (token master continua
  ganhando quando configurado).
- `cd backend && npx tsc --noEmit` verde.

## Guardrails

- Frente financeira: revisão de diff obrigatória antes de publicar.
- Não tocar em Webwhats nem em envio WhatsApp além do guard de notificação.
- Nada de mudar URL de webhook registrada no painel do MP nesta sprint.

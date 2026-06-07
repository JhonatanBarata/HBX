# HBX AI Entrypoints

Use este arquivo para escolher o primeiro conjunto de arquivos a abrir.

## Entender o produto inteiro

1. `README.md`
2. `AGENTS.md`
3. `docs/ai/AI_CONTEXT.md`
4. `docs/ai/PRODUCT_INVARIANTS.md`
5. `backend/src/app.module.ts`
6. `backend/prisma/schema.prisma`
7. `frontend/src/app/layout.tsx`

## Radar / Webscraping

Backend:

- `backend/src/webscraping/webscraping.module.ts`
- `backend/src/webscraping/webscraping.controller.ts`
- `backend/src/webscraping/webscraping.service.ts`
- `backend/src/webscraping/radar/radar-webscraping-core.service.ts`
- `backend/src/webscraping/radar/01-search/README.md`
- `backend/src/webscraping/radar/02-filter/README.md`
- `backend/src/webscraping/radar/03-enrichment/README.md`
- `backend/src/webscraping/radar/05-delivery/radar-delivery-orchestrator.service.ts`
- `backend/src/webscraping/radar/05-delivery/radar-vendas-sync.service.ts`
- `backend/src/webscraping/radar/persistence/radar-run-repository.service.ts`

Frontend:

- `frontend/src/app/radar-digital/page.tsx`
- `frontend/src/app/radar-digital/page.client.tsx`
- `frontend/src/app/radar-digital/page.module.css`
- `frontend/src/app/webscraping/page.tsx`
- `frontend/src/app/webscraping/page.client.tsx`

Motor:

- `hbx-scraping-engine/README.md`
- `hbx-scraping-engine/app/main.py`
- `hbx-scraping-engine/app/schemas.py`
- `hbx-scraping-engine/app/services/search_service.py`
- `hbx-scraping-engine/app/services/web_search_service.py`
- `hbx-scraping-engine/app/services/parser.py`
- `hbx-scraping-engine/app/services/normalizer.py`

Testes:

- `backend/src/webscraping/radar-search-engine.test.ts`
- `backend/src/webscraping/radar-social-engine.test.ts`
- `backend/src/webscraping/radar-operational-smoke.test.ts`
- `tests/radar-backend-policy.test.mjs`
- `tests/frontend-radar-channel-filter.test.mjs`

## Vendas

Backend:

- `backend/src/vendas/vendas.module.ts`
- `backend/src/vendas/vendas.controller.ts`
- `backend/src/vendas/vendas.service.ts`
- `backend/src/vendas/vendas-automation.service.ts`
- `backend/src/vendas/prospecting-safety.ts`
- `backend/src/vendas/commercial-contact-fingerprint.ts`
- `backend/src/vendas/vendas-lead-enrichment.ts`

Frontend:

- `frontend/src/app/vendas/page.tsx`
- `frontend/src/app/vendas/page.client.tsx`
- `frontend/src/app/vendas/page.module.css`
- `frontend/src/app/vendas/automacao/page.tsx`
- `frontend/src/app/dashboard/vendas/page.tsx`

Testes:

- `backend/src/vendas/vendas.service.test.ts`
- `backend/src/vendas/vendas-automation.service.test.ts`
- `backend/src/vendas/vendas-lead-enrichment.test.ts`
- `tests/frontend-vendas-channel-icons.test.mjs`

## WhatsApp / Atendimento / Mensageria

Backend HBX:

- `backend/src/messaging/messaging.module.ts`
- `backend/src/messaging/messaging.controller.ts`
- `backend/src/messaging/messaging.service.ts`
- `backend/src/messaging/conversations.service.ts`
- `backend/src/messaging/webwhats-bridge.service.ts`
- `backend/src/messaging/whatsapp-channel.ts`
- `backend/src/messaging/whatsapp-consent-ledger.service.ts`
- `backend/src/inbox/inbox.service.ts`
- `backend/src/inbox/atendimento-config.ts`

Frontend:

- `frontend/src/app/whatsapp/page.client.tsx`
- `frontend/src/app/atendimento/page.client.tsx`
- `frontend/src/app/messages/page.client.tsx`
- `frontend/src/lib/whatsapp-center.ts`
- `frontend/src/lib/whatsapp-connection-flow.ts`
- `frontend/src/lib/useWhatsAppLiveHealth.ts`

Webwhats:

- `Webwhats/AGENTS.md`
- `Webwhats/src/main.ts`
- `Webwhats/src/api/server.module.ts`
- `Webwhats/src/api/routes/instance.router.ts`
- `Webwhats/src/api/routes/sendMessage.router.ts`
- `Webwhats/src/api/provider/sessions.ts`
- `Webwhats/src/api/services/channel.service.ts`

Compliance:

- `docs/compliance/whatsapp-opt-in.md`

## Comercial, planos, quotas e acesso pago

Backend:

- `backend/src/commercial-plans/commercial-plans.module.ts`
- `backend/src/commercial-plans/commercial-plans.service.ts`
- `backend/src/commercial-plans/commercial-entitlement.guard.ts`
- `backend/src/commercial-plans/commercial-usage-limits.service.ts`
- `backend/src/commercial-plans/commercial-plan-catalog.ts`
- `backend/src/modules/module-access.guard.ts`
- `backend/src/modules/module-access-policy.ts`
- `backend/src/plans/plans.service.ts`
- `backend/src/payments/mercado-pago-client.service.ts`
- `backend/src/financeiro/financeiro.service.ts`
- `backend/src/financeiro/financeiro.webhook.controller.ts`

Frontend:

- `frontend/src/lib/billing-access.ts`
- `frontend/src/lib/commercial-plans.ts`
- `frontend/src/app/planos/page.client.tsx`
- `frontend/src/app/checkout/page.tsx`
- `frontend/src/app/pagamento/page.client.tsx`
- `frontend/src/app/pre-checkout/page.client.tsx`
- `frontend/src/components/PreCheckoutGate.tsx`
- `frontend/src/components/PlanSelectionExperience.tsx`

Testes:

- `backend/src/commercial-plans/*.test.ts`
- `backend/src/modules/module-access-policy.test.ts`

## Auth, usuarios, master e tenant

Backend:

- `backend/src/auth/auth.module.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/guards/jwt-auth.guard.ts`
- `backend/src/auth/guards/master.guard.ts`
- `backend/src/auth/roles.guard.ts`
- `backend/src/users/users.service.ts`
- `backend/src/master-context/master-context.service.ts`
- `backend/src/admin/active-sessions.service.ts`

Frontend:

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/register/page.tsx`
- `frontend/src/app/reset-password/page.tsx`
- `frontend/src/app/_lib/useRequireAuth.ts`
- `frontend/src/app/_lib/useRequireModule.ts`
- `frontend/src/lib/masterContextEvents.ts`

## Financeiro / Recovery / Retorno

Backend:

- `backend/src/financeiro/financeiro.module.ts`
- `backend/src/financeiro/financeiro.service.ts`
- `backend/src/hbx-recovery/hbx-recovery.module.ts`
- `backend/src/hbx-recovery/hbx-recovery.service.ts`
- `backend/src/customer-profile/customer-profile.service.ts`
- `backend/src/integrations/external-webhook-ledger.service.ts`

Frontend:

- `frontend/src/app/hbx-recovery/page.client.tsx`
- `frontend/src/app/atendimento/recovery/page.tsx`
- `frontend/src/app/dashboard/financeiro/page.tsx`
- `frontend/src/app/master/financeiro/page.tsx`

Docs:

- `docs/security/external-webhook-ledger.md`

## Integracoes externas

Backend:

- `backend/src/integrations/integrations.module.ts`
- `backend/src/integrations/integration-connections.service.ts`
- `backend/src/integrations/integration-secrets.service.ts`
- `backend/src/integrations/credential-resolver.service.ts`
- `backend/src/integrations/auvo/*`
- `backend/src/integrations/tagplus/*`

Docs:

- `docs/security/company-secrets-migration.md`
- `docs/security/external-webhook-ledger.md`

## UI operacional

Componentes globais:

- `frontend/src/components/DashboardScaffold.tsx`
- `frontend/src/components/HbxGuide1.tsx`
- `frontend/src/components/HbxGuide4.tsx`
- `frontend/src/components/ThemeProvider.tsx`
- `frontend/src/components/TopBar.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/theme-palettes.ts`
- `frontend/src/lib/design-tokens.ts`

Padroes:

- `guia1`: `HbxGuide1`, `hbx-guide1-slot`, `hbx-guide1`, `hbx-tab-glide`.
- `guiaesquerdovertical`: `HbxGuide4`, `hbx-guide4-slot`, `hbx-guide4`.
- `subguia`: `hbx-guide5`.


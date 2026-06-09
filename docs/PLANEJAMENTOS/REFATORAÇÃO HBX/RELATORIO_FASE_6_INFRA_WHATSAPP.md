# Relatorio Fase 6 - Infraestrutura WhatsApp

Data: 2026-06-08

## Objetivo

Manter `hbx-master-whatsapp-engine` apenas como infraestrutura tecnica de WhatsApp, sem papel de cliente comercial, billing, modulos tenant ou vendedores comerciais.

## Ajustes aplicados

- Criacao/obtenção da empresa tecnica do motor WhatsApp agora grava `companyKind="platform_infra"` em:
  - `backend/src/companies/companies.service.ts`;
  - `backend/src/master-context/master-context.service.ts`;
  - `backend/src/vendas/vendas.service.ts`.
- Regras comerciais passaram a consultar `companyKind`, nao slug, em:
  - `backend/src/commercial-plans/commercial-plans.service.ts`;
  - `backend/src/commercial-plans/commercial-usage-limits.service.ts`;
  - `backend/src/commercial-plans/seat-billing.util.ts`;
  - `backend/src/vendas/vendas.service.ts`.
- `platform_infra` recebe snapshot comercial zerado em usage limits.
- O slug `hbx-master-whatsapp-engine` permanece apenas como constante tecnica para localizar/criar a infraestrutura.

## Validacao

- `npm --prefix backend run build`
- `node --test backend/dist/common/company-kind.test.js backend/dist/access/seller-access-governance.test.js backend/dist/modules/module-access-policy.test.js`
- `node --test backend/dist/commercial-plans/commercial-usage-limits.service.test.js`

## Observacao

A migracao da Fase 2 continua responsavel por backfill de registros existentes. Esta fase ajustou runtime e criacoes novas.

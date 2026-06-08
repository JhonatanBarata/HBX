# Relatorio Fase 8 - Testes obrigatorios

Data: 2026-06-08

## Objetivo

Adicionar e validar testes que travam a separacao entre System Master, tenant comercial e infraestrutura tecnica.

## Cobertura por requisito

1. Empresa `slug="hbx"` com `companyKind="tenant"` nao ganha privilegio especial.
   - `backend/src/common/company-kind.test.ts`
   - `backend/src/modules/module-access-policy.test.ts`
   - `backend/src/access/seller-access-governance.test.ts`

2. Empresa HBX tenant usa a mesma regra de empresa cliente.
   - `backend/src/modules/module-access-policy.test.ts`
   - `backend/src/team/team-policy.service.test.ts`

3. Empresa `platform_infra` nao aparece como empresa comercial/modulo tenant.
   - `backend/src/modules/module-access-policy.test.ts`
   - `backend/src/commercial-plans/commercial-usage-limits.service.test.ts`

4. System Master sem contexto assumido nao vira empresa operacional comercial.
   - `backend/src/auth/auth.service.test.ts`

5. `hbx-master-whatsapp-engine` so e aceito em fluxo tecnico de infraestrutura.
   - `backend/src/companies/master-whatsapp-engine-company.test.ts`
   - Regressao comercial coberta por module/access/usage tests.

6. Access governor antigo `HBX_MASTER` nao existe mais no runtime.
   - `backend/src/access/seller-access-governance.test.ts`
   - `backend/src/modules/module-access-policy.test.ts`

7. Login de tenant manual/premium segue fluxo normal, sem `if` por slug `hbx`.
   - `backend/src/auth/auth.service.test.ts`

## Testes novos

- `backend/src/auth/auth.service.test.ts`
- `backend/src/companies/master-whatsapp-engine-company.test.ts`

## Validacao executada

- `npm --prefix backend run build`
- `node --test backend/dist/auth/auth.service.test.js backend/dist/companies/master-whatsapp-engine-company.test.js backend/dist/master-provisioning/master-provisioning.service.test.js`
- `node --test backend/dist/common/company-kind.test.js backend/dist/access/seller-access-governance.test.js backend/dist/modules/module-access-policy.test.js backend/dist/commercial-plans/commercial-usage-limits.service.test.js`
- `node --test backend/dist/gerencial/hbx-partner-referral.service.test.js backend/dist/gerencial/seller-onboarding.service.test.js backend/dist/team/team-policy.service.test.js`

Resultado: todos passaram.

## Observacao

Frontend nao foi alterado nesta fase, entao lint/build frontend nao foram repetidos aqui. A fase anterior ja havia validado frontend apos as mudancas de UI/contrato.

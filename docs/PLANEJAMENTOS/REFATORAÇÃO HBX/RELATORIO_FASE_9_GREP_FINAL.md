# Relatorio Fase 9 - Grep final e limpeza

Data: 2026-06-08

## Objetivo

Remover restos de regra antiga por slug/governador e confirmar que `System Master`, tenant comercial e infraestrutura tecnica nao voltaram a se misturar.

## Limpeza aplicada

- `backend/src/common/effective-company.ts` nao resolve mais contexto por `hbx_seller_operational_company` ou `master_operational_company`.
- `backend/src/companies/companies.controller.ts` deixou de enviar empresa operacional HBX para resolver contexto efetivo.
- `backend/src/pulse/hbx-pulse.service.ts` deixou de tratar slug da engine como operacao master; apenas contexto explicito `master_operacional` define operacao.
- `backend/src/commercial-plans/seat-billing.util.ts` perdeu o helper legado por slug `isMasterOperationalCompanySlug`.
- Radar deixou de importar/reexportar `MASTER_WHATSAPP_ENGINE_COMPANY_SLUG` em massa e nao usa mais o slug da engine como empresa operacional comercial.
- Textos publicos restantes foram normalizados de "Parceiro/Rede HBX/Master HBX" para termos genericos como vendedor, indicacoes ou responsavel.

## Resultado do grep em runtime

Comandos executados:

```powershell
rg -n 'HBX_MASTER|COMPANY_ADMIN|isHbxOperationCompany|isMasterOperationalCompany|master_operational_company|hbx_seller_operational_company|slug === ''hbx''|slug === "hbx"' backend/src frontend/src
rg -n "isMasterOperationalCompanySlug|MASTER_WHATSAPP_ENGINE_COMPANY_SLUG|hbx-master-whatsapp-engine" backend/src frontend/src
rg -n "hbx_partner_seller|Parceiro HBX|parceiro HBX|Rede HBX|Direto HBX|Master HBX" backend/src frontend/src
```

Classificacao:

- `HBX_MASTER`, `COMPANY_ADMIN`, `isHbxOperationCompany`, `isMasterOperationalCompany`, `master_operational_company`, `hbx_seller_operational_company` e checks `slug === "hbx"` nao aparecem mais como regra runtime.
- Restam apenas marcadores CSS `HBX_MASTER_*` em `frontend/src/app/master/_command-center/MasterCommandCenter.module.css`; sao comentarios de bloco visual, nao regra de acesso, billing ou tenant.
- `MASTER_WHATSAPP_ENGINE_COMPANY_SLUG` e `hbx-master-whatsapp-engine` permanecem em `companies`, `master-context`, `vendas`, constante e teste dedicado para localizar/criar a infraestrutura tecnica do WhatsApp.
- Nao restou texto publico runtime com `hbx_partner_seller`, `Parceiro HBX`, `Rede HBX`, `Direto HBX` ou `Master HBX`.

## Resultado do grep em documentos

Comandos executados:

```powershell
rg -n 'HBX_MASTER|COMPANY_ADMIN|isHbxOperationCompany|isMasterOperationalCompany|master_operational_company|hbx_seller_operational_company|slug === ''hbx''|slug === "hbx"' "docs/PLANEJAMENTOS/REFATORAÇÃO HBX"
rg -n "isMasterOperationalCompanySlug|MASTER_WHATSAPP_ENGINE_COMPANY_SLUG|hbx-master-whatsapp-engine" "docs/PLANEJAMENTOS/REFATORAÇÃO HBX"
rg -n "hbx_partner_seller|Parceiro HBX|parceiro HBX|Rede HBX|Direto HBX|Master HBX" "docs/PLANEJAMENTOS/REFATORAÇÃO HBX"
```

Classificacao:

- As ocorrencias em `RELATORIO_FASE_1_INVENTARIO.md`, relatorios das fases e no plano master sao historico/contexto da propria refatoracao.
- Essas ocorrencias nao representam regra ativa e devem continuar documentadas para auditoria do corte.

## Validacao executada

- `npm --prefix backend run build`
- `node --test backend/dist/auth/auth.service.test.js backend/dist/companies/master-whatsapp-engine-company.test.js backend/dist/master-provisioning/master-provisioning.service.test.js backend/dist/pulse/hbx-pulse.service.test.js`
- `node --test backend/dist/common/company-kind.test.js backend/dist/access/seller-access-governance.test.js backend/dist/modules/module-access-policy.test.js backend/dist/commercial-plans/commercial-usage-limits.service.test.js`
- `node --test backend/dist/gerencial/hbx-partner-referral.service.test.js backend/dist/gerencial/seller-onboarding.service.test.js backend/dist/team/team-policy.service.test.js`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

Resultado: todos passaram.

## Observacao

`docs/ai/README.md` exigido por `AGENTS.md` nao existe neste checkout. A execucao seguiu com `AGENTS.md` e a skill local `project-standards`.

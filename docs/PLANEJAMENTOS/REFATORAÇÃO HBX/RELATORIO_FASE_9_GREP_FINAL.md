# Relatorio Fase 9 - Grep final e limpeza

Data: 2026-06-08

## Objetivo

Confirmar que o corte Master/tenant nao deixou vestigios runtime da arquitetura antiga:
System Master nao vira empresa operacional automaticamente, `platform_infra` nao recebe plano/modulo comercial e HBX passa a ser tenant comum.

## Limpeza aplicada

- `MasterContextService` agora retorna `effectiveCompanyId: null` e `master_puro` quando o System Master nao tem tenant assumido.
- `CommercialPlansService` removeu fallback para empresa tecnica e bloqueia `platform_infra` como contexto de plano comercial.
- Triggers de `ModulesService` inserem `CompanyModule` somente para `companyKind='tenant'` e limpam modulos de `platform_infra`.
- Radar passou a usar regra generica de vendedor/tenant, sem `isHbxOperationSellerUser`, `hbxSellerScope` ou `scope hbx_master` em runtime.
- Distribuicao automatica do Radar usa `tenant_distribution`; dados antigos sao tratados por migration marcada `MIGRATION_ONLY`.
- Limites especiais de vendedor passam por policy/tenant/plano, sem constantes ou metodo HBX seller.
- Gerencial manteve documentacao, comissao, heranca e indicacao como escolhas genericas do dono da empresa.
- `MasterProvisioning` ganhou endpoint protegido para provisionar tenant e explicita pendencias `pending_schema/deferred`.
- Foi criada migration de inventario nao destrutivo para dados comerciais que ainda possam estar na empresa tecnica.

## Grep obrigatorio

Comando executado em runtime:

```powershell
rg -n -F -e 'isHbxOperationSellerUser' -e 'hbxSellerScope' -e 'hbx_master' -e 'master_operacional' -e 'master_operational' -e 'MasterRadar' -e 'parseMasterRadar' -e 'listMasterRadar' -e 'executeMasterRadar' -e 'HBX_SELLER_' -e 'computeHbxSellerOperationalLimits' -e 'HBX_MASTER' -e 'COMPANY_ADMIN' -e 'slug === "hbx"' -e "slug === 'hbx'" backend/src frontend/src
```

Resultado: zero ocorrencias em `backend/src` e `frontend/src`.

Ocorrencias permitidas:

- `backend/prisma/migrations/20260608_hbx_platform_infra_inventory/migration.sql` contem `hbx_master` somente para backfill `MIGRATION_ONLY`.
- Documentos historicos em `docs/PLANEJAMENTOS/REFATORAÇÃO HBX` podem manter termos antigos como registro da refatoracao.

## Validacao executada

- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- `cd backend && node --test dist/auth/auth.service.test.js dist/companies/master-whatsapp-engine-company.test.js dist/master-provisioning/master-provisioning.service.test.js dist/pulse/hbx-pulse.service.test.js dist/common/company-kind.test.js dist/access/seller-access-governance.test.js dist/modules/module-access-policy.test.js dist/commercial-plans/commercial-usage-limits.service.test.js dist/gerencial/hbx-partner-referral.service.test.js dist/gerencial/seller-onboarding.service.test.js dist/gerencial/seller-contract-template.test.js dist/team/team-policy.service.test.js`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

Resultado: todos passaram.

## Observacao

`docs/ai/README.md` exigido por `AGENTS.md` nao existe neste checkout. A execucao seguiu com `AGENTS.md` e a skill local `project-standards`.

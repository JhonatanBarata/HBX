# Relatorio Fase 4 - Access/modules

Data: 2026-06-08
Branch: `refactor/master-tenant-clean-cut`

Escopo executado: remover o governor antigo de access/modules e trocar a decisao local para `tenant` / `platform_infra`. Auth, billing, team, users, Vendas, Gerencial, Radar, Master Context e frontend ficaram fora desta fase.

## Arquivos alterados

- `backend/src/access/seller-access-governance.ts`
- `backend/src/access/seller-access-governance.test.ts`
- `backend/src/modules/module-access-policy.ts`
- `backend/src/modules/module-access-policy.test.ts`
- `backend/src/modules/modules.service.ts`

## Regras alteradas

- `AccessGovernor` deixou de ser `'HBX_MASTER' | 'COMPANY_ADMIN'`.
- `resolveAccessGovernor` agora resolve pelo helper `resolveCompanyKind`.
- `slug`, `isHbxOperation` e `isMasterOperationalCompany` nao entram mais na decisao de access/modules.
- `platform_infra` fica bloqueado para modulos comerciais.
- HBX com `companyKind="tenant"` segue a mesma regra de qualquer tenant.
- Vendedor de HBX tenant nao ganha Radar desktop por slug; segue o mesmo default de cliente:
  - `vendas`: permitido por default operacional;
  - `webscraping`: permitido no mobile, nao no desktop sem permissao/configuracao.
- Governanca de vendedor comercial em `platform_infra` e bloqueada, inclusive para System Master neste fluxo de modulos.
- Sync automatico de `CompanyModule` para todas as empresas passou a considerar apenas `companyKind='tenant'`.
- Listagens comerciais do Master dentro de `modules.service` passaram a buscar `companyKind='tenant'`.

## Protecoes adicionadas

- `resolveCompanyModuleAccessPolicy` retorna `blocked` para `platform_infra`, com `moduleKeys` vazio.
- `evaluateCompanyStatus` em `modules.service` trata `platform_infra` como inativa para acesso a modulos, sem ativar premium por slug.
- `setCompanyModuleByMaster` rejeita `platform_infra`.
- `syncCompanyModulesForPlanTx` desabilita modulos e nao faz upsert quando a empresa e `platform_infra`.
- Acesso direto ao modulo `financeiro` tambem bloqueia `platform_infra`.

## Testes ajustados

- `backend/src/access/seller-access-governance.test.ts`
  - `resolveAccessGovernor` usa `companyKind`;
  - `slug='hbx'` sem `companyKind` especial resolve como tenant;
  - falta de `companyKind` cai em tenant.
- `backend/src/modules/module-access-policy.test.ts`
  - `platform_infra` nao recebe modulos comerciais;
  - HBX tenant manual/premium segue plano selecionado;
  - HBX tenant seller segue defaults de cliente;
  - governanca bloqueia `platform_infra` e preserva boundary de admin por tenant.

## Validacoes executadas

```powershell
cd backend
npm run build
node --test dist/common/company-kind.test.js
node --test dist/access/seller-access-governance.test.js
node --test dist/modules/module-access-policy.test.js
```

Resultado:

- `npm run build` passou.
- `company-kind.test`: 4 testes, 4 passes.
- `seller-access-governance.test`: 4 testes, 4 passes.
- `module-access-policy.test`: 11 testes, 11 passes.

## Grep da Fase 4

Comando:

```powershell
rg -n -e 'HBX_MASTER' -e 'COMPANY_ADMIN' -e 'isHbxOperationCompany' -e 'MASTER_WHATSAPP_ENGINE_COMPANY_SLUG' -e 'isMasterOperationalCompany' -e "slug === 'hbx'" -e 'hbx-master-whatsapp-engine' backend/src/access backend/src/modules --glob '!**/*.test.ts' --glob '!**/node_modules/**'
```

Resultado:

- Nenhum vestigio em runtime de `backend/src/access`.
- Nenhum vestigio em runtime de `backend/src/modules`.

Grep amplo em `backend/src` e `frontend/src` ainda encontrou vestigios fora do escopo da Fase 4, principalmente em:

- `backend/src/auth`
- `backend/src/commercial-plans`
- `backend/src/team`
- `backend/src/users`
- `backend/src/vendas`
- `backend/src/gerencial`
- `backend/src/pulse`
- `backend/src/master-context`
- `backend/src/common/effective-company.ts`
- `backend/src/webscraping/radar`
- `frontend/src/components/TopBar.tsx`
- CSS do Master com marcadores `HBX_MASTER_*`

Esses pontos ficam para as proximas fases.

## Observacoes

- A migration da Fase 2 continua criada, mas nao aplicada ao banco.
- O build executou `prisma:generate`.
- `module-access-policy.ts` ja tinha texto PT-BR com caracteres nao ASCII antes desta fase; nao foram adicionados novos textos com acento.

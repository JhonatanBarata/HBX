# Relatorio Fase 3 - Helper central companyKind

Data: 2026-06-08
Branch: `refactor/master-tenant-clean-cut`

Escopo executado: criar helper central para interpretar `Company.companyKind` e provar que a decisao nao usa slug nem flags antigas. Nenhum consumidor runtime antigo foi migrado nesta fase.

## Arquivos alterados

- `backend/src/common/company-kind.ts`
- `backend/src/common/company-kind.test.ts`

## Helper criado

Arquivo: `backend/src/common/company-kind.ts`

Exports:

```ts
COMPANY_KIND_TENANT
COMPANY_KIND_PLATFORM_INFRA
type CompanyKind
type CompanyKindCompanyLike
resolveCompanyKind(company)
isTenantCompany(company)
isPlatformInfraCompany(company)
```

Regras implementadas:

- `companyKind === "platform_infra"` resolve como infraestrutura de plataforma;
- qualquer outro valor resolve como `tenant`, alinhado ao default do schema;
- `slug`, `isHbxOperation` e `isMasterOperationalCompany` nao participam da decisao;
- HBX com `companyKind="tenant"` permanece tenant normal.

## Testes adicionados

Arquivo: `backend/src/common/company-kind.test.ts`

Coberturas:

- tenant explicito resolve como tenant;
- `platform_infra` explicito resolve como infra;
- slug legado `hbx-master-whatsapp-engine` nao concede infra sem `companyKind`;
- flags antigas nao influenciam o resultado;
- valores nulos/vazios/invalidos caem para `tenant`.

## Validacoes executadas

```powershell
cd backend
npm run build
node --test dist/common/company-kind.test.js
```

Resultado:

- `npm run build` passou.
- `node --test dist/common/company-kind.test.js` passou: 4 testes, 4 passes.

## Observacoes

- A Fase 3 nao removeu `HBX_MASTER`, `COMPANY_ADMIN`, `isHbxOperationCompany`, `isMasterOperationalCompany` ou regras por slug do runtime.
- A remocao real deve comecar na Fase 4, limitada a access/modules.
- Ao migrar consumidores, garantir que consultas Prisma selecionem `companyKind`; caso contrario a decisao cai em `tenant` por default.

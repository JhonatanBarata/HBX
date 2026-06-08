# Relatorio Fase 1 - Inventario master/tenant/infra

Data: 2026-06-08
Branch: `refactor/master-tenant-clean-cut`

Escopo executado: inventario e mapa de impacto. Nenhum arquivo de runtime foi alterado nesta fase.

## Preparacao

- Branch inicial encontrada: `master`.
- Branch obrigatoria criada e ativa: `refactor/master-tenant-clean-cut`.
- `docs/ai/README.md` solicitado pelo `AGENTS.md` nao existe no repo atual.
- `Company.companyKind` nao existe em `backend/prisma/schema.prisma`.

## Comandos executados

```powershell
git branch --show-current
git status --short
rg -n -e 'HBX_MASTER' -e 'COMPANY_ADMIN' -e 'isHbxOperationCompany' -e 'isMasterOperationalCompany' -e 'master_operacional' -e 'master_operational_company' -e 'hbx_seller_operational_company' -e "slug === 'hbx'" -e 'slug === "hbx"' -e 'MASTER_WHATSAPP_ENGINE_COMPANY_SLUG' -e 'hbx-master-whatsapp-engine' .
rg -n -e 'HBX_MASTER' -e 'COMPANY_ADMIN' -e 'isHbxOperationCompany' -e 'isMasterOperationalCompany' -e 'master_operacional' -e 'master_operational_company' -e 'hbx_seller_operational_company' -e "slug === 'hbx'" -e 'slug === "hbx"' -e 'MASTER_WHATSAPP_ENGINE_COMPANY_SLUG' -e 'hbx-master-whatsapp-engine' backend frontend --glob '!**/node_modules/**' --files-with-matches
rg -n -e 'CompanyKind|companyKind|platform_infra|tenant' backend/prisma/schema.prisma backend/src frontend/src --glob '!**/node_modules/**'
```

Observacao: a primeira tentativa de grep com regex unico falhou por escape de aspas no PowerShell. A busca foi repetida com `-e` por termo e retornou normalmente.

## Contagem por termo

Contagem em `backend`, `frontend` e `docs`, sem `node_modules`:

| Termo | Ocorrencias |
| --- | ---: |
| `HBX_MASTER` | 21 |
| `COMPANY_ADMIN` | 7 |
| `isHbxOperationCompany` | 8 |
| `isMasterOperationalCompany` | 37 |
| `master_operacional` | 12 |
| `master_operational_company` | 6 |
| `hbx_seller_operational_company` | 5 |
| `MASTER_WHATSAPP_ENGINE_COMPANY_SLUG` | 70 |
| `hbx-master-whatsapp-engine` | 20 |
| `slug === 'hbx'` | 4 |
| `slug === "hbx"` | 1 |

`slug === 'hbx'` aparece em runtime comercial em:

- `backend/src/access/seller-access-governance.ts`
- `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts`

As demais ocorrencias desse termo estao em documentacao/plano. `slug === "hbx"` apareceu apenas em documentacao.

## Classificacao dos achados

### Runtime comercial - prioridade alta

Arquivos que hoje usam regra antiga para acesso, modulo, billing, perfil, login ou operacao comercial:

- `backend/src/access/seller-access-governance.ts`
  - Define `AccessGovernor = 'HBX_MASTER' | 'COMPANY_ADMIN'`.
  - `isHbxOperationCompany` libera por `isHbxOperation`, `isMasterOperationalCompany`, `slug === 'hbx'` e `MASTER_WHATSAPP_ENGINE_COMPANY_SLUG`.
  - Deve ser substituido por helper de `companyKind` na Fase 3/4.
- `backend/src/modules/modules.service.ts`
  - Consome `isHbxOperationCompany`, `resolveAccessGovernor` e trata `governor === 'HBX_MASTER'`.
  - Tambem filtra/cria logica usando `MASTER_WHATSAPP_ENGINE_COMPANY_SLUG`.
- `backend/src/modules/module-access-policy.ts`
  - Resolve acesso por slug da engine.
- `backend/src/auth/auth.service.ts`
  - Tem multiplos desvios de login, acesso e confirmacao por `MASTER_WHATSAPP_ENGINE_COMPANY_SLUG`.
- `backend/src/auth/profile.controller.ts`
  - Marca usuario como rede/parceiro HBX por slug da empresa.
- `backend/src/common/effective-company.ts`
  - Mantem modos antigos `master_operacional`, `master_operational_company` e `hbx_seller_operational_company`.
- `backend/src/commercial-plans/seat-billing.util.ts`
  - `isMasterOperationalCompanySlug` remove a engine da cobranca por slug.
- `backend/src/commercial-plans/commercial-plans.service.ts`
  - `isMasterOperationalCompany` libera acesso/entitlements por slug.
- `backend/src/commercial-plans/commercial-usage-limits.service.ts`
  - Concede plano/limites especiais por slug ou flag antiga.
- `backend/src/users/users.service.ts`
  - Decide billable/HBX seller network por slug.
- `backend/src/team/team-policy.service.ts`
  - Trata vendedor/parceiro HBX, limites e permissoes por slug.
- `backend/src/team/team-policy-persistence.ts`
  - Gera snapshot `hbx_partner_seller` por slug.
- `backend/src/vendas/vendas.service.ts`
  - Usa slug da engine para rede de vendedores HBX e tambem cria/busca empresa da engine.
- `backend/src/gerencial/gerencial.service.ts`
  - Usa slug da engine para `isHbxSellerNetwork`.
- `backend/src/gerencial/seller-onboarding.service.ts`
  - Restringe onboarding de parceiro HBX por slug da engine.
- `backend/src/gerencial/hbx-partner-referral.service.ts`
  - Restringe indicacao de parceiros por slug da engine.
- `backend/src/pulse/hbx-pulse.service.ts`
  - Usa `master_operacional` ou slug da engine para escopo `master_operation`.
- `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts`
  - Libera visibilidade HBX por `isHbxOperation`, `isMasterOperationalCompany`, `slug === 'hbx'` ou slug da engine.

### Frontend runtime - prioridade alta/media

- `frontend/src/lib/billing-access.ts`
  - Define `HBX_OPERATIONAL_COMPANY_SLUG = "hbx-master-whatsapp-engine"`.
  - `isHbxOperationalCompany` ignora pre-checkout quando a company tem esse slug.
- `frontend/src/app/pagamento/page.client.tsx`
  - Usa `isHbxOperationalCompany(profile?.company)` para redirecionar para `/vendas` ou `/gerencial`.
- `frontend/src/app/pagamento/page.mobile.client.tsx`
  - Mesmo desvio no fluxo mobile.
- `frontend/src/components/TopBar.tsx`
  - Tipos e UI ainda aceitam `master_operacional`.

### Infraestrutura WhatsApp/engine - pode permanecer, mas precisa ser marcada como infra

- `backend/src/companies/master-whatsapp-company.constants.ts`
  - Constantes tecnicas da engine: slug e nome.
  - Pode continuar apenas se usado como infraestrutura tecnica.
- `backend/src/companies/companies.service.ts`
  - `getOrCreateMasterWhatsAppEngineCompany()` cria a empresa da engine com status manual/premium.
  - Na Fase 2 deve passar a criar/backfill com `companyKind="platform_infra"`.
- `backend/src/master-context/master-context.service.ts`
  - Cria/assume workspace `master_operacional` e cria a company da engine.
  - Precisa ser separado entre contexto tecnico do Master e tenant comercial.
- `backend/src/vendas/vendas.service.ts`
  - `getOrCreateMasterWhatsappEngineCompanyId()` tambem cria engine dentro de Vendas.
  - Risco alto: Vendas nao deve criar empresa de infra como workspace comercial.
- `backend/src/webscraping/radar/05-delivery/radar-core-distribution.mixin.ts`
  - Busca company da engine para distribuicao; revisar se e infraestrutura ou acesso comercial.

### Radar/webscraping - importacoes em cadeia

Muitos arquivos de Radar importam `MASTER_WHATSAPP_ENGINE_COMPANY_SLUG` via `radar-core-method-imports.ts`, mas a maioria dos achados e import/re-export. O uso runtime claro fica em:

- `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts`
- `backend/src/webscraping/radar/05-delivery/radar-core-distribution.mixin.ts`

Arquivos com importacao/re-export que devem cair naturalmente quando a fonte for limpa:

- `backend/src/webscraping/radar/radar-webscraping-core.service.ts`
- `backend/src/webscraping/radar/radar-core-method-imports.ts`
- `backend/src/webscraping/radar/providers/hbx-engine/radar-core-provider.mixin.ts`
- `backend/src/webscraping/radar/persistence/radar-core-history-persistence.mixin.ts`
- `backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts`
- `backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts`
- `backend/src/webscraping/radar/01-search/*`

### Testes a reescrever

Testes que validam explicitamente a regra antiga:

- `backend/src/access/seller-access-governance.test.ts`
- `backend/src/modules/module-access-policy.test.ts`
- `backend/src/commercial-plans/commercial-usage-limits.service.test.ts`
- `backend/src/team/team-policy.service.test.ts`
- `backend/src/pulse/hbx-pulse.service.test.ts`
- `backend/src/gerencial/seller-onboarding.service.test.ts`
- `backend/src/gerencial/hbx-partner-referral.service.test.ts`

Esses testes devem virar prova do novo comportamento:

- HBX tenant nao ganha privilegio por slug.
- `platform_infra` nao aparece como tenant comercial.
- `HBX_MASTER` nao existe mais em runtime.
- Engine so passa em fluxo tecnico de infra.

### Migration/backfill historico

Ocorrencias antigas em migrations existentes:

- `backend/prisma/migrations/20260523_zz_add_billable_seat_usage/migration.sql`
- `backend/prisma/migrations/20260607_user_team_policy/migration.sql`

Essas migrations sao historicas. Nao alterar retroativamente sem necessidade. Na Fase 2, criar nova migration/backfill idempotente com comentario `MIGRATION_ONLY` para qualquer referencia a slug antigo.

### Documentacao e CSS

- plano antigo de simplificacao de regras admin/master em `docs/PLANEJAMENTOS`
- plano desta refatoracao em `docs/PLANEJAMENTOS/REFATORACAO HBX`
- `frontend/src/app/master/_command-center/MasterCommandCenter.module.css`

Documentacao pode continuar citando nomes antigos como contexto. Os marcadores CSS `HBX_MASTER_*` parecem labels de estilo, nao regra de runtime; baixa prioridade.

## Arquivos a tocar primeiro

Para evitar refatoracao grande demais, a proxima fase deve tocar primeiro apenas:

1. `backend/prisma/schema.prisma`
2. nova migration Prisma/backfill de `Company.companyKind`
3. helper central de `companyKind` em backend
4. teste unitario do helper

Depois disso, aplicar cortes por bloco:

1. access/modules;
2. auth/profile/login;
3. commercial-plans/seat billing/usage;
4. team/users/gerencial/vendas;
5. master-context/infra WhatsApp;
6. frontend billing/pagamento/topbar;
7. Radar presentation/distribution.

## Criterio de parada desta fase

O inventario mostrou a regra antiga espalhada em muitas areas. Portanto a Fase 2 deve ficar restrita a schema/backfill/helper base. Nao misturar Fase 2 com remocao de access governor, login, billing ou Radar.

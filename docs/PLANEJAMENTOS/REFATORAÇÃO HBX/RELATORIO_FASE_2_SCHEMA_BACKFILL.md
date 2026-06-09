# Relatorio Fase 2 - Schema e backfill companyKind

Data: 2026-06-08
Branch: `refactor/master-tenant-clean-cut`

Escopo executado: adicionar base de dados para separar tenant de infraestrutura. Nenhum guard, service comercial, login, modulo, Vendas, Radar, Gerencial ou frontend access helper foi refatorado nesta fase.

## Arquivos alterados

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260608_company_kind/migration.sql`

## Schema

Foi adicionado em `Company`:

```prisma
companyKind String @default("tenant") // tenant | platform_infra
```

Tambem foi adicionado:

```prisma
@@index([companyKind])
```

Decisao: usar `String` em vez de enum Prisma para seguir o padrao atual do schema, que ja armazena varias classificacoes como texto por compatibilidade.

## Migration criada

Migration: `backend/prisma/migrations/20260608_company_kind/migration.sql`

Comportamento idempotente:

- adiciona `"companyKind"` se a coluna ainda nao existir;
- garante default `tenant`;
- normaliza nulos/valores invalidos para `tenant`;
- marca `hbx-master-whatsapp-engine` como `platform_infra`;
- garante `HBX` e `HBX2` como `tenant`;
- promove HBX por nome para `slug='hbx'` quando nao houver slug HBX;
- promove uma seed local HBX2 para HBX somente quando nao houver HBX;
- garante HBX com acesso manual/full por dados:
  - `companyKind='tenant'`;
  - `onboardingStatus='active_paid'`;
  - `paymentStatus='MANUAL'`;
  - `paymentMethod='MANUAL'`;
  - `subscriptionStatus='manual'`;
  - `billingProvider='manual'`;
  - `premiumAccess=true`;
  - `isActive=true`;
- adiciona check constraint `Company_companyKind_check`;
- adiciona indice `Company_companyKind_idx`.

As referencias antigas a slug na migration estao marcadas com `MIGRATION_ONLY`.

## Validacoes executadas

```powershell
cd backend
npm run prisma:validate
npm run build
```

Resultado:

- `prisma:validate` passou.
- `npm run build` passou.
- O build executou `prisma:generate` e gerou Prisma Client local em `backend/node_modules/@prisma/client`.

## Observacoes

- A migration foi criada, mas nao foi aplicada ao banco nesta fase.
- `docs/ai/README.md` continua ausente no repo atual.
- A Fase 2 nao removeu vestigios runtime; isso fica para as fases seguintes conforme o plano.

## Proximo corte recomendado

Aplicar a Fase 3 com escopo pequeno:

1. criar helper central `resolveCompanyKind`, `isTenantCompany`, `isPlatformInfraCompany`;
2. adicionar teste unitario do helper;
3. nao alterar access/modules ainda, exceto se for necessario para compilar o helper.

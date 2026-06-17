# Regras — BACKEND

> NestJS + Prisma + PostgreSQL em `backend/`.
> Leia este arquivo antes de tocar em endpoint, serviço, schema ou migration.

## Princípios

- **Backend é contrato.** Refazer tela no frontend NUNCA muda endpoint, payload ou
  regra de negócio. Mudança de backend é trilha própria, planejada e explícita.
- O backend é a fonte de verdade de autorização comercial (ver docs/Rules/PAGAMENTOS.md).
- Radar é a memória de leads e oportunidades: **resultado negativo nunca é descartado
  casualmente** — ele protege o sistema de retrabalho.

## Pontos de entrada canônicos

- Estado de acesso/cobrança: `backend/src/modules/company-access-state.ts`
  (`resolveCompanyAccessState`) — todo o resto projeta dele.
- Política de módulos por plano: `backend/src/modules/module-access-policy.ts`
  (inclui `presentModuleBlockForRole`: vendedor nunca vê motivo financeiro).
- Catálogo comercial: `backend/src/commercial-plans/commercial-plan-catalog.ts`.
- Seeds estruturais: `backend/src/bootstrap/structural-defaults.json`
  (módulos globais, planos default, permissões de importação, seed local de dev).
- Superfície master-pura: `MASTER_SURFACE_MODULE_KEYS` em `modules.service.ts`
  (só `master` e `exclusoes`; superfície completa só ao "Operar" uma empresa).

## Banco e migrations

- Migration destrutiva ou operação destrutiva de dados: SÓ com ordem explícita do dono
  na tarefa atual.
- Migrations Prisma rodam dentro do container `hbx-backend` em produção
  (via `backend/scripts/start-prod.sh`) — nunca `npx prisma` no host contra produção.
- Local é descartável; produção só recebe código, migrations e bootstrap estrutural
  idempotente. Dado operacional real não nasce no banco local esperando subir.
- `npm run up` recusa `backend/.env` apontando para banco remoto (proteção contra
  Prisma Studio em produção por engano).

## Mensageria WhatsApp (Cloud API)

- Envio via padrão Outbox com retry (backoff exponencial + jitter) e integração
  por webhook. Não trocar o mecanismo sem plano próprio (ver docs/Rules/WHATSAPP.md).

## Proibido sem ordem explícita do dono

Vale a lista única de segurança do [CLAUDE.md](../../CLAUDE.md): auth/autorização,
secrets, env de produção, deploy/publish/restart, migration destrutiva e refactor
amplo fora de escopo.

## Checks padrão (menor conjunto relevante aos arquivos tocados)

- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- Testes direcionados do `backend/package.json` quando a área tocada bater com eles.
- `npm run test:e2e` (raiz) só quando um caminho end-to-end mudou e o ambiente está pronto.

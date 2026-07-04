# RBAC / Hierarquia de Papéis — Sprint 3
## Papel decidido num só lugar (`resolveActorKind`) + `AccessContext` 1× por request

## Contexto verificado

- "Gerente" NÃO é role no banco: `role=ADMIN` + `canViewBilling=false`
  (`backend/prisma/schema.prisma:1092`). A derivação existe em **3 lugares** com fórmula
  hoje **idêntica** (`!isSystemMaster && role==='ADMIN' && canViewBilling===false`):
  - `backend/src/team/team-policy.service.ts:462` (`isGerente`)
  - `backend/src/inbox/inbox.service.ts:232` (`isGerenteUser`)
  - `backend/src/auth/profile.controller.ts:522` (`resolveUserKind`)
  O problema NÃO é divergência atual (auditado 01/07: são consistentes) — é o custo de
  manutenção e o drift futuro: a 4ª cópia que alguém escrever diferente.
- **52 checks inline** `role === 'ADMIN'` em **21 arquivos** (top: `users.controller.ts` 12,
  `profile.controller.ts` 7, `inbox.service.ts` 6, `modules.service.ts` 5).
- `backend/src/access/seller-access-governance.ts` está **órfão** — nenhum código de
  produção importa (só o próprio `.test.ts`). Vocabulário `HbxCapability` perdeu pro
  catálogo do team.
- `resolveEffectiveTeamAccess` (`team-access-runtime.ts:174`) faz 2+ queries
  (`hydrateUserForTeamAccess` + `loadUserTeamPolicyRuntime`) **a cada chamada** — e um
  request de Vendas pode chamar mais de uma vez.

## Por quê ($)

Bug de visão ("gerente viu o que não devia") é a classe de bug que quebra a Lei do
Vendedor e a confiança do Dono no produto. Fonte única mata a classe. O cache por request
corta queries repetidas no caminho quente do Vendas (latência = experiência do vendedor).

## Escopo

1. **Renascer `backend/src/access/`** (aproveitar a pasta órfã):
   - Apagar `seller-access-governance.ts` + `.test.ts` (mortos — confirmar com grep antes).
   - Criar `actor-kind.ts`: `type ActorKind = 'master'|'dono'|'gerente'|'vendedor'|'user'`
     e `resolveActorKind(user): ActorKind` — fórmula única e testada, mesma semântica dos
     3 derivadores atuais (master primeiro; USERMASTER sem flag → 'user', mantendo o
     anti-spoof do `roles.guard.ts:25`).
2. Migrar os 3 derivadores para importar `resolveActorKind` (mantêm a assinatura local,
   viram wrapper de 1 linha — diff mínimo).
3. Migrar os checks inline dos 4 arquivos-top (30 dos 52) para o resolver. Os 22 restantes
   ficam pra migração oportunista (tocou no arquivo, migra o check).
4. **`AccessContext` por request**: cache em `WeakMap<req, Promise<EffectiveTeamAccess>>`
   (ou request-scoped provider) envolvendo `resolveEffectiveTeamAccess` — 1 resolve por
   request, os demais leem o cache. Ponto único: `team-access-runtime.ts`.

## Fora de escopo
- NÃO criar role `GERENTE` no banco / migration / enum Prisma. O marcador funciona; o
  problema era derivação espalhada. (Decisão de arquitetura: registrada, não re-discutir
  por sprint.)
- NÃO mexer no RolesGuard/AdminGuard/MasterGuard (sprint 4).

## Riscos e guardrails
- Semântica de `USERMASTER` sem `isSystemMaster` e de `companyKind` platform_infra:
  preservar EXATAMENTE o comportamento atual — teste de caracterização antes de migrar
  (snapshot dos 3 derivadores com a mesma bateria de usuários sintéticos).
- Cache por request: invalidar nada (vida = request). NÃO cachear entre requests.

## Aceite
- 3 derivadores importam a fonte única; bateria de caracterização verde antes/depois.
- `backend/src/access/` sem código morto.
- Nº de queries de política por request de Vendas: medido antes/depois (logar em dev),
  esperado cair para 1 resolve.

## Checks
- `cd backend && npm run build`
- `team-access-runtime.test.ts`, `team-policy.service.test.ts` + caracterização nova
- Smoke localhost:3001: inbox como gerente (visão do time, nunca o dono), perfil dos 4 papéis

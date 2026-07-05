# S8 — RESULTADO: Hierarquia "só passa o que tem" + trava do canViewBilling

> Worker Sonnet, execução LOCAL. Nada commitado, nada publicado, nenhuma branch/worktree
> criada — diff fica no working tree (branch `master`) para o dono/Opus revisar.

## Arquivos tocados

- `backend/src/team/team-policy.service.ts` — T1 (subset-delegation) + refino do bloqueio
  bruto do gerente.
- `backend/src/users/users.controller.ts` — T2 (trava de `canViewBilling` em `updateRole`).
- `backend/src/team/team-policy-subset-delegation.test.ts` (novo) — 8 testes cobrindo T1.
- `backend/src/users/users.controller.update-role.test.ts` (novo) — 4 testes cobrindo T2.

Nenhum arquivo financeiro tocado (`backend/src/credits/**`, `schema.prisma`, migrations —
fora do escopo, e de fato havia trabalho paralelo rodando nesses arquivos durante a
execução; ver seção "Nota sobre tree paralelo" no fim).

## T1 — Subset-delegation em `updatePolicy` (`grant ⊆ granter`)

### Onde travou / decisão tomada
O bloqueio bruto original (linha ~1219 antes da mudança) impedia o GERENTE de mandar
`patch.access`/`patch.accessMap` **de qualquer forma** — a régua "gerente só concede
módulos" vetava até chave única. Isso conflita direto com o objetivo do A2 (gerente **pode**
conceder acesso, só que limitado ao que ele tem). Decisão: **tirei `access`/`accessMap` da
lista de campos vetados** para o gerente e coloquei a interseção chave-a-chave no lugar.
Mantive vetado para gerente: `accessPresetKey`/`presetKey`/`presetId` (preset é atalho que
concede um pacote inteiro de uma vez — não passa por interseção individual, mais seguro
manter exclusivo do responsável) e `compensation`/`sellerNetwork`/`limits`/`radar`/
`visibility` (fora do escopo do T1, que é só sobre `access`/`accessMap`).

### Implementação
- Novo helper privado `resolveGranterAccessMap(requester)` em `team-policy.service.ts`:
  monta o mapa efetivo do CONCEDENTE — `buildDefaultTeamAccessMapForRole(actorKind)` +
  override explícito de `loadUserTeamPolicyRuntime(prisma, requester.id).accessMap`. Mesma
  fonte de runtime que `assertCanManage` já usa para `team.access.manage`.
- Em `updatePolicy`, logo após o bloqueio bruto do gerente: resolve `resolveActorKind(requester)`;
  se `isSystemMaster` ou `kind === 'dono'` → raiz, sem interseção (comportamento antigo
  preservado). Caso contrário (gerente/admin-capado): normaliza `patch.access ?? patch.accessMap`
  via `normalizeAccessPatch` (já existente), filtra as chaves com `allowed === true` que o
  concedente NÃO tem (`hasTeamAccess(granterMap, key) === false`) e lança
  `ForbiddenException` listando as chaves negadas, ordenadas alfabeticamente, se houver
  alguma. Chaves com `allowed === false` (desligar) nunca entram nessa checagem — remoção é
  sempre livre, conforme o SPEC.
- A checagem acontece ANTES de `buildPolicyStorageUpdateData`/persistência — falha explícita,
  nada é gravado em caso de rejeição.

### Testes (`team-policy-subset-delegation.test.ts`, 8 casos — todos verdes)
1. Gerente concede chave que TEM → passa.
2. Gerente concede chave que NÃO tem → `ForbiddenException`.
3. Gerente desliga chave mesmo sem ter → passa (remoção livre).
4. Dono concede qualquer chave → passa (raiz).
5. Master concede qualquer chave → passa sempre.
6. `patch.access` com `canViewBilling` (chave fora do catálogo) → descartada por
   `normalizeTeamAccessMap`, nunca persiste — cobre a fronteira entre T1 (RBAC access map)
   e T2 (campo de User fora do catálogo).
7. Chave sem override explícito na policy do gerente cai no default do papel (admin=true).
8. Mix de chaves concedidas (algumas com posse, outras sem) → mensagem de erro lista
   exatamente as negadas, não inclui a que ele tinha.

## T2 — `canViewBilling` só editável por dono/master

### Onde travou / descoberta
Antes de mexer, mapeei TODA superfície de escrita (`grep -rn canViewBilling backend/src`).
Achado: **não existe hoje nenhum DTO HTTP que exponha `canViewBilling` como campo editável**
diretamente — nem `CreateCompanyUserDto`, nem `UpdateCompanyUserProfileDto`, nem
`UpdateRoleDto`, nem `MasterEditUserDto`. As únicas escritas de `canViewBilling` no código são:
- `users.controller.ts` (`POST /users/company/create`, rota `@Admin()`): já força
  `canViewBilling: false` sempre que `role === 'ADMIN'` — comentário no código já documenta
  a régua "o Dono só cunha GERENTE; Admin com cobrança só o Master cria, por outro fluxo."
  Nada a fazer aqui, já está correto.
- `users.controller.ts` masterEditUser (`PATCH /users/master/:id`): `@UseGuards(MasterGuard)`
  — só master chama, exceção do T2 já satisfeita pelo guard.

**Gap real encontrado:** `PATCH /users/:id/role` (`updateRole`), guardado por `@Admin()` —
ou seja, **também chamável por GERENTE** (ADMIN com `canViewBilling=false`, via
`RolesGuard`). Esse endpoint promove `USER → ADMIN` mas **nunca tocava em `canViewBilling`**.
Como o schema Prisma tem `canViewBilling Boolean @default(true)`, um vendedor promovido a
ADMIN por essa rota nascia com `canViewBilling=true` por default — ou seja, virava **"dono"**
(`resolveActorKind` → `dono`, pois `canViewBilling !== false`) na hora, não gerente. Se quem
promove for o próprio GERENTE, isso é exatamente a auto-promoção pra ver dinheiro que o T2
existe para impedir.

### Decisão de escopo (documentando para o dono revisar)
Segui a régua **já codificada** em `createCompanyUser` (comentário `PR13062026007 P5`: "o
Dono só cunha GERENTE; Admin com cobrança só o Master cria, por outro fluxo") por
consistência: em `updateRole`, força `canViewBilling: false` sempre que `role` vira `ADMIN`
e quem chama **não é master** (`resolveActorKind(req.user) !== 'master'`) — isso inclui o
próprio DONO, não só o gerente. Cheguei a implementar a variante "dono pode, só gerente é
travado" primeiro, mas revertida ao notar que contradiria a régua já em produção na rota de
criação — **se o dono precisa criar um ADMIN com cobrança, o caminho é sempre o Master**,
igual já vale para `create`. Sinalizando essa escolha explicitamente porque foi a única
decisão "cinza" do sprint — se o dono quiser que ELE (não o gerente) possa conceder billing
por `updateRole`, é uma linha (`canGrantBilling = requesterKind === 'master'` →
`['master','dono'].includes(requesterKind)`).

### Implementação
- `users.controller.ts`: import `resolveActorKind` de `../access/actor-kind`.
- Em `updateRole`, antes do `updateById`: `const requesterKind = resolveActorKind(req?.user)`;
  `const canGrantBilling = requesterKind === 'master'`; quando `role === 'ADMIN'`, inclui
  `canViewBilling: false` no patch a menos que `canGrantBilling` seja true.
- Rebaixamento (`ADMIN → USER`) não é tocado (não expõe `canViewBilling`, sem gap ali).

### Testes (`users.controller.update-role.test.ts`, 4 casos — todos verdes)
1. Gerente promove USER→ADMIN → `canViewBilling` forçado a `false`.
2. Dono promove USER→ADMIN → `canViewBilling` também forçado a `false` (mesma régua do
   `createCompanyUser`).
3. Master promove USER→ADMIN → **não** força o campo (pode conceder billing, fluxo
   legítimo).
4. Rebaixar ADMIN→USER → `canViewBilling` não é tocado no patch (não é campo desse fluxo).

## Checks

```
cd backend && npm run build          → verde
cd backend && npm run prisma:validate → schema válido (não tocado por mim)
node --test dist/team/team-policy-subset-delegation.test.js  → 8/8 verde
node --test dist/users/users.controller.update-role.test.js  → 4/4 verde
node --test dist/team/team-policy.service.test.js            → 8/8 verde (não regrediu)
node --test dist/access/actor-kind.test.js                    → 7/7 verde (não regrediu)
node --test dist/auth/roles.guard.test.js                     → 5/5 verde (não regrediu)
node --test dist/users/users.service.test.js                  → 9/9 verde (não regrediu)
```

Rodei também a suíte completa (`node --test 'dist/**/*.test.js'`, 1686 testes): **19
falhas pré-existentes**, nenhuma nos arquivos tocados por este sprint (confirmei rodando a
mesma suíte com meu diff stashado — as mesmas falhas já existiam na baseline). Falhas são em
`auth` (login System Master / no-beco), `companies/whatsapp-modal` (getCompanyStatus),
`vault` (cofre PFX), `mp-recovery` (ledger concurrent), `hbx-pulse` (nudge), `vendas.service`
(`getBoardForUser`, `importWebscrapingLeadsForUser`) e `hbx-engine-pool` — nenhuma relação com
RBAC/team-policy/users.controller.

## Nota sobre tree paralelo (não é ação minha)

Durante a execução, `git status` mostrou mudanças concorrentes de outro processo em
`backend/.env.example`, `backend/package.json`, `backend/prisma/schema.prisma`,
`backend/src/app.module.ts`, `backend/src/auth/auth.service.ts`, `backend/src/credits/**`,
uma migration nova (`20260705090000_credits_wallet_ledger`) e
`docs/PLANEJAMENTOS/CREDITOS/S1-RESULTADO.md` (S1-SPEC.md foi apagado por esse outro
processo). **Não toquei em nenhum desses arquivos** — são exatamente os caminhos que a
tarefa pediu para evitar (`credits/**`, `schema.prisma`, migrations). Confirmei via
`git stash`/`pop` isolado nos meus 2 arquivos que meu diff segue intacto e sem conflito
depois do merge automático desse trabalho paralelo.

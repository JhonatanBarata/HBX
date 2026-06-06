# Comandos Permitidos

Todos os comandos ficam em `allowlist.json` como array. O Local Agent nao aceita comando vindo pelo body.

## Operacao local

- `up`: `npm run up`
- `down`: `npm run down`

## Validacoes

- `frontend-lint`: `npm --prefix frontend run lint`
- `frontend-build`: `npm --prefix frontend run build`
- `backend-prisma-validate`: `npm --prefix backend run prisma:validate`
- `backend-build`: `npm --prefix backend run build`
- `webwhats-typecheck`: `npm --prefix Webwhats run typecheck`
- `webwhats-build`: `npm --prefix Webwhats run build`
- `e2e`: `npm run test:e2e`

## Git

Somente leitura por padrao:

- `git status --short`
- `git branch --all`
- `git branch --show-current`
- `git remote -v`
- `git log -1 --pretty=format:%H%n%s%n%cd`
- `git diff --name-only master...HEAD`

Checkout de PR exige workspace limpo e usa apenas `gh pr checkout <numero>`.

## Deploy Control

Nesta fase existe somente:

- `verify-prod`: `npm run verify:prod`

Bloqueados:

- `npm run new`
- `npm run publish`
- `npm run force`
- migrations
- shell livre

# HBX Master Git / PR Workflow

## Estados

- master atualizado
- PR listado
- PR baixado
- teste rodando
- teste passou
- teste falhou
- merge liberado
- merge feito
- publicacao pendente
- publicado

## Comandos seguros

- `git status --short`
- `git branch --all`
- `git fetch origin`
- `gh pr list`
- `gh pr checkout <n>`
- `gh pr view <n>`

## Comandos proibidos inicialmente

- `git reset`
- `git clean`
- `git push direto`
- `merge automatico`
- `force`
- `publish automatico`

## HOLD por arquivo

- `.env`
- `secrets`
- `migrations`
- `auth`
- `billing`
- `commercial-plans`
- `deploy`
- `docker-compose`
- `scripts/ops`

## Teste por area

- Frontend: lint e build.
- Backend: prisma validate e build.
- Webwhats: typecheck e build.
- E2E: `npm run test:e2e` somente quando ambiente estiver pronto.

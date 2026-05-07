# Operacao HBX

Este repositorio tem tres comandos operacionais publicos na raiz:

- `npm run release`
- `npm run publish`
- `npm run force`

Scripts auxiliares ficam com prefixo `internal:*` e nao devem ser usados como fluxo principal.

## `npm run release`

Fluxo sem restart de producao:

1. Confere que o repositorio esta no branch `master`.
2. Mostra `git status` e arquivos alterados.
3. Roda validacoes rapidas locais: JSON dos manifests, `backend prisma:validate` e `docker compose config --quiet` quando Docker estiver disponivel.
4. Cria commit automatico datado se houver mudancas permitidas.
5. Executa `git push origin master`.
6. Verifica na Hostinger que o build Next existe, que o PM2 `hbx-frontend` esta online e que `/login` responde localmente.
7. Verifica `PROD_BACKEND_URL/health`, `PROD_FRONTEND_URL` e `PROD_FRONTEND_URL/login`.
8. Mostra status final.

Este comando nao reinicia containers, PM2 ou processos remotos.

## `npm run publish`

Fluxo de deploy normal:

1. Detecta mudancas e mostra diff resumido.
2. Cria commit automatico datado se houver mudancas permitidas.
3. Executa `git push origin master`.
4. Roda build local de backend e frontend.
5. Executa o deploy Hostinger atual via `scripts/deploy-hostinger.js`.
6. No servidor, o backend roda migrations Prisma dentro do container `hbx-backend`, usando o host Docker `hbx-postgres`.
7. Valida backend `/health` e frontend.
8. Mostra status final.

O build remoto falha antes de trocar o runtime se uma etapa critica falhar. O frontend de producao roda via PM2 (`hbx-frontend`) fora do Docker.

## `npm run force`

Fluxo de recuperacao/rebuild completo:

1. Cria backup local em `backups/ops/<timestamp>` antes de qualquer acao destrutiva.
2. Salva `git diff --binary`, manifests `package.json/package-lock`, `docker-compose*.yml` e arquivos `.env` sem imprimir segredos no terminal.
3. Tenta criar dump de producao via `scripts/backup-prod.js` se SSH, Docker e banco estiverem seguros/disponiveis.
4. Detecta mudancas e cria commit automatico datado se houver.
5. Executa `git push origin master`.
6. Para containers HBX e o processo PM2 `hbx-frontend`.
7. Rebuilda motores HBX, backend e webscraping, e sobe frontend via PM2.
8. As migrations Prisma rodam dentro de `hbx-backend` por `backend/scripts/start-prod.sh`, evitando `npx prisma` no host contra `hbx-postgres:5432`.
9. Verifica Docker, PM2, motores, backend, frontend e logs curtos.
10. Valida backend `/health` e frontend antes de terminar.

## Variaveis necessarias

Os comandos de producao usam `.env.production.local`, `.env.ops.local` ou `.env.operations.local`.

Obrigatorias para health/deploy:

- `PROD_BACKEND_URL`
- `PROD_FRONTEND_URL`
- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_USER`
- `HOSTINGER_APP_DIR`

Arquivos `.env` reais nao devem ser commitados. O script de commit bloqueia `.env`, backups, dumps e bancos locais.

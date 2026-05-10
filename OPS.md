# Operacao HBX

Este repositorio tem seis comandos operacionais publicos na raiz:

- `npm run publish`
- `npm run new`
- `npm run up`
- `npm run down`
- `npm run force`
- `npm run verify:prod`

Scripts auxiliares devem ser chamados diretamente por `node`/PowerShell quando forem necessarios para manutencao pontual.

## `npm run publish`

Fluxo de deploy normal:

1. Detecta mudancas e mostra diff resumido.
2. Cria commit automatico datado se houver mudancas permitidas.
3. Executa o deploy Hostinger via `scripts/deploy-hostinger.js`.
4. O deploy roda preflight Prisma/build local uma vez, faz `git push origin master`, atualiza a VPS e sobe os containers.
5. No servidor, o backend roda migrations Prisma dentro do container `hbx-backend`, usando o host Docker `hbx-postgres`.
6. Valida backend `/health`, frontend `/` e health rapido dos motores HBX.
7. Mostra status final.

O fluxo normal evita checks pesados como CORS completo, upload probe, `/atendimento` e varredura de todos os motores. Para forcar a verificacao completa no publish, defina `HOSTINGER_FULL_VERIFY=true`.

## `npm run new`

Fluxo seletivo para atualizar apenas o que mudou:

1. Confere branch `master`.
2. Cria commit automatico datado se houver mudancas permitidas.
3. Detecta arquivos alterados contra `origin/master`.
4. Faz `git push origin master`.
5. Na VPS, faz `git reset --hard origin/master`.
6. Rebuilda/reinicia apenas os servicos afetados: `backend`, `frontend`, `webscraping` e/ou `hbx-scraping-engine`.
7. Mantem health minimo: containers essenciais, backend `/health`, frontend `/` e amostra dos motores quando eles forem afetados.

Mudancas estruturais como `docker-compose.hostinger.yml`, Dockerfile ou `deploy/` viram rebuild completo dos servicos gerenciados pelo seletivo.

## `npm run force`

Fluxo de recuperacao/rebuild completo:

1. Cria backup local em `backups/ops/<timestamp>` antes de qualquer acao destrutiva.
2. Salva `git diff --binary`, manifests `package.json/package-lock`, `docker-compose*.yml` e arquivos `.env` sem imprimir segredos no terminal.
3. Tenta criar dump de producao via `scripts/backup-prod.js` se SSH, Docker e banco estiverem seguros/disponiveis.
4. Detecta mudancas e cria commit automatico datado se houver.
5. Executa `git push origin master`.
6. Para containers HBX e remove qualquer runtime antigo `hbx-frontend` no PM2.
7. Rebuilda motores HBX, backend e webscraping, e sobe frontend via Docker `hbx-frontend`.
8. As migrations Prisma rodam dentro de `hbx-backend` por `backend/scripts/start-prod.sh`, evitando `npx prisma` no host contra `hbx-postgres:5432`.
9. Verifica Docker, motores, backend, frontend e logs curtos.
10. Valida backend `/health` e frontend antes de terminar.

## `npm run verify:prod`

Fluxo manual de verificacao completa:

1. Valida backend `/health`.
2. Valida e-mail transacional.
3. Valida WhatsApp modal.
4. Valida banco Hostinger por SSH quando configurado.
5. Valida frontend quando `PROD_FRONTEND_URL` estiver configurado.

## Variaveis necessarias

Os comandos de producao usam `.env.production.local`, `.env.ops.local` ou `.env.operations.local`.

Obrigatorias para health/deploy:

- `PROD_BACKEND_URL`
- `PROD_FRONTEND_URL`
- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_USER`
- `HOSTINGER_APP_DIR`

Arquivos `.env` reais nao devem ser commitados. O script de commit bloqueia `.env`, backups, dumps e bancos locais.

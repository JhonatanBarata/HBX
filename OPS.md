# Operacao HBX

Este repositorio tem seis comandos operacionais publicos na raiz:

- `npm run publish`
- `npm run new`
- `npm run up`
- `npm run down`
- `npm run force`
- `npm run verify:prod`

Comandos locais auxiliares para motores HBX:

- `npm run engines:up`
- `npm run engines:down`

Scripts auxiliares devem ser chamados diretamente por `node`/PowerShell quando forem necessarios para manutencao pontual.

## `npm run publish`

Fluxo de deploy normal:

1. Detecta mudancas e mostra diff resumido.
2. Mostra um resumo ASAP com destino, warm pool de motores e escopo pesado esperado.
3. Executa o deploy Hostinger via `scripts/deploy-hostinger.js`.
4. O deploy cria commit automatico datado se houver mudancas permitidas.
5. O deploy roda preflight Prisma/build local uma vez, faz `git push origin master`, atualiza a VPS e sobe os containers.
6. No servidor, o backend roda migrations Prisma dentro do container `hbx-backend`, usando o host Docker `hbx-postgres`.
7. Nao roda healthcheck de backend, frontend ou motores no publish normal.
8. Mostra status final.

O publish normal usa warm pool pequeno de motores HBX por padrao para nao recriar a frota inteira sem necessidade. Para publicar mais motores explicitamente, defina `HBX_PUBLISH_ENGINE_COUNT` no ambiente operacional antes do publish. `HBX_ENGINE_MAX_COUNT` representa capacidade maxima configuravel e pode ficar em 200 sem significar 200 containers ligados.

Para reduzir tempo sem perder cobertura do publish completo:

- mantenha `HBX_PUBLISH_ENGINE_COUNT` baixo no publish normal;
- use `npm run new` quando a mudanca puder ser publicada pelo fluxo seletivo;
- reserve `npm run force` para recuperacao/rebuild completo.

Use `npm run verify:prod` quando quiser verificacao de producao separada do publish.

## `npm run new`

Fluxo seletivo para atualizar apenas o que mudou:

1. Confere branch `master`.
2. Cria commit automatico datado se houver mudancas permitidas.
3. Detecta arquivos alterados contra `origin/master`.
4. Faz `git push origin master`.
5. Na VPS, faz `git reset --hard origin/master`.
6. Rebuilda/reinicia apenas os servicos afetados: `backend`, `frontend`, `webscraping` e/ou `hbx-scraping-engine`.
7. Nao roda healthcheck HTTP; apenas lista containers e logs curtos no final.

Mudancas estruturais como `docker-compose.hostinger.yml`, Dockerfile ou `deploy/` viram rebuild completo dos servicos gerenciados pelo seletivo.

## `npm run up`

Sobe o ambiente local de app com backend, banco, webscraping legado, fallback `hbx-scraping-engine`, Webwhats local, frontend e Prisma Studio. A frota `hbx-engine-*` fica fora do start local padrao.

O comando mostra um resumo ASAP antes das etapas demoradas. Por padrao, `HBX_UP_BUILD=auto`: quando o runtime Docker principal ja existe, o `up` nao forca `docker compose --build`; quando esta ausente, o build acontece automaticamente. Para forcar ou impedir build:

```powershell
$env:HBX_UP_BUILD="always"
npm run up

$env:HBX_UP_BUILD="never"
npm run up
```

O backend so roda `npm install` dentro do container quando as dependencias faltam, quando `backend/package-lock.json` mudou desde a ultima sincronizacao registrada, ou quando for explicitamente forcado:

```powershell
$env:HBX_UP_SYNC_BACKEND_DEPS="true"
npm run up
```

Para pular componentes opcionais do ambiente local:

```powershell
$env:HBX_UP_WEBWHATS="false"
$env:HBX_UP_STUDIO="false"
npm run up
```

Quando precisar de motores HBX locais numerados, use:

```powershell
npm run engines:up
```

Por padrao esse comando sobe 3 motores locais e recria o backend com `HBX_ENGINE_COUNT=3`. Para outro tamanho:

```powershell
npm run engines:up -- -Count 5
```

Para parar os motores locais sem derrubar app/banco/fallback:

```powershell
npm run engines:down
```

## `npm run down`

Para o ambiente local iniciado por `npm run up` e, por padrao, tambem tenta parar o warm pool dedicado `hbx-engine-*` usado por `npm run engines:up`.

Para manter os motores dedicados ligados durante testes:

```powershell
$env:HBX_DOWN_KEEP_ENGINES="true"
npm run down
```

Para limitar a limpeza de motores:

```powershell
$env:HBX_DOWN_ENGINE_COUNT="3"
npm run down
```

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

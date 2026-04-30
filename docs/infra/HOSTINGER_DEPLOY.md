# Deploy Hostinger

Fluxo oficial de producao do HBX para backend e webscraping na VPS Hostinger.

## Arquitetura atual

- Frontend: Vercel em `https://www.hbxsystem.com.br`
- Backend: Hostinger em `https://api.hbxsystem.com.br`
- Webscraping: Hostinger, via `docker-compose.hostinger.yml`
- Webwhats: servico separado em `/opt/Webwhats`; se nao houver systemd, o publish reinicia o processo `node dist/main.js`
- Banco: Postgres local da VPS no container `hbx-postgres`, banco `hbx_prod`
- Rede Docker: externa, preferindo a rede onde `hbx-postgres` ja esta conectado (`hbx_net` ou `hbx-net`)
- Compose da VPS: `/usr/bin/docker-compose 1.29.2`

O frontend nao e publicado pela Hostinger. Mudancas em `frontend/` dependem do deploy da Vercel.

## Comandos oficiais

```powershell
npm run commit -- "feat: minha mensagem"
npm run publish
npm run publish:d
npm run publish:f
```

Atalhos equivalentes:

```powershell
npm run publish -- d
npm run publish -- f
```

## `npm run commit`

Cria apenas um backup local no git:

- roda `git status` antes e depois;
- roda `git add -A`;
- aceita mensagem por argumento;
- gera mensagem com timestamp se nenhuma mensagem for enviada;
- se `../Webwhats` existir, repete o mesmo fluxo em commit separado no repositorio Webwhats;
- nao faz push;
- nao faz deploy;
- bloqueia `.env` reais, backups, dumps, bancos locais e arquivos sensiveis conhecidos.

## `npm run publish`

Fluxo normal de producao:

- exige branch `master`;
- exige working tree limpa;
- exige working tree limpa tambem no Webwhats quando `../Webwhats` existir;
- roda validacoes/builds locais de HBX e Webwhats;
- faz `git push origin master` sem force nos repositorios aplicaveis;
- publica Webwhats por SSH antes do HBX, usando `npm ci`, `npm run build`, `npm run db:generate`, `npm run db:deploy` e `systemctl restart`;
- acessa a Hostinger por SSH;
- roda `git fetch origin master` e `git reset --hard origin/master`;
- valida que `backend/.env` existe na VPS;
- valida que `DATABASE_URL`/`DIRECT_URL` apontam para `hbx-postgres` e `hbx_prod`;
- valida que o container `hbx-postgres` esta running;
- remove somente containers antigos de servico (`hbx-backend`, `webscraping` e `hbx-scraping-engine`) se houver conflito de nome;
- sobe apenas `backend`, `webscraping` e `hbx-scraping-engine`;
- verifica `https://api.hbxsystem.com.br/health`.

Durante o deploy o script mostra:

- Banco esperado: `hbx-postgres/hbx_prod`
- Backend URL
- Frontend URL
- Configuracao remota do Webwhats quando habilitado
- Containers ativos

## `npm run publish:d`

Dry-run completo:

- imprime o que faria;
- roda validacoes/builds locais;
- nao faz `git push`;
- nao executa SSH remoto;
- nao derruba containers;
- nao recria containers.

## `npm run publish:f`

Modo force:

- faz tudo do publish normal;
- roda `docker-compose down --remove-orphans`;
- tenta `docker-compose build --no-cache backend webscraping hbx-scraping-engine`;
- roda `docker-compose up -d --build backend webscraping hbx-scraping-engine`;
- reinicia `hbx-backend`, `webscraping` e `hbx-scraping-engine`;
- roda `docker image prune -f`;
- tenta `docker builder prune -f`;
- nao remove volumes;
- nao remove `hbx-postgres`;
- nao remove `hbx-postgres-data`;
- nao usa `docker system prune --volumes`;
- so reinicia a VPS se `FORCE_REBOOT_HOSTINGER=true` estiver definido no env operacional local.

## Variaveis reais

O `.env` real do backend fica somente no servidor:

```text
backend/.env
```

Ele deve apontar para o Postgres local do Docker:

```env
DATABASE_URL=postgresql://hbx_user:...@hbx-postgres:5432/hbx_prod?schema=public&connection_limit=10&pool_timeout=60
DIRECT_URL=postgresql://hbx_user:...@hbx-postgres:5432/hbx_prod?schema=public
```

Arquivos reais que nunca devem ir para o git:

- `.env`
- `.env.local`
- `.env.production.local`
- `.env.ops.local`
- `.env.operations.local`
- `backend/.env`
- backups
- dumps
- `postgres-data`
- senhas, tokens e chaves reais

Use `.env.production.example` para variaveis operacionais locais e `.env.hostinger.example` como referencia do `backend/.env` da VPS.

## Webwhats no publish

Por padrao, o publish inclui o Webwhats quando o repositorio local existe em `../Webwhats`. Para desabilitar temporariamente:

```env
WEBWHATS_DEPLOY_ENABLED=false
```

Variaveis principais:

```env
WEBWHATS_REPO_PATH=../Webwhats
WEBWHATS_APP_DIR=/opt/Webwhats
WEBWHATS_RUN_USER=root
WEBWHATS_SYSTEMD_SERVICE=
WEBWHATS_GIT_REMOTE=origin
WEBWHATS_GIT_BRANCH=master
```

Se `WEBWHATS_SSH_HOST` e `WEBWHATS_SSH_USER` nao forem definidos, o script usa `HOSTINGER_SSH_HOST` e `HOSTINGER_SSH_USER`.

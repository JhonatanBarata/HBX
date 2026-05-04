# Deploy Hostinger

Fluxo oficial de producao do HBX na VPS Hostinger nova.

## Alvos publicos

- IP da VPS: `187.77.47.18`
- Frontend: `https://hbxsystem.com.br` e `https://www.hbxsystem.com.br`
- Backend/API: `https://api.hbxsystem.com.br`
- DNS esperado:
  - `A @ -> 187.77.47.18`
  - `A www -> 187.77.47.18`
  - `A api -> 187.77.47.18`

## Arquitetura

O compose de producao e `docker-compose.hostinger.yml` e deve subir:

- `hbx-frontend`, porta externa `3001`, Next.js;
- `hbx-backend`, porta externa `3000`, NestJS;
- `hbx-postgres`, Postgres 15 Alpine, sem porta externa;
- `hbx-scraping-engine`, porta interna `8001`;
- `webscraping`, porta interna `8501`;
- rede Docker externa `hbx_net`.

Nginx fica fora do compose:

- `hbxsystem.com.br` e `www.hbxsystem.com.br` fazem proxy para `http://127.0.0.1:3001`;
- `api.hbxsystem.com.br` faz proxy para `http://127.0.0.1:3000`;
- HTTP redireciona para HTTPS;
- a pagina default do Nginx deve ficar removida/desabilitada.

Exemplo de site Nginx: `deploy/nginx/hbxsystem.conf`.

## Variaveis da VPS

Arquivos reais nunca entram no git:

- `.env`
- `.env.local`
- `.env.production.local`
- `.env.ops.local`
- `.env.operations.local`
- `backend/.env`
- backups, dumps, bancos locais e tokens reais

Use `.env.hostinger.example` como base. Na VPS, coloque as variaveis do compose em `.env` na raiz do repositorio, ou exporte no shell antes de rodar `docker compose`. No servidor, o backend real fica em `backend/.env` e deve apontar para o Postgres interno:

```env
DATABASE_URL=postgresql://hbx_user:...@hbx-postgres:5432/hbx_prod?schema=public&connection_limit=10&pool_timeout=60
DIRECT_URL=postgresql://hbx_user:...@hbx-postgres:5432/hbx_prod?schema=public
```

O compose tambem precisa de variaveis de Postgres no ambiente da pasta raiz da VPS:

```env
POSTGRES_USER=hbx_user
POSTGRES_PASSWORD=...
POSTGRES_DB=hbx_prod
POSTGRES_DATA_VOLUME=hbx-postgres-data
NEXT_PUBLIC_API_URL=https://api.hbxsystem.com.br
```

`NEXT_PUBLIC_API_URL` e passado como build arg do frontend. Sem isso, o bundle Next pode nascer apontando para URL errada.

## Comandos

```bash
docker network inspect hbx_net >/dev/null 2>&1 || docker network create hbx_net
docker compose -f docker-compose.hostinger.yml up -d --build hbx-postgres backend webscraping hbx-scraping-engine frontend
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Em VPS com `docker-compose` legado:

```bash
docker-compose -f docker-compose.hostinger.yml up -d --build hbx-postgres backend webscraping hbx-scraping-engine frontend
```

## Verificacoes

```bash
curl -I https://hbxsystem.com.br
curl -I https://www.hbxsystem.com.br
curl -I https://api.hbxsystem.com.br/health
docker exec hbx-postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select current_database();"'
```

Esperado:

- frontend responde pelos dominios raiz/www;
- backend responde em `/health`;
- CORS permite `https://hbxsystem.com.br` e `https://www.hbxsystem.com.br`;
- `DATABASE_URL` usa `hbx-postgres:5432`;
- webscraping interno usa `http://webscraping:8501`;
- scraping engine interno usa `http://hbx-scraping-engine:8001`.

## Erros conhecidos

- `P1001`: backend nao alcancou Postgres. O `start-prod.sh` aguarda o banco antes das migrations, mas confirme container, rede `hbx_net` e `DATABASE_URL`.
- `P3009`: migration marcada como falhada em tentativa anterior. Nao force reset em producao. Corrija a migration no banco ou marque resolvida com Prisma somente depois de validar o estado real do schema.
- Frontend chamando `localhost`: refaca o build de `hbx-frontend` com `NEXT_PUBLIC_API_URL=https://api.hbxsystem.com.br`.

# Regras — INFRA E OPERAÇÃO

> Deploy, ambientes, comandos operacionais, Ops Control e HBX Owner.
> **Agente NUNCA roda deploy/publish/new/force/restart de produção sem ordem
> explícita do dono na tarefa atual.**

## Ambientes

- Local = desenvolvimento: pode ter teste, lixo temporário, dado descartável.
- Produção (VPS Hostinger) = real: só recebe código, migrations e bootstrap
  estrutural idempotente. Sem clientes em produção ainda — mas a regra vale.
- Arquivos `.env` reais nunca são commitados (o script de commit bloqueia `.env`,
  backups, dumps e bancos locais).

## Comandos operacionais públicos (raiz)

| Comando | O que faz |
|---|---|
| `npm run up` | sobe ambiente local (backend, banco, webscraping legado, fallback engine, frontend, Prisma Studio) |
| `npm run down` | derruba o local (e o warm pool `hbx-engine-*`, salvo `HBX_DOWN_KEEP_ENGINES=true`) |
| `npm run publish` | fluxo rápido completo: adiciona e commita tudo no `master`, faz push e roda build/migrations/restart de backend, frontend, scraping, motores e Webwhats diretamente na VPS, sem repetir builds locais |
| `npm run new` | deploy seletivo: detecta arquivos mudados vs `origin/master` e rebuilda só os serviços afetados |
| `npm run force` | recuperação/rebuild completo COM backup prévio em `backups/ops/<timestamp>` e dump de produção quando possível |
| `npm run verify:prod` | verificação de produção (health backend, e-mail, WhatsApp, banco, frontend) — separada do publish |
| `npm run engines:up` / `engines:down` | frota local de motores numerados (ver docs/Rules/MOTOR.md) |
| `npm run db:tune` | **fiscal** do tuning do Postgres de produção: compara a VPS com o repo (read-only, sai ≠ 0 se houver desvio) |
| `npm run db:tune:apply` | reaplica o tuning (ALTER SYSTEM + reload + autovacuum por tabela) — **sem** reiniciar nada |
| `npm run db:tune:restart` | idem + restart do `hbx-postgres` (**DOWNTIME**, só com autorização do dono) |

Flags úteis do `up`: `HBX_UP_BUILD=auto|always|never`, `HBX_UP_SYNC_BACKEND_DEPS=true`,
`HBX_UP_STUDIO=false`.

O motor **Webwhats não sobe local**: roda só na VPS como `webwhats.service` (systemd, `:8080`),
fora do `up`/`down`.

Capacidade elástica no publish: `HBX_PUBLISH_ENGINE_COUNT` (default 1),
`HBX_PUBLISH_ENGINE_MAX_COUNT` (default 20), `HBX_ENGINE_WARM_MIN` (default 1),
`HBX_ENGINE_WARM_MAX=1`, `HBX_ENGINE_GOVERNOR_ENABLED=true` e
`HBX_ENGINE_DOCKER_CLI_PATH=/usr/bin/docker` na VPS. O backend precisa receber
`/usr/bin/docker` e `/var/run/docker.sock` montados para o governor ligar/desligar
motores sob demanda.

Env de produção: `.env.production.local` / `.env.ops.local` / `.env.operations.local`
com `PROD_BACKEND_URL`, `PROD_FRONTEND_URL`, `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_USER`,
`HOSTINGER_APP_DIR`. `verify:prod` recusa targets locais.
Bootstrap do master: produção mantém `BOOTSTRAP_SYSTEM_MASTER=false`.

## Postgres de produção (`hbx-postgres`) — tuning e por que ele NÃO está no compose do publish

Rodou 3 meses no **default de fábrica** (`shared_buffers` 128 MB num banco de 66 GB). Tunado em
05/08/2026. Fonte da verdade dos valores: **`deploy/postgres/hbx-prod-tuning.conf`** (cada número
com a justificativa do porquê nesta máquina); autovacuum por tabela em
**`deploy/postgres/hbx-prod-tabelas.sql`**.

- **O `publish` não toca no Postgres.** Ele roda `docker compose -f docker-compose.hostinger.yml
  up -d --force-recreate`, e o `hbx-postgres` **não está** nesse arquivo. **NÃO adicione** — todo
  publish passaria a recriar o banco de produção (downtime a cada deploy + risco de o volume
  trocar de nome).
- Os parâmetros vivem em `postgresql.auto.conf` **dentro do volume** `hbx_postgres_data`
  (gravados por `ALTER SYSTEM`). Sobrevivem a restart, a recriação do container e ao publish.
  Só se perdem se o volume for destruído — nesse caso, `npm run db:tune:apply` reconstrói.
- A forma do **container** (o que não cabe em `ALTER SYSTEM`) mora em
  **`docker-compose.postgres.yml`**, aplicado **à mão** e fora do publish de propósito.
- ⚠️ **`shm_size` (`/dev/shm`)**: o default do Docker é 64 MB e **query paralela morre** nele
  (`could not resize shared memory segment`) agora que `work_mem` subiu pra 32 MB. Está em 1 GB
  **ao vivo** (remount), mas o `ShmSize` do container segue 64 MB até alguém recriar — ou seja,
  **um `docker restart` reverte em silêncio**. `npm run db:tune` reprova se cair abaixo de 1 GB.
- Observabilidade: `pg_stat_statements` está instalado. Query lenta e quem derrama em disco
  saem dele, não de log (`log_min_duration_statement` fica desligado de propósito).

## Ops Control (`ops-control/`)

- **Headless** (desde 17/06): só API em `127.0.0.1:3099`, controla a VPS via SSH. **Não tem
  mais tela própria** (`public/` removido + sem `express.static`) — o HBX Owner (`:3107`) é a
  única cara; o Ops Control é o motor SSH que ele consome por proxy.
- API: pressão/containers (`/api/host-snapshot`, `/api/overview`, `/api/containers`), cockpit
  Local×VPS (`/api/radar-cockpit`, `/api/radar-audit/:env`), Turbo/Forçar/Cancelar
  (`/api/opscontrol/*`), Email Lab (`/api/email-lab/*` → import oficial
  `/webscraping/lead-harvest/import`), motores (`/api/engines/*`, `/api/quick/*`).
- Config via `.env.ops-control` (token, SSH, backends por ambiente com JWT master
  ou auto-session no container). Sobe com `docker compose -f docker-compose.ops.yml up -d`.

## HBX Owner (`hbx-owner/local-agent/`)

- Cockpit local do dono = **painel web servido pelo local-agent** (Node, sem SQLite).
  Sobe com `npm run owner:app` (start-owner.ps1: sobe o agent + abre o navegador) ou
  `npm run owner:agent` direto. Token local em `HBX_OWNER_LOCAL_TOKEN` (ou gerado/persistido
  em `.owner-token`, gitignored). Painel em `http://127.0.0.1:3107`.
- **Página única (sem abas)** — a única tela do dono, de cima pra baixo: pills de status
  (agent/backend/Ops/VPS), **Pressão** sua máquina × VPS (com veredito), **Motores & fábrica**
  dos dois lados, **Radar ao vivo** (o que cada ambiente raspa agora + Turbo/filtro/Forçar/Cancelar),
  **Leads** (banco local×VPS, Exportar→VPS, Limpar lixo, Caçar e-mail via Email Lab) e o **Feed honesto**.
- A página tem DUAS colunas em todo bloco: **sua máquina** (pressão/motores/containers lidos
  nativamente pelo agent + banco/fábrica via backend `:3000`) e **VPS** (lida e controlada via
  Ops Control). A coluna VPS NÃO abre SSH próprio — proxia o Ops Control
  (`HBX_OWNER_OPS_URL`/`HBX_OWNER_OPS_TOKEN`, token vindo do `.env.ops-control` pelo start-owner.ps1).
  Leitura: snapshot leve (`/api/host-snapshot/vps`, fallback `/api/overview`) e cockpit
  (`/api/radar-cockpit`, cacheado). Controles VPS: parar/ligar frota `hbx-engine-N`, parar motor
  único, Turbo/Forçar/Cancelar (`/api/opscontrol/*`) — destrutivos exigem confirmação.
- O Owner cobre 100% do uso do Ops Control pelo dono; o Ops Control (`:3099`) virou **headless**
  (só API) e é a ponte SSH que alimenta a coluna VPS / radar / email-lab do Owner.
- Banco de Leads e Exportar usam o backend via `HBX_OWNER_BACKEND_URL` +
  `HBX_OWNER_BACKEND_TOKEN` (JWT do dono). Sem token, o painel degrada com aviso, não quebra.
- Exportar = enviar leads do Local Lab para a VPS (que os importa via
  `/webscraping/lead-harvest/import`); só remove a evidência local DEPOIS da VPS confirmar.
- Fluxo de QA de lote: dono mergeia PRs → checkout vira lote de QA → `npm run up` →
  testa em `localhost:3001` → aba Execução roda os checks do diff.
- O Owner NUNCA: libera feature paga sem backend autorizar, expõe secrets, roda shell
  livre (só allowlist), executa deploy/publish/new/force/migrations, apaga histórico
  negativo do Radar.
- O app desktop tkinter legado (`hbx-owner/windows-app/`, com SQLite) foi descontinuado.

## Electron / demo

- O shell Electron apenas abre a URL do frontend (`localhost:3001`); não faz parte do
  fluxo oficial de local/publish.

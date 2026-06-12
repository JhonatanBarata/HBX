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
| `npm run up` | sobe ambiente local (backend, banco, webscraping legado, fallback engine, Webwhats local, frontend, Prisma Studio) |
| `npm run down` | derruba o local (e o warm pool `hbx-engine-*`, salvo `HBX_DOWN_KEEP_ENGINES=true`) |
| `npm run publish` | deploy Hostinger normal: diff, commit automático datado, preflight Prisma/build, push, atualiza VPS, migrations no container `hbx-backend` |
| `npm run new` | deploy seletivo: detecta arquivos mudados vs `origin/master` e rebuilda só os serviços afetados |
| `npm run force` | recuperação/rebuild completo COM backup prévio em `backups/ops/<timestamp>` e dump de produção quando possível |
| `npm run verify:prod` | verificação de produção (health backend, e-mail, WhatsApp, banco, frontend) — separada do publish |
| `npm run engines:up` / `engines:down` | frota local de motores numerados (ver docs/Rules/MOTOR.md) |

Flags úteis do `up`: `HBX_UP_BUILD=auto|always|never`, `HBX_UP_SYNC_BACKEND_DEPS=true`,
`HBX_UP_WEBWHATS=false`, `HBX_UP_STUDIO=false`.

Capacidade elástica no publish: `HBX_PUBLISH_ENGINE_COUNT` (default 3),
`HBX_PUBLISH_ENGINE_MAX_COUNT` (default 20), `HBX_ENGINE_WARM_MIN` (default 1),
`HBX_ENGINE_GOVERNOR_ENABLED=true` na VPS.

Env de produção: `.env.production.local` / `.env.ops.local` / `.env.operations.local`
com `PROD_BACKEND_URL`, `PROD_FRONTEND_URL`, `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_USER`,
`HOSTINGER_APP_DIR`. `verify:prod` recusa targets locais.
Bootstrap do master: produção mantém `BOOTSTRAP_SYSTEM_MASTER=false`.

## Ops Control (`ops-control/`)

- Painel local em `127.0.0.1:3099` que controla a VPS via SSH.
- Áreas: Auditoria do Radar (abas VPS / localhost), cockpit Local x VPS
  (Turbo LOCAL/VPS/ambos, filtro de canal, Forçar filtro, Cancelar scraping,
  coordenação para não abrir duas fábricas na mesma cidade/segmento),
  e Email Lab (job no Local Lab → export → import oficial via
  `/webscraping/lead-harvest/import` na VPS).
- Config via `.env.ops-control` (token, SSH, backends por ambiente com JWT master
  ou auto-session no container). Sobe com `docker-compose.ops.yml`.

## HBX Owner (`hbx-owner/local-agent/`)

- Cockpit local do dono = **painel web servido pelo local-agent** (Node, sem SQLite).
  Sobe com `npm run owner:app` (start-owner.ps1: sobe o agent + abre o navegador) ou
  `npm run owner:agent` direto. Token local em `HBX_OWNER_LOCAL_TOKEN` (ou gerado/persistido
  em `.owner-token`, gitignored). Painel em `http://127.0.0.1:3107`.
- Abas: **Hoje** (ponto/foco, estado em `state/today.json` — sem banco), **Tickets**
  (fila `.md` de `docs/PLANEJAMENTOS`, fonte única versionada), **Caça** (Banco de Leads,
  Local Lab e Exportar local→VPS), **Código** (git), **Execução** (allowlist + runs), **Config**.
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

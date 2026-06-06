# HBX Master Local Agent

Agente local do HBX Master para executar comandos seguros no Windows, sempre em `127.0.0.1`.

## Como iniciar

```powershell
$env:HBX_MASTER_LOCAL_TOKEN="token-local-forte"
npm run master:agent
```

URL local:

```txt
http://127.0.0.1:3107
```

## Regras

- Bind somente em `127.0.0.1`.
- Token local obrigatorio no header `Authorization: Bearer <token>`.
- Sem endpoint de shell livre.
- Executa apenas comandos de `allowlist.json`.
- Comandos ficam modelados como array `[binario, ...args]`.
- `npm` vira `npm.cmd` no Windows.
- Logs ficam em `hbx-master/local-agent/logs`.
- `publish`, `new`, `force`, migrations e secrets ficam bloqueados nesta fase.

## Endpoints principais

- `GET /health`
- `GET /commands`
- `POST /commands/:id/run`
- `GET /runs`
- `GET /runs/:id`
- `GET /git/status`
- `GET /git/branches`
- `GET /git/current`
- `GET /git/remotes`
- `GET /git/last-commit`
- `GET /git/changed-files`
- `POST /git/checkout-pr`
- `POST /test/frontend`
- `POST /test/backend`
- `POST /test/webwhats`
- `POST /test/e2e`
- `POST /deploy/verify-prod`

`/deploy/new`, `/deploy/publish` e `force` nao existem nesta fase.

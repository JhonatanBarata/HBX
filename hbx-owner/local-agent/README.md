# HBX Owner Local Agent

Agente local do HBX Owner para executar comandos seguros no Windows, sempre em `127.0.0.1`.

## Como iniciar

```powershell
$env:HBX_OWNER_LOCAL_TOKEN="token-local-forte"
npm run owner:agent
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
- Logs ficam em `hbx-owner/local-agent/logs`.
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
- `GET /radar/engines/status`
- `GET /radar/engines/:id/logs`
- `POST /radar/engines/:id/start`
- `POST /radar/engines/:id/stop`

`/deploy/new`, `/deploy/publish` e `force` nao existem nesta fase.

## Radar Motores

Os endpoints de motores aceitam somente nomes no formato `hbx-engine-N`.
Eles nao recebem shell livre pelo body e continuam exigindo `Authorization: Bearer <HBX_OWNER_LOCAL_TOKEN>`.

Use a aba `Radar Motores` do HBX Owner Windows para consultar Docker local, abrir logs, iniciar um motor parado ou parar um container selecionado com confirmacao. Acoes de scheduler, dreno com lease, force night e cancelamento de factory continuam no painel Master web.

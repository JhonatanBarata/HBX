# HBX Master

HBX Master e o app de comando operacional do HBX.

## Como rodar

```powershell
npm run up
$env:HBX_MASTER_LOCAL_TOKEN="token-local-forte"
npm run master:agent
```

Abra:

```txt
http://localhost:3001/master
```

## Modulos

- Morning Desk.
- Automatizadores.
- Windows App local em `hbx-master/windows-app`.
- Git / PR.
- Testes.
- Ops Control em `hbx-master/ops-control`.
- Deploy Control.
- Support Ops.
- Config.

## O que nunca fazer

- Nao liberar feature paga sem backend autorizar.
- Nao expor secrets.
- Nao rodar shell livre.
- Nao executar deploy, publish, new, force ou migrations nesta fase.
- Nao apagar historico negativo do Radar.

## Comandos principais

```powershell
npm run master:agent
npm run master:agent:health
npm run codex:status
npm run codex:next
npm run up
npm run down
npm run verify:prod
```

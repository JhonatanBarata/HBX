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

## Teste de lote integrado

Quando o Codex Cloud criar PRs para tickets, o HBX Master trabalha assim:

1. O dono revisa e mergeia manualmente os PRs que quer aplicar em paralelo.
2. O checkout atual passa a ser o lote de QA.
3. O Local Agent roda `npm run up` nessa mesma pasta.
4. O dono abre `http://localhost:3001` e testa o ticket no sistema real.
5. O painel Testes roda frontend, backend, Webwhats ou E2E conforme o diff.

Baixar PR isolado continua disponivel para diagnostico, mas nao e o caminho principal.

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

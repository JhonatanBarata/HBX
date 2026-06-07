# PLANEJAMENTO RADAR 04 - ESTADO, DRAIN E LEASES

## Objetivo

Separar pausa logica de desligamento real. O pool decide leases; o estado operacional decide se o container deve ficar vivo, drenar ou parar.

## Problema atual

Pausar motor no painel impede uso na fila, mas nao desliga container. Isso nao libera memoria.

## Escopo

- Introduzir estado desejado por motor.
- Garantir que motor em `draining` nao receba lease novo.
- Parar apenas motor sem lease ativo.
- Refileirar tarefa longa quando cancelamento exigir.

## Estado minimo

Idealmente persistir:

```text
desiredState: running | draining | stopped
actualState: running | exited | missing | starting
containerName
memoryRssMb
memoryEwmaMb
lastStartAt
lastStopAt
idleSince
drainUntil
priorityClass: client | factory | mixed
lastLeasePurpose
```

## Estrategia sem risco inicial

Se migration for grande, comecar usando campos/configuracao existentes e metadata JSON. Depois criar migration especifica quando a estrutura estiver validada.

## Arquivos provaveis

- `backend/prisma/schema.prisma`, se houver migration
- `backend/src/webscraping/hbx-engine-pool.service.ts`
- controllers Master/webscraping existentes
- DTOs de resposta do painel

## Criterios de aceite

- `pause` continua sendo pausa logica.
- `drain` bloqueia lease novo e aguarda job atual.
- `stop` so para container sem lease.
- `kill` nao e fluxo normal; apenas emergencia/panic.

## Validacao

- Testes de elegibilidade de lease.
- Testes de transicao de estado.
- Prisma validate se schema mudar.
- Backend build.

## Aplicado em 2026-06-07

- Sem migration nesta etapa: `HbxEngineLock.status` passa a aceitar tambem `draining` e `stopped`.
- `pause` continua pausa logica (`manualPaused`/`pausedUntil`) e nao representa desligamento real.
- `drain` bloqueia novas leases e mantem a lease ativa ate o job atual terminar.
- `releaseEngine` e lock expirado convertem `draining` para `stopped`.
- `stop` em motor sem lease marca `stopped`; com lease ativa, sem `force`, entra em `draining`.
- `stop force` devolve `WebscrapingCampaignTask` e `WebscrapingSearchRun` para fila antes de marcar `stopped`.
- Painel/backend passa a expor `desiredState`, `actualState`, `drainUntil`, `leaseActive` e `stopEligible`.
- Parada fisica do container ficou para a parte 5 (`governor/watchdog Docker`).

## Validado em 2026-06-07

- `npm --prefix backend run build`
- `node --test backend\dist\webscraping\hbx-engine-pool.service.test.js`
- `npm --prefix backend run prisma:validate`
- `git diff --check`

## Risco

Medio/alto se envolver migration. Por isso deve ser uma request separada e revisada antes de aplicar em producao.

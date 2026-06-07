# PLANEJAMENTO RADAR 05 - GOVERNOR DOCKER E WATCHDOG

## Objetivo

Criar o atuador real: o Governor liga, drena e para containers `hbx-engine-*` conforme estado desejado, memoria e demanda.

## Problema atual

O watchdog atual tende a religar motor parado. Isso anula qualquer tentativa de liberar memoria parando containers.

## Escopo

- Criar `HbxEngineGovernorService`.
- Criar `HbxEngineTelemetryService`.
- Criar adaptador Docker limitado a containers `hbx-engine-*`.
- Alterar watchdog para obedecer `desiredState`.
- Implementar cooldown para evitar liga/desliga em loop.

## Regras do watchdog novo

```text
desiredState=running  + container parado  => start
desiredState=stopped  + container rodando sem lease => stop
desiredState=draining => nao dar lease novo; parar apos drain
unhealthy + running   => restart
unhealthy + stopped   => nao religar
```

## Windows/HBX Owner

No ambiente Windows, comandos Docker devem ser executados por caminho controlado:

- backend quando tiver permissao operacional segura;
- ou `hbx-owner/local-agent` com allowlist explicita;
- nunca comando arbitrario vindo do frontend.

## Arquivos provaveis

- `backend/src/webscraping/*`
- `backend/src/webscraping/webscraping.module.ts`
- `hbx-owner/local-agent/*`, se for necessario comando local
- `scripts/*hbx*engine*`

## Criterios de aceite

- Parar container libera memoria e nao e revertido pelo watchdog.
- Governor nunca mexe em container fora do prefixo permitido.
- Governor respeita lease ativo.
- Logs registram acao e motivo, sem segredo.

## Validacao

- Testes unitarios de decisao.
- Mock do Docker adapter.
- Teste manual local com 1 a 3 containers.
- Backend build.

## Risco

Alto. Esta e a request mais sensivel porque atua no Docker. Deve vir depois das requests 01 a 04.

## Aplicado em 2026-06-07

### Backend

- Criado `HbxEngineDockerAdapterService` com `execFile`, sem shell, limitado a containers `hbx-engine-*`.
- Criado `HbxEngineTelemetryService` para inspecionar container, saude, estado real e memoria RSS.
- Criado `HbxEngineGovernorService`, opt-in por `HBX_ENGINE_GOVERNOR_ENABLED=true`.
- Registrados adapter, telemetry e governor em `WebscrapingModule`.
- Exportada funcao pura `decideHbxEngineGovernorActions` para teste de decisao sem Docker real.

### Regras implementadas

```text
desiredState=running  + container ausente/parado => start
desiredState=running  + container unhealthy      => restart
desiredState=stopped  + container rodando sem lease => stop
desiredState=stopped  + lease ativo              => nao parar
desiredState=draining + lease ativo              => aguardar
desiredState=draining + sem lease rodando        => stop
desiredState=draining + sem lease parado         => marcar stopped
```

Tambem foi adicionado cooldown por motor para evitar loop de start/stop/restart.

### Watchdog antigo

- `scripts/generate-hbx-engines-compose.js` agora gera o watchdog legado desativado por padrao.
- `docker-compose.hbx-engines.generated.yml` foi regenerado com `HBX_LEGACY_ENGINE_WATCHDOG_ENABLED=false`.
- Se a flag nao for `true`, o watchdog fica parado e nao religa motores parados pelo governor.

### Variaveis novas

Adicionadas em `.env.hostinger.example`, `.env.production.example`, `docker-compose.yml`, `scripts/deploy-hostinger.js` e `scripts/release.js`:

```env
HBX_ENGINE_GOVERNOR_ENABLED=false
HBX_ENGINE_GOVERNOR_INTERVAL_SECONDS=30
HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS=120
HBX_ENGINE_DRAIN_TIMEOUT_SECONDS=90
HBX_ENGINE_DOCKER_CLI_PATH=docker
HBX_LEGACY_ENGINE_WATCHDOG_ENABLED=false
```

### Validacao executada

- `npm --prefix backend run build`
- `node --check scripts/generate-hbx-engines-compose.js`
- `node --check scripts/deploy-hostinger.js`
- `node --check scripts/release.js`
- `node --test backend\dist\webscraping\hbx-engine-governor.service.test.js`
- `node --test backend\dist\webscraping\hbx-engine-pool.service.test.js`
- `npm --prefix backend run prisma:validate`
- `docker compose -f docker-compose.yml config --quiet`
- `docker compose -f docker-compose.hostinger.yml -f docker-compose.hbx-engines.generated.yml config --quiet`
- `git diff --check`

### Pendente proposital

- Nao foi executado teste manual com Docker real nem publish/deploy.
- Para ativar em ambiente operacional, ligar explicitamente `HBX_ENGINE_GOVERNOR_ENABLED=true` e manter o watchdog legado desativado, validando primeiro com 1 a 3 containers.

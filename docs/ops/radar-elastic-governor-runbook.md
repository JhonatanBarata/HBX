# Radar Elastic Engine Governor - Runbook

## Objetivo

Operar a frota elastica do Radar sem ligar todos os `hbx-engine-*` por padrao.

Regra operacional:

```text
Cliente tem prioridade.
Factory usa excedente.
Memoria manda no limite.
Cancelamento devolve a maquina.
```

## Validacao local sem deploy

```powershell
npm run radar:elastic:validate
npm --prefix backend run prisma:validate
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend run build
node --test backend\dist\webscraping\hbx-engine-pool.service.test.js
node --test backend\dist\webscraping\hbx-engine-governor.service.test.js
node --test backend\dist\webscraping\webscraping-controller-master-routes.test.js
```

Use `npm run test:e2e` somente quando o fluxo ponta a ponta mudar e o ambiente estiver pronto.

## Operacao local

`npm run up` sobe o app local sem frota grande de `hbx-engine-*`.

Resumo rapido do `up`:

```powershell
$env:HBX_UP_BUILD="auto"              # padrao: build so quando runtime principal nao existe
$env:HBX_UP_SYNC_BACKEND_DEPS="true"  # opcional: forca npm install no backend container
$env:HBX_UP_WEBWHATS="false"          # opcional: pula Webwhats local
$env:HBX_UP_STUDIO="false"            # opcional: pula Prisma Studio
npm run up
```

Para subir warm pool explicito:

```powershell
npm run engines:up
```

Padrao local: 3 motores.

Para desligar warm pool local:

```powershell
npm run engines:down
```

`npm run down` tambem tenta parar o warm pool dedicado por padrao. Para manter os motores durante um teste:

```powershell
$env:HBX_DOWN_KEEP_ENGINES="true"
npm run down
```

## Owner Windows

1. Inicie o agent local:

```powershell
$env:HBX_OWNER_LOCAL_TOKEN="token-local-forte"
npm run owner:agent
```

2. Abra o app:

```powershell
npm run owner:app
```

3. Use a aba `Radar Motores` para status, logs, iniciar e parar containers locais `hbx-engine-N`.

4. Use `Abrir painel Master` para force night, cancelamento de factory e dreno com lease.

## Ativacao controlada

Flags de ativacao:

```text
HBX_ENGINE_GOVERNOR_ENABLED=true
HBX_ENGINE_ELASTIC_FACTORY_ENABLED=true
HBX_ENGINE_DOCKER_ACTUATOR_ENABLED=true
HBX_ENGINE_LEGACY_WATCHDOG=false
```

Comece com warm pool baixo:

```text
HBX_ENGINE_WARM_MIN=1
HBX_ENGINE_WARM_MAX=3
HBX_FACTORY_MIN_ENGINES=1
HBX_FACTORY_MAX_ENGINES=3
HBX_CLIENT_RESERVED_ENGINES=2
```

## Rollback rapido

Desative o Governor e o atuador Docker:

```text
HBX_ENGINE_GOVERNOR_ENABLED=false
HBX_ENGINE_ELASTIC_FACTORY_ENABLED=false
HBX_ENGINE_DOCKER_ACTUATOR_ENABLED=false
```

Se precisar restaurar comportamento antigo temporariamente:

```text
HBX_ENGINE_LEGACY_WATCHDOG=true
```

Mantenha pelo menos um motor ou fallback:

```text
HBX_ENGINE_COUNT=1
HBX_ENGINE_MAX_COUNT=1
HBX_FACTORY_MIN_ENGINES=1
HBX_FACTORY_MAX_ENGINES=1
```

## Smokes esperados

- `npm run up` nao sobe `hbx-engine-1..50`.
- build/lint nao chama Docker de motores.
- publish normal usa warm pool pequeno por padrao.
- Governor so atua em container `hbx-engine-N`.
- Motor com lease ativo nao e parado pelo Governor.
- Cancelamento de factory bloqueia novos leases `mass_data`.
- Demanda de cliente reduz ou bloqueia factory.
- Memoria alta reduz `automaticAllowedEngines` e memoria critica zera factory.

## O que nao fazer no smoke

- Nao rodar publish/deploy/release para validar localmente.
- Nao rodar migrations destrutivas.
- Nao editar `.env` real sem backup.
- Nao parar container manualmente se houver lease ativo; drene pelo painel Master primeiro.

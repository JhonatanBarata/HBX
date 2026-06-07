# PLANEJAMENTO RADAR 06 - FACTORY, FORCE NIGHT E CANCELAMENTO

## Objetivo

Fazer scraping noturno/forcado usar capacidade elastica e permitir cancelamento real que devolve memoria.

## Problema atual

A factory ja consulta allowance, mas ainda nao controla vida real dos containers. Algumas regras de janela podem estar permissivas demais, e cancelamento nao necessariamente drena/paralisa containers.

## Escopo

- Separar factory normal de force night.
- Force night ignora janela, mas nao ignora memoria.
- Cancelamento bloqueia novos leases `mass_data`.
- Jobs em andamento drenam ou sao refileirados quando longos.
- Governor para containers factory ociosos.

## Regras

```text
factory normal: respeita janela operacional
force night: pode iniciar fora da janela
emergency stop: corta factory mesmo se forcedOn=true
cancel forced: desired factory = 0
```

## Arquivos provaveis

- `backend/src/webscraping/radar/*factory*`
- `backend/src/webscraping/hbx-engine-pool.service.ts`
- controllers Master de webscraping
- DTOs e logs operacionais

## Endpoints sugeridos

```text
POST /modules/master/webscraping/elastic/force-night
POST /modules/master/webscraping/elastic/cancel-forced
POST /modules/master/webscraping/engines/:id/drain
POST /modules/master/webscraping/engines/:id/stop-container
```

Os endpoints devem exigir contexto Master/Owner.

## Criterios de aceite

- Factory nao compete com cliente.
- Cancelar scraping forçado impede jobs novos de factory.
- Memoria volta ao sistema quando containers drenados param.
- Estado fica visivel para painel Owner.

## Validacao

- Testes de politica de factory.
- Testes de permissao Master nos endpoints.
- Backend build.

## Risco

Medio/alto. Mexe no comportamento operacional do Radar, mas sem alterar pagamento/auth/tenant.

## Aplicado em 2026-06-07

### Politica da factory

- Factory normal voltou a respeitar janela operacional.
- `force night` ignora a janela, mas continua respeitando memoria, reserva de cliente e capacidade saudavel.
- `emergencyStop` vence mesmo quando existe `forcedUntil` ativo.
- `forcedUntil: ""` agora limpa uma forca futura de verdade.
- `saveMasterTurboConfig` nao cria/reabastece campanha quando a factory esta desabilitada, em emergencia ou com capacidade zero.

### Cancelamento e drain

- Criado `HbxEnginePoolService.drainFactoryEngines`.
- O drain de factory preserva o motor reservado ao cliente e atua em motores/leases de `mass_data`/`autonomous`.
- `stopFactoryNow` agora:
  - limpa `forcedUntil`;
  - zera `maxEngines/minEngines`;
  - marca `emergencyStop`;
  - pausa campanhas `mass_data`;
  - forca parada/requeue de motores de factory via pool.
- Criado `cancelForcedRadarFactory`:
  - desabilita a factory;
  - limpa `forcedUntil`;
  - zera capacidade automatica;
  - cancela campanhas/tarefas `mass_data`;
  - drena motores de factory para devolver memoria.

### Endpoints Master/Owner

Todos continuam no controller `modules/master/webscraping`, protegido por `JwtAuthGuard` + `MasterGuard`.

```text
POST /modules/master/webscraping/elastic/force-night
POST /modules/master/webscraping/elastic/cancel-forced
POST /modules/master/webscraping/engines/:id/drain
POST /modules/master/webscraping/engines/:id/stop
POST /modules/master/webscraping/engines/:id/stop-container
```

Os endpoints antigos de factory continuam funcionando:

```text
POST /modules/master/webscraping/factory/start
POST /modules/master/webscraping/factory/stop
POST /modules/master/webscraping/factory/stop-now
POST /modules/master/webscraping/factory/resume-schedule
POST /modules/master/webscraping/factory/force-next
```

### Testes e validacao executada

- `npm --prefix backend run build`
- `node --test backend\dist\webscraping\hbx-engine-pool.service.test.js`
- `node --test backend\dist\webscraping\hbx-engine-governor.service.test.js`
- `node --test backend\dist\webscraping\webscraping-controller-master-routes.test.js`
- `npm --prefix backend run prisma:validate`
- `git diff --check`

### Cobertura adicionada

- Factory normal bloqueia fora da janela.
- Force night ignora janela, mas nao ignora memoria.
- Emergency stop vence force night.
- Weekdays/weekend sempre ligado funcionam de forma explicita.
- Drain de factory preserva motor reservado ao cliente.
- Endpoints novos de elastic/engines continuam no controller Master com `JwtAuthGuard` + `MasterGuard`.

### Pendente proposital

- Nao foi executado teste manual com Docker real.
- Nao foi executado publish/deploy.
- Antes de ativar em VPS, validar com poucos containers e `HBX_ENGINE_GOVERNOR_ENABLED=true`.

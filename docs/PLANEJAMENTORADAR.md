# PLANEJAMENTO RADAR - HBX Elastic Engine Governor

## Objetivo

Transformar a frota de motores do Radar em uma capacidade elastica governada por memoria, fila e prioridade operacional.

O HBX nao deve mais tratar `hbx-engine-1..50` como motores que precisam estar sempre vivos. O desenho correto e declarar capacidade maxima e manter ligados apenas os motores necessarios agora.

Regra central:

```text
Cliente tem prioridade.
Factory usa excedente.
Memoria manda no limite.
Cancelamento devolve a maquina.
```

## Resultado esperado

- `npm run up`, builds e publish deixam de acionar ou verificar uma frota grande sem necessidade.
- Ambiente local e Windows Owner sobem poucos motores por padrao.
- Producao pode ter capacidade maxima maior, mas com warm pool pequeno.
- Scraping noturno/forcado sobe motores progressivamente conforme backlog e memoria segura.
- Ao cancelar factory, novos leases de `mass_data` param, jobs drenam e containers ociosos desligam.
- O painel operacional fica no contexto HBX Owner/Master, nao em tela publica de cliente.

## Onde o painel deve viver

O painel de controle do Governor deve ficar dentro do HBX Owner:

- UI web operacional: rotas `frontend/src/app/master/*` ou area Master ja existente para webscraping/owner.
- App Windows Owner/local agent: pasta `hbx-owner/*`, quando o controle precisar conversar com o sistema local do Windows.
- Backend continua sendo fonte de verdade para estado, permissao Master e operacao.

Nao criar painel publico para cliente. Cliente deve ver apenas estado operacional necessario do Radar, sem botoes de Docker, memoria host ou comandos de infraestrutura.

## Divisao em requests

Faremos em 8 requests de implementacao, alem desta request de planejamento.

1. `PLANEJAMENTORADAR-01-DEV-UP-BUILD-PUBLISH.md`
2. `PLANEJAMENTORADAR-02-CAPACIDADE-CONFIGURAVEL.md`
3. `PLANEJAMENTORADAR-03-SCHEDULER-MEMORIA-CLIENTE.md`
4. `PLANEJAMENTORADAR-04-ESTADO-DRAIN-LEASES.md`
5. `PLANEJAMENTORADAR-05-GOVERNOR-DOCKER-WATCHDOG.md`
6. `PLANEJAMENTORADAR-06-FACTORY-FORCE-CANCEL.md`
7. `PLANEJAMENTORADAR-07-PAINEL-HBX-OWNER.md`
8. `PLANEJAMENTORADAR-08-VALIDACAO-ROLLBACK.md`

## Sequencia recomendada

Primeiro atacar a dor de demora local:

1. impedir que `up/build/publish` subam ou validem motores em massa sem necessidade;
2. deixar dev com 1 a 3 motores por padrao;
3. tornar capacidade maxima configuravel sem ligar tudo.

Depois ativar inteligencia:

4. memoria e reserva de cliente mandando no scheduler;
5. estado `running/draining/stopped`;
6. Governor Docker obedecendo estado desejado.

Por fim, operacao:

7. painel no HBX Owner;
8. cancelamento/force night;
9. testes, smoke e rollback.

## Principios de seguranca

- Nao mexer em planos, cobranca, checkout, quotas comerciais, Mercado Pago ou entitlements.
- Nao enfraquecer auth, Master Guard, roles ou tenant.
- Nao rodar deploy, publish, release ou restart de producao durante implementacao local.
- Nao apagar historico de Radar, negativos, runs, tasks ou leads.
- Todo comando Docker destrutivo deve ser limitado a containers `hbx-engine-*` e preferencialmente via allowlist do Owner/local agent.
- Backend e o dono da autorizacao operacional. Frontend apenas aciona APIs autorizadas.

## Arquitetura alvo

```text
Radar / Vendas / Master / HBX Owner
        |
        v
WebscrapingService / Radar Factory
        |
        v
HbxEnginePoolService
  - leases
  - elegibilidade
  - prioridade
  - fila
        |
        v
HbxEngineGovernorService
  - desiredState
  - start/stop/drain
  - cooldown
        |
        v
HbxEngineTelemetryService
  - memoria host
  - docker stats
  - ewma por motor
        |
        v
hbx-engine-1..N
```

## Definicoes operacionais

- `warm`: motor mantido ligado para baixa latencia.
- `cold`: motor declarado, mas container parado.
- `running`: motor vivo e elegivel conforme politica.
- `draining`: nao recebe lease novo; termina trabalho curto e depois para.
- `stopped`: container parado e sem consumo de memoria relevante.
- `client`: prioridade de usuario/cliente/Radar Digital/manual/Vendas.
- `factory`: prioridade baixa, preemptivel, incluindo `mass_data`, `autonomous` e scraping noturno.

## Formula alvo

```text
freePercent = mem.available / mem.total * 100

hardReserveMb = max(
  mem.totalMb * 0.15,
  osReserveMb + clientReserveMb
)

engineCostMb = max(
  configuredMinEngineMb,
  p95(engineMemoryEwmaMb) * 1.20
)

maxEnginesByMemory = floor(
  (mem.availableMb - hardReserveMb) / engineCostMb
)

clientNeed = activeClientLeases + queuedClientRuns + minWarmClientEngines

factoryNeed = forcedNight
  ? ceil(factoryBacklog / tasksPerEngineTarget)
  : ceil(factoryBacklog / normalTasksPerEngineTarget)

desiredTotal = clamp(
  clientNeed + factoryNeed,
  minWarmEngines,
  min(configuredMaxEngines, maxEnginesByMemory)
)
```

Protecoes:

```text
freePercent < 15% => nao crescer factory
freePercent < 12% => drenar/parar factory agressivamente
clientDemandActive => factory devolve motores
```

## Estado final desejado

O HBX sai de:

```text
Tenho 50 motores sempre declarados e tento administrar uso.
```

Para:

```text
Tenho capacidade maxima N, mas so mantenho vivos os motores que memoria, fila e prioridade permitem agora.
```


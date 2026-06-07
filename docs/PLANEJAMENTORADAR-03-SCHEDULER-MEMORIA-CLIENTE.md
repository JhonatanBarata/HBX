# PLANEJAMENTO RADAR 03 - SCHEDULER, MEMORIA E CLIENTE

## Objetivo

Fazer o scheduler usar memoria real e prioridade de cliente para calcular quantos motores automaticos/factory podem trabalhar.

## Problema atual

O backend ja tem embriões de scheduler, reserva de cliente e pressao de memoria, mas parte da inteligencia esta neutralizada:

```text
manualReservedEngines = 0
clientPriorityActive = false
pressurePenalty = 0
factoryMaxEngines = null
resolveMemoryGuardEngines() ignora pressure
```

## Escopo

- Reativar reserva de cliente.
- Reativar janela de prioridade de cliente.
- Usar pressao de memoria para reduzir factory.
- Garantir que `mass_data` e `autonomous` sejam prioridade baixa.
- Preservar jobs manuais/Radar Digital/Vendas como prioridade alta.

## Arquivos provaveis

- `backend/src/webscraping/hbx-engine-pool.service.ts`
- services de Radar factory em `backend/src/webscraping/radar/*`
- testes existentes de webscraping/radar

## Politica sugerida

```text
soft pressure  >= 82% => factory reduz para 60%
hard pressure  >= 85% => factory reduz para 25%
panic pressure >= 88% => factory vai para 0
```

Para alvo de memoria livre:

```text
normal: manter pelo menos 15% livre
emergencia: abaixo de 12%, factory para
```

## Criterios de aceite

- Cliente ativo reduz capacidade da factory.
- Memoria alta reduz ou zera motores automaticos.
- Scheduler retorna razoes claras: `client_priority`, `memory_guard`, `memory_stop`, `factory_max`, `manual_demand`.
- Nenhuma regra apaga negativos ou historico do Radar.

## Validacao

- Testes unitarios do calculo de allowance.
- Backend build.
- Logs sem PII, secrets ou payload sensivel.

## Aplicado em 2026-06-07

- Reserva de cliente reativada no scheduler com `HBX_CLIENT_RESERVED_ENGINES` e janela `HBX_RADAR_CLIENT_PRIORITY_*`.
- `manual`, `radar_pull`, `radar_digital`, `lead_plus_enrichment` e `vendas` continuam fora do limite automatico.
- `mass_data` e `autonomous` agora respeitam `automaticAllowedEngines`.
- Pressao de memoria agora reduz factory em 82/85/88 por cento via `memory_guard` e `memory_stop`.
- Scripts de publish/release deixam de injetar reserva zero no backend e respeitam `HBX_CLIENT_RESERVED_ENGINES`.

## Validado em 2026-06-07

- `npm --prefix backend run build`
- `node --check scripts/deploy-hostinger.js`
- `node --check scripts/release.js`
- `node --test backend\dist\webscraping\hbx-engine-pool.service.test.js`
- `npm --prefix backend run prisma:validate`
- `docker compose -f docker-compose.yml config --quiet`
- `git diff --check`

## Risco

Medio. Se agressivo demais, factory trabalha pouco. Se fraco demais, host sofre. Usar envs para ajuste fino.

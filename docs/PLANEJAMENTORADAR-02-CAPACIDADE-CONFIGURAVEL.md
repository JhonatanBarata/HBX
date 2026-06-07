# PLANEJAMENTO RADAR 02 - CAPACIDADE CONFIGURAVEL

## Objetivo

Remover a trava rigida de 50 motores e substituir por capacidade maxima configuravel, sem ligar todos os containers.

## Problema atual

Existem limites fixos como `DEFAULT_COUNT = 50`, `HARD_LIMIT = 50`, `PRODUCTION_HBX_ENGINE_COUNT = 50`, `HARD_HBX_ENGINE_MAX_COUNT = 50` e scripts que reescrevem ou limpam motores acima de 50.

## Escopo

- Tornar capacidade maxima configuravel por env.
- Definir default local baixo.
- Definir hard cap seguro, como 200, mas sem significar 200 ligados.
- Ajustar cleanup para nao destruir capacidade declarada quando o Governor estiver ativo.

## Arquivos provaveis

- `scripts/generate-hbx-engines-compose.js`
- `scripts/cleanup-hbx-extra-engines-vps.js`
- `backend/src/webscraping/hbx-engine-pool.service.ts`
- `.env*.example`
- `docker-compose.hbx-engines.generated.yml`

## Politica sugerida

```text
HBX_ENGINE_DEFAULT_COUNT=3
HBX_ENGINE_MAX_COUNT=200
HBX_ENGINE_HARD_LIMIT=200
HBX_ENGINE_WARM_MIN=1
HBX_ENGINE_WARM_MAX=3
```

Em producao, o maximo pode ser maior, mas o numero ligado vem do Governor.

## Criterios de aceite

- O backend nao faz clamp obrigatorio em 50.
- O gerador aceita capacidade maior quando explicitada.
- Dev continua pequeno por padrao.
- Cleanup nao remove motores de forma contraria ao plano elastico.

## Validacao

- Teste unitario ou script simples para parser de count.
- Build backend se tocar TypeScript.
- Nao rodar cleanup real em producao.

## Risco

Medio se alguem interpretar capacidade como motores vivos. Por isso esta request nao deve mudar start/stop ainda; apenas configuracao e limites.

## Aplicado nesta request

- `backend/src/webscraping/hbx-engine-pool.service.ts`: hard cap passou de 50 para 200.
- `backend/src/webscraping/hbx-engine-pool.service.ts`: default dev passou para 3 e default producao para 20.
- `backend/src/webscraping/hbx-engine-pool.service.ts`: `HBX_ENGINE_DEFAULT_COUNT` e `HBX_ENGINE_HARD_LIMIT` passaram a ser respeitados.
- `backend/src/webscraping/hbx-engine-pool.service.test.ts`: adicionada cobertura para `HBX_ENGINE_COUNT=200`.
- `scripts/generate-hbx-engines-compose.js`: gerador aceita ate 200 e usa default 20.
- `docker-compose.hbx-engines.generated.yml`: regenerado com 20 motores por padrao.
- `scripts/deploy-hostinger.js` e `scripts/release.js`: `HBX_PUBLISH_ENGINE_COUNT` define warm pool ativo; `HBX_ENGINE_MAX_COUNT` pode permanecer como capacidade ate 200.
- `scripts/cleanup-hbx-extra-engines-vps.js` e `scripts/cleanup-hbx-extra-engines.sh`: cleanup preserva ate 200 por padrao e nao reescreve `.env` para 50.
- `.env.hostinger.example` e `.env.production.example`: documentados `HBX_ENGINE_DEFAULT_COUNT`, `HBX_ENGINE_HARD_LIMIT`, `HBX_ENGINE_WARM_MIN`, `HBX_ENGINE_WARM_MAX` e `HBX_PUBLISH_ENGINE_COUNT`.

## Validado nesta request

- `node --check scripts/generate-hbx-engines-compose.js`
- `node --check scripts/cleanup-hbx-extra-engines-vps.js`
- `node --check scripts/deploy-hostinger.js`
- `node --check scripts/release.js`
- `docker compose -f docker-compose.hostinger.yml -f docker-compose.hbx-engines.generated.yml config --quiet`
- `docker compose -f docker-compose.yml config --quiet`
- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- `node --test backend/dist/webscraping/hbx-engine-pool.service.test.js`

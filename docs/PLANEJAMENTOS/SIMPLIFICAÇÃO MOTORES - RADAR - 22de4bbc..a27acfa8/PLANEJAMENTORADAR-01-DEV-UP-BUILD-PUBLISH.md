# PLANEJAMENTO RADAR 01 - DEV, UP, BUILD E PUBLISH

## Objetivo

Resolver primeiro a dor pratica: comandos locais e operacionais nao devem abrir ou checar muitos motores quando o objetivo e subir app, buildar ou publicar codigo.

## Problema atual

O repo trata muitos motores como frota oficial sempre presente. Isso torna `npm run up`, build e publish lentos porque scripts/compose/watchdog acabam criando, verificando ou esperando containers que nao sao necessarios para a tarefa.

## Escopo

- Revisar scripts raiz de `up`, build e publish.
- Separar perfil de app principal do perfil de motores.
- Dev local deve iniciar com poucos motores, idealmente 1 a 3.
- Build/publish nao deve depender de motor vivo, exceto quando o proprio comando for explicitamente de scraping.

## Arquivos provaveis

- `package.json`
- `scripts/start-all.ps1`
- `scripts/generate-hbx-engines-compose.js`
- `docker-compose*.yml`
- `scripts/publish.js`
- `scripts/release.js`
- `OPS.md`
- docs operacionais em `docs/ops/*`, se existirem orientacoes conflitantes

## Mudanca esperada

Criar separacao clara:

```text
app stack       -> frontend, backend, banco, redis/infra basica
engine warm     -> poucos motores para dev
engine capacity -> compose gerado com N maximo, mas nao iniciado por padrao
factory         -> motores elasticos sob Governor
```

## Criterios de aceite

- `npm run up` local nao sobe 50 motores.
- Build de frontend/backend nao sobe motor.
- Publish nao inicia frota de motores por acidente.
- Existe comando explicito para subir motores quando necessario.
- Scripts mantem compatibilidade com Windows/PowerShell.

## Validacao

- `git diff --check`
- comando de listagem dos scripts alterados
- quando seguro, rodar apenas comandos de build/lint que nao executem deploy

## Risco

Baixo, desde que nao altere deploy de producao automaticamente. A mudanca deve ser reversivel por env/script.

## Aplicado nesta request

- `docker-compose.yml`: motores `hbx-engine-*` ficaram atras do profile `hbx-engines`.
- `docker-compose.yml`: backend local deixou de depender dos 50 motores e passou a usar o fallback `hbx-scraping-engine` com `HBX_ENGINE_COUNT=1`.
- `package.json`: adicionados `npm run engines:up` e `npm run engines:down`.
- `scripts/start-hbx-engines.ps1`: comando explicito para subir warm pool local numerado, com default 3.
- `scripts/stop-hbx-engines.ps1`: comando explicito para parar motores locais sem derrubar app/banco/fallback.
- `scripts/deploy-hostinger.js` e `scripts/release.js`: publish/new usam warm pool pequeno por padrao e aceitam `HBX_PUBLISH_ENGINE_COUNT` para aumentar explicitamente.
- `OPS.md`: documentado o novo comportamento local e operacional.

## Validado nesta request

- `node --check scripts/deploy-hostinger.js`
- `node --check scripts/release.js`
- parse dos scripts PowerShell locais
- `docker compose -f docker-compose.yml config --quiet`
- `git diff --check`

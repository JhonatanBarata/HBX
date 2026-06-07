# PLANEJAMENTO RADAR 08 - VALIDACAO E ROLLBACK

## Objetivo

Fechar a entrega com verificacoes pequenas, rollback claro e documentacao operacional.

## Validacoes minimas

Frontend, quando tocar painel:

```text
cd frontend && npm run lint
cd frontend && npm run build
```

Backend, quando tocar scheduler/Governor/API:

```text
cd backend && npm run prisma:validate
cd backend && npm run build
```

Testes especificos:

```text
backend/src/webscraping/*.test.ts
tests/radar-backend-policy.test.mjs
```

Rodar e2e raiz apenas se o fluxo ponta a ponta mudar e ambiente estiver pronto.

## Smokes operacionais

- Subir app local sem frota grande.
- Confirmar que build nao sobe engine.
- Confirmar que publish nao inicia engine por acidente.
- Confirmar que Governor so atua em `hbx-engine-*`.
- Confirmar que motor com lease ativo nao e parado.
- Confirmar que cancelamento de factory para novos leases `mass_data`.
- Confirmar que cliente ativo reduz ou bloqueia factory.
- Confirmar que memoria alta reduz allowed engines.

## Rollback

Cada request deve manter rollback simples:

1. env desativa Governor;
2. watchdog antigo pode ser restaurado por flag temporaria, se necessario;
3. warm pool minimo garante que Radar nao fique sem motor;
4. compose antigo pode ser regenerado com count baixo;
5. painel Owner pode esconder acoes via feature flag.

Flags sugeridas:

```text
HBX_ENGINE_GOVERNOR_ENABLED=false
HBX_ENGINE_ELASTIC_FACTORY_ENABLED=false
HBX_ENGINE_DOCKER_ACTUATOR_ENABLED=false
HBX_ENGINE_LEGACY_WATCHDOG=true
```

## Criterios de conclusao

- O sistema local nao abre frota grande por padrao.
- Scheduler respeita cliente e memoria.
- Governor atua em containers com seguranca.
- Painel Owner mostra estado real e permite cancelamento.
- Documentacao operacional explica como ativar/desativar.
- Nenhum fluxo de pagamento, auth, tenant ou historico Radar foi alterado fora do escopo.

## Aplicado em 2026-06-07

- Criado validador nao destrutivo `scripts/validate-radar-elastic-governor.js`.
- Adicionado script raiz:

```text
npm run radar:elastic:validate
```

- Criado runbook operacional:

```text
docs/ops/radar-elastic-governor-runbook.md
```

- O validador confirma:
  - `docker-compose.yml` deixa `hbx-engine-*` fora do `up` padrao via profile;
  - backend local inicia com `HBX_ENGINE_GOVERNOR_ENABLED=false`;
  - `npm run up` nao chama frota `hbx-engine-*` explicitamente;
  - warm pool local explicito usa 3 motores por padrao;
  - release/publish usam warm pool pequeno por padrao;
  - watchdog legado fica desligado por padrao;
  - Governor continua opt-in por env;
  - Docker adapter e Local Agent atuam apenas em `hbx-engine-N`;
  - flags de rollback estao documentadas.

## Validacao executada

- `npm run radar:elastic:validate`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- `npm --prefix backend run prisma:validate`
- `npm --prefix backend run build`
- `node --test backend\dist\webscraping\hbx-engine-pool.service.test.js backend\dist\webscraping\hbx-engine-governor.service.test.js backend\dist\webscraping\webscraping-controller-master-routes.test.js`
- `node --test tests\radar-backend-policy.test.mjs`
- `git diff --check`
- Checks da parte 7 Owner Windows:
  - `python -m py_compile hbx-owner/windows-app/hbx_owner_app.py hbx-owner/windows-app/hbx_owner_launcher.py`
  - `node --check hbx-owner/local-agent/server.js`
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\hbx-owner\windows-app\self-check-hbx-owner.ps1`
  - smoke temporario do local-agent em porta isolada

## Ajuste de teste

`tests/radar-backend-policy.test.mjs` foi atualizado para verificar os invariantes nos arquivos atuais da arquitetura modular Radar, em vez de procurar tudo no agregador `webscraping.service.ts`.

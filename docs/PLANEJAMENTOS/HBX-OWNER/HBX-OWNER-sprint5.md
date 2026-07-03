# HBX-OWNER — Sprint 5: Modularizar o server.js (extração incremental, zero-dep)

> Arquitetura nº9 (HBX Owner). Escopo: `hbx-owner/local-agent/`. Último sprint — os anteriores
> já enxugaram o arquivo (muletas, cópias e código morto mortos). Fazer POR PARTES, cada
> extração com smoke test do painel antes da próxima.

## Por quê (ROI)
server.js concentra 6 papéis em ~2.7k linhas. O custo não é estética: hoje cada correção se
valida "sondando ao vivo"; funções puras extraídas ganham teste de verdade (`node:test`, nativo,
zero dependência) e subagentes conseguem mexer em arquivos diferentes sem conflito.

## Estrutura alvo (CommonJS, sem build, sem npm install)
```
local-agent/
  server.js            # raiz ~100 linhas: config/env, monta rotas, listen
  lib/http-client.js   # backendRequest/opsRequest/localLabRequest + withRetry (1 cliente genérico)
  lib/util.js          # safeText, clampInt, readDotenvValue, setDotenvValue, cardDomain, chunkLeadsBySize
  lib/state.js         # journal em disco (Sprint 1) — load/save atômico
  routes/              # cada bloco de rotas vira função register(router): system, vps, transfer,
                       # enricher, radar, night-factory, integrations, local-lab, tree, events
  jobs/transfer.js     # runTransferPull/Push + estado
  jobs/enricher.js     # enricherLoop/Cycle + estado
  fleet/engines.js     # ensureEnginesUp/stop/keep-warm/runningEngineSet
  system/snapshot.js   # pressão local, containers, parseEngineCapacity, verdicts, mapSnapshot/mapOverview
  test/*.test.js       # node:test das puras
```

## Ordem de extração (menor risco primeiro; 1 commit por passo)
1. `lib/util.js` + testes (chunkLeadsBySize: lote gordo/vazio/1 lead; cardDomain; clampInt).
2. `lib/http-client.js` — unificar os 3 requests copiados (backendRequestOnce/opsRequest/
   localLabRequest são o MESMO esqueleto http.request com timeout/maxBytes/JSON).
3. `system/snapshot.js` + teste de `parseEngineCapacity` (payloads: governor off, fila cheia,
   factoryStopped, contrato elástico 25/06) e `buildVpsVerdict`.
4. `fleet/engines.js`.
5. `jobs/transfer.js` e `jobs/enricher.js` (já com journal do Sprint 1).
6. `routes/*` — o if/else gigante vira tabela `[método, regex/path, handler]` percorrida em
   ordem; comportamento idêntico (mesma precedência).

## Critérios de aceite
- `node --test hbx-owner/local-agent/test/` verde.
- Painel: TODOS os cards pintam, transferência de teste roda, enricher liga/desliga, Árvore
  carrega os 2 lados (smoke após CADA extração, não só no fim).
- `server.js` final ≤150 linhas; nenhum arquivo novo >600 linhas.
- Zero dependência no package.json (continua só scripts).

## Não fazer
- NÃO converter pra ESM/TypeScript/NestJS — CommonJS puro, `node server.js` continua bastando.
- NÃO mudar contrato de nenhum endpoint.
- NÃO extrair tudo num commit só — a regra é 1 extração → smoke → commit.

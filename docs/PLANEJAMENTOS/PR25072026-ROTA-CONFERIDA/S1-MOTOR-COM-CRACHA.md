# S1 — Motor com crachá (fim do fallback Haversine mudo)

Pré-requisito: ler `01-CONTRATO-WORKER.md` e `docs/Rules/BACKEND.md`.

## O problema (real, confirmado)
`backend/src/logistica/logistica-rota.service.ts` → `planRouteByRoads` (linha
~929) chama `https://router.project-osrm.org/table/...` DIRETO e, em QUALQUER
falha, cai calado pro Haversine (`catch` na ~974). A tela mostra "rota pronta"
igual nos dois casos. E existe um proxy pronto sendo ignorado:
`backend/src/logistica/logistica-osrm.service.ts` (cache 10min, rate-limit
30/min/empresa, `OSRM_BASE_URL` p/ self-host).

## O que fazer
1. **Cadeia de 3 degraus** no `planRouteByRoads`:
   proxy (`LogisticaOsrmService.table`) → OSRM público direto (o fetch atual) →
   Haversine. O proxy nunca vira ponto único de falha (comentário do próprio
   serviço).
   - O `table()` do proxy hoje só pede `annotations=duration` (linha ~187) e o
     planejador precisa de `duration,distance` — estender o proxy (parâmetro ou
     annotations fixas `duration,distance`; conferir impacto no cache key).
   - `planRouteByRoads` é função exportada pura; injete o acesso via
     `PlanRouteOptions` (ex.: `opts.osrmTable?: (coords) => Promise<...>`) pra
     manter testável sem Nest. `LogisticaRotaService` injeta
     `LogisticaOsrmService` (module wiring em `logistica.module.ts`) e passa o
     fetcher adiante com o `companyId` já vinculado.
2. **Crachá no resultado**: `PlanRouteResult` e `PlanejarRotaResult` ganham
   `engine: 'osrm' | 'haversine'` e `degradedReason?: 'timeout' | 'rate_limit'
   | 'upstream' | 'coords_invalidas'`. Propagar no retorno de
   `planejarRota`/`iniciarRota` (aditivo — nenhum campo existente muda).
   Ordem manual (`planRouteManual`): não usa matriz — decidir e documentar
   (sugestão: `engine` reflete o cálculo de ETA usado; hoje é haversine → marcar
   como tal, sem faixa de alarme no app quando for ordem manual).
3. **APK (mínimo desta sprint)**: em `EntregaShell/app/src/logistica/assets/app/app.js`,
   guardar `state.routeEngine`/`state.routeDegradedReason` a partir do resultado
   de planejar/iniciar e mostrar:
   - `osrm` → selo discreto "Calculada pelas ruas" no cabeçalho da rota;
   - `haversine` (e NÃO ordem manual) → faixa amarela persistente "Distâncias
     aproximadas em linha reta — rede de rotas indisponível".
   Componentes/tokens do catálogo do APK; zero hex; nada de nova moldura.

## Testes (obrigatórios)
- Estender `logistica-rota.service.test.ts` (padrão do arquivo):
  a) proxy responde → `engine:'osrm'`;
  b) proxy falha e público falha → `engine:'haversine'` + `degradedReason`;
  c) proxy falha e público responde → `engine:'osrm'` (degrau 2 funciona).
- `cd backend && npm run build && node --test dist/logistica/logistica-rota.service.test.js`
  e o teste do proxy se existir (`dist/logistica/logistica-osrm*.test.js` — conferir).

## Guard-rails
- NENHUMA mudança em cobrança (`prepareRoute` intocado).
- Timeouts atuais preservados (proxy 9s já embutido; direto 8s).
- Rate-limit: planejar consome 1 chamada de table por replanejo — ok; NÃO
  aumentar `RATE_LIMIT_PER_MIN`.

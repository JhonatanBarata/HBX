# M3 — Motor de rota + ETA (RESULTADO)

> Sprint M3 do plano `LOGISTICA-MOBILE/PLANO.md`. Executado LOCAL no `master`
> (base = commit M2 `b6efaf8d`), **NÃO publicado**. 100% aditivo sobre N6/M2, sem
> API paga (zero Google Directions), R$0.

## O que entrou

### Serviço novo — `backend/src/logistica/logistica-rota.service.ts`
`LogisticaRotaService` (provider registrado no `logistica.module.ts`, exportado)
+ a **matemática PURA exportada** (testável sem banco):
`haversineKm`, `hasCoord`/`filtrarComCoord`, `routeCostKm`, `nearestNeighbor`,
`twoOpt`, `computeEta`, `planRoute`.

## Algoritmo (100% local)
1. **Separa** paradas com coord × sem coord. Sem `lat`/`lng` (do `CustomerProfile`)
   → vão pro FIM da fila com flag `semCoordenada` (não dá pra roteá-las).
2. **Nearest-neighbor** sobre distância **Haversine**: começa na **origem**
   (`origemLat`/`origemLng` = GPS do entregador); se ausente, começa pela 1ª parada
   com coord. Vai sempre à parada mais próxima ainda não visitada (heurística gulosa).
3. **2-opt**: parte da ordem NN e reverte segmentos `[i..k]` enquanto isso REDUZIR o
   custo total (origem fixa). Converge para ótimo local; **nunca piora** a rota
   (só aceita troca com ganho > 1e-9). Teto de 30 passadas. Para < 4 paradas é no-op
   (2-opt não muda nada).
4. **Grava `rotaOrdem`** 0..N (roteáveis na ordem otimizada primeiro, sem-coord depois).

## Como o ETA é calculado
Cumulativo, por parada, a partir da hora de partida (default: agora):
```
etaAt(parada) = partida + Σ (trajetoMin + tempoParadaMin) das paradas até ela
trajetoMin = (Haversine(prev → atual) / velocidadeMediaKmH) * 60
```
- A 1ª parada não tem `prev` conhecido no ETA relativo → trajeto 0, ETA = partida + `tempoParadaMin`.
- **Defaults** (quando `LogisticaConfig` não existe/inválido): velocidade **25 km/h**, parada **5 min** — os mesmos do schema.
- Parada **sem coord** recebe `etaAt = null` (não dá pra estimar trajeto), mas mantém o `rotaOrdem`.
- **Previsão de término** = `etaAt` da última parada COM coord.

## Endpoints (company-scoped, `JwtAuthGuard`, companyId do JWT — padrão dos vizinhos)
- `POST /logistica/rota/planejar {date?, origemLat?, origemLng?}` → ordena, grava
  `rotaOrdem`/`etaAt`, devolve `{ paradas[], terminoPrevisto, semCoordenada, distanciaTotalKm, ... }`.
- `POST /logistica/rota/iniciar {date?, origemLat?, origemLng?}` → re-planeja com a
  origem atual e marca a 1ª parada roteável em `em_rota` + `startedAt` (só se ainda 'agendada').
- **Re-ETA** (hook MÍNIMO e aditivo no `confirmarEntrega`/`cancelarEntrega` do N6):
  `recalcularEtaRestantes` recalcula o `etaAt` das paradas ABERTAS restantes do dia
  **sem reordenar** o já feito. É **best-effort** (`try/catch` que engole o erro e loga):
  qualquer falha aqui NÃO afeta o desfecho do confirmar/cancelar nem a flag do N6.

## Resultado do teste (`node --test`, fixture de 12 coords ~Fortaleza/CE)
`backend/src/logistica/logistica-rota.service.test.ts` — **18/18 verde** (7 do M3 +
os 11 já existentes de N6/M2, sem regressão):
- **(a) 2-opt ≤ NN nos números reais:** `NN = 42.326 km → 2-opt = 37.446 km`
  (ganho **4.880 km ≈ 11.5%**). 2-opt ≤ NN provado.
- **(b) ETA monotônico crescente** ao longo do `rotaOrdem` — verde.
- **(c) parada sem coord vai pro FIM** (`semCoordenada=true`, `etaAt=null`) — verde.
- Extras: Haversine plausível (~7 km), `computeEta` vazio/1-parada, NN sem origem.

## Checks
- `cd backend && npm run build` → **verde** (tsc estrito).
- `npx prisma validate` → **verde** (nenhuma coluna nova; usa `rotaOrdem`/`etaAt`/`startedAt`/`velocidadeMediaKmH`/`tempoParadaMin` que o M2 já criou).
- Testes M3 + N6 + M2 → **18/18 verde**.

## Decisões p/ o dono
- **Sem migration:** M3 só GRAVA em colunas que o M2 já adicionou (`rotaOrdem`, `etaAt`,
  `startedAt`) e LÊ `velocidadeMediaKmH`/`tempoParadaMin` do `LogisticaConfig`. Nada a aplicar no banco.
- **Sem novo caminho de WhatsApp/cobrança:** planejar/iniciar/re-ETA são 100% internos
  (só escrevem linhas). Os efeitos com risco continuam SÓ no confirmar (N6), atrás de
  `HBX_LOGISTICA_ENABLED`. O re-ETA é aditivo e à prova de falha.
- **Heurística vs exato:** NN+2-opt é ótimo o bastante p/ ≤50 paradas de 1 entregador
  (o trecho-a-trecho real é do Waze). Distância é Haversine (linha reta), não rota de rua —
  ETA é ESTIMATIVA de planejamento, não promessa ao cliente.
- **Re-ETA no confirmar/cancelar re-lê o banco** (1 query + N updates das restantes).
  Para rotas típicas (dezenas de paradas) é barato; se algum tenant fizer rotas gigantes,
  dá pra trocar por recálculo em memória depois — não é o caso hoje.

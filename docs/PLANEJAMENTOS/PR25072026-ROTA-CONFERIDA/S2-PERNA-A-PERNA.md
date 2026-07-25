# S2 — Perna a perna (Cliente X → 500 m · 3 min → Cliente Y)

Pré-requisito: `01-CONTRATO-WORKER.md`, `docs/Rules/BACKEND.md`, CONSTITUIÇÃO
do APK. Depende da S1 (usa `engine` no resultado).

## A sacada
Os números por perna JÁ EXISTEM na matriz do OSRM — o loop de ETA em
`planRouteByRoads` soma `durations[prev][atual]` e `distances[prev][atual]`
(linhas ~964-967 de `logistica-rota.service.ts`) e joga o detalhe fora. É expor,
não calcular.

## Backend
1. `PlannedStop`/resultado por parada ganha `legDistanceM: number | null` e
   `legDurationS: number | null` (perna DA parada anterior — ou da origem — até
   ela; 1ª parada sem origem → null; parada `semCoordenada` → null).
2. Preencher nos TRÊS caminhos: `planRouteByRoads` (matriz), `planRoute`
   (fallback Haversine: perna = haversineKm × 1000, duração = distância /
   velocidadeMediaKmH), `planRouteManual` (mesma matemática do computeEta).
3. Propagar em `PlanejarRotaResult.paradas` (aditivo) e no que o
   `listRota`/refresh do APK consome — investigar onde o app lê as paradas da
   rota (`logistica.service.ts` listRota / `logistica-mobile`) e garantir que os
   campos cheguem lá também, senão a lista do app não tem o dado após reload.
   Persistência: NÃO criar coluna nova; se o reload não tiver a matriz, aceitar
   `legDistanceM` recalculado por Haversine no listRota com marcação
   `legFonte: 'osrm' | 'aproximada'` (documentar a escolha no código).
4. Teste: soma das pernas ≈ `distanciaTotalKm` (tolerância 1%) nos três
   caminhos + casos com parada sem coordenada no meio.

## APK (`EntregaShell/.../app.js`)
1. Na LISTA da rota (tela Rota), entre um card e o próximo, conector visual
   `↓ 500 m · 3 min` (formato: <1000 m → "N m"; ≥1 km → "N,N km"; duração em
   min arredondada). Usar tokens/classes existentes; SEM moldura nova; olhar o
   catálogo antes.
2. Parada `semCoordenada` aparece NO LUGAR onde cairia (fim da fila), com o
   conector substituído por "sem trajeto — endereço sem pino" em tom de alerta
   (token existente de erro/alerta, zero hex).
3. ETA por parada já existe (`etaAt`) — não duplicar; o conector é só o SALTO.
4. Nada de som novo; nada de mudança nos fluxos de iniciar/pausar.

## Aceite
- `cd backend && npm run build && node --test dist/logistica/logistica-rota.service.test.js`.
- Relatório: screenshot mental (descrição) da lista com conectores + onde o
  listRota devolve os campos.

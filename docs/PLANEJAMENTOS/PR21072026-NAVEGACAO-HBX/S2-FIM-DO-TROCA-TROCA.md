# S2 — Fim do troca-troca: navegação fica no HBX

Arquivo: `EntregaShell/app/src/logistica/assets/app/app.js` (+ ajustes pontuais de
`app.css` se precisar). Nada de backend/Kotlin.

## 1. Iniciar/continuar rota NÃO abre mais app externo
Remover as chamadas automáticas de `abrirNavegacao(openItems()[0])`:
- app.js:3658 (`if (!planOnly) abrirNavegacao(...)` no início de rota)
- app.js:3693 (start-planned-route)
- app.js:3766 (retomada/continuar)
No lugar: permanecer na tela Rota e entrar em MODO NAVEGAÇÃO (abaixo). `abrirNavegacao`
continua existindo e sendo chamada SÓ pelo ícone GPS avançado (`show-map`, S1) e pelo
`data-action="maps"` da folha (4457).

## 2. Modo navegação = mapa segue o motorista na rota ativa
Predicado novo `navModeActive()` = `routeActive() && !state.routePaused &&
!leituraRouteActive()`. Com ele:
- **Posição ao vivo**: `navigator.geolocation.watchPosition` (mesmas options do
  `currentPosition()`, app.js:3641) ligado enquanto `navModeActive()`; desligar em
  parar/pausar/encerrar rota e logout. Cada fix: normalizar pro MESMO shape de ponto
  da Leitura (`{lat, lng, accuracyM, speedMps, bearingDeg}`) e guardar em
  `state.navPosicao` + push em `state.navTrilha` (array [lat,lng] com filtro de
  distância mínima ~8m e teto ~2000 pontos — descartar do início). Chamar
  `markGpsFix()` (chip de GPS já existente).
- **Reuso da infra da Leitura** (follow camera, marcador com direção, círculo de
  precisão, botão recentralizar, status "GPS · ±12 m"): generalizar as funções
  `updateRouteReadingMap`/`ensureRouteReadingUi`/`followRouteReadingPosition`/
  `routeReadingTrailData`/etc. (app.js:432–620) para receberem o MODO:
  leitura → fonte `state.leituraTrilha`/`leituraLiveLastPoint()` (comportamento
  IDÊNTICO ao publicado — regressão aqui é inaceitável);
  navegação → fonte `state.navTrilha`/`state.navPosicao`.
  A trilha da navegação usa as MESMAS camadas/estilo (casing branco + linha #0865df).
- **Câmera**: ao iniciar a rota, fitBounds(motorista + próxima parada) e então
  follow ligado (mesma histerese da Leitura: arrastar/zoom desliga follow, botão
  religa).
- **Painel da S1**: linha 2 (distância) atualiza a cada fix do watch (patch DOM).

## 3. Countdown de próxima parada vira foco no mapa
`nextStopOverlay` (app.js:815) e `openNextStop` (app.js:3992):
- Copy: "Abrindo navegação para" → "Próxima parada"; botão "Abrir agora" → "Ver rota".
- `openNextStop()` NÃO chama mais `abrirNavegacao(next)` (4003). Agora: garante
  `state.screen === "route"` (navigateTo("route") se preciso), fecha o overlay e dá
  fitBounds(motorista + próxima parada) com follow religado.
- O disparo automático no fim da contagem faz o MESMO (é o mesmo ponto único).
- `hbx:arrival` (5172) intocado.

## 4. Pausa/encerramento
Pausar rota (routePausedBanner) e encerrar: desligam watch e follow; retomar religa.
Trilha `navTrilha` sobrevive a pause/resume do mesmo dia; encerrar rota limpa.

## Validação
`node --check` exit 0. Relatar: matriz de estados (leitura ativa / rota ativa /
pausada / sem rota) × (watch ligado? follow? painel? trilha?). Confirmar que NENHUM
caminho de código restante chama `abrirNavegacao` automaticamente (só show-map/maps).

## NÃO fazer
Não tocar nas 3 cores/pernas (S3). Não mexer no RotaService.kt nem em nada nativo.
Não commitar. Não criar branch.

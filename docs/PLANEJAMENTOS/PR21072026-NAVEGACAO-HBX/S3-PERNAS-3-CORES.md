# S3 — Rota em pernas: 3 cores + avanço + recálculo com disjuntor

Arquivo: `EntregaShell/app/src/logistica/assets/app/app.js`. Nada de backend/Kotlin.

## 1. Pernas
Hoje `applyRouteLine` (app.js:633) desenha UMA linha `hbx-route-line` (#78c900) pela
geometria inteira do OSRM (`roadGeometry`, app.js:350). Nova estrutura quando
`navModeActive()` (S2):
- Pedir a rota viária de `state.navPosicao` (motorista) → paradas ABERTAS na ordem
  (`openItems()` com coordenadas válidas). Guardar em `state.navRota`
  `{ geometry, cortes }` onde `cortes[i]` = índice do ponto da geometria mais próximo
  da parada i (projeção por `distanceMeters`; calcular uma vez por resposta).
- **Perna atual** = geometria do início até `cortes[0]` → camada
  `hbx-nav-leg-atual`, cor esmeralda #07a93f (mesmo papel do token `--cta`),
  width 5, casing branco fino (padrão da trilha).
- **Restante** = de `cortes[0]` em diante → camada `hbx-nav-leg-resto`,
  #78c900 opacity .35, width 4.
- **Percorrido** = trilha azul da S2 (navTrilha), por cima do resto e abaixo do
  marcador (ordem de camadas: resto < atual < trilha < accuracy < marker).
- Rota planejada SEM estar ativa: mantém a linha única atual (zero mudança).
- Atualizar via source.setData (mapa transplantado — nunca recriar camada se já
  existe; seguir o padrão do hbx-reading-trail).

## 2. Avanço de perna
Ao confirmar entrega / pular parada (todos os pontos que chamam showNextStop /
recarregam a rota): recomputar com o `openItems()` novo — a perna atual passa a
apontar pra nova primeira parada aberta. Sem parada aberta → remover camadas de perna
(fica só trilha) e seguir o fluxo existente de fim de rota.

## 3. Painel (S1) passa a usar distância viária
Distância da linha 2 do painel = comprimento da perna atual (somatório de
`distanceMeters` sobre os pontos da geometria até `cortes[0]`). Fallback: reta.
Formato igual (`2,1 km`).

## 4. Recálculo fora de rota — COM DISJUNTOR (padrão da casa)
- Saiu do caminho: distância do fix atual até o segmento mais próximo da perna atual
  > 120 m por 3 fixes seguidos → pedir `roadGeometry` de novo (motorista → paradas
  abertas).
- Disjuntor: mínimo 30s entre recálculos + máximo 10 recálculos por rota/dia; acima
  disso, para de recalcular e mantém a última geometria (log silencioso, sem toast
  de erro repetido). Falha do OSRM: mantém o desenho atual, tenta no próximo gatilho.
- Recálculo NUNCA reordena paradas (ordem é do backend); só redesenha o caminho.
- Aviso discreto 1x por recálculo: toast "Rota atualizada" (não-erro) NO MÁXIMO a
  cada 60s (não spammar — Lei 8).

## 5. Cache
`roadGeometryCache` (12 entradas) continua; chave já é por coordenadas arredondadas.
Recálculo com posição do motorista muda a chave a cada chamada — ok, o disjuntor é
quem segura a frequência.

## Validação
`node --check` exit 0. Relatar: ordem final das camadas, gatilhos de recálculo e
os limites do disjuntor; confirmar que modo Leitura e rota planejada (não ativa)
ficaram intocados.

## NÃO fazer
Não mexer em voz/steps (S5). Não trocar URLs do OSRM (S4). Não commitar/criar branch.

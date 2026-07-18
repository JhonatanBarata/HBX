# L4-D — Rota sem piscar: preservar o mapa vivo entre renders

## Problema (item 10 do dono: "Rota pesada, piscando")
`EntregaShell/app/src/main/assets/app/native.js` — `mobileShell.mount` faz
`content.replaceWith(nextContent)` a CADA render. O `#route-live-map` é recriado do zero →
o maplibre é descartado e re-instanciado → piscada + peso (tiles re-baixados, GPU reinit).
O `#route-plan-preview-map` (prévia do montar rota, re-renderiza durante o countdown)
sofre igual.

## Entrega
1. **native.js `mount`**: antes do replaceWith, pra cada id em
   `["route-live-map", "route-plan-preview-map"]`: se o content atual tem o nó vivo
   (com instância de mapa pendurada) e o nextContent tem um placeholder com o MESMO id,
   transplantar o nó vivo pro lugar do placeholder (substituir o placeholder pelo nó
   existente antes de montar). Se o novo HTML NÃO tem o id, deixar morrer naturalmente.
2. **app.js `mountMap`** (logistica): pendurar a instância no elemento
   (`el.__hbxMap = map`) e, quando `mountMap` rodar de novo num elemento que JÁ tem
   `__hbxMap`, ATUALIZAR (markers/rota/fitBounds) em vez de recriar. Conferir como o
   mountMap atual cria markers/polyline pra reaproveitar; remover/recriar só os markers,
   nunca o map. Cuidado com o listener de resize/estilo — não duplicar listeners a cada
   render (guardar referências no `el.__hbxMapParts`).
3. Zero mudança de comportamento pro resto do shell — o transplante é cirúrgico por id.

## Regras
- Arquivos: native.js + logistica/app.js (só a região do mountMap). Nada de Kotlin.
- Gate: `node --check` nos dois. Teste visual é do orquestrador no celular.
- Não commitar.

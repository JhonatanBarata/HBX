# S1 — Painel compacto sobre o mapa + reordenação dos controles

Arquivos: `EntregaShell/app/src/logistica/assets/app/app.js` +
`EntregaShell/app/src/main/assets/app/app.css`. Nada de backend/Kotlin.

## 1. Painel "Próxima parada" EM CIMA do mapa
Hoje a próxima parada aparece ABAIXO do mapa como section-title + stopCard destacado
(routeScreen, app.js:2815). O painel novo é um overlay compacto DENTRO de
`.route-map-shell` (irmão do `#route-live-map`, posicionado absoluto no TOPO do mapa
— o mapa é transplantado, o painel não; ele re-renderiza normal).

Conteúdo (2 linhas, EXATAMENTE esta copy — Lei 8):
```
Próxima parada · {nome do cliente} — {n} de {total}
{endereço} · aproximadamente {distância}
```
- `{n}` = `orderedItems().indexOf(next) + 1`; `{total}` = `items().length`
  (mesma numeração dos cards). `next = openItems()[0]`.
- `{distância}` = distância do último fix de GPS conhecido até a parada
  (`distanceMeters()` já existe; formato `850 m` / `2,1 km` — padrão `lrt-distance`).
  Sem fix de GPS → omitir o `· aproximadamente …` (linha 2 fica só o endereço).
  (S3 troca essa distância pela distância viária da perna; aqui é reta mesmo.)
- Guardar o último fix num helper (ex.: `lastKnownPosition` setado por
  `currentPosition()` e depois, na S2, pelo watch) — S1 usa o que tiver.
- Exibir quando: tela Rota, existe `next`, e NÃO está em modo Leitura
  (`leituraRouteActive()` esconde o painel — a Leitura tem os controles dela).
- Toque no painel = `showSheet(next)` (mesmo comportamento do pino do mapa).
- Visual: fundo `--surface` translúcido + blur leve, radius e borda por token,
  fonte pequena (linha 1 strong, linha 2 menor/muted), largura auto até
  calc(100% - 2*gap), canto superior do mapa. NÃO cobrir o `route-gps-status` nem o
  botão de recentralizar da Leitura (só coexistem se você errar o gate — não exibem
  juntos). Transição de entrada (Lei 9): reusar padrão de fade/slide existente.
- Atualização viva da distância SEM re-render: patch por querySelector no elemento
  da linha 2 (padrão do gpsStatus/nextStop count).
- NÃO remover o stopCard destacado nem o section-title de baixo nesta sprint
  (o dono lapida depois; painel é aditivo).

## 2. Reordenação dos controles (linha do play)
`routeTransmuxControl()` (app.js:2829) hoje: disco transmux primeiro e
`route-cancel-icon` depois. Nova ordem VISUAL, esquerda→direita:
`[excluir(s) route-cancel-icon…] [novo ícone GPS avançado] [DISCO PLAY]`
- Novo botão `route-nav-external` (mesmo tamanho/estilo dos `route-cancel-icon`,
  48px circular, MAS com gradiente azul GPS — reusar os stops do
  `routeGpsGradient` #23c9f5→#0865df num gradiente próprio com id único),
  `data-action="show-map"` (handler JÁ existe, app.js:4456 → abrirNavegacao),
  aria-label="Abrir no Waze ou Google Maps".
  Ícone interno: usar `icon()` do catálogo; se não houver um de mapa/navegação,
  ADICIONAR um path novo no catálogo (~app.js:190) seguindo o estilo stroke dos
  existentes (ex.: seta de navegação estilo Waze). PROIBIDO SVG inline fora do icon()
  (exceção: o disco transmux já é SVG próprio, não mexer nele).
- Exibir o ícone GPS quando houver `openItems().length > 0` e (rota ativa OU
  planejada). Sem parada aberta → some.
- Os `route-cancel-icon` existentes (cancelar planejamento / encerrar rota /
  limpar dia) passam a renderizar ANTES (à esquerda) do ícone GPS. Comportamento
  deles INTOCADO (mesmas ações e confirmações).
- CSS: `.route-transmux-wrap` vira linha flex com o disco como âncora à direita do
  grupo; espaçamentos por token/gap já usados. Conferir que o layout não quebra com
  0, 1 ou 2 ícones de excluir visíveis (estados: sem rota / planejada admin /
  ativa / ativa admin).

## Validação
`node --check EntregaShell/app/src/logistica/assets/app/app.js` exit 0. Descrever no
relatório: como fica cada estado da linha de controles e quando o painel aparece.

## NÃO fazer
Não mexer em `abrirNavegacao`/fluxo de iniciar rota (é a S2). Não mexer na Leitura.
Não commitar. Não criar branch.

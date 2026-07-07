# FIX5 — RESULTADO: swipe horizontal entre módulos

Ordem do dono: navegar entre as abas-tela da tab bar arrastando a tela
pro lado, com a transição da casca. Ciclo = só o app central (Vendas ↔
Conversas ↔ Empresas); Rota é OUTRO app (/entrega, casca própria) e fica
FORA do ciclo — entra só pelo toque no ícone.

## O que foi feito

- **Fonte única da ordem das abas** — `tab-bar.tsx` passou a exportar
  `CASCA_TABS` (a lista, antes privada) e `isCascaTabVisible()` (o mesmo
  gate `isModuleVisible` já usado no filtro da tab bar). O swipe consome
  os dois; zero lista duplicada.
- **Gesto no palco** — `components/casca/mobile-shell.tsx`: `CascaStage`
  ganhou pointer handlers (`onPointerDown/Move/Up/Cancel`) via o hook novo
  `useModuleSwipe`. Durante o arrasto o palco acompanha o dedo por
  `--casca-swipe-drag` (só `transform: translateX`, sem re-layout).
- **CSS** — bloco novo no FIM de `hbx-theme/casca.css` (`.casca-stage` com
  `transform: translateX(var(--casca-swipe-drag,0px))` + `touch-action:
  pan-y`; `.is-snapping` liga a `transition` só no instante de "voltar ao
  lugar", removida no `onTransitionEnd`). Zero hex/inline; reusa
  `--motion-base` (token existente, não criei token novo). Bloco
  respeita `prefers-reduced-motion` (desliga transform/transition).
- **Opt-out explícito** — `vendas-foco.tsx` (carrossel de cards do modo
  foco, que já tem swipe próprio ←/→) ganhou `data-swipe-opt-out="true"`
  no card arrastável.

## Como o gesto funciona

- **Ordem do ciclo:** Vendas → Conversas → Empresas (mesma ordem visível
  da tab bar, filtrada pelo gate de módulo do usuário). "Mais" nunca é
  destino — abre sheet, não navega. "Rota" TAMBÉM não é destino (revisão
  do orquestrador): é outro app (/entrega, casca própria), entrada só
  pelo toque deliberado no ícone — o filtro em `useSwipeableTabHrefs`
  exclui `key "mais"` e `key "rota"`. Nas pontas (1ª/última aba central
  visível) o swipe além do limiar não navega, só volta ao lugar.
- **Direção:** arrastar para a ESQUERDA → próxima aba (`router.push`,
  a MobileShell reage ao pathname e toca a transição IR de tela normal).
  Arrastar para a DIREITA → aba anterior (mesma transição, efeito visual
  de "voltar" pela ordem natural do ciclo).
- **Limiares:** decisão de gesto só acontece após mover ≥12px (filtro de
  ruído de toque) E com ângulo claramente horizontal (`|dx| > 2×|dy|`) —
  enquanto ambíguo/vertical, o handler não marca `active` e a lista
  continua rolando normalmente (nunca rouba scroll). Disparo de
  navegação só com `|dx| ≥ 64px` no solte; aquém disso, snap de volta.
- **Feedback durante o arrasto:** `translateX` em tempo real via custom
  property (`--casca-swipe-drag`), sem transition — acompanha o dedo
  1:1, barato (só compositor, sem layout/paint). Soltar sem cruzar o
  limiar liga `.is-snapping` (transition curta, `--motion-base`) e o
  palco volta suave; a classe some no `onTransitionEnd`.

## O que bloqueia o swipe (nunca dispara)

1. **Overlay aberto por cima** — `hasOverlayOpen()` faz
   `querySelector(".casca-stack-layer, .casca-sheet-veil")`: se existe
   um `CascaView` (sub-tela/chat/foco) ou `CascaSheet` montado, o gesto
   é abandonado assim que tentaria virar "ativo" (checado no exato
   instante em que decidiria assumir o gesto como horizontal).
2. **Elemento com scroll/gesto horizontal próprio** —
   `isHorizontalScrollAncestor()` sobe pelos ancestrais do alvo do
   `pointerdown` até o `<body>` e para em: (a) qualquer nó com o
   atributo `data-swipe-opt-out` (marcado manualmente — usado no card
   do modo foco); (b) qualquer nó com `overflow-x: auto|scroll` cujo
   `scrollWidth > clientWidth` (ancestral que realmente rola em X).
   Cobre também casos futuros (kanban/Quadro com scroll-x, se vier a
   existir) sem precisar de novo marcador manual.
3. **`/entrega`** — nunca ganha esse swipe porque o módulo vive FORA do
   `MobileShell` (`app/entrega/page.client.tsx` não importa `AppShell`/
   `MobileShell`); o `CascaStage` com o gesto nem monta lá. O swipe de
   paradas do `/entrega` (`touch-action: pan-y` no `.ent-carousel`,
   `entrega.css`) não foi tocado.

## Coordenação com os outros workers

- Toquei só 4 arquivos: `mobile-shell.tsx`, `tab-bar.tsx`, `casca.css`
  (bloco novo no fim, nada reformatado) e `vendas-foco.tsx` (1 linha,
  o atributo de opt-out). Não toquei screens do FIX4 nem o resto do
  `casca.css` que o FIX3 está mexendo.
- `git add` só desses 4 caminhos — o resto do working tree (edições de
  FIX3/FIX4/W7, arquivos novos como `geo-radar.ts` e o spec de QA) ficou
  intocado/não-staged, preservado para os donos daquele trabalho
  commitarem depois.

## Checks

- `npx tsc --noEmit` — limpo (0 erros), rodado 2× (antes e depois de
  uma edição concorrente externa no `casca.css` no meio da sessão —
  conferido que meu bloco continuou íntegro no fim do arquivo).
- `npm run lint` — meus 4 arquivos: **0 erros/warnings novos** (não
  aparecem na lista de problemas). Total do repo no momento: 47
  errors/38 warnings, todos em arquivos que eu não toquei
  (`entrega-hooks.ts`, `entrega/page.client.tsx`,
  `entrega/produtos/page.client.tsx`, `bot-prosp-fields.tsx`,
  `voice-rubberband.ts` etc.) — confirmado via `git diff --stat` que
  nenhum deles foi modificado por mim nem pelos outros workers
  (pré-existentes, fora de escopo).
- `npm run build` — verde, "Compiled successfully", 42 rotas geradas
  (1ª tentativa colidiu com lock de build de outro worker rodando em
  paralelo; 2ª tentativa, ~20s depois, passou limpo).

## Commit

Local, direto no `master`, sem branch/stash. `git add` por caminho (só
os 4 arquivos meus).

```
669d5cff9b56fd1ac27be6db33f1671b6765f1c3 feat(mobile-casca): FIX5 swipe entre módulos
```

Não publicado (`npm run publish` fica para o dono).

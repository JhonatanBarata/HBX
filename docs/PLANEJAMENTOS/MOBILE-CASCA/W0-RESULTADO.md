# W0 — RESULTADO da limpeza do front mobile velho

## Inventário do que existia (antes da limpeza)

1. **`frontend/src/app/hbx-theme/mobile.css`** (656 linhas) — camada mobile de
   1ª classe, import por último em `globals.css`. Cobria: shell+abas (gaveta,
   `.mobile-nav-veil`, `.mobile-tab-bar`, folha "Mais"/`.more-sheet__*`), login,
   dashboard, atendimento, vendas (lista `.vnd-list`/`.vnd-row`/`.vnd-detail` +
   kanban mobile), leads/radar, bot (`.bot-mobile-*`), relatórios, configurações
   (`.cfg-*` premium mobile), landing/planos/módulos, gerencial.
2. **`frontend/src/app/hbx-theme/modo-foco.css`** (616 linhas, `@media ≤860px`
   inteiro) — CSS exclusivo do `VendasModoFoco` (overlay full-screen `.vf-*`).
3. **`frontend/src/components/hbx/mobile-tab-bar.tsx`** — barra de abas
   inferior (Início/Vendas/Conversas/Buscar/Rota + folha "Mais"), usada só via
   `<MobileTabBar />` no `app-shell.tsx`.
4. **`frontend/src/components/hbx/vendas-modo-foco.tsx`** — componente
   `VendasModoFoco` (portal em `document.body`), usado só em
   `vendas/page.client.tsx` dentro do bloco `isMobile && modoFocoOpen`.
5. **`frontend/src/lib/use-is-mobile.ts`** — hook `useIsMobile()`
   (`matchMedia` em `MOBILE_BP=860`).
6. Gaveta do menu no `app-shell.tsx`: `navOpen`/`data-mobile-nav`,
   `.mobile-nav-veil`, `onMenu` no `Topbar`, botão `.burger` em `shell.tsx`
   (CSS base em `kit.css`, override `display:none` só em `mobile.css`).
7. Classes `more-sheet__*`, `mobile-nav-veil`, `data-mobile-nav` — só existiam
   dentro de `mobile.css` (nenhum resíduo em outro arquivo de tema).
8. Bloco `@media (max-width: 860px)` do `.vnd-funhead`/`.vnd-modehost` em
   `screens.css` ("A5 — passe mobile do funil de Vendas").
9. `@media (max-width: 760px)` de `.radar2-shell`/`.radar2-rail` em
   `screens.css` — override mobile de um rail de filtros que o JSX do
   `/leads` não usa mais (era `radar2-filter-toggle`/`radar2-rail--open`).

### Consumidores de `useIsMobile` encontrados (8 arquivos) e como cada um ficou

| Arquivo | Uso do `isMobile` | Como ficou |
|---|---|---|
| `mobile-tab-bar.tsx` | `if (!isMobile) return null` | Arquivo inteiro deletado |
| `app-shell.tsx` | consumia `<MobileTabBar/>` | Import + uso removidos; gaveta (`navOpen`/`data-mobile-nav`/veil) removida |
| `activation-checklist.tsx` | decidia `collapsed` inicial (mobile nasce recolhido) | Vira sempre "nasce expandido" (comportamento desktop), preferência salva em localStorage continua respeitada |
| `bot/page.client.tsx` (`BotClient`) | `if (isMobile) return (<bloco inteiro>)` antes do "Render desktop" | Bloco mobile inteiro removido; só sobrou o "Render desktop" |
| `vendas/page.client.tsx` | múltiplas ramificações: `.vnd-page`, lista agrupada `.vnd-list`, botão "Modo foco", pop-up `.vnd-detail`, `VendasModoFoco`, navegação ↑/↓ | Todas as ramificações `isMobile ? X : Y` viraram só `Y` (caminho desktop); lista mobile/pop-up/modo-foco removidos por inteiro; estados órfãos (`mobileDetailOpen`, `modoFocoOpen`, `focoWinConfirmRef`) removidos |
| `leads/page.client.tsx` (`LeadsClient`) | filtro-toggle+rail mobile, `emptyMsg` mobile, `renderListMobile()`, `renderCardOverlay()` (swipe Tinder), aside condicional | Toggle Linhas\|Cards sempre visível; `renderCommandBar()` sempre chamado; lista mobile + swipe removidos (funções, states `cardIdx/cardOpen/dragRef/dragDx/isDragging`, handlers de pointer); aside `.ctx` sempre renderiza |
| `use-is-mobile.ts` | definição do hook | Arquivo deletado |

## Remoção cirúrgica realizada

- Deletados: `mobile.css`, `modo-foco.css`, `mobile-tab-bar.tsx`,
  `vendas-modo-foco.tsx`, `use-is-mobile.ts`.
- `globals.css`: removidos os 2 `@import` (mobile.css, modo-foco.css).
- `app-shell.tsx`: removido import/uso de `MobileTabBar`; removida a gaveta
  mobile (`navOpen`, `data-mobile-nav`, `.mobile-nav-veil`, `onMenu`).
- `shell.tsx`: `Topbar` perdeu a prop `onMenu` e o botão `.burger`; comentário
  em `NAV_LINKS` atualizado (não cita mais "mobile-tab-bar").
- `kit.css`: removida a regra `.burger`/`.burger span` (órfã sem o botão).
- `screens.css`: removido o bloco `@media (max-width:860px)` do
  `.vnd-funhead`/`.vnd-modehost` (passe mobile do funil) e o
  `@media (max-width:760px)` de `.radar2-shell`/`.radar2-rail`.
- `bot/page.client.tsx`: removido `import useIsMobile` + `const isMobile` +
  bloco `if (isMobile) { return (...) }` inteiro (render mobile do Bot).
- `vendas/page.client.tsx`: removido `import useIsMobile`/`VendasModoFoco`;
  removidos states `mobileDetailOpen`/`modoFocoOpen`/`focoWinConfirmRef` e a
  função `abrirDetalhe`; ramificações `isMobile`/`!isMobile` colapsadas pro
  caminho desktop (lista densa, quadro, ordenação A→Z, filtro de equipe);
  removida a lista agrupada mobile (`.vnd-list`), o pop-up de detalhe mobile
  (`.vnd-detail`) e o `VendasModoFoco`; `FecharVendaModal` simplificado
  (`onClose`/`onDone` sem a ponte do modo foco).
- `leads/page.client.tsx`: removido `import useIsMobile`; removido state
  `filterOpen` (só servia o toggle/rail mobile); removidos `renderListMobile()`
  e `renderCardOverlay()` inteiros + states/handlers de swipe (`cardIdx`,
  `cardOpen`, `dragRef`, `dragDx`, `isDragging`, `onPointerDown/Move/Up`,
  `cardGo`, `openCard`, `closeCard`, `isCardHandoff`, `activeCard`); removida
  a chamada órfã `setCardIdx(0)`/`setCardOpen(false)` em `switchTab`; toggle
  Linhas\|Cards e `renderCommandBar()` passam a renderizar sempre; aside `.ctx`
  (idle/detalhe) passa a renderizar sempre.
- `activation-checklist.tsx`: removido `import useIsMobile` e `isMobile`; o
  efeito de estado inicial de `collapsed` não depende mais de viewport.

## Fora do escopo (intocado, conforme regra)

- `/entrega`, `entrega.css`, `EntregaTabBar.tsx`, `entrega/layout.tsx` — não
  tocados (skin/app próprio, cuida da W6).
- `@media (max-height: …)` (zero-scroll desktop) — nenhum removido.
- `@media (max-width: …)` de telas de marketing/landing/planos/gerencial/
  contábil/bot-builder/etc. em `screens.css` e outros arquivos de tema — não
  são "remendo mobile do dashboard app", ficaram como estavam.
- Trabalho não commitado de outro worker presente no mesmo working tree
  (LEADS-FINAL/01 rail colapsável, LEADS-FINAL/02 lista densa/página
  `/leads/[id]`, ajustes em `entrega.css`/`base.css`/`spacing.css`/
  `typography.css`/`detalhes-negocio.tsx`/`tutorial-coach-steps.ts`/telas do
  master) — preservado integralmente; a limpeza foi feita por cima, sem
  reverter nada dessas mudanças.

## Estado final

Desktop renderiza idêntico: sidebar completa, topbar sem hambúrguer (já não
tinha função em desktop — a sidebar sempre foi visível), `/vendas` (funil +
toggle "Buscar empresas"), `/leads` (embutido em Vendas) e `/bot` conferidos
ao vivo no Chrome (localhost:3001) sem erros de console. No celular agora o
app renderiza o caminho desktop (feio/apertado, esperado — W1 conserta).

## Checks

- `cd frontend && npm run lint` — mesma contagem de antes da limpeza
  (45 errors / 38 warnings, todos pré-existentes e fora do escopo tocado:
  `entrega/*`, `bot-prosp-fields.tsx`, `voice-rubberband.ts`, etc.). Nenhum
  erro novo em arquivo tocado por este worker.
- `npx tsc --noEmit` — limpo (0 erros).
- `npm run build` — verde (42 rotas geradas, incluindo `/vendas`, `/leads`,
  `/leads/[id]`, `/bot`).

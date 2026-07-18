# /vendas — lapidação: tela pesada + "Buscar empresas" não entra + canos bagunçados

Pedido do dono (18/07): tela de Vendas pesada, clique em "Buscar empresas" não muda de
tela, e o visual do encanamento de enriquecimento (SVG que liga os 4 estados do topo
aos leads na lista) ficou bagunçado. Achado ao vivo no Chrome, direto em prod.

## 1. "Buscar empresas" não entra — CAUSA ACHADA E CORRIGIDA

`vnd-funhead` (barra dos 7 botões) e `vnd-stage` (as 3 camadas Funil/Buscar/Enriquecimento)
recebiam o **mesmo z-index (2)** em `vendas-live-polish.css` quando o modo
`vnd-has-live-enrichment` está ativo (é o modo padrão hoje). Com z-index empatado, quem
vem depois no DOM pinta por cima — `.vnd-stage` vem depois de `.vnd-funhead` — então a
camada do funil ficava fisicamente por cima da barra de botões e roubava o clique
(`elementFromPoint` no centro do botão "Buscar empresas" devolvia a `<div class="work">`
de dentro do stage, não o `<button>`). Board carregado e clique nunca trocava de `modo`.

Fix aplicado: `vnd-funhead` subiu pra z-index **3** (stage continua em 2, comentário
explica o porquê). Local: [vendas-live-polish.css:31](../../frontend/src/app/hbx-theme/vendas-live-polish.css#L31).
Confirmado ao vivo trocando o CSS no DOM antes de editar o arquivo (clique passou a
acertar o botão). **Falta publicar pra valer em prod.**

## 2. Tela pesada — causa provável, NÃO mexida ainda

`frontend/src/app/(app)/leads/radar-status-preview.tsx` (743 linhas) monta o SVG do
encanamento via `useEffect` cru (sem React, manipula DOM direto) com:

- `MutationObserver` no `root` inteiro com `childList:true, subtree:true` — dispara
  `scheduleScan()` em **qualquer** mutação de DOM dentro da tela inteira de Vendas
  (exceto mutações dentro do próprio SVG do cano). Qualquer re-render de uma linha do
  pipeline, badge, contador, etc. dispara um scan completo.
- Cada `scan()` recalcula `getBoundingClientRect()` de TODOS os alvos visíveis (pode ser
  20+ linhas) e **reconstrói o SVG inteiro** (`network.replaceChildren()` +
  5 `<path>` por segmento × 1 tronco + 1 branch por linha + 2 `<circle>` por acoplamento).
  Com 20 cards isso já passa de 100+ nós SVG recriados por scan.
- Mais um `ResizeObserver` (root + header) e listener de `scroll` (capture) que também
  agendam recomputo via rAF.

Ou seja: qualquer atividade normal da tela (polling do board, busca, hover) tende a
re-disparar reconstrução completa do cano. Isso é o principal suspeito do "pesada",
mas não cheguei a medir com Performance profiler (precisa do preview/Chrome real com
throttling de CPU pra confirmar o peso relativo).

## 3. Canos "bagunçados" — é o desenho por design, não bug isolado

Comentário do próprio CSS confirma a intenção: *"cada lead visível recebe somente um
braço lateral"* — ou seja, o SVG desenha **um ramo (branch) para CADA linha visível da
lista**, saindo de um tronco único embaixo dos 4 estados do topo. Com poucas linhas
(3-5) fica legível; com o pipeline cheio (20 cards, como está hoje) os ramos se
acumulam e ficam confusos — não achei um jeito de "ajustar 1 propriedade" pra resolver;
é uma escolha de desenho que ficou ruim em escala, não um valor errado.

## Por que abrindo planejamento em vez de já mexer

`radar-status-preview.tsx` é DOM manual (sem React), com scan contínuo + geometria
recalculada — mexer no meio sem entender o fluxo de flight/animação (`enqueue`,
`FlowFlight`, tokens que "viajam" pelo cano) tem risco real de quebrar a animação de
chegada de lead (parte funcional, não só estética) ou pior, sujar o observer e criar
loop. Isso passa de "lapidada simples" — três caminhos possíveis, pra o dono escolher:

1. **Cortar o alcance do cano**: em vez de 1 branch por linha visível, desenhar só até
   um teto (ex.: 6-8 primeiras linhas) e recolher o resto num "+N" — menos bagunça,
   sem tocar no motor de flight/animação.
2. **Reduzir a reatividade do MutationObserver**: trocar `subtree:true` genérico por um
   filtro mais específico (ex.: só observar mudanças nos elementos com
   `.vnd-enrichment-target` / atributo `data-enrichment-state`), cortando scans
   desnecessários — resolve a maior parte do "pesado" sem tocar no visual.
3. **Remover o cano da view de Lista** (fica só quando `view === "board"`/poucos cards, ou
   vira um resumo estático no topo sem ramos por linha) — mais radical, muda a
   experiência que foi desenhada de propósito (ver "vendas-live.css" e comentários
   ligados ao `vnd-has-live-enrichment`), por isso não decidi sozinho.

Recomendo começar pela opção 2 (baixo risco, ataca o "pesada" direto) e depois avaliar
1 com o dono vendo o resultado ao vivo. Abrir isso pro dono decidir escopo antes de
tocar mais fundo no componente.

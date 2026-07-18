# /vendas — lapidação: tela pesada + "Buscar empresas" não entra + canos bagunçados

Pedido do dono (18/07): tela de Vendas pesada, clique em "Buscar empresas" não muda de
tela, e o visual do encanamento de enriquecimento (SVG que liga os 4 estados do topo
aos leads na lista) ficou bagunçado. Achado ao vivo no Chrome, direto em prod.

## DECISÃO FINAL 18/07 — encanamento REMOVIDO por inteiro (dono não gostou da lapidação)

A lapidação (abaixo) foi publicada, o dono viu e **rejeitou**: "não gostei, remova todo
esse encanamento, e essa tela por trás da tela". Ação executada:

- **Removido o aparato de enriquecimento inteiro** — o componente `RadarStatusPreview`
  (que injetava a fileira de 4 estados + ativador no topo e o SVG do encanamento ATRÁS
  da tela, e marcava `vnd-has-live-enrichment`). Arquivo deletado:
  `frontend/src/app/(app)/leads/radar-status-preview.tsx`. CSS do encanamento deletado:
  `frontend/src/app/hbx-theme/vendas-live-polish.css` (import tirado do globals.css).
- **Guia "Enriquecimento" e o modo `enriquecimento`** saíram do
  [vendas/page.client.tsx](../../frontend/src/app/(app)/vendas/page.client.tsx) — sobrou
  só `Meu funil ↔ Buscar empresas`. O topo reverte pro base (toggle + KPIs), sem os
  canos e sem os estados.
- **Bônus — botões invadindo o radar (buscar):** o ativador "Radar de enriquecimento"
  do topo cavalgava em cima do painel "Radar HBX" no modo Buscar. Como era parte do
  mesmo aparato, sumiu junto; o funhead base fica confinado (`right:360px`) e não invade
  mais o painel do radar. (Verificar ao vivo pós-publish.)
- CSS `.radar-status-preview*` / `.vnd-enrichment-*` em `screens.css`/`vendas-live.css`
  ficou inerte (classes que não renderizam mais) — não removido pra não arriscar mexer
  nesses arquivos gigantes compartilhados; é dead code sem efeito.

O que segue abaixo (lapidação dos canos) é histórico do que foi tentado antes da remoção.

---

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

## STATUS 18/07 — os 3 caminhos foram APLICADOS (dono mandou aplicar + publicar)

Não são mais 3 alternativas: virou UMA lapidação com as 3 alavancas juntas, coerentes.

- **Fix 2 (reatividade + rebuild):** o `MutationObserver` do cano
  ([radar-status-preview.tsx](../../frontend/src/app/(app)/leads/radar-status-preview.tsx))
  ignorava só mutações DENTRO do SVG — mas cada token que voa é injetado no `root`,
  então TODO token disparava rescan + rebuild completo do SVG. Agora ignora as nossas
  próprias injeções (SVG + tokens) e o `renderNetwork` calcula uma assinatura barata da
  geometria: se nada mudou, não reconstrói. Também desliguei o 2º observer (o `locate`,
  que rodava `subtree:true` no `document.body` inteiro a cada mutação) assim que acha a
  casca. → ataca direto o "pesada".
- **Fix 1 (cortar braços):** `buildLayout` agora só desenha braço pro lead que está de
  fato na faixa visível do cano (abaixo do cabeçalho, acima do rodapé) e no máximo 8
  (`MAX_BRANCHES`). Pipeline cheio (20+) não vira mais emaranhado e o SVG cai de 100+
  nós pra um punhado. Lead fora da faixa não anima token (consistente: sem braço, sem
  voo) mas continua contando no topo.
- **Fix 3 (visual):** braços laterais ficaram SUBORDINADOS ao tronco — mais finos e
  discretos ([vendas-live-polish.css](../../frontend/src/app/hbx-theme/vendas-live-polish.css),
  bloco `.is-branch`). O tronco (4 entradas → 1 cano) continua sendo o herói; vários
  leads deixam de competir visualmente.

Verificado local: `tsc --noEmit` verde, `eslint` verde nos arquivos tocados, `check-pele`
sem apontar meus arquivos. Publicado junto com o fix do z-index (item 1) e o fix da tela
de aplicativo (mobile-device-panel, que o dono já tinha publicado em `ba326abd`).

---

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

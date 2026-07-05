# A5 — Passe de conserto Vendas mobile (B4 + B5) — RESULTADO

> Sprint A5 do PLANO-APPIFICACAO.md. **Só layout/CSS mobile (≤860px). NENHUMA
> lógica/estado/handler/JSX do refab do dono foi tocado.** Commit isolado no master.

## O que estava quebrado (screenshots iPhone, dono 04/07 20:03)
- **B4 (funil `/vendas`):** o header quebrava — "de vendas / 1 cards" vazava em 2
  linhas POR CIMA dos KPIs; o botão "Modo foco" ficava cortado na borda direita.
- **B5 ("Buscar empresas" embutido no `/vendas`):** o painel "Buscando empresas /
  Todo o Brasil / ← Voltar" ficava SOBREPOSTO à lista; os 3 chips de stats
  (Total no Brasil / Disponíveis / Cota) amontoados/cortados no topo; o campo de
  busca coberto pelos chips.

## Causa-raiz (uma só, para os dois bugs)
No **desktop** a casca de Vendas é um overlay ABSOLUTO: `.vnd-funhead` (a barra do
topo) é `position:absolute; right:360px` e flutua POR CIMA de `.vnd-stage`
(`position:absolute; inset:0`, as 2 camadas em crossfade); o conteúdo ganha
`padding-top:74px` pra não passar por baixo da barra.

No **mobile** esse modelo quebrava:
1. `.vnd-funhead` herdava `right:360px` → num viewport de ~375px a barra encolhia
   pra uma faixa de ~15px, então segbtns/KPIs empilhavam em várias linhas e
   estouravam por cima do conteúdo (o "de vendas 1 cards" vazando = B4).
2. As camadas `absolute; inset:0` + `padding-top:74px` não casavam com o modelo de
   scroll flex do mobile (`.vnd-page`/`.leads-page`), então a lista/Radar embutido
   (B5) ficava coberta pela barra.
3. Havia ainda um **descasamento de breakpoint**: a media query da funhead estava em
   `760px`, mas o resto do mobile (`useIsMobile` e `mobile.css`) usa **860px** — entre
   760–860px a barra nem tentava se ajustar.

## Fix (só CSS — media query mobile)
A casca deixa de ser overlay e vira **coluna em fluxo** no `≤860px`: a barra empilha
em cima, as camadas descem em fluxo, sem sobreposição. Zero mudança de lógica.

### 1) `frontend/src/app/hbx-theme/screens.css` (linhas ~1726–1770)
Reescrevi o bloco `@media (max-width: 760px)` → `@media (max-width: 860px)` (casa com
`useIsMobile`/mobile.css) e ampliei:
- `.vnd-modehost` → `display:flex; flex-direction:column` (coluna que rola).
- `.vnd-funhead` → `position:static; right:auto; left:auto` (entra no FLUXO, some o
  `right:360px` que a estrangulava) + `flex-wrap:wrap`, ocupa 100% da largura.
- `.vnd-stats`/`.kpis` → linha de 3 colunas com `min-width:0`, rótulo `white-space:normal`
  centrado e valor menor → os 3 chips cabem sem cortar (vale p/ B4 e B5, mesma barra).
- `.vnd-stats__layer:not(.is-on)` → `display:none` (camada inativa não empilha fantasma).
- `.vnd-stage`/`.vnd-layer` → `position:relative` em fluxo; `.vnd-layer:not(.is-on)`
  sai do fluxo (`display:none`).
- `.vnd-layer.is-on .content > .work` (e `--buscar`) → `padding-top:0` (sem barra
  flutuante em cima, não precisa mais do respiro de 74px).

### 2) `frontend/src/app/hbx-theme/mobile.css` (dentro do bloco `@media (max-width:860px)` de `.vnd-page`)
- `.vnd-page .panel > .panel-head` → `flex-wrap:wrap` + `align-items:flex-start`.
- `.panel-head > h2` → `flex:1 1 100%` (título em coluna própria, envolve o "X de Y cards").
- `.panel-head > .meta` → `margin-left:0; flex:1 1 100%; flex-wrap:wrap` → a barra de
  ações ("Modo foco"/"Novo lead") **envolve** em vez de ser cortada na borda direita.

## Garantia de que NADA de lógica mudou
`git status --short` = só 2 arquivos, **ambos `.css`**. Zero `.ts`/`.tsx` alterado →
nenhum estado/handler/JSX/regra de negócio do refab tocado. Todas as regras novas
vivem DENTRO de `@media (max-width:860px)` → o **desktop é byte-a-byte idêntico**
(base `.vnd-funhead{position:absolute;right:360px}` linha 1544 e `padding-top:74px`
linhas 1608-1609 intactas).

## Checks
- `cd frontend && npm run build` → **exit 0** (verde).
- `npx tsc --noEmit` → **exit 0** (verde).
- `check-pele.mjs` → **0 violação nova nos meus arquivos** (minhas linhas não têm
  nenhum hex/rgba/hsl — só tokens/`static`/`flex`). As R1 que o check lista
  (screens.css:1564/1579, bot-builder.css, whatsapp.css) são **pré-existentes no HEAD**,
  de terceiros — não mexi (regra: não consertar violação alheia).

## Verificação no viewport iPhone (376px, preview real com device emulation)
Montei a DOM real das 2 telas (classes verdadeiras) no viewport 376px e medi
`getBoundingClientRect`:

**B4 (funil):**
- `.vnd-funhead`: `w:376, overflowRight:0` (antes: ~15px estrangulada).
- KPIs (Cards/Atrasados/Fechados): `w:352, right:364` → cabem, `overflowRight:-12`.
- `contentBelowFunhead: true` → título NÃO vaza mais por cima dos KPIs.
- "Modo foco": `right:339 ≤ 376`, **visível, overflowRight:-37** (não cortado).

**B5 (Buscar empresas):**
- KPIs (Total no Brasil / Disponíveis / Cota): `w:352, right:364`, `overflowRight:-12`
  → 3 chips numa linha, sem cortar.
- mini-bar "Buscando empresas / Todo o Brasil / ← Voltar": `top:1124 ≥ funhead.bottom:1114`
  → **em FLUXO abaixo da barra, não sobreposta**; "← Voltar" visível.
- campo de busca: `top:1207 ≥ miniBar.bottom:1180` → **visível, acima da lista, não coberto**.
- ordem final empilhada: barra (toggle + 3 KPIs + radar) → mini-bar → busca → tabs/lista.

Screenshots via imagem não anexados: o preview renderiza mas `screenshot` dá timeout
(fundo animado do login); a prova de layout foi por medição de bounding-box no DOM
real no viewport de 376px (acima), que é mais precisa que print pra checar overflow.

# FIX2 — RESULTADO: VIDA nas telas (reprova do dono 06/07 noite)

Os 5 itens da reprova ("parece planilha do excel", "cade a foto? cade
efeitos cade vida?", seta invertida) foram corrigidos. Nenhum elemento novo
foi somado (anti-placona) — a vida veio de vidro/profundidade/estados,
reusando a API central da casca (`useGlassPill`/`<GlassPill>`,
`.glass-pill-*` do kit.css) exatamente como a Lei nº2 manda.

## V1 — Vendas topo (Glass Pill + botões com pele)
- **Funil|Buscar** (`ModoSegment` em `vendas.tsx`) e **Lista|Quadro**
  (`vendas-funil.tsx`) agora usam `useGlassPill`+`<GlassPill>` — a pílula de
  vidro mede o item ativo e desliza até ele com a chacoalhada de pouso, em
  vez do `background` que trocava instantâneo (a furada da Lei §2 que gerou
  a reprova).
- `.casca-segment` ganhou `--glass-pill-radius: var(--radius-pill)`
  (`casca.css`) — o vidro nasce redondo igual ao track, não o `--radius-sm`
  default do menu lateral.
- Neutralizada a dupla-camada: `.glass-pill-track .casca-segment__item.is-on`
  vira `background:transparent` (o vidro por trás já dá o fundo+sombra; sem
  isso ficaria pílula sólida + vidro por cima, visual errado).
- Ícones soltos (Lista/Quadro/raio/+) já eram `.vnd-m__tool-btn` — reforçados
  com `border: 1px solid var(--border-hairline)` (cara de botão real, não
  ícone pelado) e feedback de `:active` (fundo muda + scale).
- **Grupo inteiro do topo ganha painel de vidro leve**: `.vnd-m__toolbar` e
  `.vnd-m__searchbar` agora têm `background: var(--surface-card)` + brilho
  sutil no topo (`linear-gradient` translúcido) + `border-hairline` +
  `shadow-xs` — mata a cara de "linha solta de planilha" citada pelo dono.
  Cromo continua ≤140px (só ganhou padding/radius, não altura).

## V2 — Conversas: seletor do admin (Todos|Meus)
- `conversas-lista.tsx`: novo chip **Todos | Meus**, visível só quando
  `isTenantAdmin(useCurrentUser())` é true — MESMA fonte de papel que o
  `/atendimento` desktop usa (`souAdmin = isTenantAdmin(me)`). Vendedor não
  vê o chip e continua só nas conversas dele.
- Filtro 100% client-side: "Meus" = `assignedUserId` bate com o meu `id` OU
  a conversa ainda não tem atendente (mesmo espírito do desktop — dono não
  some da fila só por falta de atribuição). Zero endpoint novo — o campo
  `assignedUserId` já vinha no payload de `/inbox/conversations`.
- Chips de filtro (Todas/Não lidas/Bot) e o novo chip de escopo também viraram
  **Glass Pill** — `.cvs-m__chips` ganhou `--glass-pill-radius: var(--radius-pill)`
  e a mesma neutralização de dupla-camada do V1
  (`.glass-pill-track .cvs-m__chip.is-on`).

## V3 — Conversas: foto real
- Já estava certo no código (nada a mudar): lista e chat usam `<Av
  name={...} src={convAvatar(c)} />`, o MESMO componente central
  `components/hbx/shell.tsx::Av` que o `/atendimento` desktop usa, lendo
  `customer.avatarUrl` — idêntico campo, idêntica fonte (foto real do
  WhatsApp com fallback de iniciais). A reprova do dono ("cade a foto?") foi
  contra o snapshot antigo; confirmado que o código atual já resolve a foto
  pela fonte certa — nenhuma mudança necessária além de conferir.

## V4 — Áudio com cara de áudio
- `AudioBubble` em `conversas-chat.tsx` reescrita: play/pause (mantido) +
  **forma de onda em barras** (24 barras CSS, altura por `nth-child`
  determinístico grave→agudo→grave — decorativo, a API não manda amplitude
  por segmento) + **camada de progresso real** (`cvs-m__audio-wave-fill`,
  `width%` = `currentTime/duration`, as barras já tocadas "acendem" em
  opacidade cheia) + **duração** (`fmtDur`, dos metadados
  `durationSeconds` OU do `onLoadedMetadata` do próprio `<audio>`).
- Reusa o MESMO `<audio>`/fluxo de mídia do desktop (`preload="metadata"`,
  `onPlay`/`onPause`/`onEnded`, mesmo `resolveMediaUrl`) — só a pele visual
  trocou de barra de progresso fina pra waveform em barras. Zero caminho
  novo de mídia.

## V5 — Seta de voltar
- `ICONS.arrow` (`shell.tsx`) é uma seta pra DIREITA, usada em ~15 outras
  telas como "ver mais" (linhas de lista, cards) — não podia virar seta de
  voltar sem quebrar essas telas.
- Adicionada chave nova **`ICONS.back`** (chevron pra ESQUERDA,
  `M19 12H5 / m11 18-6-6 6-6`), usada SÓ no `casca-top__back` de
  `transitions.tsx` (`<CascaView>`). Alvo mantido em 28px
  (`--casca-action-max`).

## Arquivos tocados
- `frontend/src/components/hbx/shell.tsx` — nova chave `ICONS.back`.
- `frontend/src/components/casca/transitions.tsx` — botão voltar usa
  `ICONS.back`.
- `frontend/src/components/casca/screens/vendas.tsx` — `ModoSegment` com
  Glass Pill.
- `frontend/src/components/casca/screens/vendas-funil.tsx` — Lista|Quadro
  com Glass Pill (hook antes dos early-returns — regra de hooks).
- `frontend/src/components/casca/screens/conversas-lista.tsx` — chip
  Todos|Meus (gate `isTenantAdmin`) + chips em Glass Pill.
- `frontend/src/components/casca/screens/conversas-chat.tsx` — `AudioBubble`
  com waveform + duração.
- `frontend/src/app/hbx-theme/casca.css` — `.casca-segment` com
  `--glass-pill-radius: pill` + neutralização de dupla-camada do `is-on`.
- `frontend/src/app/hbx-theme/screens.css` — painel de vidro em
  `.vnd-m__toolbar`/`.vnd-m__searchbar`; `.cvs-m__chips` com
  `--glass-pill-radius`; CSS da waveform de áudio
  (`.cvs-m__audio-wave*`/`.cvs-m__audio-bar`/`.cvs-m__audio-dur`).

## Coordenação com W5 (screens.css compartilhado)
`screens.css` também recebeu, em paralelo, o bloco `.mais-m__*`/`.cfg-m__*`
do W5 (folha "Mais" + Configurações) — os dois conjuntos de mudanças
convivem no mesmo arquivo sem conflito (blocos distintos, seções separadas
por comentário). Um incidente local de `git stash`/`stash pop` no meio da
sessão foi resolvido reaplicando cirurgicamente só os arquivos do FIX2 por
`git apply` (nunca tocando `configuracoes.tsx`/`mais-sheet.tsx`/
`mais-types.ts`, que o W5 estava editando ao vivo) — conferido arquivo por
arquivo antes de cada apply.

## Checks
- `npx tsc --noEmit` — limpo (0 erros).
- `npm run lint` (eslint + check-pele) — 85 problems (47 errors/38 warnings),
  TODOS pré-existentes fora do escopo deste FIX (voice-rubberband.ts,
  bot-prosp-fields.tsx, plans.tsx, etc.) — zero erro/warning novo introduzido
  pelos arquivos do FIX2 (conferido isolando cada arquivo tocado no output do
  lint).
- `npm run build` — verde, "Compiled successfully", 42 rotas geradas.

## Pendência de verificação visual
Localhost não é veredito (regra da frente) — falta o spot-check no Chrome
375×812 vendo: a pílula de vidro deslizando em Vendas (Funil|Buscar,
Lista|Quadro) e em Conversas (chips + Todos|Meus quando logado como admin),
a foto real no avatar de uma conversa com `customer.avatarUrl` preenchido, a
bolha de áudio com waveform tocando (progresso enchendo as barras), e a seta
de voltar apontando pra ESQUERDA no chat.

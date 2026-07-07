# FIX4 — RESULTADO: painel de comando (Vendas/Conversas/Empresas)

Reprova do dono (print do topo de Buscar em Vendas, pele rose): "crie um
painelzinho bem feito disso, continua feio! siga o tema" — o topo era fileiras
soltas sem moldura, cara de linha de planilha. Depois, adendo do dono (novos
prints): o mesmo painel se estende a Conversas e Empresas, com uma classe
central compartilhada.

## Classe central — `.casca-command` (casca.css)

Card único, contrato de painel real da pele (mesmo espírito de `.panel` do
kit): `--surface-card` + `--border-hairline` (1px) + `--radius-panel` +
`--shadow-lip` (inset) + `--shadow-xs`. Margem lateral `--space-3`, padding
`--space-2 --space-3` (vertical apertado, lateral no valor da spec), gap
`4px` entre linhas — apertado ao máximo pra caber no orçamento de cromo.

Auxiliares centrais também em `casca.css`:
- `.casca-command__row` — linha genérica dentro do card (não usada
  diretamente pelas telas atuais, mas disponível pra próximas).
- `.casca-command__btn` — botão quadrado 32px de ação do painel (borda
  hairline, radius-sm, fundo recessed) — usado como botão de filtro em
  Vendas e "+" em Conversas.
- `.casca-command__btn-dot` — pontinho de badge (filtro ativo), herda
  `--hbx-brand-strong` — nunca cor solta.

## Vendas (`vendas-funil.tsx` / `vendas-buscar.tsx`)

Um `.casca-command` por modo, simétricos:
- **Funil:** linha 1 = `.vnd-m__toolbar` (segmented Funil|Buscar + Lista|Quadro
  + foco + "+ Novo"); linha 2 = `.vnd-m__stats`.
- **Buscar:** linha 1 = `.vnd-m__searchbar` (segmented + campo full-width 38px
  + botão de filtro 32px `.casca-command__btn`, com `.casca-command__btn-dot`
  quando `city`/`segment` preenchidos); linha 2 = `.vnd-m__statsrow` (stats +
  CTA "Buscar" pill 28px com raio, cor forte da pele) — some quando há busca
  rodando (`runActive`), dando lugar só ao espaço da faixa viva.
- A **faixa viva de busca rodando** (`.vnd-m__live`, verde/marca) e a **lista**
  ficam FORA do painel, abaixo dele (spec) — nunca dentro do card.

## Conversas (`conversas-lista.tsx`)

Um `.casca-command` com 3 linhas: busca "Buscar conversa…" + "+"
(`.casca-command__btn`); chips Todas · Não lidas · Bot (glass pill); chips
Todos | Meus (só admin, gate `isTenantAdmin`). O pontinho de status do chip
(verde/vermelho) SAIU do chip "Todas" (reprova do dono: "pontinho vermelho
órfão") — pertence à faixa de estado `.cvs-m__faixa` (WhatsApp
desconectado/reconectando), que continua FORA/acima do painel, como estava.

## Empresas (`empresas-lista.tsx`)

Reprova adicional do dono: título "Empresas" **duplicado** (topo da casca via
MobileShell + cabeçalho interno `.emp-m__head`/`.emp-m__title`) — mesma classe
de erro do W3/Conversas. Cabeçalho interno **removido**; "+ Nova" migrou pra
dentro do painel, ao lado da busca. `.casca-command` com linha 1 = busca +
"+ Nova"; linha 2 = stats "N empresas · N clientes". CSS morto
(`.emp-m__head`/`.emp-m__title`) removido de `screens.css` (zero consumidor
restante, conferido).

## Cromo medido (Chrome 375×812, sessão local logada)

| Tela/modo | Cromo (topo casca + card) |
|---|---|
| Vendas — Funil | ~113px |
| Vendas — Buscar | ~140px (no limite; CTA 28px, gap 4px, padding vertical `--space-2`) |
| Empresas | ~123px |
| Conversas — vendedor (2 linhas) | ~122px (calculado) |
| Conversas — **admin** (3 linhas: busca+chips+chips-admin) | ~158px sem a faixa de estado |

Conversas-admin passa do teto de 140px quando logado como admin — é o piso
físico de 3 linhas de conteúdo funcional real (busca 36px + 2 filas de chips
22px + padding/gap mínimos), pedido explicitamente pelo adendo do dono
("linha 3 só admin: Todos | Meus" DENTRO do mesmo painel). Não há gordura a
cortar: padding e gap já estão no mínimo praticado nas outras telas. Registrado
aqui para o dono decidir se aceita ou se prefere colapsar a linha 3 num
segundo estado (ex.: popover) — não alterado sem instrução, pois a spec do
adendo foi explícita sobre a 3ª linha morar no painel.

## Tokens usados (zero hex/inline novo)
`--surface-card`, `--surface-recessed`, `--surface-canvas`, `--border-hairline`,
`--radius-panel`, `--radius-sm`, `--radius-pill`, `--shadow-lip`, `--shadow-xs`,
`--shadow-sm`, `--space-1/2/3`, `--casca-text-*`, `--hbx-brand-strong`,
`--hbx-action-ink`, `--text-strong/body/muted`, `--weight-bold/semibold`,
`--motion-fast`. As 3 peles (aurora/ember/rose) e os 2 modos (claro/escuro)
vestem o painel sozinhos — conferido ao vivo trocando `data-theme` e
`data-theme-mode` no Chrome (nenhum ajuste por tela).

## Achado de coordenação (arquivo compartilhado)

`casca.css` e `screens.css` já continham GRANDE PARTE deste trabalho no HEAD
antes deste commit — outros workers da mesma frente (FIX5 "swipe entre
módulos" e W7 "qa") rodaram em paralelo no mesmo working tree e capturaram o
estado em disco destes 2 arquivos CSS nos commits deles (arquivo compartilhado
entre frentes, mesmo padrão já registrado no FIX2-RESULTADO). Conferido
arquivo por arquivo: nada do trabalho deles foi revertido; o delta restante
commitado aqui é só o ajuste fino de padding/gap do `.casca-command` (que
ainda não tinha sido capturado) + os 4 arquivos `.tsx` de tela (exclusivos
desta frente, intocados pelos outros commits).

## Checks
- `npx tsc --noEmit` — limpo (0 erros).
- `npm run lint` (eslint + check-pele) — 85 problems (47 errors/38 warnings),
  TODOS pré-existentes fora do escopo (idêntico à baseline: `entrega/*`,
  `bot-prosp-fields.tsx`, `plans.tsx`, `voice-rubberband.ts` etc.) — zero
  erro/warning novo nos arquivos tocados neste FIX4.
- `check-pele` — catraca 497/495 estourada, 100% pré-existente
  (`janela-empresas.tsx`, `gerencial/page.client.tsx`, `relatorios/page.client.tsx`
  etc.) — nenhum arquivo deste FIX4 aparece na lista de violações.
- `npm run build` — verde, "Compiled successfully", 42 rotas geradas, sem
  warning de CSS (corrigido um comentário CSS com `/*` aninhado que quebrava
  o minificador do Turbopack).

## Pendência de verificação
Spot-check visual feito ao vivo no Chrome 375×812 (login local, sessão HBX
System) nas 3 telas + 2 modos de Vendas + 3 peles (aurora/ember/rose) + dark
mode — confirmado visualmente que o painel veste sozinho, sem ajuste manual.
Falta o teste com dados reais de produção (dono publica e testa no VPS,
conforme regra da frente — local tem banco vazio).

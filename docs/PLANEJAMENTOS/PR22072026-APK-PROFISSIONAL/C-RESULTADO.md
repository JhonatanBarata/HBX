# Worker C — RESULTADO (C1 contrato · C2 aplicação · C3 mata folhas injetadas)

Arquivos tocados (só os três autorizados):
- `EntregaShell/app/src/main/assets/app/app.css`
- `EntregaShell/app/src/logistica/assets/app/mobile-contract.js`
- `EntregaShell/app/src/logistica/assets/app/offline-controls.js`

Commits locais, um por sprint (+ 1 de fechamento), direto no `master` (sem branch, sem publish):
- `2714bfeb` — C1 (só declara os tokens; zero pixel mudado)
- `f05c14f9` — C2 (aplica os ~45 hex nos tokens do C1)
- `d375f489` — C3 (mata as 2 folhas injetadas, migra pra app.css)
- `8df0c9d5` — fechamento: o C6 (lint, de outro worker) entrou no meio do meu C1→C3 e
  passou a reprovar EntregaShell/; rodei o lint isolado contra meus 3 arquivos e fechei
  os achados (ver seção própria abaixo — não estava nos 6 famílias originais, mas ficou
  bloqueando os arquivos que eu possuo, então corrigi).

⚠️ Nota operacional: enquanto eu trabalhava, outros workers publicaram commits em
paralelo no mesmo `master` (`54f016d4` casca de abertura/C5, `c94040c5` lint/C6). Não
toquei nos arquivos deles; `git status` ficou limpo antes de cada commit meu.

---

## C1 — o contrato (`2714bfeb`)

Só declaração, nenhum seletor mudou. 6 famílias + 3 tokens extra que nasceram durante o
C3 (ver "Achados do fechamento C6" — mesma disciplina, tokens novos declarados antes de
qualquer aplicação):

| Token | Claro | Escuro | Por quê sem par dark (quando não tem) |
|---|---|---|---|
| `--on-brand` | `#1b290b` | *(igual)* | fundo que cobre (`--brand`/`--cta`) já é vívido nos dois temas |
| `--on-brand-soft` | `var(--on-brand)` | `#dfffb0` | cobre `--brand-soft`, que troca de pálido→escuro — a tinta inverte junto |
| `--on-solid` | `#fff` | *(igual)* | fundo sólido/vívido nos dois temas |
| `--map-canvas` | `#e5ece1` | `#45516e` | placeholder do mapa antes do tile — já existia par, faltava um consumidor |
| `--map-canvas-ink` | `#cbd5c6` | *(igual)* | texto "carregando/indisponível" sobre o canvas, nunca teve par |
| `--glass-surface` | `rgba(255,255,255,.9)` | `rgba(11,16,32,.86)` | vidro sobre o mapa (chip GPS + botão seguir) |
| `--glass-border` | `rgba(255,255,255,.76)` | `rgba(255,255,255,.14)` | idem |
| `--glass-ink` | `#162033` | `#f4f7ff` | idem |
| `--navy-light` | `#111a2e` | *(igual)* | 2º stop do gradiente do hero, hero não muda com tema |
| `--navy-ink` | `#b9c3d8` | *(igual)* | texto `.hero .muted` |
| `--navy-ink-accent` | `#bde96f` | *(igual)* | texto `.hero-kicker` |

`--navy` (já existia, `#0b1020`/`#080b14`) foi reaproveitado, não recriado.

---

## C2 — aplicação (`f05c14f9`) — TODAS as convergências visuais

Regra seguida: tokenizar ≠ repintar. Toda vez que o hex solto já batia 1:1 com o valor do
token, é wiring puro (0 pixel). Toda vez que divergia, é convergência — listada aqui com
valor antigo → novo. Nenhuma foi feita calada.

### Sem mudança de pixel (hex já era idêntico ao token)
| Seletor | Token |
|---|---|
| `.btn-danger`, `.client-editor-part-head span`, `.center-arrow-glyph` (color `#fff`) | `--on-solid` |
| `.route-map-shell`/`.route-live-map` (background, já tinha os 2 valores) | `--map-canvas` |
| `.route-map-loading/.unavailable/.empty` (color `#cbd5c6`) | `--map-canvas-ink` |
| `.route-gps-status` (border `.76`, background `.9`, color `#162033`) | `--glass-*` |
| dark `.route-gps-status` (border `.14`, background `.86`, color `#f4f7ff`) | `--glass-*` |
| `.hero` gradiente 2º stop (`#0b1020`) | `var(--navy)` — token já existia, estava sendo **ignorado** |
| `.hero` box-shadow `rgba(11,16,32,.22)` | `color-mix(in srgb, var(--navy) 22%, transparent)` (matematicamente idêntico) |
| `.hero .muted` (`#b9c3d8`), `.hero-kicker` (`#bde96f`), `.hero` 1º stop (`#111a2e`) | `--navy-ink`/`--navy-ink-accent`/`--navy-light` (só ganharam nome) |
| `.day-chip.active`, `.nav-btn.active`, `.recurrence-mode.active` (claro, já eram `#1b290b`) | `--on-brand`/`--on-brand-soft` |
| dark `.chip.active`/`.avatar`/`.nav-btn.active`/`.recurrence-mode.active`/`.order`/`.row-card.selected` (todas `#dfffb0`) | `--on-brand-soft` — dark override por seletor **removido**, o token já inverte sozinho |
| 4 usos de `var(--route-icon-on)` (`#fff`) | `--on-solid` |

### Convergências reais (valor mudou — listadas)

**Família "tinta sobre a marca" (`--on-brand`, canônico `#1b290b`)** — eram 9 pretos-
esverdeados fazendo a mesma coisa, ninguém escolhe 9 de propósito:

| Seletor | Antes | Depois |
|---|---|---|
| `.brand-mark` | `#17210f` | `#1b290b` |
| `.btn-primary` | `#132000` | `#1b290b` |
| `.rp2-cta` | `#082610` | `#1b290b` |
| `.fab` | `#142000` | `#1b290b` |
| `.chegada-btn-pago` | `#0a2a13` | `#1b290b` |
| `.chegada-btn-entregue` | `#17210f` | `#1b290b` |
| `.route-map-pin` | `#172116` (= `--ink` claro, ignorado — **não** virou `var(--ink)`: `--ink` inverte com o tema e apagaria o contraste no disco de marca escuro; virou `--on-brand`, que fica fixo igual ao fundo `--brand`) | `#1b290b` |
| `.day-chip.active` (dark, override removido) | `#102000` (único ponto da família com valor **diferente** entre claro/escuro) | `#1b290b` (igual ao claro — fundo é `--brand`, vívido nos dois temas, não precisava variar) |

**Família "tinta sobre `--brand-soft`" (`--on-brand-soft`)**:

| Seletor | Antes (claro) | Depois |
|---|---|---|
| `.chip.active` | `#1d2b0a` | `#1b290b` |
| `.avatar` | `#24370d` | `#1b290b` |
| `.order` | `#1c2a0c` | `#1b290b` |

**Fundo do mapa (`--map-canvas`)** — mudança REAL de comportamento, não só de hex:

| Seletor | Antes | Depois |
|---|---|---|
| `.route-plan-preview-map` | `#e5ece1` **sem nenhum override dark** (ficava bege-claro mesmo no tema escuro) | `var(--map-canvas)` → agora vira `#45516e` no escuro, igual ao mapa ao vivo |

**Vidro sobre o mapa (`--glass-*`)** — `.route-follow-control` tinha alfas/tom levemente
diferentes de `.route-gps-status`; convergidos pro valor do chip (diferença imperceptível
a olho nu, mas é mudança real de valor):

| Seletor | Antes | Depois |
|---|---|---|
| `.route-follow-control` border | `rgba(255,255,255,.78)` | `rgba(255,255,255,.76)` |
| `.route-follow-control` background | `rgba(255,255,255,.92)` | `rgba(255,255,255,.9)` |
| `.route-follow-control` color | `#243047` | `#162033` |
| dark `.route-follow-control` background (override removido) | `rgba(11,16,32,.88)` | `rgba(11,16,32,.86)` |

**Consolidação `--route-icon-*` (família 6 — a mudança mais visível do pacote):**

Os 3 tokens `--route-icon-nav/-stop/-on` (S5) nasceram sem par dark, duplicando
`--info`/`--danger`/branco-fixo. Removidos; os 4 pontos de uso passam a referenciar os
tokens gerais, que JÁ têm o par certo:

| Seletor | Antes | Depois (claro) | Depois (escuro) |
|---|---|---|---|
| `.transmux-disc.gps`, `.transmux-pin circle` | `--route-icon-nav` = `#0e6fd6` fixo nos 2 temas | `--info` = `#0865df` | `--info` = `#4d9dff` |
| `.transmux-disc.stop` | `--route-icon-stop` = `#c0392b` fixo nos 2 temas | `--danger` = `#c43838` | `--danger` = `#ff8b85` |

**⚠️ Esta é a mudança visual mais forte de todo o C1-C3**: o disco "Parar rota" (o botão
STOP do controle de navegação) muda de um vermelho escuro FIXO para um **rosa-salmão
claro** (`#ff8b85`, o mesmo tom que `--danger` já usa em badge/borda no tema escuro) toda
vez que o app estiver em tema escuro. Antes ele nunca mudava de cor com o tema. Segui a
instrução explícita do C1 ("consolidar os 3 tokens --route-icon-* que nasceram sem par
dark") e a lógica é consistente (mesmo --danger que pinta todo alerta do app no escuro),
mas é a convergência que o dono deveria olhar primeiro no aparelho antes de aprovar às
cegas — reverter é trivial (voltar as 2 regras de `.transmux-disc` pro hex antigo).

---

## C3 — mata as 2 folhas injetadas (`d375f489`)

`mobile-contract.js` (linha ~90) e `offline-controls.js` (linha ~10) cada um criava um
`<style>` via `document.createElement` e injetava DEPOIS de `app.css` — vencendo qualquer
edição feita na folha central (causa raiz de "edito o CSS e não muda nada"). As duas
folhas migraram pra uma seção nova no fim de `app.css` ("Fase 2 C3"); os dois arquivos JS
agora só manipulam classe/atributo/innerHTML, nunca mais criam `<style>`.

Convergências feitas na migração (novo código entrando no C1-C3 nasce dentro do
contrato, não fora):

| Onde | Antes | Depois |
|---|---|---|
| `.hbx-pix-copy` (mobile-contract) | `#17210f` | `var(--on-brand)` → `#1b290b` (mesmo caso da família 1, só que morava numa folha fora do alcance do C2) |
| `.hbx-offline-banner` e os 3 seletores irmãos (offline-controls) | `var(--border, #d8dfd0)` — **`--border` não existe em lugar nenhum do app**, a regra sempre caía calada no fallback | `var(--line)` → `#d9e1d4` claro / `#2b3829` escuro. Mesma classe de bug do `var(--text)` que o worker A já achou (token referenciado que não existe) |
| `.hbx-offline-banner`/`.hbx-offline-dot`/`.hbx-offline-option input` accent/`.hbx-route-schematic` (verde) | `#78c900` cravado, **nunca mudava com o tema** | `var(--brand)` → `#78c900` claro / `#94df22` escuro |
| `var(--surface, #fff)` (3 usos) | fallback morto (`--surface` sempre existe) | `var(--surface)`, sem fallback — limpeza, 0 pixel |

**Mudança real pro usuário**: o banner "sem sinal"/sincronização, o checkbox de
preferências e o esquema de rota offline (fallback sem mapa) agora respondem ao tema
escuro pela primeira vez — antes ficavam sempre no verde de tema claro e no cinza-verde
fixo, mesmo com o app em modo escuro.

**Deixado como estava, dentro do escopo C1-C3** — `#f2b52b` (aviso) e `#e75353` (perigo)
do mesmo banner: são um matiz visivelmente diferente de `--warning`/`--danger` (não é "10
tons da mesma coisa"), forçar a convergência mudaria a cor de verdade. Ver seção
"Achados do fechamento C6" abaixo — acabaram ganhando token próprio de qualquer forma.

---

## Achados do fechamento C6 (`8df0c9d5`) — não fazia parte das 6 famílias originais

Enquanto eu trabalhava, outro worker publicou `c94040c5`, estendendo `check-pele.mjs`
pra reprovar hex solto (`R6`) em `EntregaShell/**.{css,js,html}` — **sem** a isenção de
neutros que o lint do frontend tem (lá até `#fff`/`#000` tem que nascer de `var()`).
Rodei o lint isolado contra meus 3 arquivos (script parte-a-parte, já que o lint
completo do repo falha por ~35 violações pré-existentes em `frontend/src/`, nada a ver
com o APK) e achei 4 pontos que sobraram FORA das 6 famílias do C1. Corrigi porque
ficaram bloqueando exatamente os arquivos que eu possuo:

| Achado | Token novo | Valor |
|---|---|---|
| `.brand-mark` gradiente do logo | `--brand-mark-from`/`--brand-mark-to` | `#a4ec2f`/`#65b600` (sem mudança, cor fixa da marca) |
| `.hbx-loading-spinner`/`.hbx-loading-text` (branco do overlay de loading) | `var(--on-solid)` | `#fff` (sem mudança — alcance do `--on-solid` ampliado pro scrim de loading) |
| `maplibregl-ctrl-attrib` no escuro (rótulo de atribuição do MapLibre) | `--map-attrib-ink` | `#dce5f2` (sem mudança, só nomeado; claro usa o padrão da lib) |
| Banner offline aviso/perigo | `--offline-warn`/`--offline-danger` | `#f2b52b`/`#e75353` (sem mudança — token dedicado, NÃO convergido pra `--warning`/`--danger`) |

Também reescrevi (sem `#`) 5 comentários que citavam hex por extenso — o scanner do
lint olha a linha inteira, inclusive dentro de `/* */` e `//`, então um comentário
histórico mencionando um hex morto reprova igual a código de verdade. 2 desses
comentários eram de commits anteriores ao meu (`S1 21/07`, `S5 22/07`, não meus), mas
corrigi por estarem no arquivo que eu possuo e o lint ser real.

**Confirmado**: 0 hits de `R6`/`R7` nos meus 3 arquivos (rodei o script isolado, resultado
colado no commit). As ~18 violações que sobram no repo inteiro são todas em
`logistica/app.js`, `vendas/app.js` e `native.js` — fora do meu escopo, são trabalho do
C4 (SVG à mão + `style=` inline).

---

## O que ficou de fora, de propósito

- **`var(--text)`** (3 usos: `.ddd-input`, `.ddd-preview`, `.route-cancel-icon`/
  `.route-nav-external`) — token que não existe, já achado pelo worker A e listado no
  plano como parte do C6 ("matar var(--text) morto"). O C6 que rodou (`c94040c5`) só fez
  a metade do lint, não essa faxina. Não toquei: não é hex solto (é var() morta, caso
  diferente), não bloqueia o lint novo, e mexer nesses 2 seletores tocaria área que pode
  ter trabalho de outro worker em voo. Fica pro C6 de verdade.
- **`maplibregl-ctrl-attrib` no tema claro** (`rgba(255,255,255,.78)` background) — não é
  hex, ficou como estava, fora do escopo das 6 famílias.
- **`#f2b52b`/`#e75353`** do banner offline — ver acima, ganharam token mas não
  convergiram de matiz pra `--warning`/`--danger`; decisão de unificar o tom (se fizer
  sentido) fica pro dono/sprint futuro.
- **A maior parte do C4/C5/C6 "de verdade"** (SVG à mão, `style=` inline em
  `logistica/app.js`/`vendas/app.js`, faxina completa) é de outros workers — não toquei
  nesses arquivos (proibido).

## Riscos reais (o que o dono deve olhar no aparelho antes de aprovar)

1. **Disco "Parar rota" no tema escuro muda de vermelho fixo pra rosa-salmão claro**
   (consolidação `--route-icon-stop` → `--danger`, ver C2 acima). Maior mudança visual do
   pacote — reverter é 1 linha (`.transmux-disc.stop`).
2. **Disco GPS no tema escuro muda de azul fixo pra um azul mais claro** (mesma lógica,
   `--route-icon-nav` → `--info`), impacto bem menor que o item 1.
3. **Preview do "Montar rota"** (`.route-plan-preview-map`) passa a escurecer no tema
   escuro pela primeira vez — antes ficava sempre bege-claro.
4. **Banner "rota sem sinal" e esquema de rota offline** passam a responder ao tema
   escuro pela primeira vez (verde/borda mudam de tom).
Nenhum desses quebra funcionalidade — são só cores que agora reagem ao tema onde antes
ficavam fixas. Testei só lendo código (nenhum aparelho, nenhum servidor, conforme
instrução); `node --check` passou nos 2 JS e o balanceamento de chaves do CSS foi
conferido por script.

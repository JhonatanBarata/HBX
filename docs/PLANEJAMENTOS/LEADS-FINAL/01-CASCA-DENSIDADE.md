# 01 — CASCA: passe de densidade + sidebar colapsável + regra nova

## Objetivo
O app inteiro (desktop) fica com cara de ferramenta densa profissional — mais conteúdo
por tela, menos chrome — **mexendo só em token de esqueleto**, pra valer nas 4 peles de
uma vez e a troca de tema continuar trivial. Alvo concreto: a lista de leads mostra
**≥9 linhas em 1080p** (hoje: 4 cards).

## Por quê ($)
Densidade = percepção de "ferramenta pro" = sustenta preço e retenção. O Biz mostra 9+
leads por tela; o HBX mostra 4 porque ~530px são menu. Isso é objeção de venda direta.

## Estado atual (fatos verificados 06/07)
- `html{font-size:15px}` em [base.css:7](../../frontend/src/app/hbx-theme/base.css) —
  `--text-base` 0.88rem = 13,2px. **A letra base NÃO é o problema; NÃO descer abaixo de 13px.**
- [typography.css](../../frontend/src/app/hbx-theme/typography.css): `--text-h1: 2.4rem`
  (~36px), `--text-h2: 1.9rem`, `--text-h3: 1.35rem`, `--text-h4: 1.05rem`.
- [spacing.css](../../frontend/src/app/hbx-theme/spacing.css): `--rail-width: 260px`,
  `--context-width: 248px`, `--control-height: 38px`, `--control-height-sm: 32px`,
  `--field-height: 42px`. Não existe token de altura de linha de lista.
- Sidebar ([shell.tsx](../../frontend/src/components/hbx/shell.tsx), `Sidebar` ~l.719) não
  tem colapso. ICONS map existe — **nav id sem entrada em ICONS derruba a Sidebar** (P0
  conhecido do "assistente", 03/07). 
- Peles com `font-size:px`: `theme-future.css` (28×, FORA do seletor — órfã),
  `entrega.css` (1×), `base.css` (1× = o root). Peles instaladas estão limpas.

## Desenho

### 1. Tokens de densidade (esqueleto — `typography.css` + `spacing.css`)
| Token | De | Para |
|---|---|---|
| `--text-h1` | 2.4rem | **1.8rem** (~27px) |
| `--text-h2` | 1.9rem | **1.5rem** |
| `--text-h3` | 1.35rem | **1.15rem** |
| `--text-h4` | 1.05rem | **0.95rem** |
| `--text-display` | 3.5rem | **mantém** (é de landing/marketing) |
| `--control-height` | 38px | **32px** |
| `--control-height-sm` | 32px | **28px** |
| `--field-height` | 42px | **36px** |
| `--rail-width` | 260px | **228px** |
| `--context-width` | 248px | **212px** |
| novo `--rail-width-min` | — | **64px** (rail de ícones) |
| novo `--row-height` | — | **48px** (linha densa de lista de dados) |

- `html{font-size:15px}` **NÃO mexe** — root é global e encolheria a landing/mundo-site.
- Passe de padding macro: em `screens.css`, containers de topo de telas do APP que usam
  `--space-6`/`--space-8` descem um degrau (→ `--space-4`/`--space-6`). Só padding/gap de
  casca, nunca dentro de card/conteúdo. Marketing (`.scene-*`, `marketing.css`) intocado.

### 2. Sidebar colapsável (rail de ícones)
- Estado `data-rail="min"` no elemento raiz do shell; toggle no topo da Sidebar;
  persistência `localStorage("hbx:rail")`; default expandida (decisão 3 do PLANO.md).
- Colapsada: largura `--rail-width-min`, só ícone (ICONS já cobre todo nav id — conferir
  TODOS antes, pelo P0), label vira `title`/tooltip. CSS 100% em `kit.css`/`screens.css`
  trocando a variável — **zero estilo novo em TSX**.
- Glass pill do menu re-mede no toggle (o hook `useGlassPill` já aceita deps — passar o
  estado do rail como dep).

### 3. Regra nova em `docs/Rules/FRONTEND.md` (o que o dono pediu: "alterar as regras")
Adicionar às 5 Leis (dentro da Lei 3 ou como nota da Lei 1):
> **Métrica estrutural é ESQUELETO.** `font-size`, alturas (`height`, `--control-*`,
> `--row-height`), larguras de shell (`--rail-*`, `--context-width`) e escala de spacing
> nascem SÓ em `typography.css`/`spacing.css`/`skeleton.css`. Pele (`theme-*.css`) é
> PROIBIDA de declarar `font-size`/altura/largura estrutural — pele veste cor, borda,
> sombra, vidro, radius e família de fonte. É isso que garante troca de tema sem quebrar
> densidade.
E registrar os alvos de densidade (≥9 linhas de lista em 1080p; zero-scroll continua lei).

### 4. Fiscal (`check-pele.mjs`)
Nova verificação: `font-size:` com valor px dentro de `theme-*.css` = reprovado (catraca
com baseline se precisar, meta zero). `theme-future.css`: está fora do seletor — pela
regra "sem legado", **deletar** o arquivo + import no `globals.css` se ninguém referencia
(confirmar antes com grep; se o dono quiser guardar, mover pra `docs/TEMAS`).
`entrega.css` (1 ocorrência): migrar pra token.

## Passos
1. Grep de consumo: quem usa `--text-h1/h2`, `--control-height`, `--field-height`,
   `--rail-width` (inclusive `--context-width` no aside do leads) — mapear impacto.
2. Aplicar tabela de tokens. Build + varrida visual nas telas quentes: /dashboard, /leads,
   /vendas, /atendimento, /master, /configuracoes, landing (intocada).
3. Passe de padding macro em `screens.css` (só app).
4. Sidebar colapsável (estado + CSS + tooltip + glass pill re-measure).
5. `check-pele.mjs` + limpeza `theme-future.css`/`entrega.css`.
6. Atualizar `docs/Rules/FRONTEND.md` (regra + alvos).
7. Zero-scroll: revalidar `@media (max-height:900px)` de `screens.css` — com tudo menor,
   pode até relaxar overrides que amassavam demais.

## Riscos / guardrails
- **Landing/mundo-site não encolhe** (`marketing.css`, `page.client.tsx` da landing,
  `trabalhe-conosco`) — conferir visualmente; é o principal risco do passe de heading.
- `--field-height` 36px: conferir inputs com ícone dentro (busca do topo, campos do bot).
- Aside do leads usa `--context-width` — a tela precisa continuar confortável; se 212px
  apertar o "show-off" do Buscar Empresas (redesign publicado 05/07), o ajuste é no token
  local da tela em `screens.css`, não revertendo o token global.
- Working tree tem `screens.css` modificado (frente créditos) — merge por cima, não reverter.

## Checks / DoD
- `cd frontend && npm run lint && npm run build` verdes.
- Chrome 100% zoom (localhost:3001, cred de teste `.test-login.local.md`):
  `document.documentElement.scrollHeight <= window.innerHeight` = true nas telas quentes.
- /leads com ≥9 linhas visíveis em 1080p (após 02; neste plano: aferir que cards atuais
  já ganharam ~2 por dobra).
- /dev/pele: 4 peles × claro/escuro sem quebra; trocar tema NÃO muda métrica nenhuma.
- Landing pixel-igual (antes/depois).
- FRONTEND.md atualizado; fiscal reprovando `font-size:px` em pele.

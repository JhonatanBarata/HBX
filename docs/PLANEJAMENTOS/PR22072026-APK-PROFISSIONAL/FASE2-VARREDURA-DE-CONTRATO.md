# Fase 2 — varredura de contrato (APK)

**Lei do dono (22/07):** "A sempre. Remova o que não tiver contrato e planeje dentro."
Não é decisão caso a caso. Sem contrato = sai. Sprint novo nasce DENTRO do contrato.

**Sem contrato =** aparência decidida no lugar de uso: hex solto, `style=` inline, SVG desenhado à
mão fora do catálogo, folha de estilo injetada em runtime, seletor que pinta por posição no DOM.

**Regra que não pode ser quebrada nesta fase: tokenizar ≠ repintar.** O objetivo é mudar a FONTE DA
VERDADE, não a aparência. Mesmos pixels. Onde o hex solto divergir de um token existente, a
convergência é mudança visual — vai LISTADA pro dono, nunca silenciosa. Ver
`ajustar-tela-nao-reconstruir`: "arrume" nunca foi "reconstrua".

---

## Inventário (contado em 22/07, não estimado)

| Arquivo | Sem contrato |
|---|---|
| `main/assets/app/app.css` | ~45 hex soltos fora dos blocos de token |
| `logistica/.../mobile-contract.js` | folha de estilo injetada em runtime (`createElement("style")`, l.90) |
| `logistica/.../offline-controls.js` | 2ª folha injetada (l.10) + 20 hex + 1 SVG à mão |
| `logistica/.../app.js` | 4 `<svg` fora do catálogo + 3 `style=` inline + 12 hex |
| `vendas/.../app.js` | 5 `style=` inline + 1 `<svg` fora do catálogo |
| `logistica/.../opening.html` | 35 hex + 7 SVG + folha própria |
| `vendas/.../opening.html` | 37 hex + folha própria |
| `index.html` (×2) | 2 hex |
| `app.css` | `var(--text)` em 2 regras — token que NÃO EXISTE, cai calado no herdado |

Duas folhas injetadas em runtime são a causa raiz registrada em `css-segunda-folha-anula-edicao`
("edito o CSS e não muda nada"): elas entram DEPOIS da folha central e vencem.

## Os 45 hex soltos não são 45 problemas — são 6 contratos faltando

1. **Tinta sobre a marca** — `#17210f #132000 #1d2b0a #24370d #1b290b #142000 #1c2a0c #082610`
   (claro) e `#dfffb0 #102000` (dark). Dez tons fazendo UMA coisa: a cor da letra em cima do verde.
   Ninguém escolhe 10 pretos-esverdeados de propósito — é a prova de que não havia contrato.
   → `--on-brand` + par dark.
2. **Tinta sobre cor sólida** — `#fff` em `.btn-danger` (l.472) e no selo do editor de cliente
   (l.532), mais `--route-icon-on` criado agora no S5. → `--on-solid`.
3. **Fundo do mapa** — `#e5ece1` (l.298, 614, 615), `#45516e` (l.616), `#cbd5c6` (l.618).
   → `--map-canvas` + par dark.
4. **Vidro sobre o mapa** — chip de GPS e botão "seguir": `rgba(255,255,255,.9)`, `#162033`,
   `#243047`, `#f4f7ff`, `rgba(11,16,32,.86)` (l.631-638). Sobre o mapa a regra de tema do app não
   vale — é o único caso legítimo de paleta própria aqui, mas tem que ser DECLARADA.
   → `--glass-surface` / `--glass-ink` + par dark.
5. **Hero navy** — `#111a2e #0b1020 #b9c3d8 #bde96f` (l.211-213). **`#0b1020` É o `--navy`** que já
   existe no `:root` (l.12). Token existente sendo ignorado. → usar `--navy` + `--navy-ink`.
6. **Os 3 tokens que o S5 acabou de criar** — `--route-icon-nav: #0e6fd6`, `--route-icon-stop:
   #c0392b`, `--route-icon-on: #fff` (l.362-369): nasceram sem par dark e duplicando `--info` /
   `--danger`. Contrato mal feito conta como sem contrato. → consolidar nos tokens existentes.

## A tela de abertura é caso à parte — "declarar", não "converter"

`oobe-casca-isolada` já registra a decisão: casca de abertura tem visual PRÓPRIO, constante, e
**não** usa tokens do sistema. Isso É um contrato — só nunca foi escrito, então virou 72 hex
espalhados. A correção não é puxar pros tokens do app: é **declarar a paleta da casca no topo do
próprio arquivo** e o resto referenciar. Casca continua isolada, e para de ser espalhada.

---

## Sprints

| # | O que | Arquivos |
|---|---|---|
| **C1** | Escrever o contrato: 6 famílias de token + pares dark no `:root`. **Nada muda na tela.** | `app.css` |
| **C2** | Aplicar: os ~45 hex soltos passam a apontar pro token. Mesmos pixels; convergências listadas. | `app.css` |
| **C3** | Matar as 2 folhas injetadas em runtime — regras migram pra `app.css`. | `mobile-contract.js`, `offline-controls.js`, `app.css` |
| **C4** | SVG à mão (4+1+1) → catálogo `icon()`. `style=` inline (9) → classe. | `logistica/app.js`, `vendas/app.js`, `offline-controls.js` |
| **C5** | Abertura: paleta declarada no topo dos 2 `opening.html`; casca segue isolada. | `opening.html` ×2 |
| **C6** | Faxina + **trava**: matar `var(--text)` morto e pôr lint que reprova hex novo em `EntregaShell/`. | `scripts/`, CI |

**C6 é o que impede tudo voltar.** O `check-pele.mjs` hoje não olha pra `EntregaShell/` — foi por
isso que 45 hex entraram sem ninguém ver. Sem a trava, em 3 semanas tem 45 de novo.

## Ordem e travas de execução

- **C3 só depois do worker B fechar** — ele está no `mobile-contract.js` agora.
- **C1+C2 = um worker só** (mesma folha, e separar geraria conflito).
- **C4 e C5 podem ir em paralelo** (arquivos disjuntos entre si e dos demais).
- **C6 por último**, senão reprova o trabalho em andamento.
- Dono tem trabalho NÃO COMMITADO em `app.css` e `app.js` (bloco "Entregar"). Workers recortam os
  commits em volta, como o worker A já fez com sucesso nesta mesma pasta. **Ninguém dá `git stash`**
  (regra dura: stash é global do repositório e já trocou trabalho entre agentes — ver
  `nao-orquestrar-subagentes-paralelos-no-mesmo-repo`).
- Sem branch, commit local, sem publish, sem teste em aparelho.

# Worker E — RESULTADO (C5 — paleta da casca de abertura, C6 — trava do lint)

Arquivos tocados (só os autorizados):
- `EntregaShell/app/src/logistica/assets/app/opening.html` (C5)
- `EntregaShell/app/src/vendas/assets/app/opening.html` (C5)
- `frontend/scripts/check-pele.mjs` (C6)

Commits:
- `54f016d4` — C5: declara a paleta da casca nos 2 `opening.html`.
- `c94040c5` — C6: estende `check-pele.mjs` pro `EntregaShell/`.

`app.css` **não foi tocado** (é do worker C, em edição ao vivo durante toda esta sessão) — só lido
pra calibrar a regra do C6 e pra conferir o achado do `var(--text)` pedido no fim.

---

## C5 — paleta da casca declarada, mesmos pixels

Contrato: a casca de abertura tem visual próprio e constante (`oobe-casca-isolada`) — não puxa pros
tokens do app (`--brand`/`--surface`/`--ink` de `app.css`). O que faltava era **escrever isso**: hoje
cada arquivo já tinha um `:root{}` no topo do `<style>`, mas só com ~10 variáveis — o resto da cor
(25 valores distintos em `logistica`, 23 em `vendas`) estava solto pelo corpo do CSS, nos atributos
`fill=`/`stroke=` do SVG inline, e até dentro do `<script>`.

**O que mudou:** o `:root{}` de cada arquivo cresceu pra ter **uma variável por cor usada** (nome
semântico pelo papel — `--pulse-ink`, `--node-off/--node-on`, `--headline-mid/-end`,
`--module-ready-ink`, `--handoff-light/-dark`, etc.), e todo o resto do arquivo passou a referenciar
`var(--nome)` em vez do hex cravado — CSS, atributos de SVG (`fill="var(--white)"` funciona em
qualquer engine Chromium/WebView moderna) e o próprio `<script>` inline (a função `complete()` que
seta `--handoff` em runtime agora lê o valor de `--handoff-light`/`--handoff-dark`/`--bg` via
`getComputedStyle(root)` em vez de ter os 3 hex duplicados em string JS).

**Verificação de que não sobrou hex solto** (script descartável, não faz parte do repo): contei
todos os `#hex` de cada arquivo antes/depois e which ficam dentro do bloco `:root{}` (via
brace-depth, mesma lógica que entrou no lint) — resultado: **100% dos hex remanescentes estão
dentro da declaração da paleta** (27/27 em `logistica`, 24/24 em `vendas`), zero hex solto no corpo.

**Duas divergências que decidi consolidar** (declarando aqui como o contrato manda — "mesmos
pixels, mas se convergir hex repetido, listar"):
- Em `vendas/opening.html`, os gradientes `<linearGradient id="flow">` e `id="logo">` (usados nos
  SVGs de rota e no anel do hub) tinham `#2e5bff`/`#00e5ff`/`#9aea35`/`#8a5cff` **cravados de novo**,
  em vez de referenciar `--blue`/`--cyan`/`--lime`/`--violet` que **já existiam** no `:root` — a
  mesma cor, escrita duas vezes. Agora apontam pro token existente. Valor idêntico, zero mudança
  visual, só parou de duplicar a fonte da verdade.
- No mesmo arquivo, o `#050713` do `.handoff` (linear-gradient) é exatamente o valor de `--bg` — em
  vez de criar uma variável nova só pra repetir o mesmo hex, reaproveitei `var(--bg)`.
- Não achei nenhum caso de "10 tons fazendo 1 trabalho" (como a família 1 do `app.css`) dentro dos
  `opening.html` — cada hex distinto realmente é uma cor com papel próprio na animação (rota do
  caminhão ≠ rota da moto ≠ pacote), não uma bagunça de variações acidentais.

**Duas exceções que não dá pra tokenizar** (documentadas em comentário no próprio arquivo, não só
aqui):
- `<meta name="theme-color" content="#...">` — atributo de HTML lido pelo Android antes de qualquer
  CSS existir; não aceita `var()`. Mantido literal, com comentário dizendo pra manter em sincronia
  manual com `--bg` se a paleta mudar um dia.
- As próprias variáveis `--handoff`/`--handoff-light`/`--handoff-dark` dentro do `:root` continuam
  com hex — são a **definição** da paleta, não um uso dela (é o ponto (b) da isenção do C6).

## C6 — a trava: `check-pele.mjs` agora cobre `EntregaShell/`

O script vive em `frontend/scripts/check-pele.mjs` (chamado por `frontend/package.json` → script
`lint`) — não achei um `scripts/check-pele.mjs` na raiz do repo, é este mesmo. Ele escaneava só
`frontend/src/**`; `EntregaShell/` nunca foi tocado, e foi exatamente essa lacuna que deixou os 72
hex do `opening.html` (e o resto do inventário) entrarem sem ninguém ver.

**Duas regras novas, DURAS** (reprovam a build na hora, sem "catraca" — diferente do R4 do
frontend, que tolera uma migração gradual):

- **R6 — hex solto** em `EntregaShell/app/src/**.{css,js,html}`. Ao contrário do R1 do frontend, o
  R6 **não tem a isenção de "neutros"** (`#fff`/`#000`) — no APK até branco/preto têm que nascer de
  `var()`, porque o próprio inventário (família 2 do `app.css`) trata `#fff` solto como
  "sem contrato" que precisa virar `--on-solid`.
- **R7 — `style="..."` inline**, sem exceção nenhuma (nem dentro do bloco de token — lá não faria
  sentido ter um atributo HTML dentro de CSS puro).

**Isenções do R6 — só 3, todas declaradas e comentadas no topo do arquivo:**

| # | O que isenta | Onde |
|---|---|---|
| (a) | Blocos **puros** de definição de token: `:root { ... }` e `:root[data-theme="dark"] { ... }` — via contagem de chaves (brace-depth), não por marcador de comentário, porque `app.css` não é meu arquivo pra eu inserir `/* pele-allow */` nele. **Não cobre seletor composto** (`:root[data-theme="dark"] .chip{...}`) — aquilo é regra de componente que ainda tem hex sem contrato, não dicionário. | `main/assets/app/app.css` (por regex de caminho, funciona pra qualquer `assets/app/app.css` futuro) |
| (b) | A paleta da casca declarada no `:root{}` do `<style>`, mesma lógica de brace-depth. | Os 2 `opening.html` (por regex de caminho) |
| (c) | `<meta name="theme-color" content="#...">` — não é atributo de HTML que aceite `var()`, isenção técnica, não visual. Na prática cobre qualquer arquivo com essa meta tag (também os 2 `index.html`, que têm o mesmo tag — não é exclusivo dos `opening.html`, é a mesma limitação técnica em qualquer lugar). | Qualquer arquivo |

**Como validei sem rodar contra o repo inteiro esperando verde:** escrevi um harness descartável
(fora do repo, só em scratchpad) que reusa as mesmas regras linha por linha e rodei **só** contra
`EntregaShell/`, separando por arquivo:

```
R6 (hex) total: 35        R7 (style=) total: 8
  app.js (logistica): 10    app.js (logistica): 3
  mobile-contract.js: 1     native.js: 1
  offline-controls.js: 11   app.js (vendas): 4
  app.css: 13
```

Meus dois arquivos (`opening.html` ×2): **zero hits de R6 e zero de R7** — confirma que o C5 saiu
limpo sob a régua do C6. O resto (`app.js`, `mobile-contract.js`, `offline-controls.js`, `app.css`)
é trabalho de outros workers em voo nesta mesma sessão (B no `mobile-contract.js`, C no `app.css`,
D avaliou e manteve os `style=`/SVG de `app.js` por razão documentada em `D-RESULTADO.md`) — não é
regressão minha, é o estado real ainda não fechado. **Não rodei `node ./scripts/check-pele.mjs`
completo esperando ele passar** — só `node --check` (sintaxe) e este harness isolado.

Também rodei o `check-pele.mjs` oficial uma vez (de dentro de `frontend/`) só pra confirmar que ele
**executa sem estourar exceção** (sai com código 1 por causa das violações pré-existentes do
frontend + as do APK em voo — isso é esperado, não é um bug meu). O gate final de verdade (rodar
puro, esperando 0) fica pro orquestrador, como pedido.

`frontend/package.json` **não precisou mudar** — o script `lint` já chama `check-pele.mjs`, não
criei comando novo.

## `var(--text)` morto em `app.css` — achado, NÃO editado (não é meu arquivo)

Conferido agora (linha pode ter deslocado desde a varredura original — `app.css` está em edição
ativa por outro worker durante toda esta sessão):

```
$ grep -n "var(--text)" EntregaShell/app/src/main/assets/app/app.css
504: .ddd-input { ... color: var(--text); }
505: .ddd-preview { font-size: 1.02rem; font-weight: 600; color: var(--text); }
788: .route-cancel-icon, .route-nav-external { ... color: var(--text); ... }
```

`--text` **não existe** em nenhum `:root`/`:root[data-theme="dark"]` do arquivo (busquei
`--text\s*:` no arquivo inteiro — zero declarações). É herança silenciosa: o navegador cai pro
`color` herdado do ancestral (`body`/`.stage`, etc.), então visualmente "funciona por acidente", não
por contrato. O inventário original contava **2** regras; hoje são **3** (`.ddd-input`,
`.ddd-preview`, `.route-cancel-icon`/`.route-nav-external` — este último compartilha a declaração
com 2 seletores). Pode ser que o worker C já tenha adicionado o 3º uso durante esta sessão, ou a
contagem original tenha sido por regra-CSS e não por seletor — de qualquer forma, o fato central se
mantém: **token que não existe, sem par dark, três lugares confiando na herança**. Passo pro
orquestrador decidir se vira `--ink` (o token real de texto do app) ou se ganha um par próprio.

## Riscos e pendências

- **Risco:** nenhum identificado nos 2 `opening.html` — mudança é 1:1 (hex → var do mesmo valor),
  `node --check` não se aplica a HTML mas revisei visualmente cada substituição linha a linha, e o
  script inline (`complete()`) foi ajustado de forma equivalente (lê o mesmo hex via CSS em vez de
  string JS duplicada). Não testei no aparelho (fora do escopo pedido).
- **Pendência para o orquestrador:** rodar `cd frontend && npm run lint` (ou só
  `node ./scripts/check-pele.mjs`) como portão final, depois que B/C/D fecharem — hoje ele reprova
  de propósito (R6 em `app.js`/`mobile-contract.js`/`offline-controls.js`/`app.css`, mais as
  violações pré-existentes do frontend que já existiam antes desta sessão, ex.: `kit.css` linha
  1546+ e `route-builder.module.css`, nada relacionado ao APK).
- **Pendência para quem fechar o `app.css` (worker C ou o dono):** os 3 usos de `var(--text)`
  listados acima — ver se o C1/C2 já cobre isso ou se fica pra depois.
- A isenção (c) do meta `theme-color` é ampla de propósito (qualquer arquivo, não só os 2
  `opening.html`) — decisão minha, documentada no comentário do próprio `check-pele.mjs`, porque a
  limitação é técnica (atributo de HTML) e não visual; sem essa amplitude os 2 `index.html`
  ficariam com uma violação impossível de corrigir.

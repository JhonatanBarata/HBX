# PEDIDO-DE-PELE — como encomendar um tema do HBX (a qualquer IA)

> Cole o bloco abaixo na IA, escreva a vibe, e exija UM arquivo só.
> A precisão vem da arquitetura: a superfície dela é fechada — fora
> das lacunas não existe lugar pra colar nada, e o `check-pele.mjs`
> reprova o build de qualquer coisa cravada fora de pele.

---

## O PROMPT (copiar daqui pra baixo)

Você vai criar uma PELE para o sistema HBX. Responda com **UM ÚNICO
arquivo** chamado `theme-<nome>.css`. PROIBIDO: HTML, telas, classes
novas, textos, estrutura, JavaScript. Qualquer coisa fora do contrato
será descartada.

**VIBE:** _[descreva em 2–3 linhas: cores, personalidade, cantos,
vidro ou sólido, fonte, movimento. Ex.: "rosa e lilás, elegante e
suave, cantos bem arredondados, sombras difusas, serifada delicada
nos títulos, movimento macio"]_

**FORMATO OBRIGATÓRIO (3 blocos, todos escopados em `[data-theme="<nome>"]`):**

1. **Bloco A — tokens CLARO**: `[data-theme="<nome>"] { … }` preenchendo
   TODAS as variáveis do contrato (lista canônica e comentada:
   `frontend/src/app/hbx-theme/skeleton.css` — cores `--hbx-*`, texto,
   linhas, `--hbx-action-ink`, avatar, fontes `--font-*` (Google Fonts já
   carregadas: Plus Jakarta Sans, IBM Plex Mono, Sora, Fraunces, Lora),
   raios `--radius-*`, sombras `--shadow-*` + `--shadow-inset`, blur,
   glows, movimento `--motion-*`).
2. **Bloco A — tokens ESCURO**: `[data-theme="<nome>"][data-theme-mode="dark"] { … }`
   com a mesma paleta no escuro (texto SEMPRE com contraste alto).
3. **Bloco B — camada de vestir** (opcional, é onde mora a alma):
   reestilizar SOMENTE estas classes centrais, SÓ propriedades visuais
   (background, border, border-radius, box-shadow, blur, filter,
   text-transform, letter-spacing, font-weight, padding leve):
   `.side .topbar .panel .kpi .kpi-icon .plan-card .user-card .nav-item
   .nav-item.active .btn-teal .btn-ghost .round-btn .search .field-dark
   .select-dark .tag .tbl .avatar .bars .bar .funnel-bar .meter-fill
   .hbx-modal .hbx-pop .hbx-drawer`
   Exemplos reais prontos: theme-aurora.css (vidro), theme-ember.css
   (sólido quente), theme-rose.css (suave e arredondada).

---

## Depois que a IA responder (3 passos)

1. Salvar como `frontend/src/app/hbx-theme/theme-<nome>.css`.
2. 1 import no fim do `globals.css` + 1 entrada no `PELES` de
   `components/hbx/theme-attributes.tsx` (key + label).
3. Abrir **/dev/pele**, trocar pra pele nova no seletor e julgar
   (claro E escuro). Reprovou? Ajustar valores no próprio arquivo.

Ícones são ESTRUTURA (catálogo central no shell) — pele não mexe no
desenho, só na cor/peso via tokens.

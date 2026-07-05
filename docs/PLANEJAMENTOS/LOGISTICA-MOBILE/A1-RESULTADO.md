# A1 — RESULTADO (P0 navegação mobile + consertos B1/B2)

Sprint **A1** do plano `PLANO-APPIFICACAO.md`. Trabalho LOCAL no `master`, NÃO publicado.
`git add` por caminho (nunca `-A`). O arquivo `leads/page.client.tsx` NO tree é WIP do dono — **não tocado**.

## O que mudou (arquivo:linha)

### 1. Aba "Rota" → o APP `/entrega`  ✅
`frontend/src/components/hbx/mobile-tab-bar.tsx`
- `LOGISTICA_TAB.href` de `/logistica` → **`/entrega`** (linha ~31). A aba "Rota" da barra
  inferior agora abre o app de entrega (skin entrega), não a tela ERP do dashboard.
- `ROUTE_TO_TAB` agora mapeia `/entrega` → `"logistica"` (~46-52); nova `resolveActiveTab()`
  (~55-58) acende a aba "Rota" em `/entrega` E qualquer subrota (`/entrega/clientes` etc.).
- O `/logistica` (gestão ERP) **continua existindo** e ficou acessível pela folha "Mais".

### 2. Folha "Mais" ganha os módulos do NÚCLEO-CRM  ✅
`frontend/src/components/hbx/mobile-tab-bar.tsx`
- Nova const `MORE_MODULES` (~37-42): **Empresas** (`/empresas`), **Contatos** (`/contatos`),
  **Produtos** (`/produtos`), **Logística/gestão** (`/logistica`).
- Renderizados no topo da folha "Mais" (~logo após o handle), cada um `.filter(isModuleVisible(...))`
  — **mesmo gate da Sidebar** (ent + user + mods) — com ícone das `ICONS` (`empresas`/`contatos`/
  `produtos`/`logistica`, chaves já existentes). Separador antes de Relatórios/Config/Tutorial.
- Resultado: dá pra cadastrar cliente/produto pelo celular (destrava o passo-a-passo do teste).

### 3. B1 — topo mobile sem overflow  ✅
`frontend/src/app/hbx-theme/mobile.css` (seção SHELL+ABAS, dentro de `@media (max-width: 860px)`)
- Diagnóstico: a fileira de ícones redondos (`.top-actions`) tinha ~7-8 botões de 32px + a
  "linha de bolinhas" eram os `.bot-type-dots` (posicionados absolute ABAIXO do ícone do bot).
  Estourava a largura → título truncava pra "Lo…".
- Fix centralizado (só media-query, desktop intocado byte-a-byte):
  - `.page-id { flex: 1 1 auto; min-width: 0 }` e `.top-actions { flex: 0 0 auto }` — o título
    flexiona/trunca e a fileira não cresce.
  - **Colapso pro essencial**: `display:none` no mobile para os sinalizadores de STATUS
    (`.wa-action-btn` = WhatsApp/localização/bot/e-mail), o wrapper do bot (`.bot-signal-wrap`,
    que carrega as bolinhas), o "+" novo lead (`.round-btn.add`) e o toggle claro/escuro
    (`[aria-label="Alternar claro/escuro"]` — já disponível na folha "Mais").
  - Sobra na topbar mobile: **sino + atendimento + avatar** (+ "Como usar" quando há tour). Cabe
    sem estourar; sem "linha de bolinhas".

### 4. B2 — resumo sem travessão  ✅
`frontend/src/app/(app)/logistica/page.client.tsx` (`ResumoDiaCard`)
- Novo estado `loading` (setado no `load()`, limpo no `.finally`).
- Os 3 stats: **skeleton** (`.log-resumo__skel`, shimmer) enquanto carrega; ao carregar mostram
  `0` (entregues) e `R$ 0,00` (recebido / a receber via `fmtMoneyLog(... ?? 0)`) — **nunca mais `—`**.
`frontend/src/app/hbx-theme/screens.css` (~após `.log-resumo__num`)
- Nova classe `.log-resumo__skel` reusando o keyframe central `dn-shimmer` (kit.css); só tokens.

## Checks
- `npx tsc --noEmit` → **exit 0** ✅
- `node scripts/run-next-build.js` (npm run build) → **exit 0** ✅ (todas as rotas compilaram:
  `/entrega`, `/logistica`, `/empresas`, `/contatos`, `/produtos`).
- `node scripts/check-pele.mjs` → exit 1, **mas as 3 famílias de violação são PRÉ-EXISTENTES e de
  arquivos que NÃO toquei nas linhas apontadas**: `screens.css:1564/1579` (`.vnd-segbtn`/`.vnd-stats`
  do refab Vendas do dono — confirmado idêntico em `HEAD`), `bot-builder.css:163`, `whatsapp.css:19-328`.
  Minhas linhas novas (`screens.css` ~3921-3933, `mobile.css`) são 100% token — não geram violação.
  Regra do repo: build quebrando em arquivo que não toquei = WIP do dono, reportar não consertar.

## Smoke mobile
- Não executado autenticado: porta 3001 já ocupada por dev server do dono (não matei o processo) e
  login exige credencial que, por regra (`nao-decidir-sem-o-dono`), o dono digita. Verificação foi
  estática (tsc + build verdes + revisão). Screenshot iPhone fica pro dono/A6.

## Sobras / notas pro dono
- `/entrega` não está no `META` do `app-shell.tsx` (título/crumb/active do shell desktop) — de
  propósito: o app `/entrega` tem shell/skin próprio (plano A2). Fora do escopo A1.
- As violações check-pele pré-existentes (Vendas refab + whatsapp.css + bot-builder) seguem no tree.

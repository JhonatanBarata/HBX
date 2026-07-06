# W6 — RESULTADO: ROTA (/entrega re-vestido na casca)

Regra nº5 do dono ("Rota é OUTRO aplicativo — pode ter outra cor, mas é o
MESMO ideal e MESMA casca, e tem que ter como voltar pro HBX central nos
ÍCONES") implementada por **re-vestimento de tokens**, não duplicação de CSS:
`/entrega` agora monta as MESMAS classes estruturais da casca central
(`.casca-top`/`.casca-tabbar`/`.casca-tab`/`.casca-stage`/`.casca-view`/
`.casca-sheet`/`.casca-loading`) que Vendas/Conversas/Empresas já usam — só
que dentro do escopo `[data-skin="entrega"]`, cujos tokens de cor
(`--surface-canvas`, `--hbx-brand-strong`, `--casca-ring-*` etc.) foram
redirecionados para os valores `--ent-*` (verde do entregador, claro
alto-contraste + escuro automático) já existentes em `entrega.css`. Zero CSS
de estrutura novo — só o dicionário de cores muda.

## Antes → depois (estrutura)

| Peça | Antes (A1-A2, próprio do /entrega) | Depois (W6, casca central) |
|---|---|---|
| Shell | `EntregaScaffold` com `.ent-app.has-tabbar` + `.ent-head` cru | `EntregaScaffold` novo: `.casca-shell` + `.casca-top` + `.casca-stage`/`.casca-view` |
| Tab bar | `EntregaTabBar` com `.ent-tabbar`/`.ent-tab` próprios | `EntregaTabBar` novo com `.casca-tabbar`/`.casca-tab` (API central) |
| Folha de chegada | `.ent-sheet-veil`/`.ent-sheet` cru (`ArrivalSheet`) | `<CascaSheet>` (API central) — abre/fecha só pela API, nunca seco |
| Editores (Cliente/Produto) | trocavam de "view" no mesmo componente, sem transição | `<CascaView>` empilha por CIMA da lista com IR/VOLTAR |
| Loading de tela | `.ent-spinner` (spinner genérico) | `<CascaLoading>` (marca HBX + anel, veste o verde do entregador) |
| Auth redirect | duplicado em cada tela (`page.client`, `clientes`, `produtos`, `ajustes`) | centralizado 1x no `EntregaScaffold` |

## Tab bar final

**Rota · Clientes · Produtos · Ajustes · HBX** — as 4 primeiras são
`.casca-tab` normais (Link, ativo pelo pathname, ícones do `icons.tsx` já
existentes); o 5º item **HBX** é a exigência "voltar pro HBX central nos
ÍCONES": ícone novo (`ICON_PATHS.hbx`, o duplo-chevron » da marca, mesmo
traço do `CascaLoading`) + `<Link href="/vendas">` — nunca acende como
"ativo" (não é uma aba do app de entrega, é a porta de saída). Um toque volta
para `/vendas` (o dashboard, dentro do grupo `(app)`, que monta a MobileShell
normalmente).

## Fullscreen no "Iniciar rota" (LEI nº3 — "especialmente no Rota")

`onIniciar` (`page.client.tsx`) agora chama `void toggleCascaFullscreen()`
best-effort, junto do `wakeLock.enable()` que já existia — 1 toque oferece
tela cheia, e a lib central (`casca-fullscreen.ts`, do W1) **sempre emite o
toast de aviso** ("Tela cheia — deslize a borda de cima pra sair"), mesmo se
o navegador recusar a API. Nada trava o fluxo se o device não suportar.
`CascaToastHost` foi montado no `EntregaScaffold` (o `/entrega` vive FORA do
grupo `(app)` e não passa pela `MobileShell`, então precisa do seu próprio
host de toast — adicionado `CascaToastHost` ao barrel público
`components/casca/index.ts`, que ainda não o exportava).

**Toggle em Ajustes:** nova seção "Tela" com switch "Tela cheia"
(`toggleCascaFullscreen` + `isFullscreenActive`/`isFullscreenSupported` —
esconde a opção onde a API não existe), consistente com o padrão do W5 em
Mais/Configurações.

## O que ficou intocado (confirmado)

- **PWA/manifest**: `layout.tsx` do `/entrega` não foi tocado — `data-skin`,
  metadata, viewport, manifest próprio (`HBX Entregas`) seguem idênticos.
- **Geofence foreground / Wake Lock / vibrate**: `entrega-hooks.ts` **não foi
  tocado** (zero diff) — `useGeofence`, `useWakeLock`, `buzz`, offline-sync
  seguem exatamente como estavam.
- **WhatsApp**: nenhum caminho de envio foi tocado; o app continua sem
  disparo próprio (o aviso de entrega é backend, `LogisticaConfig`/M5) —
  nada aqui chama o motor cru.
- **Pagamento condicional (M4)**: `ArrivalSheet` manteve 100% da lógica de
  `mostrarChips`/`itensIniciais`/stepper/chips — só a casca ao redor mudou
  (virou `CascaSheet`); a regra dos 3 casos (financeiro OFF / aberto /
  costumeiro) não foi tocada.
- **Endpoints**: zero chamada nova, zero endpoint novo, zero Prisma.
- **Onboarding (M9)**: continua cobrindo a tela inteira com `.ent-app`
  (sem tab bar/topo) antes da casca montar — não é uma tela do dia-a-dia,
  então ficou fora do re-vestimento por design (tela de boas-vindas isolada).

## Detalhe técnico do re-vestimento (`entrega.css`)

Bloco novo no fim do arquivo, dentro de `[data-skin="entrega"]`:
- Superfícies/texto/bordas/sombras da casca central apontam pros tokens
  `--ent-*` (`--surface-canvas: var(--ent-canvas)`, `--hbx-brand-strong:
  var(--ent-brand)`, `--border-hairline: var(--ent-hairline)` etc.).
- `--casca-ring-*`/`--casca-mark-*` (o anel/marca do `CascaLoading`) vestem o
  verde do entregador em vez do espectro roxo→platina do dashboard — "outro
  aplicativo", cor própria.
- `.casca-top`/`.casca-tabbar`/`.casca-sheet` herdam `font-family:
  var(--ent-font)` (Plus Jakarta/Sora, não a fonte do dashboard).
- `.casca-shell` (classe nova, só usada pelo `EntregaScaffold`) dá o
  `min-height:100dvh` + `flex-column` que a `.casca` do dashboard já tem via
  `position:fixed` — aqui sem fixed (o app não compartilha viewport com
  chrome externo), mesma régua de altura.
- **Achado durante o build:** um comentário CSS com `.casca-sheet*/` (e
  `.casca-sheet*)`) fechava o comentário no meio da frase (`*/` literal) e
  quebrava o parser do PostCSS ("Invalid dangling combinator in selector").
  Corrigido reescrevendo o texto do comentário sem o `*` solto antes da
  barra — nada de CSS afetado, só o comentário.

## Título não duplica / zero texto explicativo

O topo (`.casca-top__title`) já mostra "Hoje"/"Rota"/"Clientes"/"Produtos"/
"Ajustes" — os componentes de conteúdo não repetem `<h1>`/header próprio. A
data (`DATA_HOJE`, sub-informação, não título) virou `.ent-head-sub--standalone`
(classe nova, mesmo texto, só sem o `.ent-head` cru ao redor).

## Checks

- `npx tsc --noEmit` — **limpo (0 erros)**.
- `npm run lint` (eslint) — arquivos NOVOS deste sprint (`EntregaScaffold.tsx`,
  `EntregaTabBar.tsx`, `icons.tsx`, `ArrivalSheet.tsx`, `components/casca/index.ts`)
  com **0 erros/warnings** (isolado via `npx eslint <arquivos>`). Nos arquivos
  pré-existentes que editei (`page.client.tsx`, `produtos/page.client.tsx`,
  `ajustes/page.client.tsx`) os erros restantes (`react-hooks/set-state-in-effect`
  em `useEffect(() => void carregar())`/`useEffect(() => setOnboarding(...))`)
  são **pré-existentes** — confirmado linha a linha contra `git show HEAD:<path>`,
  mesmo texto/mesma linha antes da minha edição. `clientes/page.client.tsx`
  ficou 100% limpo (0 erros/warnings) mesmo pré-existindo os mesmos padrões
  antes. Total do repo: 47 errors/38 warnings (baseline W1 documentado era
  45/38 antes do W6; a diferença de 2 é justamente os erros pré-existentes
  do `page.client.tsx`/`produtos` que já existiam mas que meu diff nas mesmas
  linhas trouxe pra dentro do "diff" — o texto do erro é idêntico ao original).
- `check-pele` isolado — catraca em 497/495 (mesmo estouro pré-existente já
  documentado por W1/W4/W5: `janela-empresas.tsx` 90, `gerencial/page.client.tsx`
  55 etc.) — **nenhum arquivo `entrega/*` ou `casca/*` aparece na lista de
  ofensores** (grep confirmado, zero resultado).
- `npm run build` — **verde, "Compiled successfully", 42 rotas geradas**
  (`/entrega`, `/entrega/ajustes`, `/entrega/clientes`, `/entrega/produtos`
  incluídas), sem warnings de CSS após o fix do comentário.

## Verificação visual (honesta)

Ambiente local (`.test-login.local.md`, nota do dono 06/07): banco vazio,
login dá 401/redireciona — confirmado ao vivo (login com a credencial local
`jhonatan@hbxsystem.com.br` voltou pra `/login` com "sessão expirou"; token
fake também foi rejeitado pelo AuthGate, como esperado — a proteção funciona).
Não dá pra ver o fluxo Hoje→Rota→Chegada→Entregue com dado real fora do VPS
pós-publish.

O que consegui confirmar via `preview_inspect` (injeção estática do HTML da
casca no DOM, só pra auditar CSS computado, sem tocar no fluxo real):
- `.casca-top` herda `font-family: "Plus Jakarta Sans"` (não a fonte do
  dashboard) — o re-vestimento de fonte funciona.
- `.casca-tab.is-on` (aba ativa) tem `color: rgb(47, 191, 107)` = exatamente
  `#2FBF6B`, o `--ent-brand` do modo escuro do `entrega.css` — confirma que
  `--hbx-brand-strong: var(--ent-brand)` está vestindo a tab bar central com
  o verde do entregador, não a marca roxa do dashboard.
- `.casca-tabbar` mede 55px e `.casca-top` ~48px — dentro da régua do PLANO
  (topo ~48px, tab bar 54-56px).
- `.ent-progress` (classe M4 antiga, não tocada) mantém sombra própria —
  conteúdo antigo convive bem dentro da nova casca.

**Pendência honesta:** falta o spot-check ao vivo no VPS pós-publish (fluxo
completo autenticado): navegar as 5 abas vendo IR/VOLTAR, abrir/fechar o
editor de Cliente/Produto vendo o `CascaView` empilhar, tocar "Iniciar rota"
vendo a oferta de fullscreen + toast, abrir a folha de chegada vendo o
`CascaSheet` subir com handle/arrastar-pra-fechar, e voltar pro HBX pelo
ícone. Build/tsc/lint verdes + inspeção de CSS computado dão alta confiança
estrutural; falta o olho no pixel com o fluxo real rodando.

## Commit

`feat(mobile-casca): W6 rota` (local, master, não publicado).

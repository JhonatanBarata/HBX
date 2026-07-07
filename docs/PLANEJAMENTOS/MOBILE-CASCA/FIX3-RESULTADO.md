# FIX3 — RESULTADO: temas+modo em tudo, dark no /entrega, localização mobile

Ordem do dono (print da topbar desktop): "inserir no modo mobile: temas,
escuro e claro (e implanta em tudo); o logística não compartilha o modo
escuro ou claro, ajustar. Localização (bot e email não)".

## 1. Temas + claro/escuro no mobile

Já existia (W5, `mais-sheet.tsx` `TemaSection`) e funcionava — mas a seleção
ativa usava só `is-on` (background/borda que troca na hora), violando a Lei
nº2 (seleção ativa = SEMPRE Glass Pill deslizante). Corrigido: o segmented
Modo (Claro/Escuro) e os chips de Pele agora usam `useGlassPill`/`<GlassPill>`
(o MESMO par hook+componente que `conversas-lista.tsx` já usava para os
chips de filtro) — `glass-pill-track` no container, `glass-pill-item` em
cada botão, `role="tablist"`/`role="tab"`/`aria-selected` pra acessibilidade.
CSS: `.glass-pill-track .mais-m__pele-chip.is-on { background:transparent }`
(mesmo padrão já usado por `.casca-segment__item.is-on`, pra não duplicar
destaque: vidro por trás + chip só troca cor do texto).
Confirmado ao vivo no Chrome (sessão real, `/vendas` autenticado): folha
Mais abre, Glass Pill mede e desliza (`reactProps.landing:true` inspecionado
via `preview_inspect`), chips de pele com pílula própria.

## 2. Auditoria de dark em TODAS as telas da casca

Varredura em `casca.css` (moldura: topo/stage/tab bar/fallback/stub/
transições/sheet/toast/CascaLoading) e nos blocos `.vnd-m__*` (vendas),
`.cvs-m__*` (conversas), `.emp-m__*` (empresas), `.mais-m__*`/`.cfg-m__*`
(mais/config) em `screens.css`: **zero hex/cor hardcoded** fora dos
`color-mix(in srgb, #fff X%, transparent)` de glass-sheen — que são padrão
JÁ estabelecido no `kit.css` central (mesmo truque em `.panel`, `.btn-teal`
etc.), literais neutros isentos pela própria R1 do check-pele.mjs (funcionam
como highlight translúcido nos dois modos, não são cor "presa"). Confirmado
com `preview_inspect`/tokens computados nos dois modos (aurora): `.casca`
`background`/`color` flipam de `#fff+#1e1038` (claro) pra `#0b0620+#f1ecff`
(escuro); `--casca-ring-*`/`--casca-mark-*` do CascaLoading idem. **Nenhum
bug de contraste encontrado** nas telas da casca — a arquitetura W1-W6 já
seguia o método (só tokens, nunca hex em TSX/tela).

O item que "não flipava de verdade" era o **`/entrega`** — ver item 3.

### Bug ao vivo à parte, corrigido no mesmo commit (pedido do coordenador)

O dono reportou em produção: o campo "Segmento" do sheet de Filtros (Buscar)
bugava toda edição em touch real ("parece que tem o capeta nele"). Causa:
`.casca-sheet` (o CONTAINER INTEIRO do bottom sheet, `casca.css`) tinha
`touch-action: none` — posto ali pra habilitar o arrastar-pra-fechar, mas os
handlers de drag (`onPointerDown/Move/Up/Cancel`, `transitions.tsx`) vivem
SÓ no `.casca-sheet__grip` (o puxador). O `touch-action:none` no pai matava o
toque nativo de TODO filho, incluindo os `<input className="field-dark">` do
formulário de filtros. **Fix:** `touch-action:none` movido do `.casca-sheet`
pro `.casca-sheet__grip` — único elemento com pointer handlers de drag.
Auditei o resto da casca (`.casca-view`, `.casca-stage`) por
`touch-action`/`user-select`/`pointer-events` agressivo: as duas outras
ocorrências (`touch-action: pan-y` no card de swipe do Foco de Vendas) são
`pan-y` (permite scroll vertical, só restringe swipe horizontal — não é
`none`, não bloqueia toque/edição, sem input dentro). `field-dark` (kit.css)
confirmado 100% central e por token nas 3 peles/2 modos — o bug era
touch-action, não cor.

## 3. Logística (/entrega) agora compartilha o modo com o dashboard

**Causa raiz encontrada:** `entrega.css` tinha `@media (prefers-color-scheme:
dark)` pros tokens `--ent-*` escuros — dependia do SO/navegador do device,
**cego ao toggle do app** (o `data-theme-mode` que `setThemeMode` escreve no
`<html>`). Por isso "não compartilhava": um usuário podia estar em modo claro
no dashboard e ver o /entrega escuro (ou vice-versa) só por causa da
preferência do sistema.

**Fix:** troquei `@media (prefers-color-scheme: dark)` por
`[data-theme-mode="dark"] [data-skin="entrega"]` — o MESMO atributo global
que `theme-attributes.tsx` (`setThemeMode`) escreve no `<html>`, herdado
porque `[data-skin="entrega"]` vive dentro do MESMO documento (o
`/entrega/layout.tsx` só aninha `<div data-skin="entrega">` dentro do
`RootLayout`, que já roda o `THEME_BOOT` inline no `<head>` pra TODAS as
rotas — nenhum layout próprio de tema no /entrega). Claro alto-contraste
continua o padrão (mobile no sol).

**Toggle:** adicionado em `EntregaAjustes` (`/entrega/ajustes`), seção
"Tela", ANTES de "Tela cheia": usa a MESMA `setThemeMode`/`subscribeToThemeMode`
(`theme-attributes.tsx`/`shell.tsx`) que o Mais do dashboard usa — nenhuma
lógica 2ª, nenhum estado próprio. `useSyncExternalStore` lê `data-theme-mode`
direto do `<html>`.

**Confirmado ao vivo** (Chrome, sessão real autenticada): cliquei "Modo
escuro" em `/entrega/ajustes` → `[data-skin="entrega"]` virou
`background-color: rgb(11,16,23)` (`#0B1017`, o token dark de `--ent-canvas`)
na hora, com o verde do entregador vestindo o escuro (screenshot). Naveguei
de volta pro dashboard (`/vendas`) SEM re-tocar o toggle: `data-theme-mode`
continuava `dark` e a tela renderizou em roxo escuro (pele Aurora dark) —
**mesmo estado, uma fonte só**, confirmado nos dois sentidos.

## 4. Localização no mobile

Extraído `toggleGeo`/`geoState` de `shell.tsx` (que era local ao componente
`TopBar`, não exportado) pra lib nova `frontend/src/lib/geo-radar.ts` —
fonte única: `getInitialGeoState`, `hasStoredGeo`, `subscribeGeoUpdated`,
`toggleGeoRadar`. Contrato 100% preservado (mesma `localStorage["hbx:geo"]`,
mesmo `CustomEvent("hbx:geo-updated")` que `leads/page.client.tsx` já
consome) — **zero mudança de comportamento no desktop**, só realocação da
lógica. `shell.tsx` (TopBar) foi atualizado pra consumir a lib em vez de
duplicar (net: -33 linhas).

Item novo na folha Mais (`LocalizacaoRow`, `mais-sheet.tsx`): linha 52px
("Localização no Radar") com tag de estado (`Ativa`/`Aguardando…`/
`Desligada`, reusando a classe central `.tag`/`.teal`/`.warn` — zero CSS
novo). Usa a MESMA `toggleGeoRadar`/`subscribeGeoUpdated` — se o usuário
ligar pelo desktop e abrir o mobile depois (ou o modo Buscar de Vendas
mexer no estado no futuro), a linha reflete via `subscribeGeoUpdated`, sem
2ª lógica. Confirmado ao vivo: tag "Desligada" renderiza
(`reactComponent:"LocalizacaoRow"` via `preview_inspect`); toggle clicado
não ligou porque o Chrome do preview nega geolocalização por padrão em
ambiente headless (comportamento correto — cai no callback de erro, sem
crash, sem erro no console).

Não reflete no modo Buscar de Vendas (indicador discreto) — avaliei e não
fiz: o pedido dizia "se fizer sentido... sem placona", e o modo Buscar já
tem cromo apertado no orçamento de 140px (busca+filtro+stats); adicionar
mais um indicador ali era o risco de placona que a régua do PLANO proíbe.
Fica de fora por ora — trivial de acrescentar depois se o dono quiser
(mesma lib já dá o estado).

## 5. Bot e e-mail não entram no mobile

Confirmado (releitura de `configuracoes.tsx`/W5): a whitelist de
`/configuracoes` mobile só tem Conta/WhatsApp/Equipe/Aparência — bot
builder, IA/assistente, automações, integrações e e-mail da empresa não
estão registrados em `CASCA_SCREENS`, então caem no `CascaFallback` central
se alguém tentar por URL. Nada foi adicionado que rompesse isso.

## Arquivos

- `frontend/src/lib/geo-radar.ts` **(novo)** — fonte única de geolocalização.
- `frontend/src/components/hbx/shell.tsx` — `toggleGeo`/`geoState` (TopBar)
  passou a consumir `geo-radar.ts` em vez de duplicar a lógica.
- `frontend/src/components/casca/screens/mais-sheet.tsx` — Glass Pill no
  Modo/Pele (`TemaSection`) + `LocalizacaoRow` novo, montado na folha Mais.
- `frontend/src/app/hbx-theme/entrega.css` — dark do /entrega migrado de
  `@media (prefers-color-scheme: dark)` pra `[data-theme-mode="dark"]`.
- `frontend/src/app/entrega/ajustes/page.client.tsx` — toggle "Modo escuro"
  (reusa `setThemeMode`/`subscribeToThemeMode`), seção "Tela".
- `frontend/src/app/hbx-theme/casca.css` — fix do bug ao vivo: `touch-action:
  none` movido de `.casca-sheet` (container inteiro) pro `.casca-sheet__grip`
  (só o puxador) — o campo "Segmento" do sheet de Filtros bugava a edição em
  touch real por causa disso.
- `frontend/src/app/hbx-theme/screens.css` — regra `.glass-pill-track
  .mais-m__pele-chip.is-on` (não duplicar destaque quando dentro do track).

## Nota sobre trabalho paralelo

O dono rodou `npm run publish` durante esta sessão (commit
`599782a9 fix(mobile-casca): FIX4 painel de comando...`) e capturou minhas
edições de CSS (`casca.css`, `entrega.css`, `screens.css`) que já estavam no
working tree naquele momento — confirmado comparando `git show HEAD:<path>`
com o conteúdo esperado (o comentário "FIX3 (bug ao vivo, dono)" e o bloco
`[data-theme-mode="dark"] [data-skin="entrega"]` já aparecem no HEAD). Nada
foi perdido; os arquivos `.tsx`/`.ts` (shell.tsx, mais-sheet.tsx,
ajustes/page.client.tsx, geo-radar.ts) seguem pendentes de commit nesta
sessão. Não toquei no bloco `.casca-command` (FIX4, de outro worker/sessão,
já commitado antes de eu começar).

## Checks

- `npx tsc --noEmit` — limpo (0 erros).
- `npm run lint` (eslint) — **85 problems (47 errors / 38 warnings)**,
  idêntico ao baseline documentado por W6 (mesmo total); isolando meus
  arquivos (`npx eslint mais-sheet.tsx geo-radar.ts ajustes/page.client.tsx
  shell.tsx`) restam só 2 erros `react-hooks/set-state-in-effect`
  PRÉ-EXISTENTES em `ajustes/page.client.tsx` (linhas `carregar()`/
  `setOrigin`, confirmado via `git diff` — não são linhas que toquei) + 1
  warning pré-existente em `shell.tsx` (`eslint-disable` órfão, mesma linha
  desde antes desta sessão, `git show HEAD~1` confirma).
- `check-pele` isolado — catraca em **497/495** (mesmo estouro pré-existente
  documentado por W1/W4/W5/W6: `janela-empresas.tsx` 90, `gerencial/
  page.client.tsx` 55 etc.) — nenhum arquivo tocado nesta entrega aparece na
  lista de ofensores.
- `npm run build` — **verde, "Compiled successfully", 42 rotas geradas**
  (`/entrega/ajustes` incluída).
- Verificação visual **AO VIVO** (Chrome, sessão real autenticada, não só
  injeção estática): folha Mais com Glass Pill deslizando + Localização
  "Desligada"; `/entrega/ajustes` alternando dark ao vivo (`#0B1017`
  confirmado via `preview_inspect`); volta ao `/vendas` mantendo o mesmo
  `data-theme-mode` sem re-tocar o toggle — os 3 confirmam o estado
  compartilhado entre dashboard e /entrega.

## Commit

`fix(mobile-casca): FIX3 tema+modo em tudo, dark no /entrega, localização
mobile` (local, master, NÃO publicado — arquivos CSS já foram capturados
pelo publish paralelo do dono antes deste commit; o commit local cobre os
`.tsx`/`.ts` pendentes).

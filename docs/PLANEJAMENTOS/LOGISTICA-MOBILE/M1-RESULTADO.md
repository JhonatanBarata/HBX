# M1 — Shell independente + Design System Entrega — RESULTADO

Sprint M1 do `PLANO.md` executado LOCAL no `master` (NÃO publicado). Escopo: a casca do
app `/entrega` + a pele mobile isolada + o PWA próprio. As telas reais (Hoje/Rota/Chegada)
são o M4 — aqui só a **vitrine** que prova o design system.

## Arquivos criados
- `frontend/src/app/entrega/layout.tsx` — shell da rota FORA do grupo `(app)`. NÃO renderiza
  AppShell/Sidebar/MobileTabBar. Envolve tudo num `<div data-skin="entrega">`. Exporta
  `metadata.manifest = "/entrega/manifest.webmanifest"` (sobrescreve o manifesto global só
  nesta rota) + `viewport` com `viewport-fit=cover`.
- `frontend/src/app/entrega/page.tsx` — server component fino que delega pro client.
- `frontend/src/app/entrega/page.client.tsx` — a vitrine (dado ESTÁTICO): header "Hoje",
  progresso X/N + previsão, `ent-stop-card`, dots de swipe, stepper, chips, actionbar
  (Navegar/Entregue). Já traz prontos, sem ativar: reuso de sessão (`getToken` → sem token
  vai pro `/login`), captura do `beforeinstallprompt` (botão "Instalar"), hook de Screen
  Wake Lock (só liga quando a ROTA iniciar — M3/M4), `navigator.vibrate` no toque.
- `frontend/src/app/hbx-theme/entrega.css` — o Design System Entrega. TODO escopado em
  `[data-skin="entrega"]`. Tokens mobile-first + componentes `.ent-*`.
- `frontend/public/entrega/manifest.webmanifest` — PWA próprio "HBX Entregas".

## Arquivos alterados (mínimo, aditivo)
- `frontend/src/app/globals.css` — +1 `@import "./hbx-theme/entrega.css";` no fim (padrão
  das peles). Nada removido.
- `frontend/scripts/check-pele.mjs` — +1 entrada em `CSS_ALLOWED` (`entrega.css`), mesma
  categoria isenta das peles (é o arquivo de TOKEN onde a Lei permite hex). NÃO afrouxa
  nada de terceiros.
- **NÃO tocados:** `frontend/src/app/layout.tsx` (raiz), `frontend/public/manifest.webmanifest`
  (global "HBX System"). Confirmado no diff (vazio) e ao vivo (`/dashboard` ainda aponta pro
  manifesto global).

## Como o `data-skin` isola das peles (a decisão-chave)
O `THEME_BOOT` do layout raiz seta `data-theme` (aurora/…) no `<html>` — vale pro app todo.
O `entrega.css` NÃO usa nenhum token de pele: dentro de `[data-skin="entrega"]` ele REDEFINE
as próprias CSS vars (`--ent-*`). Como o wrapper carrega esse escopo, as peles do dashboard
não vazam pra dentro e o PeleSwitch (que troca `[data-theme]`) não afeta o app. Reverso
também vale: nenhuma regra do `entrega.css` existe fora do escopo, então o dashboard não muda
em nada.

## Design System — o que ficou
Tokens: tipo base 17px, títulos 24/28, número grande 34px, grade de 8, radius 14–22, alvos
52/60px, transições 180–240ms com curva spring, safe-area (`env(safe-area-inset-*)`). Modo
CLARO alto-contraste por default + ESCURO automático via `@media (prefers-color-scheme:dark)`
DENTRO do escopo. Componentes: `.ent-stop-card`, `.ent-stepper`, `.ent-chips`, `.ent-progress`,
`.ent-sheet` (folha de chegada), `.ent-btn` (primário/secundário/ghost), + `.ent-dots`,
`.ent-actionbar`, `.ent-head`. Respeita `prefers-reduced-motion`.

## PWA / Instalar
Manifest próprio: `name` "HBX Entregas", `short_name` "Entregas", `start_url`/`scope`
`/entrega`, `display` standalone, ícones `any`+`maskable` reusando `/icon.png` e
`/robo-hbx.png`. O `<link rel="manifest">` da rota aponta pra ele (via `metadata` do layout).
SW: reusa o `/hbx-sw.js` já registrado no raiz (NÃO criei SW novo). Botão "Instalar" só
aparece quando o navegador emite `beforeinstallprompt`.

## Checks
- `npm run build` → **exit 0**; `/entrega` no manifesto de build como rota estática (`○`).
- `npx tsc --noEmit` → **exit 0**.
- `check-pele` → **0 violação nos meus arquivos**. (Restam 30 violações DURAS
  PRÉ-EXISTENTES de terceiros — `bot-builder.css`, `screens.css`, `whatsapp.css` — provei
  que existem com o script ORIGINAL do HEAD; fora do escopo M1, não mexi.)
- Ao vivo (dev server do dono na :3001): `GET /entrega` e `/entrega/manifest.webmanifest`
  → HTTP 200; HTML traz o wrapper `data-skin="entrega"`, as classes `ent-*` e o link do
  manifesto próprio. Screenshot no Chrome confirmou a pele (o navegador estava em dark →
  o modo escuro automático acendeu, provando o `@media` no escopo).

## Decisões p/ o dono
1. **`entrega.css` entrou no allowlist do check-pele** (como as peles). É a forma limpa de
   ter os hex num arquivo de token; a alternativa era nomear `theme-entrega.css`, mas o PLANO
   pede `entrega.css` por nome. Reversível numa linha.
2. **Import global no `globals.css`** (não no layout de `/entrega`): o PLANO M1 já prevê isso
   ("o globals do root ainda carrega o CSS do dashboard nesta rota — aceitável na V1"). Se o
   Lighthouse do M9 reclamar de peso, movemos os imports pro layout do `(app)`.
3. **Botão "Instalar" só aparece com `beforeinstallprompt`** (Chrome/Android). iOS não emite
   esse evento — lá a instalação é "Adicionar à Tela de Início" manual; o QR no painel do
   admin (previsto no PLANO) cobre a distribuição.
4. **Wake Lock fica no gatilho, desativado**: a rota é M3/M4. Ligá-lo na vitrine acenderia a
   tela à toa. Deixei `enable()/disable()` prontos.
5. **Auth**: reusei `getToken()` do app (mesmo mecanismo do `(app)`), redirect pro `/login`
   existente. Não inventei auth. Rodando ao vivo NÃO redirecionou (sessão do dono ativa).

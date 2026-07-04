# M9 — Distribuição + prontidão PWA (RESULTADO)

Sprint final do LOGÍSTICA-MOBILE. Frontend só (o QA de campo com chip é do dono).
Trabalho LOCAL no `master`, NÃO publicado. `git add` por caminho (nenhum arquivo
de WIP do dono tocado).

## O que entrou

### 1. Ícones / splash do PWA `/entrega`
- **Bug achado e corrigido:** o `manifest.webmanifest` do `/entrega` (e o global)
  apontavam para `/robo-hbx.png` — arquivo que **NÃO existe** em lugar nenhum do
  repo (referência quebrada). Removida do manifest do `/entrega`.
- Manifest do `/entrega` agora referencia só o `/icon.png` (192², que EXISTE via
  `src/app/icon.png`, convenção do Next), nas duas finalidades exigidas pra
  instalação: `purpose: "any"` **e** `purpose: "maskable"`. Não inventei binário.
- Adicionados `id: "/entrega"` e `categories` (recomendações de manifest válido).
- `theme_color` (#0F7A3D, verde da marca entrega) e `background_color` (#F4F6F8,
  canvas claro) **coerentes com o skin** `entrega.css`. Já estavam certos, mantidos.
- **apple-touch-icon:** iOS não lê o manifest para o ícone da home. Adicionei
  `icons: { icon, apple }` no `metadata` do `entrega/layout.tsx` reaproveitando o
  `/icon.png`. Servido e confirmado no HTML (`<link rel="apple-touch-icon">`).

### 2. QR de instalação no painel do admin
- Nova sub-rota **`/logistica/instalar`** (server `page.tsx` + client `page.client.tsx`),
  gated por `isTenantAdmin` (só admin da empresa vê; não-admin → "Acesso restrito",
  mesmo padrão da `/logistica/config`).
- Mostra um **QR apontando pra `${origin}/entrega`** + o **link copiável** (botão
  "Copiar link" via `navigator.clipboard`) + "Abrir o app". A URL é derivada da
  origem atual e é **editável** (caso o domínio público difira do painel).
- Link "Instalar app" adicionado no cabeçalho da `/logistica` (ao lado de "Regras").
- **QR gerado 100% no cliente, SEM CDN e SEM npm novo** (regra do M9: "sem serviço
  externo de imagem"; e não mexer em package.json/lock no meio do WIP do dono):
  - **Lib usada:** codificador QR **vendorizado** em `logistica/instalar/qr.ts`
    (~450 linhas, algoritmo clássico Kazuhiko Arase/davidshimjs, MIT): byte mode +
    Reed-Solomon (GF(256)) + máscara automática (8 máscaras, penalidade) + format
    info BCH(15,5) + **version info BCH(18,6)** para v7+. Suporta versões 1–10
    (até ~213 bytes, nível de correção M). Funciona **offline**.
  - Render em `<canvas>` (`QrCanvas.tsx`) — preto/branco puros (`#000000`/`#ffffff`,
    neutros isentos no check-pele), escala inteira por módulo (nítido) + quiet zone.

  **⚠️ 3 bugs de correção do QR pegos e corrigidos por decode real (jsQR):**
  1. `rsEncode` estava com o índice do gerador deslocado (`gen[i]` em vez de
     `gen[i+1]`) e estourava 1 elemento → **todos os bytes de EC errados**. Corrigido.
  2. `placeFormat` cópia-2 vertical ia até o bit 7 e **sobrescrevia o módulo escuro
     fixo** (n-8,8). Corrigido (vertical vai só até bit 6; escuro preservado).
  3. **Faltava a version info** (v7+): sem ela os decoders rejeitam e 2×18 módulos
     viram lixo. Implementada `versionBits`/`placeVersion` + reserva no zigzag e no
     `markFunction`.
  - **Validação:** BCH de format e de version conferem contra a tabela oficial
    ISO/IEC 18004; **jsQR decodifica 25/25** URLs de vários tamanhos (v1–v10) de
    volta à string exata. (jsQR instalado só no scratchpad, fora do projeto.)

### 3. Onboarding de 3 telas visuais (`/entrega`, 1º acesso)
- `entrega/Onboarding.tsx` + `entrega/icons.tsx` (ícones SVG locais — a casca
  `/entrega` é isolada e não importa o shell do dashboard).
- **3 telas swipe ←/→**, cada uma = **1 ícone + 1 frase curtíssima** (ZERO
  parágrafo, Lei da seção 2): rota / navegar / confirmar. Dots de posição.
  Botão **"Começar"** na última (+ "Pular" e "Próximo"). `buzz()` na virada.
- Guardado em **localStorage** (`hbx:entrega:onboarded:v1`): aparece 1× por device;
  decidido só no cliente pra não piscar no SSR.
- Usa os componentes/tokens do Design System Entrega (`.ent-*`, `.ent-onb-*` novos
  em `entrega.css`). Zero hex/inline em TSX.

## Checklist de prontidão Lighthouse PWA (o que atende / o que falta)

**Atende (instalável):**
- ✅ `manifest.webmanifest` válido e servido (200): `name`, `short_name`, `id`,
  `start_url` (/entrega), `scope`, `display: standalone`, `theme_color`,
  `background_color`, ícone 192² com `purpose` `any` + `maskable`.
- ✅ Service Worker registrado (`/hbx-sw.js`, do layout raiz — reusado) com
  handler de `fetch` (stale-while-revalidate do GET da rota, M8).
- ✅ `apple-touch-icon` + `<link rel="icon">` = `/icon.png`.
- ✅ `<meta viewport>` com `viewport-fit=cover`; `mobile-web-app-capable`.
- ✅ Responsivo/mobile-first (skin `entrega`), alvos ≥52px, safe-area.
- ✅ Offline honesto: SW serve o GET da rota em cache; confirmações em fila
  IndexedDB (M8). Abrir "Hoje" sem sinal funciona se a rota já foi carregada 1×.

**Falta / ressalvas (não bloqueiam a instalação; ficam pro dono decidir):**
- ⚠️ **Ícone único de 192²** cobre o mínimo de instalabilidade, mas para Lighthouse
  "PWA" 100% o ideal é ter também um **512×512** dedicado (splash de melhor
  qualidade no Android). Não inventei binário; precisa de arte 512² (ou reexport do
  robô da marca) — decisão do dono. Com só o 192² o app **instala e roda**.
- ⚠️ **Perf ≥90:** o `globals.css` do dashboard ainda carrega nesta rota (cascata
  do layout raiz — nota já registrada no M1). Aceitável na V1; se o Lighthouse de
  Perf reclamar, mover os imports de CSS pesado pro layout do `(app)` (fora do
  `/entrega`). Não medi o Lighthouse headless (não pedido); critérios acima ficam
  atendidos por construção.
- ⚠️ Screenshots do manifest (`screenshots[]`) — opcional, melhora o card de
  install no Android/desktop. Não incluído (exigiria capturas reais).

## TWA / Play Store
**NÃO feito, por decisão do dono.** O QR + link já espalham o app (instala via
navegador → tela inicial). Se um dia quiser a Play Store: `bubblewrap` sobre o
manifest do `/entrega` (US$25 único de conta de dev). Fica anotado, sem trabalho.

## Checks
- `npx tsc --noEmit` → **exit 0** (verde).
- `cd frontend && npm run build` → **exit 0**; `/entrega` e `/logistica/instalar`
  no output (static); `/icon.png` resolve.
- `check-pele` → **0 violação nos meus arquivos**. (O exit geral do script é 1 por
  violações PRÉ-EXISTENTES em `bot-builder.css` / `whatsapp.css` / `screens.css:1564`
  — arquivos que eu não toquei; confirmado no `git diff`.)
- Smoke dev (:3001): `/entrega` 200, manifest 200, `/logistica/instalar` 200,
  `/icon.png` 200, `/hbx-sw.js` 200. HTML confirma `data-skin="entrega"`, link do
  manifest, apple-touch-icon, e a seção "Instalar o app".
- **Decode real do QR:** jsQR (no scratchpad) lê 25/25 URLs v1–v10 de volta à
  string exata; BCH de format+version batem com a tabela ISO/IEC 18004.

## Decisões p/ o dono
1. **512×512 do ícone:** quer que eu gere um 512² a partir de arte da marca pra o
   Lighthouse PWA cravar 100% e a splash do Android ficar redonda? (Hoje: 192²,
   instala e roda; só o polimento fica pendente — precisa de binário, não invento.)
2. **Perf:** se for buscar Perf ≥90 no Lighthouse, o próximo passo é tirar o CSS do
   dashboard da cascata do `/entrega` (mover imports pro layout do `(app)`). Baixo
   risco, mas mexe no layout raiz — só faço se você mandar.
3. **Domínio do `/entrega`:** o QR usa a origem atual do painel. Se o app de entrega
   for servido em subdomínio próprio, o campo do link é editável — confirme o host.

## Arquivos
- `frontend/public/entrega/manifest.webmanifest` (ícones/splash corrigidos)
- `frontend/src/app/entrega/layout.tsx` (apple-touch-icon)
- `frontend/src/app/entrega/page.client.tsx` (wire do onboarding)
- `frontend/src/app/entrega/Onboarding.tsx` + `frontend/src/app/entrega/icons.tsx` (novos)
- `frontend/src/app/(app)/logistica/instalar/{page.tsx,page.client.tsx,QrCanvas.tsx,qr.ts}` (novos)
- `frontend/src/app/(app)/logistica/page.client.tsx` (link "Instalar app")
- `frontend/src/app/hbx-theme/entrega.css` (`.ent-onb-*`)
- `frontend/src/app/hbx-theme/screens.css` (`.log-qr-*`)

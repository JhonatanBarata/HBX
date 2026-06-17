# Regras — FRONTEND

> Next.js (App Router) + React + TypeScript em `frontend/`.
> Leia antes de criar ou alterar qualquer tela.

## As 5 Leis do Design System (MÉTODO — todo visual nasce centralizado)

> Não são freio: refatorar aparência e criar peles está AUTORIZADO. São o
> método pra todo valor visual nascer em token/classe central. O fiscal
> (`frontend/scripts/check-pele.mjs`, dentro do `npm run lint`) reprova o
> build se um hex/inline vazar pra dentro de tela — a disciplina não depende
> de memória de ninguém.

1. **Tokens centrais.** Todo valor visual (cor, fonte, radius, sombra,
   movimento) nasce em `frontend/src/app/hbx-theme/`:
   - `skeleton.css` — o CONTRATO inteiro, em valores neutros (cinza). É a
     lista fechada de variáveis que existe. Modo escuro é AUTOMÁTICO:
     `[data-theme-mode="dark"]` troca a escada de tokens — tela nunca sabe
     que o dark existe.
   - `theme.css` — Tailwind v4 (`@theme inline`): cada token vira utility
     (`bg-surface`, `text-ink-muted`, `rounded-panel`, `shadow-lip`…). A
     paleta default do Tailwind foi APAGADA — não existe utility de cor
     fora do contrato.
2. **Componentes centrais.** Visual repetido vira classe do kit
   (`kit.css`: panels, botões, campos, tabelas, overlays `.hbx-veil/.hbx-modal/
   .hbx-pop/.hbx-drawer`…) ou utility. Estrutura por-tela vive em
   `screens.css`. Nunca se repete visual em tela.
   - **Pop-up = SEMPRE no centro, pela central.** `.hbx-veil` já centraliza
     (`position:fixed; inset:0; grid; place-items:center; padding; z-index`).
     TODA tela só põe `className="hbx-veil"` + `.hbx-modal` e dimensiona a
     moldura (width). É PROIBIDO re-centralizar, re-posicionar ou re-empilhar
     (`z-index`) inline na tela. Pop-up fora do centro / "não aparece" = a tela
     está furando isto — o conserto é na classe central, NUNCA na página.
3. **Tema SÓ troca tokens (+ camada de vestir).** Pele nova =
   `theme-<nome>.css` (tokens claro/escuro + reestilo visual das classes
   centrais, tudo sob `[data-theme="nome"]`) + import no `globals.css` +
   entrada no `PELES` (theme-attributes.tsx). Como encomendar a uma IA:
   **docs/Rules/PEDIDO-DE-PELE.md**. Julgamento: tela-prova **/dev/pele**.
   Tema NUNCA muda escrita, estrutura, menu ou navegação — uma
   funcionalidade = UMA tela, UM DOM, UMA escrita. Instaladas: aurora
   (padrão), ember, rose. `skeleton.css` é a BASE de tokens (contrato
   neutro que as peles vestem) — NÃO é uma opção do seletor.
4. **Tela é PROIBIDA de ter visual próprio.** Nenhuma cor, borda, sombra,
   fonte ou radius dentro de TSX — só classe central/utility/token. Inline
   `style` é tolerado SOMENTE para layout (display/gap/padding/width…).
5. **Fiscal no lint.** `check-pele.mjs`: cor literal em CSS fora de pele,
   cor literal em TSX e valor arbitrário do Tailwind (`bg-[#…]`) = build
   REPROVADO na hora. Styles visuais inline legados descem por CATRACA
   (`scripts/pele-baseline.json` — o teto só desce; meta ZERO; subir = build
   reprovado).

### Estado atual e exceções registradas
- Peles instaladas (aurora padrão, ember, rose) vestem o contrato neutro de
  tokens; criar/refatorar pele é trabalho autorizado (ver PEDIDO-DE-PELE.md).
  `skeleton.css` é a base de tokens, não uma opção do seletor.
- `docs/TEMAS` é REFERÊNCIA de estrutura/escrita das telas — o visual de lá
  não se copia para dentro de tela nem de TSX (vira token/classe).
- Mundo-site (visual próprio, fora do fiscal): `hbx-theme/marketing.css`,
  `src/app/page.client.tsx` (landing) e `src/app/trabalhe-conosco/`.
- `public/sw.js` é kill-switch permanente do PWA antigo — não remover; não
  registrar service worker novo sem ordem do dono.
- Webfonts via `<link>` no `src/app/layout.tsx` (nunca `@import` em CSS — o
  bundler descarta em silêncio).

## Dados e API

- Client único: `src/lib/api.ts` (`apiFetch`, token em localStorage, proxy
  `/hbx/api` em dev via next.config). 401 fora do login → limpa token e volta
  pro `/login` (AuthGate no layout do grupo `(app)`).
- Conexão WhatsApp: fluxo canônico em `src/lib/whatsapp-connection-flow.ts`
  (+ `whatsapp-center.ts`); UI em `components/hbx/whatsapp-connect-modal.tsx`.
- Dado sem contrato no backend mostra "—" ou fica visual com nota — nunca
  número fake ao lado de dado real.

## Rotas

- Uma rota canônica por funcionalidade; alias só redireciona.
- Aliases ativos: `/boasvindas`, `/dashboard/master`, `/pre-checkout`,
  `/precheckout` → `/dashboard`; `/workspace` → `/dashboard` (app paralelo
  friendly morto na unificação).

## Acesso e cobrança

- Frontend NÃO decide regra comercial: consome `accessState*` e mensagens do
  backend. Vendedor (`userKind=seller`) nunca vê plano/valor/cobrança.
- **Módulo sem acesso NÃO aparece no painel da esquerda.** O gate é
  `isModuleVisible` em `components/hbx/shell.tsx` e é
  **fail-closed**: o item da sidebar só entra quando `/modules/me` afirma
  `accessible:true` (mesmo veredito do guard real `canUserAccessModule`).
  Nunca mostrar um módulo e barrar no clique — sem acesso = some da navegação.
- Preço/plano só do catálogo da API (`/commercial-plans/me`) — hardcode proibido.
- Trilha de checkout: aguardando "go checkout" do dono.

## Checks

- `cd frontend && npm run lint` (eslint + check-pele) → `npm run build`
  antes de entregar. Lint vermelho do check-pele = a entrega está ERRADA —
  corrigir na fonte (token/classe central), nunca contornar o fiscal.

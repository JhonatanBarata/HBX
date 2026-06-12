# Regras — FRONTEND

> Next.js (App Router) + React + TypeScript em `frontend/`.
> Leia antes de criar ou alterar qualquer tela. Estado atual e pendências:
> `docs/PLANEJAMENTOS/PR11062026001/FRONTEND-TEMAS-RESET.md` (Fase 13 = revisão).

## Fonte visual e padrão único

- A fonte das telas é o handoff `docs/TEMAS` (REGRA ZERO do CLAUDE.md:
  copiar, não recriar; elemento sem endpoint fica visual e registrado no doc).
- **Padrão único**: toda tela consome só os tokens (`src/app/hbx-theme/*.css`),
  as classes globais do handoff e o kit (`src/components/hbx/shell.tsx`:
  Sidebar, Topbar, KpiRow, Av, I/ICONS). Nenhuma tela tem CSS próprio —
  mudou o padrão, mudam todas as telas.
- Webfonts via `<link>` no `src/app/layout.tsx`. **Nunca recriar o
  `@import url()` em CSS** — o bundler descarta em silêncio (fallback Segoe UI).
- **Proibido registrar service worker** (`public/sw.js` é kill-switch
  permanente do PWA antigo). Não recriar PWA sem ordem do dono.

## Temas, modos e transições

- Corporativo: `data-theme="corporate"`, escuro padrão, claro via
  `data-theme-mode="light"` (persistência `hbx:corporate-mode`).
- Friendly (`/workspace`): sem `data-theme`, claro padrão, escuro via
  `data-theme-mode="dark"` (persistência `hbx:friendly-mode`).
- Telas de auth seguem a preferência `hbx:ws-theme` (switch no login).
- Boot sem flash: script inline no layout + `ThemeAttributes` (mesma lógica).
- Transições (`hbx-theme/transitions.css` + `src/app/template.tsx`):
  corporativo = simples (fade curto); friendly e site = alto nível (rise,
  stagger, cross-fade de tema via `applyThemeSoft`). Overlays usam as classes
  `hbx-veil` / `hbx-modal` / `hbx-drawer` / `hbx-pop`.

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
- Aliases temporários ativos: `/boasvindas`, `/dashboard/master`,
  `/pre-checkout`, `/precheckout` → destino canônico provisório `/dashboard`.

## Acesso e cobrança

- Frontend NÃO decide regra comercial: consome `accessState*` e mensagens do
  backend. Vendedor (`userKind=seller`) nunca vê plano/valor/cobrança.
- Preço/plano só do catálogo da API (`/commercial-plans/me`) — hardcode proibido.
- Trilha de checkout: plano aprovável documentado no doc do PR (aguardando
  "go checkout" do dono).

## Checks

- `cd frontend && npm run lint` → `npm run build` antes de entregar.
- Validação visual do dono contra o HTML do handoff fecha cada tela.

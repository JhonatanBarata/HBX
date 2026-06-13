# Regras — FRONTEND

> Next.js (App Router) + React + TypeScript em `frontend/`.
> Leia antes de criar ou alterar qualquer tela. Estado atual e pendências:
> `docs/PLANEJAMENTOS/PR11062026001/FRONTEND-TEMAS-RESET.md` (Fase 13 = revisão).

## REGRA DURA — TEMA É SÓ PELE (bloqueio absoluto)

> Gravada por ordem do dono em 12/06/2026. Só deixa de valer se o dono
> DELETAR esta seção ou autorizar EXPLICITAMENTE, por escrito, na tarefa
> atual, uma tela ser diferente da outra.

- Tema muda APENAS o visual: fontes, cores, janelas/superfícies, raios,
  sombras, transições — via tokens/CSS (`data-theme*`), exatamente como o
  claro/escuro já faz. **Tema não tem escrita.**
- Tema NUNCA muda escrita, estrutura, menu, navegação, elementos ou
  comportamento. **Uma funcionalidade = UMA tela, UM DOM, UMA escrita** —
  os temas vestem essa tela.
- PROIBIDO criar ou manter tela, componente, texto ou app paralelo por tema
  ("nada é aproveitado, nada é criado outro"). Trocar o tema altera o
  sistema INTEIRO de uma vez (troca de tokens), nunca navega para outro app.
- Qualquer tarefa que implique uma tela ficar diferente da outra entre
  temas → **PARAR antes de qualquer edição e avisar o dono**, mesmo que o
  pedido pareça implicar isso. Sem autorização explícita, não executa.
- CUMPRIDA em 12/06/2026 (ordem "deixe o HBX com 2 temas, não multi app"):
  o app paralelo `/workspace` foi **MORTO** (rota é alias → `/dashboard`).
  O HBX é app único; Friendly e Corporativo são peles por atributo.

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

## Temas, modos e transições (app ÚNICO, unificado em 12/06/2026)

- O tema ativo é a preferência **`hbx:ws-theme`** (`friendly`|`corporate`),
  aplicada por atributo em TODAS as rotas (app e auth) — landing `/` é html
  puro. Fonte única: `components/hbx/theme-attributes.tsx` (boot inline no
  `layout.tsx` espelha a mesma regra, sem flash).
- Corporativo: `data-theme="corporate"`, escuro padrão, claro via
  `data-theme-mode="light"` (persistência `hbx:corporate-mode`).
- Friendly: sem `data-theme`, claro padrão, escuro via
  `data-theme-mode="dark"` (persistência `hbx:friendly-mode`).
- Chavinha Friendly⇄Corporativo (Topbar `ThemeSwitch` e auth): troca de PELE
  na MESMA tela via `setFriendlyTheme`/`setCorporateTheme` — nunca navega.
  Modo claro/escuro: `ModeToggle` theme-aware → `setThemeMode` (escrita
  única de modo).
- Transições (`hbx-theme/transitions.css` + `src/app/template.tsx`):
  tema corporativo = simples (fade curto); friendly e site = alto nível
  (rise, stagger, cross-fade via `applyThemeSoft`). Overlays usam as classes
  `hbx-veil` / `hbx-modal` / `hbx-drawer` / `hbx-pop`.
- Faxina pendente registrada: blocos CSS do antigo shell do workspace em
  `screens.css`/`transitions.css` (seletores `.shell`) ficaram inertes —
  remover numa passada própria com validação visual das telas de auth.

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
- `/workspace` é alias permanente → `/dashboard` (app paralelo Friendly
  morto na unificação de 12/06/2026 — REGRA DURA).

## Acesso e cobrança

- Frontend NÃO decide regra comercial: consome `accessState*` e mensagens do
  backend. Vendedor (`userKind=seller`) nunca vê plano/valor/cobrança.
- Preço/plano só do catálogo da API (`/commercial-plans/me`) — hardcode proibido.
- Trilha de checkout: plano aprovável documentado no doc do PR (aguardando
  "go checkout" do dono).

## Checks

- `cd frontend && npm run lint` → `npm run build` antes de entregar.
- Validação visual do dono contra o HTML do handoff fecha cada tela.

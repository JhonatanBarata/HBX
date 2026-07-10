# W5-front — CADASTRO DENTRO DA LANDING (fecha o ciclo da porta única)

Decisão do dono (10/07 noite): o cadastro ganha o MESMO tratamento do login — card DENTRO da landing,
mesma casca, com transição; os cards se alternam (Entrar ↔ Criar Conta) sem sair da tela; `/register`
vira redirect preservando deep-links. NÃO pode quebrar o funil C1 (cadastro→confirmação→50 créditos) —
é a porta de cliente novo.

## Regras duras
- Branch atual, NÃO criar branch/worktree, NÃO commitar, NÃO publicar.
- 5 Leis do DS (docs/Rules/FRONTEND.md); check-pele verde; UI copy mínima (zero textão novo).
- NÃO tocar em backend. NÃO mexer na lógica de submit/resume/prefill do RegisterPanel — só MOVER.
- Ao final: `cd frontend && npx tsc --noEmit` + `node scripts/check-pele.mjs` + `npm run build` verdes.

## Estado atual (pós-frente de hoje — ler antes de editar)
- `app/page.tsx`: AUTH_BOOT pré-pintura (logado→/dashboard); `?entrar`/`?ver=entrar` → `initialScreen="login"`;
  `?ver=planos` → `redirect("/register")` (linha 28).
- `components/hbx/public-entry.tsx` (367 l): `screen: "home"|"login"`; header alterna botão Entrar/Voltar
  (linhas 289-291); CTA "Quero conhecer" chama `openLogin` (linha 305); camada `.f1-login-layer` renderiza
  `<LoginClient/>` quando login (362-363); classe `is-login` no main (268); efeito de foco no `#em` (242-246).
- `components/hbx/login-client.tsx` (228 l): card único de login; tem link "Criar Conta" → `/register`.
- `app/register/page.tsx` (12 l): `main.register-entry.hbx-scene` + `<RegisterPanel/>`.
- `app/register/page.client.tsx` (532 l): `RegisterPanel` — form crédito C1 (empresa/nome/email/tel/senha/CPF),
  retomada `?resume=1` (lê `window.location.search`, linha 117), prefill `?hbxLead=` (153), telas de
  confirmação pendente/reenvio/WhatsApp. NÃO alterar a lógica.

## Entregas
1. **Mover** `app/register/page.client.tsx` → `components/hbx/register-client.tsx` (export `RegisterPanel`
   mantido; adicionar prop opcional `onEntrar?: () => void`). O arquivo antigo morre.
2. **`app/register/page.tsx`** vira redirect server-side pra `/?criar` PRESERVANDO todos os query params
   (`resume`, `email`, `hbxLead`, o que vier): montar a query e `redirect('/?criar&...')`. Conferir por grep
   no backend quais links de e-mail apontam pra `/register?...` (ex.: confirmação/retomada) — eles precisam
   continuar funcionando através do redirect.
3. **`app/page.tsx`**: `?criar` → `initialScreen="criar"`; `?ver=planos` → `redirect("/?criar")` (não mais
   /register). AUTH_BOOT fica como está (já cobre logado em qualquer variante da landing).
4. **`public-entry.tsx`**: `screen: "home"|"login"|"criar"`; a MESMA camada (`.f1-login-layer`) renderiza
   `<LoginClient/>` ou `<RegisterPanel/>`; a classe de transição existente vale pros dois (manter `is-login`
   aplicada quando screen !== "home" — CSS intocado — e, se precisar de ajuste fino de largura do card de
   cadastro, criar modificador novo em `public-entry.css` com tokens); header: "Voltar" pros dois; hero
   `aria-hidden/inert` quando screen !== "home"; foco no `#em` também no criar (o RegisterPanel usa o mesmo id).
5. **Alternância dos cards SEM navegação**: `LoginClient` ganha prop `onCriarConta?` — quando presente, o
   "Criar Conta" troca o card em vez de navegar; `RegisterPanel` ganha "Já tem conta? **Entrar**" (rodapé do
   card, padrão do login) via `onEntrar?` — quando ausente (uso fora da landing, se houver), cai em link
   `/?entrar`. Trocar de card atualiza a URL rasa (`history.replaceState` → `/?criar` | `/?entrar`) pra
   refresh/deep-link continuarem coerentes.
6. **CTA "Quero conhecer"** (hero): passa a abrir o card de CADASTRO (`criar`) — é o call-to-action de
   cliente novo; o botão "Entrar" do header segue abrindo o login.
7. Grep final: nenhuma referência viva a `@/app/register/page.client`; `register-entry`/`hbx-scene` no
   page.tsx antigo morrem se ficarem órfãos (conferir se /reset-password, /confirm-email ou
   /hbx-vendedor/onboarding usam as mesmas classes antes de remover CSS — na dúvida, NÃO remover CSS).

## Prova
tsc + check-pele + build verdes. Relatório em PT-BR: mapa rota antiga→nova (incl. como cada deep-link
`resume`/`hbxLead`/`?ver=planos` viaja até o card), o que moveu/morreu, e qualquer CSS adicionado.
Smoke visual no dev server local (localhost:3001) das 3 telas: home → criar → entrar (alternância) +
`/register?resume=1` redirecionando certo. NÃO deletar este .md.

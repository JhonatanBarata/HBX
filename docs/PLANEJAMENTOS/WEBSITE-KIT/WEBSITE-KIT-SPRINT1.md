# WEBSITE-KIT — SPRINT 1: A PORTA (destrava a venda)

> Origem: Arquitetura nº13 (01/07/2026), auditada por segunda inteligência na mesma data.
> Regra de ouro do sprint: **ZERO mudança de backend** — os endpoints já existem e funcionam.
> Ler antes: `docs/Rules/FRONTEND.md` (5 Leis — tudo em token/classe de `frontend/src/app/hbx-theme/`).

## Contexto (auditado no código em 01/07)
- Módulo `website` existe no catálogo (`backend/src/bootstrap/structural-defaults.json` → `serviceUrl: /dashboard/website`), mas **a rota não existe no frontend** e o frontend nem lê `serviceUrl`.
- Backend PRONTO em `backend/src/website/`:
  - `GET /website/portal?target=public|admin|auto` (JWT + ModuleAccess `website`) → payload com `launchUrl`.
  - `PATCH /website/master/company/:companyId/config` (MASTER) → upsert da config.
  - `GET /website/master/company/:companyId/launch?target=...` (MASTER).
- **Gotcha do token:** `target=admin` (ou `auto` com `launchMode=admin`) GERA um entry token de 90s uso-único a cada chamada. Portanto: **carregar a tela com `?target=public`** (não cria token) e **só chamar `?target=admin` no CLIQUE**, abrindo o `launchUrl` imediatamente em nova aba.

## Entregas
### T1 — Rota `/dashboard/website` (portal do cliente)
`frontend/src/app/(app)/dashboard/website/page.tsx` + `page.client.tsx`.
Estados da tela (payload do `GET /website/portal`):
1. `configured=false` → mensagem "site ainda não configurado" + CTA de contato.
2. Configurado → card do site: botão **Abrir meu site** (`websitePublicUrl`, nova aba).
3. `adminAllowed=true` → botão **Editar meu site** → `GET /website/portal?target=admin` no clique → `window.open(launchUrl)` na hora (token de 90s).
Erros → padrão `reportError` do projeto.

### T2 — Card de config no MASTER
Em `frontend/src/app/(app)/dashboard/master/` (seguir o padrão dos cards existentes):
- Form: `websiteEnabled`, `websitePublicUrl`, `websiteAdminUrl`, `websiteProjectId`, `websiteAdminEnabled`, `websiteLaunchMode` — espelhar as validações do backend (publicUrl obrigatória se enabled; adminUrl+projectId obrigatórios se adminEnabled; launchMode=admin exige adminEnabled).
- Salvar → `PATCH /website/master/company/:id/config`.
- Botões de teste: "abrir público" e "abrir admin" via `GET /website/master/company/:id/launch` **no clique**.
- O alerta `website_missing` do master (modules.service já emite `websiteNeedsAttention`) deve linkar pra esse card.

### T3 — Entrada na navegação
`frontend/src/components/hbx/shell.tsx`: adicionar item de nav com `NAV_MODULE_KEY: 'website'` (gate fail-closed via `/modules/me` já existe — chave ausente = módulo invisível). Conferir se precisa entrada em `NAV_ENTITLEMENT` (plano) ou `null`.
Mobile: conferir `mobile-tab-bar.tsx` — website NÃO entra na tab bar (é tela ocasional), só no menu.

## Critérios de aceite
- [ ] Master configura a MadeireiraDiego **pela UI** (hoje só dá via curl/SQL) e o alerta `website_missing` some.
- [ ] Usuário com módulo `website` acessível vê o item no menu, abre o site público e (se admin habilitado) entra no admin do site com sessão validada (ver `[HBX Admin Gate]` no console do site).
- [ ] Usuário sem o módulo: item invisível + rota devolve o guard padrão.
- [ ] `check-pele` verde (nenhuma cor/borda solta).
- Teste: chrome, localhost:3001, credenciais em `.test-login.local.md`; subir com `npm run up` se preciso.

## Fora de escopo
- Preço do módulo (hoje `monthlyPrice: 0`) — **frente financeira, decisão do dono** (referência de mercado: Wix R$60–130/mês; agência local R$100–300/mês + setup R$800–3k; custo marginal ≈ R$0).
- Qualquer mudança em `backend/src/website/` (fica pra Sprint 2).

Estimativa: 1–2 dias. Executor: 1 subagente (este .md).

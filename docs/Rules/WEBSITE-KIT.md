# Regras — WEBSITE KIT (sites de cliente)

> Sites institucionais/e-commerce dos clientes HBX (Firebase Hosting + Functions),
> a ponte de autenticação do admin desses sites com o backend, e o kit de templates
> que gera cada site novo. Leia antes de tocar em `backend/src/website/`,
> `backend/website-kit/`, ou qualquer `hbx-auth-flow.js`/`hbx-admin-auth.js`.

## Mapa do domínio

- **Backend (fonte de verdade)**: `backend/src/website/` — `WebsiteService`,
  `WebsiteController`, `website-runtime.ts` (helpers Prisma). Modelos
  `CompanyWebsiteConfig` (1:1 com `Company`) e `WebsiteAdminEntryToken` vivem no
  `schema.prisma` (Sprint 2, 02/07 — antes eram tabelas "sombra" criadas em
  runtime via `$executeRawUnsafe`; ver histórico em
  `docs/PLANEJAMENTOS/WEBSITE-KIT/`).
- **Portal do módulo**: `GET /website/portal` (usuário logado no app) e
  `GET /website/master/company/:id/launch` (master operando por outra empresa)
  decidem se abre o site público ou o admin, e geram a URL de lançamento.
- **Config por empresa**: `PATCH /website/master/company/:id/config` (só MASTER) —
  liga/desliga o site, define `websitePublicUrl`/`websiteAdminUrl`/`websiteProjectId`
  e o modo de lançamento (`public` | `admin`).
- **Kit de templates e sites gerados**: `backend/website-kit/` — `templates/*`
  (fonte versionada por template: `abner-firebase`, `diego-firebase`,
  `hbx-master-saas`) e `companies/<slug>/site` (cópia própria por cliente,
  quando o cliente não usa o template direto). `projects.json` mapeia
  `companyId → templateKey/firebaseProjectId/localPath` — **hoje é a única fonte
  desse mapeamento** (frágil: tem caminho absoluto `C:\Users\Jhonatan\...` e
  mistura cliente que usa o template direto com cliente que tem cópia própria).
- **2 sites vivos em produção com clientes reais**: `madeireira-78732`
  (MadeireiraDiego, cópia própria em `companies/madeireiradiego`) e
  `guinchorioclarosp` (GuinchoBarata, **usa o template `abner-firebase` direto**
  — editar esse template É editar o site vivo dele, não existe cópia isolada).

## Fluxo de tokens (ponte admin do site ↔ backend HBX)

1. **Launch token / entry token** — gerado só no clique do usuário em "abrir admin
   do site" (`buildAdminLaunchUrl`), nunca antecipado. JWT assinado com
   `WEBSITE_ENTRY_TOKEN_SECRET`, TTL padrão **90s** (30–300s configurável via
   `WEBSITE_ENTRY_TOKEN_TTL_SECONDS`), **uso único** — a linha em
   `WebsiteAdminEntryToken` é marcada `usedAt` no consumo e uma segunda tentativa
   com o mesmo token falha. Vai na URL como `?hbx_entry=...`.
2. **Exchange** — `hbx-admin-auth.js` (roda no site do cliente) troca o
   `hbx_entry` por uma **sessão** via `POST /website/admin/exchange`. Sessão =
   JWT assinado com `WEBSITE_ADMIN_SESSION_SECRET`, TTL padrão **8h** (300–86400s
   via `WEBSITE_ADMIN_SESSION_TTL_SECONDS`), guardada em `sessionStorage` do
   navegador (nunca localStorage, nunca cookie).
3. **Verify** — cada carregamento de página do admin revalida a sessão via
   `POST /website/admin/verify` (reconfirma que o usuário ainda tem acesso ao
   módulo `website` e que a config da empresa não mudou).
4. **Custom token Firebase** (só quando o site usa Firebase Auth pro próprio
   admin, ex. MadeireiraDiego) — a Cloud Function `createHbxAdminFirebaseToken`
   (`hbx-auth-flow.js`) troca a sessão HBX (chamando `/website/admin/verify` no
   backend) por um Firebase Custom Token, permitindo o admin logar no
   Firebase Auth do site sem senha própria.

Todo o fluxo é **stateless no client + validado no backend a cada etapa** — o
site do cliente nunca decide sozinho quem pode entrar no admin.

## Secrets

- `WEBSITE_ENTRY_TOKEN_SECRET` e `WEBSITE_ADMIN_SESSION_SECRET` são **obrigatórios
  em produção** (`NODE_ENV=production`) — o boot do backend falha alto se
  faltarem (`WebsiteService.onModuleInit`, Sprint 2 / T2). Nunca reaproveitar
  `JWT_SECRET` do app em produção: os dois domínios de token devem poder ser
  rotacionados/revogados independente do login do app.
- Fallback pro `JWT_SECRET` continua válido **só fora de produção** (dev/test),
  pra não travar onboarding local sem exigir 2 secrets extras no `.env` de dev.

## CORS

- **Backend NestJS** (`main.ts`): CORS global já cobre os domínios dos sites de
  cliente. Modo restrito via `CORS_ALLOWED_FIREBASE_ORIGINS` (lista exata de
  origens, ex. `https://guinchorioclarosp.web.app,https://madeireira-78732.web.app`);
  se a env não estiver setada, cai no fallback histórico (regex `*.web.app` /
  `*.firebaseapp.com` — qualquer projeto Firebase passa). Fechar de verdade
  exige setar `CORS_ALLOWED_FIREBASE_ORIGINS` na VPS — enquanto isso não
  acontece, qualquer site Firebase (não só os 2 clientes) pode chamar
  `api.hbx.com.br`.
- **Cloud Function `hbx-auth-flow.js`** (roda dentro do projeto Firebase do
  cliente, fora do backend): `Access-Control-Allow-Origin` honra `HBX_ALLOWED_ORIGIN`
  (lista separada por vírgula, env da própria Function) quando configurada;
  sem a env, fallback é `*` (comportamento histórico). **Setar `HBX_ALLOWED_ORIGIN`
  e fazer redeploy da Function é ação por projeto Firebase — nunca em lote sem
  testar o admin do cliente logo depois.**

## Regras duras

- **Nunca** foto/asset real de cliente no git — `backend/website-kit/` acumulou
  31 MB de fotos de produto reais (auditoria 01/07); isso é dívida a sanar
  (T5), não padrão a repetir. Fotos de cliente vivem no Storage do Firebase do
  próprio projeto dele, nunca no repo do app.
- Site fala com o backend **sempre via `api.hbx.com.br`** (ou `localhost:3000`
  em dev, resolvido por `HBXWebsiteAuthConfig.apiBaseUrl`) — nunca embutir URL
  de ambiente fixa no HTML/JS do template.
- **1 projeto Firebase por cliente.** Nunca dividir dois clientes no mesmo
  projeto Firebase (Auth/Firestore/Storage isolados por tenant).
- Conteúdo do site (produtos, textos, carrossel) edita **via Firestore** do
  projeto do próprio cliente — deploy do Firebase Hosting é só para o
  **template/código**, nunca para publicar conteúdo.
- Editar um arquivo dentro de `templates/<key>/source/` pode estar editando um
  site vivo AGORA (caso GuinchoBarata/`abner-firebase`) — checar `projects.json`
  antes de qualquer mudança em template pra saber se algum cliente usa o
  `localPath` dele direto, sem cópia própria.
- Migration das tabelas `CompanyWebsiteConfig`/`WebsiteAdminEntryToken` é
  **idempotente por desenho** (`CREATE TABLE IF NOT EXISTS`) — elas já existem
  em produção (criadas em runtime antes da Sprint 2); a migration formaliza o
  schema, não recria dado.

## Proibido sem ordem explícita do dono

Redeploy de Firebase Hosting/Functions de site vivo, mudança de CORS que afete
os 2 sites em produção, alteração no fluxo de tokens (TTL, secrets, exchange),
mover/apagar qualquer coisa em `backend/website-kit/` — só com ordem explícita
na tarefa atual (lista única no [CLAUDE.md](../../CLAUDE.md)). Toda ação desse
tipo preparada mas não executada vira item "PENDENTE-DONO" no relatório.

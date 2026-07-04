# WEBSITE-KIT — SPRINT 2: HIGIENE + BLINDAGEM

> Depende da Sprint 1 estar no ar (a porta primeiro, a faxina depois).
> Ler antes: `docs/Rules/BACKEND.md` e `docs/Rules/INFRA.md`.
> **2 sites de cliente estão VIVOS em produção** (madeireira-78732, guinchorioclarosp) — toda mudança de CORS/token aqui pode derrubar o admin deles. Testar contra site vivo após cada passo.

## Contexto (auditado 01/07)
- `CompanyWebsiteConfig` e `WebsiteAdminEntryToken` são **tabelas sombra**: criadas em runtime via `$executeRawUnsafe` (`backend/src/website/website-runtime.ts`), fora do `schema.prisma`.
- Secrets da ponte caem em fallback pro `JWT_SECRET`. Auditoria 01/07: **hoje não é furo explorável** — o `JwtStrategy` do app exige claims `sid`/`sv` que os tokens do website não têm — mas a fronteira segura **por acidente**, não por desenho.
- `WebsiteAdminEntryToken` só INSERT/UPDATE — **nunca é limpo** (1 linha por launch, cresce pra sempre).
- Function do site responde com `Access-Control-Allow-Origin: *`.
- `backend/website-kit/` = 31 MB / 331 arquivos no repo do app, com **fotos reais de cliente no git** (alimenta o `.git` de 349 MB da faxina INFRA). `projects.json` tem caminhos absolutos `C:\Users\Jhonatan\...` e o projeto GuinchoBarata aponta pro **source do próprio template** (editar template = editar site vivo).
- `docs/Rules/WEBSITE-KIT.md` **não existe** (CLAUDE.md aponta pra ele).

## Entregas
### T1 — Tabelas no Prisma
Migration com `CREATE TABLE IF NOT EXISTS` (idempotente — as tabelas JÁ existem no VPS, criadas em runtime) + modelos no `schema.prisma`. Depois remover `ensureWebsiteRuntimeSchema` e migrar as queries cruas pro client Prisma.
**Guardrail VPS:** conferir aplicação da migration no deploy (migrations pendentes já morderam em 30/06 — ver memória MOTOR).

### T2 — Secrets dedicados fail-hard
Em produção, `WEBSITE_ENTRY_TOKEN_SECRET` e `WEBSITE_ADMIN_SESSION_SECRET` passam a ser **obrigatórios no boot** (erro claro se ausentes); fallback `JWT_SECRET` só em dev. Gerar e setar os dois no `.env` do VPS ANTES do deploy (env novo = **RECREATE** do container, não restart — regra INFRA).

### T3 — Cron de limpeza
Job diário: apagar `WebsiteAdminEntryToken` com `expiresAt < now() - 7 dias`. Seguir o padrão de cron já usado no backend.

### T4 — CORS honesto
1. Mapear como o CORS global do Nest está hoje (main.ts) — os sites vivos chamam `api.hbx.com.br` de outros domínios, então algo já permite; documentar antes de mexer.
2. Function (`hbx-auth-flow.js` nos templates): `Access-Control-Allow-Origin` = origem da config (publicUrl/adminUrl), não `*`. Redeploy das functions dos 2 sites vivos.
**Rollback pronto:** se admin de site vivo quebrar, reverter o header na hora.

### T5 — Kit fora do repo do app
- Criar repo `hbx-sites` (templates versionados + 1 pasta por cliente com config, **sem cópia de código de template**).
- Mover `backend/website-kit/` pra lá; `hbx-master-saas` (site do PRÓPRIO HBX, não é site de cliente) vai pra lugar próprio.
- **Coordenar com a faxina do `.git` (INFRA, 349 MB, force-push do master)** — é o mesmo trem; remover os 31 MB da história junto.
- `projects.json` morre: `templateKey` vira coluna opcional em `CompanyWebsiteConfig` (banco é a fonte única; `hbx.website.json` continua no site como metadado informativo).

### T6 — Escrever `docs/Rules/WEBSITE-KIT.md`
Mapa do domínio + regras duras: fluxo de tokens (entry 90s uso-único → sessão 8h → custom token); launch token **só no clique**; **nunca** foto/asset de cliente no git; site fala com `api.hbx.com.br`; 1 projeto Firebase por cliente; conteúdo edita via Firestore, deploy só pra template.

## Critérios de aceite
- [ ] `cd backend && typecheck` verde; boot local sem os 2 secrets falha SÓ com NODE_ENV=production.
- [ ] Migration aplicada no VPS sem drift; painel master continua lendo config.
- [ ] Admin da MadeireiraDiego loga no site vivo DEPOIS do CORS novo.
- [ ] Repo do app sem `backend/website-kit/`; regra WEBSITE-KIT.md publicada.

Estimativa: ~1 dia (T5 depende da janela da faxina INFRA). Executor: 1 subagente (este .md).

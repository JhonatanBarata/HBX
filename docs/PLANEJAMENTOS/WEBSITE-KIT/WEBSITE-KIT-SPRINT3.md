# WEBSITE-KIT — SPRINT 3: FÁBRICA + MINT CENTRAL (⛔ GATED)

> **GATE: só executar quando houver >1 site novo/mês OU decisão comercial de vender o módulo ativamente.**
> Com 2 sites em produção, automação total é over-engineering — este sprint fica na gaveta até o gatilho.
> Depende das Sprints 1 e 2.

## Por que existe (o $ do sprint)
- Hoje um site novo = horas de trabalho manual (robocopy, edição à mão, projeto Firebase no console, deploy CLI). A margem do add-on (referência R$79–149/mês) só vira margem de verdade se provisionar custar <1h.
- **Correção da auditoria 01/07 sobre custo:** "custo marginal ≈ R$0" tem um asterisco — deployar Cloud Functions (a ponte atual usa Functions v2) **exige plano Blaze (cartão vinculado) POR PROJETO de cliente**. Fricção comercial e de ops real. O T3 abaixo elimina isso.

## Entregas
### T1 — Template config-driven
`site.config.json` por cliente (nome, cores→tokens, logo, seções, projectId). Build simples: copia template + injeta config. **Zero fork de código por cliente** — cliente é config, template é código. Acaba o caso GuinchoBarata (cliente apontando pro source do template).

### T2 — Provisionador semi-automático
Script `new-site` no repo `hbx-sites`: cria pasta do cliente + config → stamp → checklist gcloud/console pro projeto Firebase → deploy com service account (CI ou local). Semi-auto é suficiente; automação de criação de projeto GCP só se o volume justificar.

### T3 — Mint central do custom token (mata a Function por cliente)
Novo `POST /website/admin/firebase-token` no backend: valida a sessão (mesma lógica do `verify`) e minta o custom token do Firebase **no HBX**, via `firebase-admin` com credencial por projeto.
- Preferir **impersonation IAM** (`serviceAccountTokenCreator` da SA central do HBX sobre a SA do projeto do cliente) a guardar chave JSON por cliente.
- Template novo: `hbx-admin-auth.js` chama o endpoint do HBX em vez de `/api/admin/hbx-auth` → **site fica hosting-only → plano Spark, sem cartão por cliente**.
- Sites existentes migram depois, sem pressa (a Function atual continua funcionando).

### T4 — Assets no Storage desde o nascimento
Fluxo de geração sobe fotos pro Firebase Storage do cliente; site novo nasce sem UMA imagem no git.

## Critérios de aceite
- [ ] Site novo de ponta a ponta (config → deploy → admin logando) em <1h de trabalho humano.
- [ ] Projeto novo de cliente em Spark (sem billing) com admin funcionando via mint central.
- [ ] Nenhum arquivo de cliente commitado fora da pasta de config dele.

## Decisão de arquitetura mantida (com trade-off na mesa)
**1 projeto Firebase por cliente** (free tier individual, blast radius isolado, "o projeto é seu" como argumento anti-Wix) em vez de multi-site num projeto só (automação mais fácil, quotas e rules compartilhadas). Revisitar só se o volume passar de ~25 sites (teto de projetos por conta de billing — pedir aumento ou repensar).

Estimativa: 2–3 dias quando destravado. Executor: 1 subagente (este .md).

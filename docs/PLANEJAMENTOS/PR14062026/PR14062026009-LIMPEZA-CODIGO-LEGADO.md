# PR14062026009 — Limpeza de código legado (relatório do agente J, 14/06)

> Agente autônomo rodou em **worktree isolado** (`worktree-agent-adc3a53f2b12a55fc`),
> 5 commits LOCAIS **nessa branch — NÃO estão na master**. Build TS verde a cada passo;
> testes das áreas tocadas + zonas protegidas todos passando. Nada pushado/deployado,
> nenhuma migration tocada.

## ✅ REMOVIDO (provado zero-uso) — vive na branch do worktree
| Commit | O quê | Prova |
|---|---|---|
| `08c9179b` | `backend/scripts/seed-dev.js`: campos `paymentStatus`/`subscriptionStatus` no upsert de Company | dropados no PR-002 → o seed crasharia ("unknown field"); trial preservado via trialStartsAt/EndsAt |
| `8346115f` | 3 type aliases mortos (`WhatsAppTemplateNormalized`, `WhatsAppOutboundNormalized`, `NightFactoryStatus`) | grep repo = só a definição |
| `0b8ffff1` | imports não usados (`Prisma` em prisma.service; `AutoReplyMatchTypeDto`/`AtendimentoBotActionGuide` em messaging; `IntegrationProviderId`) | tsc --noUnusedLocals |
| `51b689c5` | `escapeHtml` privado morto (seller-onboarding.service) | grep = só definição |
| `7bbad317` | 3 arquivos órfãos: `messaging/wa.service.ts` (0 bytes), `categories/entities/category.entity.ts`, `products/entities/product.entity.ts` (scaffold Nest nunca importado) | nenhum import no repo |

**Como aplicar:** `git cherry-pick`/merge da branch `worktree-agent-adc3a53f2b12a55fc`.
⚠ Esperar **conflito em `prisma.service.ts`** (o J tirou um import; o checkpoint do Radar
mexeu pesado no mesmo arquivo) — resolver na mão. Os outros são conflict-free.

## 🔴 ACHADOS REAIS (não-cosméticos) — decisão do dono
1. **`bulk-delete-test-companies.js` CRASHARIA** — faz `select` de `paymentStatus`/
   `subscriptionStatus` (campos dropados). É script DESTRUTIVO (exclusão em massa) → o J
   NÃO tocou. Precisa do mesmo conserto do seed-dev.js, ou apagar se não se usa mais.
2. **`webscrapingGuard` em `main.ts:108` construído mas NUNCA aplicado** (`app.use` ausente).
   Guard montado e não plugado = possível buraco de wiring/segurança. Checar.

## 🟡 SUSPEITO-MORTO, NÃO removido (zona sensível — só com ordem)
- **Auth (trava absoluta):** `AdminGuard` (registrado em lugar nenhum), `auth/index.ts`
  (barrel não importado), `sendAccountConfirmationEmail` (users.controller) — mortos, mas auth não se mexe sem ordem.
- **Cobrança/preço:** `getCommercialPlanIncludedUsers` (âncora do enforcement futuro de
  assentos), `parseCommercialMetadata` — sem uso vivo, mas catálogo é zona protegida.
- **Gate/governança:** `requireEffectiveCompanyContext`, `getTeamAccessCatalogItem`,
  `backfillMissingUserTeamPolicies` — utilitários sem consumidor, no contexto da régua.
- **Privados mortos** em messaging/hbx-recovery/vendas/gerencial/financeiro
  (`hydrateFriendlyTemplateParts`, `computeFollowupDueAt`, `buildLeadClosureTimelineDescription`,
  props DI `mailService`/`emailTemplates` em seller-onboarding, etc.) — em domínios ativos,
  podem ser "código encostado" e não abandonado.

## ℹ️ CORREÇÃO DE DOC (importante)
O **P7 do PR14062026007** lista `canUseAdminOnlyModule` / `defaultUserModuleAllowed` /
`SELLER_*` como "dívida de limpeza / cosmético". **O J provou que estão VIVOS** (gate
`canUserAccessModule:2100` + view master `listCompanyAccessForAdmin:2464`). **NÃO são
dívida removível** — remover exige reescrever a view master. Atualizar o 007.

## Anotado nas pastas excluídas (não tocado — sessão paralela trabalha lá)
- `backend/src/webscraping/radar/04-socials/radar-social-queries.ts` parece órfão (nunca importado por basename).

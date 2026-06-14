# PR14062026007 — Régua de acesso por cargo: o que sobrou

> Migrado do PR13062026007. **O NÚCLEO ESTÁ NO AR e validado** (build + testes + check-pele
> 576/576 + `docker restart` healthy). Este doc agora carrega só a CAUDA pendente.

## ✅ JÁ NO AR (não reabrir — registro)
- **Acesso por CARGO** (post-it sobre plano vivo): `canUserAccessModule`/`listMyModules` =
  `exceção da empresa (CompanyModule) ?? plano (vivo)`. P1–P7 aplicados.
- **Editor por cargo** (`cargo-acessos-editor.tsx`, Configurações → Equipe) grava
  `Company.sellerCargoAccessJson`; vendedor nasce com Vendas+Radar; `financeiro`/`gerencial` = muro.
- **Gerente** = ADMIN com `canViewBilling=false` (muro do vínculo $ HBX×contratante; vê comissão/venda).
- **Planos editáveis** (`planos-editor.tsx`, /master→Sistema→Planos): módulos + `planInfo`
  (parcela, trial, assentos inclusos, assento extra, deep search/dia, enriquecimento/dia, cards/mês).
- **List/Lead = painel mínimo**; **Full = Central de Implantação** (bloco Implantação na aba Comercial).
- **Bot fail-closed (5º muro)**: `triagemConfirmedAt` — automação NÃO dispara sem triagem.
- **WhatsApp (Meta)** — aba /master→Sistema montada (conexão + templates) sobre backend master-only.

## ⛔ FALTA — Enforcement dos valores do plano (o nó real)
A CAIXA editável (`PlanModuleConfig.planInfoJson`) está pronta e salva, **mas NADA lê ela ainda** —
quota/cobrança/trial seguem o catálogo hardcoded. "Valer" = trocar cada leitura por
**`planInfoJson (se houver) ?? catálogo`**. Âncoras:
- **Quotas (deep/enriquecimento/cards):** `commercial-plans/commercial-usage-limits.service.ts`
  → `computeLimits()` (~604). Já há override por empresa (cards ~159) como molde. **Não-cobrança → pode ir primeiro.**
- **Parcela (preço):** `financeiro.service.ts` ~511/539 `getCommercialPlanMonthlyPrice`.
- **Trial:** `auth.service.ts` ~307 `getCommercialPlanTrialDays`.
- **Assento extra / inclusos:** `users.service.ts` ~610 `getCommercialPlanExtraUserMonthlyPrice` + `getCommercialPlanIncludedUsers`.
- ⚠ **Preço + assento extra = COBRANÇA** (zona protegida) → entram com o passo "dinheiro", não antes.
- Sugestão: leitor central `resolvePlanEntitlements(company)` = `planInfoJson ?? catálogo`; converge com o C2/entitlement.

## ⛔ FALTA — Post-it por empresa dos VALORES (manual, só Full)
Hoje o post-it por empresa só cobre MÓDULOS. Estender p/ assentos/quotas/parcela/trial via
`Company.planInfoOverrideJson` (reusa `mergePlanInfo`). Regra final de leitura:
**`empresa ?? plano (planInfoJson) ?? catálogo`**. (`Company.monthlyValueOverride`/`setupValue` já existem.)

## Outras caudas (menores)
- **Passo "dinheiro":** fiar setup/parcela/desconto na cobrança REAL + comissão (deliberado, protegido).
- **Reorg visual do Full:** mover o bloco Implantação pra aba "Implantação" própria (hoje vive na Comercial; já funciona).
- **Dívida de limpeza (cosmético, NÃO-gate):** consts `canUseAdminOnlyModule`/`defaultUserModuleAllowed`/
  `SELLER_*` + view master de políticas por-usuário ainda vivos. Remoção exige reescrever a view master.
- **ABERTO (dono):** repensar o diferencial do **Lead Plus** (hoje "Atendimento" = fraco, "abre o zap").
  Direção candidata: inbox de TIME em 1 número da empresa + dossiê do lead + histórico que fica com a empresa.

## Sequência recomendada (decisão do dono)
1. Definir o novo modelo de LIMITE (o que cada número significa). 2. Enforcement no `planInfoJson`,
começando por QUOTAS (não-cobrança). 3. Só então o post-it por empresa dos valores. Motivo: evita
tela morta (salva sem morder) e não encosta em cobrança antes da hora.

# Regras — PAGAMENTOS, ACESSO E CRÉDITO

> Leia este arquivo antes de tocar em qualquer coisa de módulo, RBAC, carteira de
> crédito, recarga, checkout, acesso comercial ou permissão. Estas invariantes
> quebram o produto se violadas.
>
> **CANÔNICO desde CRÉDITOS FASE 2 (REMOÇÃO, 05/07).** O modelo antigo de
> plano/tier (List/Lead Plus/Pro/Implantação decidindo módulo e capacidade,
> mais cobrança por assento) foi **aposentado como driver de acesso**. HBX
> agora roda em **3 camadas separadas** — nenhuma delas se chama "plano".

## Invariante-mãe: 3 camadas (nunca fundir numa só)

1. **MÓDULO = disponibilidade (kill-switch do MASTER).** Existe só para o
   master esconder/remover o que está em teste. Não deriva de plano/tier —
   default é **tudo ligado** (`SystemModule.defaultEnabled`), o master pode
   desligar por empresa via post-it (`CompanyModule.enabled`). Fonte:
   `backend/src/modules/module-access-policy.ts`
   (`resolveCompanyModuleAccessPolicy` → sempre resolve via
   `resolveKillSwitchModuleKeys`, ver R2 abaixo).
2. **RBAC/PERMISSÃO = o que cada cargo PODE fazer (do ADMIN pra baixo).**
   Vive em `UserTeamPolicy.modulesJson` / `team-access-catalog.ts`. É aqui
   que o admin controla os abaixo dele (quais ações o vendedor/gerente
   executa). Crédito **não** substitui isso; módulo **não** desce a cadeia
   (módulo é assunto Master↔Empresa).
3. **CRÉDITO = quanto pode consumir (carteira pré-paga).** Saldo persistente,
   recarregável, debitado por lead entregue. `1 crédito = 1 lead` (débito
   on-success, refund atômico on-failure, nunca negativo). Fonte:
   `backend/src/credits/*` (`CreditWalletService` = ledger atômico,
   `CreditsService` = orquestração/gate, `credits.flags.ts` = flags).

> Precedência de bloqueio (LEI, ordem fixa): **(1) estado comercial da
> empresa** (`Company.status` via `resolveCompanyAccessState` —
> suspenso/atraso trava tudo) → **(2) kill-switch de módulo do master** →
> **(3) RBAC do cargo** → **(4) saldo de crédito**. Qualquer camada anterior
> nega antes da seguinte ser consultada.

## O que NÃO existe mais (não recriar)

- **Tier/plano decidindo capacidade.** `getCommercialPlanTier` e
  `getCommercialPlanCapabilities` (`commercial-plan-catalog.ts`) sempre
  devolvem `'full'`/tudo-ligado — não são mais gate de produto. As
  capacidades booleanas (ver inteligência do lead, auto-enriquecer, filtros
  avançados, templates, relatório de conversão etc.) nascem **ligadas por
  default**; RBAC é quem corta agora, não plano.
- **Cota count-based bloqueando.** `CommercialUsageLimitsService`
  (`assertCanImportCard`, `assertCanSendPresentationEmail`,
  `recordLeadEnrichmentUseOnce`) mede e loga (`*_limit_shadow`), mas **nunca
  mais lança** por estourar limite mensal/diário de plano. O teto real é o
  saldo de crédito, verificado em `CreditsService.assertAndDebitLeadDelivery`
  (fail-closed, chamado do mesmo ponto da baixa).
- **Cobrança por assento.** Adicionar vendedor/admin é **grátis**
  (`seat-billing.util.ts` não é mais consumido por nenhum fluxo de cobrança;
  `financeiro.service.ts`/`commercial-plans.service.ts`/`modules.service.ts`
  sempre projetam `extraSeatMonthlyAmount: 0`). `seatCap` pode sobreviver
  como **teto operacional** do master (não cobrança).
- **Upgrade/downgrade com proração.** `changePlanForUser`
  (`financeiro.service.ts`) é um no-op informativo
  (`CREDITS_MODEL_NO_PLAN_CHANGE`) — não há mais "cobra a diferença
  proporcional" nem crédito de downgrade. `plan-proration.util.ts` fica
  como utilitário morto (não apagar sem necessidade real — ver nota de
  migration abaixo).
- **Vitrine de planos/checkout de assinatura mensal no frontend.**
  `trocar-plano-modal.tsx`, `extra-seats-card.tsx`, `lib/plan-rank.ts` e o
  paywall de cota mensal em `leads/page.client.tsx`
  (`renderQuotaPaywall`/`LimiteAtingidoModal`) foram **removidos** — não
  recriar. `configuracoes/page.client.tsx` não tem mais aba "Plano e
  cobrança"; a aba "Créditos" (`CreditsWalletSection`) é a única tela de
  cobrança do contratante.

## Estado comercial canônico (inalterado)

- `Company.status` é o ÚNICO estado comercial persistido:
  `pending_checkout | trial | active | courtesy | overdue | suspended`.
- As datas (`trialEndsAt`, `courtesyEndsAt`, `billingGraceEndsAt`) decidem
  vencimento NA LEITURA, nunca em coluna derivada.
- `backend/src/modules/company-access-state.ts` (`resolveCompanyAccessState`)
  é o único lugar que projeta o status para o vocabulário de leitura:
  `platform_infra | exempt | manual | paying | trial | trial_ending | grace |
  overdue | pending_checkout | suspended | unknown`.
- Os campos legados (`paymentStatus`, `subscriptionStatus`, `premiumAccess`,
  `onboardingStatus`, `billingExempt*`) e a tabela `UserModuleAccess` foram
  DROPADOS do schema. **Nunca recriar, nunca re-derivar estado de campo cru.**

## Cortesia — única liberação grátis (inalterado)

- Cortesia (`status='courtesy'` + motivo obrigatório + prazo opcional) é o
  ÚNICO mecanismo de acesso sem cobrança/sem crédito. Sem prazo = permanente
  (caso do tenant interno HBX). Prazo vencido = volta a cobrar.
- Setada apenas via ação master: `PUT /modules/master/company/:id/courtesy`.
- A empresa interna HBX é um tenant normal com cortesia permanente — **nunca
  fazer special-case por slug ou nome de empresa.**

## Carteira de crédito (S1–S6, publicado)

- **Ledger em lotes** (`CreditWallet` 1:1 por empresa + `CreditLedgerEntry`):
  cada entrada de saldo é um lote com `kind` (`grant`/`recharge`/`promo`),
  `amount`, `remaining`, `expiresAt`, `grantType`
  (`paid`/`courtesy_internal`/`promo`). Saldo = Σ(lotes não-expirados).
  Consumo FIFO (expira-primeiro sai primeiro). Débito nunca deixa saldo
  negativo (fail-closed): pedido de 50 com 30 de saldo serve 30 e para.
- **Entrada:** concessão manual do master (`grantToCompanyAsMaster`) ou
  recarga self-service via MercadoPago (`CreditRechargeService`,
  `POST /financeiro/credits/recharge` = cartão, síncrono) — crédito só entra
  com pagamento CONFIRMADO. **Pix (PR22082026, 22/08):** 2 fases —
  `POST /financeiro/credits/recharge/pix` gera o QR (charge `pending/PIX`, zero
  crédito) e o crédito entra em `settlePixCharge` (poll
  `GET /financeiro/credits/recharge/pix/:paymentId` OU webhook, quem chegar
  primeiro; idempotente por `usageKey mp:<paymentId>`, receita 1× pelo
  `ledgerEntryId`). Mesmas guardas P0.4 e LEI DO VENDEDOR do cartão.
  No binário da Play NENHUMA das duas rotas é alcançável (allowlist/HBX_PLAY). Lote de boas-vindas (`grantWelcomeBatch`, `grantType:'promo'`,
  nunca receita) no signup self-service.
- **Débito:** choke único na entrega/baixa do lead
  (`LeadContactWriteService`/`recordCardImport`/`recordCardCommercialUseOnce`
  em `CommercialUsageLimitsService`) → `CreditsService.assertAndDebitLeadDelivery`.
  Gate em 2 chaves: `HBX_CREDITS_ENFORCE` (env global) E
  `Company.creditsEnforceEnabled` (por-tenant) — as duas precisam estar ON.
  Refund atômico on-failure (`refundLeadDelivery`, mesma `usageKey`).
- **Teto por vendedor (S4, opcional):** reaproveita `UserTeamPolicy`
  (`monthlyCardsLimit`/`cardDeliveryDailyLimit`) como sub-orçamento de
  crédito; default sem teto. Empresa nunca é capada pelo teto de um
  vendedor (admin nunca capado por vendedor).
- **Ações caras/irreversíveis ficam FORA do crédito** (D1): scraping pago
  (Google/e-mail fallback via `EnrichmentCostService`), chip WhatsApp,
  Serpro/NFS-e — são governadas por orçamento próprio
  (`SourceBudgetService`/disjuntor de zap/`EnrichmentCostService`, que ainda
  usa `planKey` diretamente — NÃO `getCommercialPlanTier` — para orçamento
  de custo, um propósito diferente de capacidade de produto). Enriquecimento/
  IA/templates/e-mail são capacidade GRÁTIS (RBAC decide, crédito não).

## Vendedor nunca vê cobrança (inalterado, LEI DO VENDEDOR)

- Usuário com role `USER` (vendedor/funcionário) NUNCA vê telas de cobrança,
  valores, saldo em R$, status de pagamento ou motivo financeiro de bloqueio.
- Bloqueio de vendedor é sempre neutro: `company_access_paused` ou
  `module_not_enabled` (módulo) / `company_access_paused` (crédito
  esgotado). Vendedor vê só "leads disponíveis" — um NÚMERO, nunca R$/pacote
  (`CreditsService.getMeForSellerAudience`).
- Gerente (`ADMIN` com `canViewBilling=false`) cai na mesma régua neutra do
  vendedor para cobrança/crédito (`isBillingOwnerActor`,
  `access/actor-kind.ts`) — só o dono/master vê saldo e pacotes.
- Login do vendedor cai em `/vendas` e nunca recebe destino de checkout.
- Pontos de enforcement: `presentModuleBlockForRole` (backend), payloads
  neutros em `sanitizeUser`, `CreditsService.getMeForUser`.

## Catálogo de crédito (não de plano)

- Fonte única: `backend/src/credits/credit-pack-catalog.ts` (pacotes de
  recarga: starter/growth/scale, preço+créditos+validade). Editável pelo
  master via overlay (mesmo padrão do antigo catálogo de planos).
- `backend/src/commercial-plans/commercial-plan-catalog.ts` sobrevive só
  para: (a) `SystemModule`/entitlement legado ainda lido em pontos pontuais
  do master (`janela-self-checkout.tsx`), (b) `EnrichmentCostService`
  (orçamento de COGS por `planKey`, não capacidade). **Nunca reintroduzir
  preço/plano no frontend** — o frontend consome via API.
- A tabela `Plan` legada (`prata`/`ouro`/`diamante`...) foi DROPADA na
  migration `20260613_remove_legacy_plan_feature`. `structural-defaults.json`
  não semeia Plan legado — apenas `systemModules`. **Nunca recriar essa
  taxonomia.**

## Permissão por usuário (inalterado)

- Vive SÓ na team policy (`UserTeamPolicy.modulesJson`).
- Vendedor nasce com Vendas+Radar operacionais por default do
  `team-access-catalog.ts`.
- Mesma regra em qualquer superfície (desktop = mobile).
- **A2 (S8):** concessão de RBAC é intersecção — gerente/admin só concede o
  que ele mesmo tem (`grant ⊆ granter`). `canViewBilling` só editável por
  dono/master.

## Proibido sem ordem explícita do dono

Preço de pacote de crédito, catálogo de módulo, RBAC de cargo, provedor de
pagamento, checkout, webhook, reembolso — só com ordem explícita na tarefa.
O backend é a fonte de verdade comercial; nenhum paywall é afrouxado no
frontend.

## Red flags em revisão (prioridade máxima)

- Feature paga usável sem módulo habilitado (kill-switch) OU sem RBAC OU
  (quando a ação debita) sem saldo de crédito suficiente.
- Estado de cobrança re-derivado de campos crus em vez de
  `resolveCompanyAccessState`.
- Valor/saldo/pacote de crédito renderizado para usuário não-billing
  (vendedor ou gerente sem `canViewBilling`).
- Guard de auth ou fronteira tenant/usuário enfraquecida.
- Débito de crédito não-atômico, saldo podendo ficar negativo, ou débito
  que fura `SourceBudgetService`/disjuntor de zap/`EnrichmentCostService`.
- Mudança em checkout/webhook/recarga sem teste.
- Reintrodução de tier/plano decidindo módulo, capacidade ou cobrança de
  assento (a Fase 2 existe exatamente para isso não voltar).

## Nota de migração (histórico, não canônico)

O plano/tier antigo (`hbx_lite`/`hbx_padrao`/`hbx_pro`/`hbx_melhor`) ainda
existe em `Company.selectedPlanKey` e no catálogo de código — não foi
apagado do banco (migration destrutiva fica para depois de um ciclo de
billing limpo no modelo novo, por ordem do dono). Código morto relacionado
(`plan-proration.util.ts`, ramos de `financeiro.service.ts` como
`_legacyChangePlanForUser`) foi mantido não-alcançável em vez de deletado,
para não arriscar DI/import cruzado — pode ser removido de vez numa faxina
futura, à parte.

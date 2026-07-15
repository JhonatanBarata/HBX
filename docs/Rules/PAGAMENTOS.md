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

- **Tier/plano decidindo capacidade.** O contrato de tier foi removido. As
  capacidades do produto-lead são universais e RBAC é quem corta ações da
  equipe, nunca o plano. Enriquecimento automático extra permanece desligado;
  o enriquecimento permitido acontece somente após o débito na puxada.
- **Cota count-based por cliente/plano.** Os gates mensais, diários e a antiga
  cota de 6 buscas Google foram removidos, inclusive contrato de API, contador
  e configuração. O único freio comercial de aquisição é o saldo de crédito;
  Google e Brave mantêm apenas governors globais de custo da infraestrutura.
- **Cobrança por assento.** Adicionar vendedor/admin é **grátis**
  (`seat-billing.util.ts` não é mais consumido por nenhum fluxo de cobrança;
  `financeiro.service.ts`/`commercial-plans.service.ts`/`modules.service.ts`
  sempre projetam `extraSeatMonthlyAmount: 0`). `seatCap` pode sobreviver
  como **teto operacional** do master (não cobrança).
- **Upgrade/downgrade mudando capacidade.** Plano nunca liga/desliga recurso.
  Metadados e trilhas históricas de cobrança/proração permanecem somente para
  conciliação financeira; não são fallback de produto.
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

## Cortesia — acesso comercial, nunca lead grátis

- Cortesia (`status='courtesy'` + motivo obrigatório + prazo opcional) pode
  isentar a mensalidade/acesso comercial. Ela **não isenta o débito por lead**:
  todo tenant precisa de saldo e cada revelação custa 1 crédito.
- Não existe mais endpoint de cortesia capaz de mudar o produto entregue.
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
  `POST /financeiro/credits/recharge`) — crédito só entra com pagamento
  CONFIRMADO. Lote de boas-vindas (`grantWelcomeBatch`, `grantType:'promo'`,
  nunca receita) no signup self-service.
- **Débito:** choke único no claim canônico do Radar:
  `CommercialUsageLimitsService.reserveLeadDeliveryCredit` →
  `CreditsService.assertAndDebitLeadDelivery`. Importação interna, clique em
  contato e telemetria nunca debitam.
  O débito é obrigatório para todo `Company.companyKind='tenant'`, inclusive
  quando quem opera é system master. `accountType`, plano, cortesia e flags de
  storefront nunca criam bypass. Sem serviço/configuração ou sem confirmação
  `{ applied:true, debited:1 }`, o fluxo falha fechado antes de posse, hidratação
  e revelação. `lead_delivery` é fixo em modo débito com custo 1 e não aceita
  override grátis.
  Refund atômico on-failure (`refundLeadDelivery`, mesma `usageKey`).
- **Produto único por lead:** plano, cargo e histórico de uso não criam teto
  diário, mensal ou de carteira. Permanecem somente RBAC, kill-switch do
  módulo, estado comercial da empresa e o débito de um crédito por aquisição.
- **Ações caras/irreversíveis ficam FORA do crédito** (D1): Google, Brave,
  chip WhatsApp e Serpro/NFS-e são governados por freios físicos globais
  (`SourceBudgetService`/disjuntor de zap), nunca por plano do cliente.
  Enriquecedores externos diferentes de Google e Brave foram removidos.

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
- Metadados de plano que ainda sejam necessários para faturas ou histórico
  comercial são somente dados contábeis. Eles nunca controlam módulo,
  recurso, exportação, enriquecimento, qualidade, limite ou interface.
  **Nunca reintroduzir preço/plano como gate no frontend.**
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
  que fura `SourceBudgetService`/disjuntor de zap.
- Mudança em checkout/webhook/recarga sem teste.
- Reintrodução de tier/plano decidindo módulo, capacidade ou cobrança de
  assento (a Fase 2 existe exatamente para isso não voltar).

## Compatibilidade comercial

Dados históricos necessários para conciliação, assinatura e emissão fiscal
podem permanecer no banco. Código morto e regras de produto por tier/plano
não permanecem como fallback: devem ser removidos no mesmo passo e cobertos
por teste que prove a igualdade de capacidades.

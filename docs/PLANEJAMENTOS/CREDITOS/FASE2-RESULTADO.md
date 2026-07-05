# FASE 2 (REMOÇÃO) — RESULTADO

> Executado LOCAL, direto no worktree isolado (agent-a8cf19a7bf15017f4), a partir do master já
> publicado com S1–S6/A3/R1-código/R2-código (kill-switch atrás de flag). NÃO commitado, NÃO
> publicado. Escopo: R2→R5 do `PLANO.md` (backend) + vocabulário de crédito no frontend.
>
> **Contexto que mudou o cálculo de risco:** não existem clientes reais — só o tenant interno
> HBX (courtesy). O guardrail original do PLANO.md ("R3/R4/R5 só depois de S7 migração + 1 ciclo
> de billing limpo") pressupõe clientes vivos que dependem do modelo antigo. Sem eles, S7 não
> tem o que migrar — a ordem desta tarefa (orquestrador) foi executar R2→R5 direto.

---

## R2 — Módulo desacopla de plano (backend/src/modules/module-access-policy.ts)

**Antes:** kill-switch existia mas só ativava atrás de `HBX_MODULES_KILLSWITCH_ONLY` (default
OFF) — com a flag desligada, `moduleKeys` continuava derivando de `COMMERCIAL_PLAN_MODULE_KEYS`.

**Depois:** removida a checagem da flag. `resolveCompanyModuleAccessPolicy` agora usa
`resolveKillSwitchModuleKeys(moduleSnapshot)` sempre que um snapshot é passado (o único
call site, `modules.service.ts::resolveCompanyModulePolicyWithKillSwitch`, sempre monta o
snapshot agora). Fallback por plano só sobrevive como rede de segurança defensiva quando
**nenhum snapshot** é passado (chamador não migrado) — não é mais o caminho normal.

- `isModulesKillSwitchOnlyEnabled()` virou `return true` fixo (função mantida só por
  compatibilidade de import; não lê mais a env). A env `HBX_MODULES_KILLSWITCH_ONLY` não tem
  mais nenhum efeito — comentário atualizado em `backend/.env.example`.
- Confirmado no `structural-defaults.json` que todos os módulos comerciais relevantes
  (`atendimento`, `vendas`, `webscraping`, `cadastro`, `gerencial`, `financeiro`, `empresas`,
  `contatos`, `produtos`, `logistica`) já nascem `defaultEnabled: true` — a virada não tranca
  ninguém. `bot`/`email`/`website`/`vc` continuam `defaultEnabled: false` (kill-switch real, o
  master ainda não ligou esses).

**Arquivos:** `backend/src/modules/module-access-policy.ts`, `backend/src/modules/modules.service.ts`,
`backend/src/modules/module-access-policy.test.ts` (2 testes reescritos para refletir o novo
default; resto intacto), `backend/.env.example`.

## R3 — Tier deixa de decidir acesso/capacidade

`getCommercialPlanTier` (`commercial-plan-catalog.ts`) agora sempre devolve `'full'`.
`getCommercialPlanCapabilities` sempre devolve o objeto todo-`true` (era o branch "não-list" de
antes). Efeito em cascata, SEM editar os call sites:

- `vendas.service.ts::buildPlanAccess` → `capabilities`/`planTier` sempre liberados. Todos os
  gates que dependiam disso (`canSeeLeadIntelligence`, `canAutoEnrichLeads`,
  `canUseAdvancedFilters`, `canUseSalesProfileAdvanced`, `canExportConversionPdf`,
  `canUseWeeklyProfileSuggestions`, `canUseVerifiedWhatsapp`) abrem para todo mundo.
- `commercial-plans.service.ts::buildCurrentState` → `tier`/`canSeeLeadIntelligence`/
  `canSeeCompanyData` sempre `'full'`/`true` no payload de `/commercial-plans/me`.

**Achado importante (revisado e corrigido):** `EnrichmentCostService`
(`webscraping/enrichment-cost/enrichment-cost.service.ts`) também usava
`getCommercialPlanTier` — mas para **dois governadores de CUSTO real (COGS)**, não capacidade
de produto (D1 do PLANO.md: ações caras ficam fora do crédito, em governadores físicos):

1. `planTier === 'list' && triggeredBy === 'auto'` → bloqueava fallback pago automático pra
   quem era List. Comecei a quebrar o teste `HBX List bloqueia fallback pago automatico`
   porque virou sempre `'full'`. **Corrigido:** trocado para checar `planKey ===
   COMMERCIAL_PLAN_KEYS.LITE` diretamente (não depende mais de `getCommercialPlanTier`).
2. `checkQualityGate` usava `planTier === 'full' ? 55 : 70` como score mínimo de lead pra
   liberar fallback pago — teria afrouxado a barra pra 55 (a mais permissiva) em TODOS os
   planos. **Corrigido:** a função passou a receber `planKey` e decide `isFullTierPlan` por
   `planKey === PRO || planKey === MELHOR` (mesmo resultado de antes, sem depender do tier
   aposentado).

Sem essa correção, o afrouxamento do gate de capacidade teria vazado pra um gate de dinheiro
(quanto se gasta em fallback pago por lead) — não era a intenção do R3, que é só sobre
capacidade de produto, não orçamento de COGS. Os 6 testes de `enrichment-cost.service.test.ts`
ficaram verdes depois do fix.

**Arquivos:** `backend/src/commercial-plans/commercial-plan-catalog.ts`,
`backend/src/webscraping/enrichment-cost/enrichment-cost.service.ts`,
`backend/src/vendas/vendas.service.test.ts` (1 teste reescrito — nome e asserts invertidos pra
provar que List agora vê inteligência completa).

## R4 — Aposenta cobrança por assento

Assento passou a ser **grátis** em todo caminho de cobrança, sem apagar `seat-billing.util.ts`
(fica órfão em disco, nenhum consumidor mais chama nada dele) nem `CompanyBillableSeatUsage`
(schema/tabela intactos — histórico de headcount continua sendo gravado por
`users.service.ts::createCompanyUser`, só não gera mais cobrança):

- **`financeiro.service.ts::purchaseExtraSeats`** — reescrito: sobe `seatCap` (teto
  operacional) sem cobrar nada (`chargeNow: 0`, sem proration, sem gate de assinatura).
- **`financeiro.service.ts::buildSeatBillingSnapshot`** — não chama mais
  `computeCompanySeatBillingSnapshot`; devolve snapshot zerado com `activeUsers` real
  (informativo) e todo `extraSeat*` em 0. Isso zera `extraSeatCycleAmount` que entrava na
  soma de `finalCycleAmount` cobrada no Mercado Pago.
- **`commercial-plans.service.ts::computeCompanyCommercialAmount`** — mesma lógica: conta
  `billableUsers` real, mas não computa mais assento extra (usado no `billingBreakdown` de
  `/commercial-plans/me`).
- **`modules.service.ts::buildSeatBillingSnapshot`** (função DIFERENTE, específica do resumo do
  master em `janela-empresas.tsx`) — mesma correção: `includedActiveUsers = activeUsers`,
  `extraSeat* = 0`.
- **`users.service.ts::getCompanySeatBilling`** (endpoint `GET /users/company/seat-billing`,
  consumido pelo aviso de custo no convite de vendedor) — não chama mais
  `computeCompanySeatBillingSnapshot`; devolve `extraUserMonthlyPrice: 0`,
  `nextUserIsExtra: false`, `includedUsers = activeUsers`. `seatCap` sobrevive como teto.
- **Frontend (`novo-acesso-modal.tsx`)** — o aviso "assento EXTRA de R$X/mês" nunca mais
  aparece (a condição já não dispara mais vindo do backend); reescrevi a caixa de aviso pra só
  mostrar o teto operacional (`seatCap`) quando o master configurou um, sem falar em preço.

Imports órfãos removidos (`canBillExtraSeatsForPlan`, `computeImmediateExtraSeatCharge`,
`computeCompanySeatBillingSnapshot`, `getCommercialPlanExtraUserMonthlyPrice`,
`getCommercialPlanIncludedUsers` onde ficaram sem uso).

**Arquivos:** `backend/src/financeiro/financeiro.service.ts`,
`backend/src/commercial-plans/commercial-plans.service.ts`, `backend/src/modules/modules.service.ts`,
`backend/src/users/users.service.ts`, `frontend/src/components/hbx/novo-acesso-modal.tsx`.
`backend/src/commercial-plans/seat-billing.util.ts` — arquivo mantido intacto, virou código
morto (nenhum import restante fora do próprio teste `seat-billing.util.test.ts`, que continua
verde testando as funções puras isoladas).

## R5 — Cota count-based deixa de bloquear + faxina de proração

**`CommercialUsageLimitsService`** (`commercial-usage-limits.service.ts`) — três métodos que
lançavam `ConflictException` ao estourar cota mensal/diária de plano viraram telemetria pura:

- `assertCanImportCard` — não lança mais; grava `card_import_limit_shadow` em vez de bloquear
  (era `card_import_blocked`, que ficou reservado pro código antigo/histórico).
- `assertCanSendPresentationEmail` — idem, `presentation_email_limit_shadow`.
- `recordLeadEnrichmentUseOnce` — idem, `lead_enrichment_limit_shadow` (D1: enriquecimento é
  capacidade GRÁTIS, RBAC decide, não cota de plano).

**`vendas.service.ts`** — achei um SEGUNDO ponto de bloqueio independente dentro do import em
lote (`importWebscrapingLeadsForUser`): um `ConflictException` local com os mesmos códigos
(`MONTHLY_CARD_LIMIT_REACHED`/`DAILY_CARD_SAFETY_LIMIT_REACHED`) calculado a partir de
`pendingQuotaReservations >= effectiveRemaining`, pra não estourar a cota dentro do MESMO lote
de import. Removido o throw (o cálculo fica mas não gate mais nada) — sem isso, R5 teria ficado
incompleto: o gate de `CommercialUsageLimitsService` para de bloquear mas o import em lote
continuaria bloqueando pelo mesmo número.

**O teto real** continua sendo o crédito: `enforceLeadDeliveryDebit` (dentro de
`recordCardImport`/`recordCardCommercialUseOnce`) chama
`CreditsService.assertAndDebitLeadDelivery`, que É fail-closed e PODE lançar — isso não mudou
e é o gate que efetivamente protege a entrega hoje (quando `HBX_CREDITS_ENFORCE` +
`Company.creditsEnforceEnabled` estiverem ON; hoje ambos OFF em prod, então nada bloqueia
runtime nenhum caminho até o dono ligar as flags — ver seção "O que ainda depende de flag").

**`changePlanForUser`** (`financeiro.service.ts`) — o fluxo de troca de plano com proração
(upgrade cobra diferença / downgrade credita) foi **desligado, não deletado**: a função pública
virou um no-op que devolve `{ ok: true, noop: true, code: 'CREDITS_MODEL_NO_PLAN_CHANGE' }` sem
tocar em cartão/MercadoPago. O corpo antigo (proração, `applyUpgradePlanChange`,
`applyDowngradePlanChange`, `applyTrialEndingPlanChange`, `recordProrationCharge`) foi renomeado
pra `_legacyChangePlanForUser` — método privado, nunca mais chamado por ninguém, mas ainda
compila (não quebra DI, não precisa reescrever ~630 linhas de máquina de cobrança sob risco).
Justificativa de não deletar: é código financeiro grande e intrincado (múltiplos branches de
Mercado Pago live/mock); apagar às cegas era mais risco do que benefício nesta rodada. Fica
marcado pra faxina real de código morto numa tarefa dedicada, à parte.

**`docs/Rules/PAGAMENTOS.md`** — reescrito por completo pro novo cânone: 3 camadas (módulo
kill-switch / RBAC / crédito), carteira pré-paga, sem tier/assento, lista explícita do que NÃO
existe mais (pra não ser recriado por engano), nota de migração explicando o que ficou como
código morto.

**Arquivos:** `backend/src/commercial-plans/commercial-usage-limits.service.ts`,
`backend/src/commercial-plans/commercial-usage-limits.service.test.ts` (1 teste reescrito),
`backend/src/vendas/vendas.service.ts`, `backend/src/financeiro/financeiro.service.ts`,
`docs/Rules/PAGAMENTOS.md`.

## Frontend — vocabulário de crédito

Mapeado primeiro com um sub-agente de pesquisa (read-only) pra não editar às cegas num arquivo
de 900+ linhas com dezenas de state hooks interligados.

- **`configuracoes/page.client.tsx`** — removida a aba "Plano e cobrança" inteira (vitrine de
  planos, checkout de assinatura, upgrade/downgrade, cancelar assinatura, assento extra). A aba
  "Créditos" ficou como ÚNICA tela de cobrança do contratante; ganhou um card resumido "Acesso
  da conta" (estado de acesso + módulos liberados) antes da carteira (`CreditsWalletSection`,
  que já existia intacta — S6 já tinha isso pronto). Removidos: state
  (`planoBusy`/`planoMsg`/`subscribePlan`/`upgradePay`/`trialEndPay`/`confirmCancelar`/
  `implantacaoOpen`/`trocarPlano`/`livePlans`/`team`), funções (`recarregarPlano`,
  `cancelarAssinatura`), 4 modais no fim do render (subscribe/upgrade/trialEnd/trocarPlano) +
  `ConfirmDialog` de cancelamento + `ImplantacaoContato`. Fetch de `/users/company` (só existia
  pra contar assento) e `fetchPublicPlans()` removidos.
- **`leads/page.client.tsx`** — o paywall "cota de leads do plano" (`renderQuotaPaywall`,
  `LimiteAtingidoModal`, botão "Aumentar meu plano") foi removido — o backend (R5) já não
  bloqueia mais por essa cota, então o front replicava um bloqueio fantasma nos botões
  "Puxar" que o servidor não aplicava mais. O teto de VENDEDOR (`saq`/RBAC, "carteira cheia")
  continua intacto — isso não é paywall de tier, é limite operacional por cargo.
- **`novo-acesso-modal.tsx`** — aviso de custo de assento removido (ver R4 acima).
- **Arquivos deletados** (órfãos confirmados, zero import restante):
  `frontend/src/components/hbx/trocar-plano-modal.tsx`,
  `frontend/src/components/hbx/extra-seats-card.tsx`,
  `frontend/src/components/hbx/limite-atingido-modal.tsx`,
  `frontend/src/lib/plan-rank.ts`.
- **CSS órfão removido** (`hbx-theme/screens.css`): `.plan-billing-split`, `.pbs-main`,
  `.pbs-seats`, `.sc-seats-row`, `.sc-seats-n` (só existiam para o layout removido).

**NÃO tocado (fora de escopo/risco desnecessário):**
- Landing pública (`app/page.client.tsx`, view "planos") e `register/page.client.tsx` — são o
  funil de marketing/cadastro que o dono controla ativamente (memória: "Landing = Portal v3.0,
  dono manteve"); mexer aí sem ordem explícita seria "afrouxar/reformular vitrine" fora do
  pedido desta tarefa (que é vocabulário DENTRO do produto logado).
- `janela-self-checkout.tsx`/`janela-empresas.tsx` (master) — continuam editando o catálogo de
  plano legado (preço/módulos por plano); é ferramenta do master, não paywall pro cliente, e
  ainda tem utilidade residual (kill-switch de módulo é editado ali).
- `checkout-panel.tsx` — sobrevive integralmente; é reusado pela recarga de crédito real
  (`credits-wallet-section.tsx`) via `submitOverride`. Só o vocabulário AO REDOR dele (ciclo,
  trial, proração) saiu, não o componente de pagamento.
- `dev/checkout/page.tsx` — harness de dev do `CheckoutPanel`, não fala de plano/tier
  diretamente, mantido.

## Checks

- **Backend:** `npm run prisma:validate` ✅ · `npm run build` (tsc) ✅ zero erros ·
  212 testes verdes nas suítes tocadas/adjacentes (`credits/*`, `commercial-plans/*`,
  `modules/module-access-policy.test.ts`, `users/*`, `webscraping/enrichment-cost/*`,
  `financeiro/credit-recharge.service.test.ts`, `auth/auth.service.test.ts`,
  `products/tenant-product-seed.test.ts`).
- **`vendas.service.test.ts`: 8 falhas PRÉ-EXISTENTES no master** (confirmado via `git stash` —
  mesmas 8 falhas sem nenhuma das minhas edições). Causa: `createService()` do teste monta um
  mock de `CommercialUsageLimitsService` sem `getSellerCardCapacitySnapshot` (método que
  `getBoardForUser` já chama antes desta tarefa) + 2 testes de contagem de débito desalinhados.
  Flaggeado à parte (task separada) — não bloqueia esta entrega, não foi introduzido por mim.
- **Frontend:** `npx tsc --noEmit` ✅ zero erros · `node ./scripts/run-next-build.js` ✅ build de
  produção completo, 42 rotas geradas (incluindo `/configuracoes`, `/leads`, `/planos`) ·
  `node ./scripts/check-pele.mjs` — reprova por violações PRÉ-EXISTENTES em 3 arquivos de CSS
  legado (`bot-builder.css`, `screens.css`, `whatsapp.css`) que eu não toquei (confirmado via
  `git diff` — mesmas linhas, mesmo conteúdo do master antes desta sessão). Flaggeado à parte.

## O que virou stub/no-op vs. deletado

| Item | Destino |
|---|---|
| `resolveCompanyModuleAccessPolicy` fallback por plano | Sobrevive como rede de segurança (sem snapshot) |
| `isModulesKillSwitchOnlyEnabled()` | `return true` fixo, não lê mais env |
| `getCommercialPlanTier`/`getCommercialPlanCapabilities` | Sempre `'full'`/tudo-`true` |
| `seat-billing.util.ts` | Arquivo intacto, zero consumidor de cobrança (código morto) |
| `financeiro.service.ts::changePlanForUser` (lógica antiga) | Renomeado `_legacyChangePlanForUser`, nunca chamado |
| `plan-proration.util.ts` | Intacto, zero consumidor (código morto) |
| `CommercialUsageLimitsService` (3 métodos) | Nunca lançam, viram telemetria `*_limit_shadow` |
| `trocar-plano-modal.tsx`/`extra-seats-card.tsx`/`limite-atingido-modal.tsx`/`plan-rank.ts` | **Deletados** (zero import restante) |
| `CompanyBillableSeatUsage` (tabela) | Intacta, continua sendo escrita (histórico de headcount), sem gerar cobrança |

## Riscos de boot

Nenhum encontrado. Todas as remoções de import foram verificadas (`grep` de cada símbolo antes
de remover do import) e o `tsc` full-project + `prisma generate` + build completo do Next
confirmam zero erro de compilação/DI. Os métodos "mortos" (`_legacyChangePlanForUser`, funções
em `seat-billing.util.ts`/`plan-proration.util.ts`) continuam type-checking normalmente — não
foram excluídos do grafo de módulos, só ficaram inalcançáveis em runtime.

## O que ainda depende de flag/ativação (fora do meu escopo mexer)

- `HBX_CREDITS_ENABLED` / `HBX_CREDITS_SHADOW` / `HBX_CREDITS_ENFORCE` (env global) +
  `Company.creditsEnforceEnabled` (por-tenant) — todas ainda OFF por default. Enquanto
  `HBX_CREDITS_ENFORCE` (as 2 chaves) não for ligado, **nada bloqueia a entrega de lead por
  saldo** — nem a cota antiga (removida nesta Fase 2) nem o crédito (ainda não ativo). Isso é
  esperado no worktree local (tenant HBX = courtesy, sem necessidade de bloqueio), mas é a
  PRIMEIRA coisa a decidir antes de publicar: ligar `HBX_CREDITS_ENABLED` primeiro, medir
  `HBX_CREDITS_SHADOW`, só depois `HBX_CREDITS_ENFORCE` — ordem já documentada no `PLANO.md`.
- `HBX_MODULES_KILLSWITCH_ONLY` não depende mais de nada — o comportamento R2 é definitivo e
  incondicional agora (não é mais uma flag a "ligar depois").

## Pontos para o Opus revisar com atenção (risco nº1 pedido na tarefa)

1. **`EnrichmentCostService`** — troquei `getCommercialPlanTier` por `planKey` direto em 2
   lugares (fallback automático List, score mínimo de qualidade). Validar que o comportamento
   ficou byte-a-byte igual ao anterior (os 6 testes da suíte confirmam, mas é o ponto onde uma
   mudança de capacidade quase vazou pra um orçamento de dinheiro real).
2. **`vendas.service.ts` — segundo bloqueio de cota no import em lote.** Removido o throw de
   `pendingQuotaReservations >= effectiveRemaining`; se existir algum motivo de negócio pra essa
   trava sobreviver (proteção contra abuso dentro de UM request grande, não relacionada a
   plano), vale reavaliar — eu tratei como parte da mesma cota count-based que R5 manda
   desligar, mas é um ponto que só existe nesse arquivo, não em `CommercialUsageLimitsService`.
3. **`changePlanForUser` como no-op vs. deletar de vez.** Optei por não deletar ~630 linhas de
   lógica de Mercado Pago (upgrade/downgrade/trial-ending) para não arriscar quebrar algo que eu
   não conseguiria validar sem ambiente live — mas isso significa que código financeiro morto
   fica no repo até uma faxina dedicada. Se preferir apagar de vez agora, é decisão consciente
   do dono/Opus, não miudeza.
4. **Frontend "Créditos" tab não tem mais nenhum jeito de ver/mudar `selectedPlanKey`.** Se
   algum fluxo do dono (ex.: contrato "Empresas"/Implantação) ainda depender de ver o plano
   selecionado do contratante na UI logada, esse dado sumiu da tela (só sobrevive no
   `/commercial-plans/me` cru e nas telas do master).

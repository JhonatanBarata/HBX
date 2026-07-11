# RELEASE-20X — MISSÃO C: CONTRATO COMERCIAL (fontes de verdade)

> Auditoria SÓ-LEITURA de 11/07/2026 sobre o working tree local (master à frente de prod).
> Publicados até `3ddb9765`; `9fc053da` (S8 chavinha empresarial), `e1da20f7`, `f344a294` são LOCAIS.
> `8a134730` (freio comissão) e `74abf9d3` (estorno/chargeback) estão PUBLICADOS (verificado por
> `git merge-base --is-ancestor` contra `3ddb9765`). Todos os arquivo:linha abaixo foram conferidos
> no código ATUAL via Read/Grep nesta data.

---

## 1. O que define o TIPO da conta

**Campo único:** `Company.accountType String @default("credit")` — `backend/prisma/schema.prisma:103`
(contrato nos comentários L96-102: `'credit'` = self-service, teto real é saldo; `'enterprise'` =
exceção montada pelo master, mantém a máquina de estados legada).

**Vocabulário e normalização (fonte única):** `backend/src/modules/company-access-state.ts:55`
(`type CompanyAccountType = 'credit' | 'enterprise'`) e `normalizeCompanyAccountType()` L59-64 —
valor ausente/desconhecido normaliza para `'credit'`, **nunca** enterprise por omissão.

**Backfill S6 (aplicado):** `backend/prisma/migrations/20260710010000_company_account_type/migration.sql`
— `ADD COLUMN ... DEFAULT 'credit'` + `UPDATE ... SET accountType='enterprise' WHERE paymentMethod='MANUAL'
OR billingProvider='mercadopago' OR companyKind='platform_infra'`. Idempotente; todo o resto ficou `credit`.

**Quem escreve o campo hoje:**
| Porta | accountType | Prova |
|---|---|---|
| Signup self-service (email/Google) | não escreve → default `credit` | `backend/src/auth/auth.service.ts:741-766` (comentário: "nada a setar aqui"); teste `auth.service.test.ts:733` |
| Wizard master FULL (Implantação) | `'enterprise'` explícito | `backend/src/master-provisioning/master-provisioning.service.ts:340` |
| Toggle S6 na ficha | PUT `/modules/master/company/:id/account-type` | `backend/src/modules/modules.controller.ts:721-729` → `modules.service.ts:5007-5039` |
| S8 chavinha empresarial (LOCAL `9fc053da`) | `'enterprise'` (reusa S6) | `backend/src/modules/modules.service.ts:5357` |
| **Convite simples do master** (`createByMaster`) | **NÃO seta** → nasce `credit` | `backend/src/companies/companies.service.ts:472-529` (cria com `status:'pending_checkout'`, sem accountType) |

⚠️ O comentário do schema (L102) promete "wizard master → enterprise", mas isso só vale pro wizard
FULL (master-provisioning). A porta `createByMaster` (convite por e-mail) ficou fora — ver conflito C-3.

---

## 2. O que BLOQUEIA acesso — precedência real nos guards

**Guard HTTP:** `backend/src/modules/module-access.guard.ts` — L35 `user.isSystemMaster → true`
(master nunca é bloqueado por módulo); L39 delega a `modulesService.canUserAccessModule`.

**Ordem REAL dentro de `canUserAccessModule`** (`backend/src/modules/modules.service.ts:2181-2274`):

1. **Chave `master`/`exclusoes`** → só `isSystemMaster` (L2186).
2. **Master bypass** total (L2187).
3. **Sem empresa** → nega (L2188).
4. **`financeiro`** → nega `platform_infra`; senão decide SÓ por role admin-tier — **escapa suspensão
   de propósito** (é a rota de pagamento) (L2189-2196; reforço em L2239-2241: empresa bloqueada ainda
   retorna true para financeiro).
5. **`gerencial`** → exige `evaluateCompanyStatus().active` + role (L2197-2208) — NÃO escapa suspensão.
6. **Estado comercial da empresa** (módulos comerciais): `evaluateCompanyStatus` (L2221; corpo em
   L1858-1949 — lê `resolveCompanyAccessState` e **materializa** transições terminais: trial vencido →
   `suspended`, graça vencida → `overdue`, gravando no banco L1928-1936) **+**
   `resolveCompanyModulePolicyWithKillSwitch` (L2238 → `module-access-policy.ts:166-261`:
   `platform_infra` bloqueado L173-183, `pending_checkout` L193-203, `overdue` L205-215,
   `!canUse` → `subscription_inactive` L217-227). Falhou qualquer um → nega (L2239-2241).
   - **Fonte única do estado:** `backend/src/modules/company-access-state.ts:230-276`. Conta
     **credit**: L254-256 — **só `status='suspended'` bloqueia**; todo o resto (inclusive
     `pending_checkout`/`trial`/`courtesy`/`overdue` legados no banco) lê como `'exempt'` (ativa).
     Conta **enterprise**: L259-263 — máquina legada completa decidida pelas datas.
   - Suspensão/exclusão gravam `status='suspended'` (`modules.service.ts:5066-5080`
     setCompanySuspensionByMaster; archive/remove em companies.service).
7. **Kill-switch por módulo (camada empresa):** post-it `CompanyModule` com efetivo =
   `masterEnabled && enabled` (`module-access-policy.ts:33-39` `effectiveCompanyModuleEnabled`;
   `masterEnabled` null → true, mesmo backfill da migração `20260710130000`). Teto do master OFF
   mata o módulo mesmo com a empresa ligada (`modules.service.ts:2085-2091`, `2252-2256`).
   **Sem post-it → caixa do plano** `getPlanModuleDefaults(accessPolicy.planKey)` (L2059-2078,
   L2246) — legado de plano VIVO e intencional (ver §6).
8. **Módulo company-level** (`logistica`): decide na camada empresa e PARA — pula cargo e caps
   (`module-access-policy.ts:16-21`; `modules.service.ts:2260`).
9. **RBAC de cargo:** molho do cargo Vendedor (`sellerCargoAccessJson`) para role USER; ADMIN/USERMASTER
   veem tudo; `financeiro`/`gerencial` são muro de vendedor (L2262; `resolveCargoModuleAllowed`
   L1985-1997; muro em L1995).
10. **Caps por usuário:** `resolveModuleEffectiveCapability` (L2264-2270).

**SALDO NÃO bloqueia módulo.** Saldo bloqueia a ENTREGA no choke de consumo
(`backend/src/commercial-plans/commercial-usage-limits.service.ts:1177-1193`
`enforceLeadDeliveryDebit` e `:1204-1226` `reserveLeadDeliveryCredit`), nesta ordem interna:
1. **Teto diário anti-scraper** `assertDailyDeliveryCapNotReached` (L1112-1166) — ANTES do débito,
   com bypass master (L1121) e platform_infra (L1124), idempotência por usageKey (L1129-1141),
   fail-open em erro de infra (L1162-1165).
2. **Hold de chargeback** (`credits.service.ts:728-734`) — dívida > 0 trava a empresa inteira.
3. **Teto individual do vendedor** (`credits.service.ts:736-740`; contagem no ledger L616-664).
4. **Débito FIFO fail-closed** (`credits.service.ts:742-752`) — `debited < 1` → 409, entrega PARA.

**LEI DO VENDEDOR:** bloqueio neutro para não-dono — `credits.service.ts:673-696` (`throwBlocked`,
código `company_access_paused`); motivo financeiro mascarado no policy para role não-contratante em
`module-access-policy.ts:125-150` (`presentModuleBlockForRole`).

---

## 3. Quando um débito de crédito REALMENTE acontece

**Flags** (`backend/src/credits/credits.flags.ts`):
- `HBX_CREDITS_ENABLED` (L4-6): liga o módulo/endpoints/welcome — e, pós-S6, o débito real de conta credit.
- `HBX_CREDITS_SHADOW` (L12-14): só medição (`debit_shadow`), nunca cobra.
- `HBX_CREDITS_ENFORCE` (L20-22): chave mestra do cutover de **enterprise** (2 chaves).

**Gate por empresa — `isEnforceActiveForCompany`** (`backend/src/credits/credits.service.ts:533-556`):
- Conta **credit**: `isCreditsFeatureEnabled() && accountType==='credit'` → **true** (L551). Ou seja:
  com `HBX_CREDITS_ENABLED=true` (que a VPS tem desde a campanha TESTE-GERAL), **o débito real de
  lead está LIGADO por default para TODA conta credit** — não depende de ENFORCE nem de flag por empresa.
- Conta **enterprise**: exige `HBX_CREDITS_ENFORCE=true` (env) **E** `Company.creditsEnforceEnabled=true`
  (schema.prisma:126, default false) (L554-555). Qualquer uma OFF → sem débito.
  Testes: `credits.service.test.ts:998-1050`.

**Choke real — `assertAndDebitLeadDelivery`** (`credits.service.ts:707-755`): no-op com gate OFF (L716);
**master god-mode nunca debita o tenant** (L719, `isActingUserSystemMaster` L589-604); usageKey canônica
`enforce:<actionKey>:<leadId>` (L742); débito de 1 via `CreditWalletService.debit`; sem saldo → 409
fail-closed (L749-752). Refund on-failure: `refundLeadDelivery` L764-783 (idempotente por `refund:<usageKey>`).

**Pontos de disparo (1 lead = 1 baixa):**
- `recordCardImport` — enforce ANTES do log de sucesso (`commercial-usage-limits.service.ts:953-966`).
- `recordCardCommercialUseOnce` — L1246-1282 (L1251/L1272), com dedup por `CARD_SUCCESS_EVENTS`.
- `reserveLeadDeliveryCredit`/`releaseLeadDeliveryCredit` — reserva atômica antes de gravar card
  (L1204-1226 / L1233-1244).
- Refund por reclamação: `recordCardRefund` L1320-1344.
- Chave canônica única shadow=enforce: `resolveLeadDeliveryKey` L983-991.

**Shadow (medição S2):** `recordShadowDebit` (`credits.service.ts:447+`) — `kind:'debit_shadow'`
NUNCA entra no saldo (`openLotsFifo` só lê grant|recharge|promo); disparado fire-and-forget no mesmo
choke (`commercial-usage-limits.service.ts:1001-1008`). Atrás de `HBX_CREDITS_SHADOW` (OFF em prod).

**Medidor universal track-first — `CreditMeterService`** (`backend/src/credits/credit-meter.service.ts:49-117`):
- catálogo `credit-action-catalog.ts:36-78`: `lead_delivery` = debit (mas SÓ pelo caminho assert),
  `whatsapp_auto_send`/`ai_realtime`/`ai_batch`/`logistica_delivery` = **track** (30d medindo antes
  de precificar — decisão do dono, flip nunca silencioso, L4-6).
- `track` → mesmo escritor do shadow (L71-80, respeita HBX_CREDITS_SHADOW).
- `debit` pós-fato: **recusa `lead_delivery`** (L93-98, evita 2º débito fora do gate/god-mode) e
  respeita `isEnforceActiveForCompany` (L99-100). Nunca lança (best-effort absoluto L14).

**Resposta seca:** débito real de crédito acontece HOJE apenas para `lead_delivery`, em conta
`accountType='credit'`, com `HBX_CREDITS_ENABLED=true`, fora master-god-mode, após passar cap diário,
hold de chargeback e teto do vendedor. Enterprise não debita (ENFORCE OFF + flag por empresa OFF).

---

## 4. Carteira — lotes, FIFO, expiração, welcome, concessão, recarga, estorno

**Modelo:** `backend/prisma/schema.prisma:4236-4285`. `CreditWallet` 1:1 com Company;
`CreditLedgerEntry` append-only — LOTES (`grant|recharge|promo`, `remaining>0`) vs MOVIMENTOS
(`debit|refund|expire|adjust|purchase_reversal|chargeback_debt|chargeback_settlement`, remaining=0).
Saldo = Σ lotes abertos não expirados (fonte única derivada). Trava de dinheiro no banco:
`@@unique([usageKey, parentEntryId])` (L4281).

**FIFO:** `backend/src/credits/credit-wallet.service.ts:159-188` (`openLotsFifo`) — `expiresAt` ASC,
null (nunca-expira) por último, empate por `createdAt` ASC. Saldo L190-196; agregado multi-empresa
p/ painel master L219-239.

**Débito atômico:** `debit` L336-400 + laço único `consumeOpenLots` L411-529 — decremento+trilha na
MESMA tx (Fix A, L444-493), P2002 = ação duplicada com rollback (Fix B, L474-500), teto global da
usageKey contra corrida em lotes disjuntos (L446-462), optimistic lock (L465-473), 8 retries (L99).
Parcial nunca deixa saldo negativo (`partial:true`, D7).

**Refund:** L749-861 — devolve ao lote original se vivo; lote morto → LOTE NOVO `grant` com validade
nova de 365d (L104, decisão do dono 04/07); trilha `refund` é a trava de idempotência dentro da tx.

**Expiração:** `expireLots` L873-928 (zera remaining + linha `expire` na mesma tx).
⚠️ **P1: NENHUM call-site em produção** — grep só encontra o método e testes
(`credit-wallet.service.test.ts:486-524`). Não há cron/sweep agendado. Efeito no SALDO é nulo
(o filtro de `openLotsFifo` já ignora vencidos), mas o rastro `kind:'expire'` (breakage do painel
master, `getMasterOverview` conta "expira em 30d" mas nunca materializa o expirado) não é gravado.

**Welcome (50 créditos no cadastro):**
- Concessão: `grantWelcomeBatch` (`credits.service.ts:502-525`) — lote `promo`, usageKey
  `welcome:<companyId>` (1 por empresa PRA SEMPRE), best-effort, atrás de `HBX_CREDITS_ENABLED`.
- Momento: NA CONFIRMAÇÃO de identidade (e-mail ou código WhatsApp), não no signup —
  `auth.service.ts:106-122` (`maybeGrantWelcomeAfterConfirm`, chamado em L1423, L1799), com dedup
  anti-farra por telefone/CPF e filtro **só `accountType='credit'`** (L121-122; enterprise NUNCA ganha).
- Valores: código crava 50/30 (`credit-pack-catalog.ts:51-52`, dono 06/07); config global editável
  no master (`CreditGlobalConfig.welcomeCredits`).
- ⚠️ **P1 — divergência 50×30:** o schema tem `welcomeCredits Int @default(30)`
  (`schema.prisma:4308`) e o boot SEMPRE hidrata o override do banco quando a linha `default`
  existe (`credit-pack-config.service.ts:70-79`). Qualquer upsert parcial cria a linha com o
  default 30 da coluna (ex.: editar só o prazo global em `updateGlobalExpiryDefaultDays`
  L165-172, que não informa welcomeCredits), e o brinde REAL cai silenciosamente de 50 → 30.
  Correção barata: alinhar o default do schema para 50 ou fazer o upsert de expiry preencher
  welcome com os defaults de código.

**Concessão do master:** `grantToCompanyAsMaster` (`credits.service.ts:109-170`) — grantType
`paid|courtesy_internal|promo`, **idempotência OBRIGATÓRIA** (usageKey OU sourceRef; vazio nos dois
= 400, L140-145), validade default = config global 90d (`computeDefaultExpiresAt`).
**Débito manual do master:** `credits-master.controller.ts:153-179` (actionKey `master_manual_debit`,
idempotencyKey obrigatória, MasterEvent de auditoria).

**Recarga MP (Regra de Ouro):** `backend/src/financeiro/credit-recharge.service.ts:108-442` —
- Regra de Ouro: crédito SÓ entra com pagamento `approved` na resposta síncrona (L30-31, L240-248);
  recusado/falhou → nada muda.
- Só dono/master recarrega (`isBillingOwnerActor`, L122-124 — LEI DO VENDEDOR, Forbidden neutro).
- Idempotência em 3 camadas: X-Idempotency-Key `credrech-<companyId>-<key>` escopada por EMPRESA
  (L221-227, token MP do master é compartilhado — key global colidiria cross-tenant); lote
  `usageKey mp:<paymentId>` (L308); charge por `externalReference` único (L152, 331-431).
- Trava de re-cobrança: intenção que já virou charge devolve resultado gravado sem chamar o MP (L159-173).
- P0.4 amarração fail-closed: id presente + external_reference + valor em centavos + moeda BRL
  conferidos ANTES de creditar; divergência → MasterEvent `action_required` + 502 (L249-291).
- Receita na compra (regime de caixa): `FinanceiroCharge` approved/paid + `MasterBillingLedgerEntry`
  revenue `CREDIT_RECHARGE` na MESMA tx (L339-383); cross-tenant no P2002 detectado e alertado (L400-427).
- Pós-pagamento orfão (grant/charge falhou com cartão já cobrado): alerta `credit.recharge_orphan`
  action_required + rethrow (L301-323, 384-399, 451-488).

**Estorno/chargeback (`74abf9d3`, PUBLICADO):**
- Detecção: charge com `externalReference` prefixo `hbx-credit-recharge-` revertida (webhook MP ou
  estorno manual do master) → `compensateCreditRechargeReversal`
  (`backend/src/financeiro/financeiro.service.ts:4582-4705`).
- Identidade do pagamento (live mpPaymentId; mock recuperado do externalReference) L4560-4574; o LOTE
  da recarga é a fonte de quantos créditos valeu (L4605-4609).
- `reversePurchase` (`credit-wallet.service.ts:566-608`): tira da carteira `min(saldo, créditos do pack)`,
  consumindo PRIMEIRO o lote da própria recarga (`preferredLotId`), movimento `purchase_reversal`,
  idempotente por `mp-reversal:<paymentId>` (20 webhooks = 1 débito), **não** revertível por refund (L564).
- Shortfall (cliente já consumiu) → DÍVIDA: `registerChargebackDebt` (L627-684; agregado
  `CreditWallet.chargebackDebtCredits` + linha `chargeback_debt`, tx única, idempotente) + MasterEvent
  `credit.recharge_reversal_shortfall` com R$ e hold (financeiro.service.ts:4646-4686).
- **Hold BLOQUEIA entregas** até quitar: `credits.service.ts:728-734` (fail-closed a favor do caixa).
- Quitação: crédito novo paga a dívida primeiro — todo `grant` dispara
  `settleChargebackDebtFromBalance` (`credit-wallet.service.ts:294-309` e 694-732; actionKey
  `chargeback_settlement` não conta como consumo de lead).
- ⚠️ Comentário desatualizado: `financeiro.service.ts:4547-4548` ainda diz "não bloqueia consumo —
  decisão aberta do dono", mas o código bloqueia desde o hold P0.3 (`credits.service.ts:728-731`
  documenta "decisão do dono 10/07"). Corrigir o comentário quando alguém passar lá.

---

## 5. Enterprise — S8, monthlyValueOverride, manual-payment, o que (não) paga

**S8 enterprise-contract (LOCAL, commit `9fc053da` — NÃO publicado):**
`POST /modules/master/company/:companyId/enterprise-contract` (`modules.controller.ts:735-743`) →
`setCompanyEnterpriseContractByMaster` (`modules.service.ts:5342-5416`). A 1 chamada faz, em sequência
idempotente:
1. `accountType='enterprise'` reusando o S6 (L5357 — mesma validação/auditoria; 2ª chamada é no-op).
2. Libera FULL os módulos: upsert `enabled=true` **e** `masterEnabled=true` em todo `SystemModule`
   `companyAssignable` não aposentado (L5361-5371).
3. `monthlyValue` informado → grava `monthlyValueOverride` (L5375-5382). **NÃO cria cobrança nem
   dispara nada live** — só registra o combinado; cobrar continua sendo o manual-payment (L5332-5334).
4. `dailyDeliveryCap` informado → `dailyDeliveryCapOverride` (0 = sem teto explícito; null = não mexe;
   nunca desliga sozinho) (L5384-5389).
Auditoria `COMPANY_ENTERPRISE_CONTRACT_ACTIVATED` (L5396-5406). Teste local (working tree, untracked):
`backend/src/modules/modules.service.enterprise-contract.test.ts`.

**`monthlyValueOverride` — Float em REAIS (campo legado, documentar unidade!):**
- Schema: `Float?` (`schema.prisma:147`; comentário L145 "parcela acordada (override do preço do plano)");
  runtime-schema `DOUBLE PRECISION` (`prisma/prisma.service.ts:746`).
- Unidade REAIS provada pelos consumidores: normalização a 2 casas decimais
  (`modules.service.ts:5375-5378` e 5186-5188 via finance-settings) e MRR do cockpit
  `money(c.monthlyValueOverride ?? catalogMonthly)` (`master-cockpit.service.ts:761` — soma com preço
  mensal de catálogo, que é em reais).
- ⚠️ Convenção MISTA no schema: `billingCreditCents Int` é em CENTAVOS (`schema.prisma:169`).
  Quem for mexer em cobrança precisa saber que `monthlyValueOverride`/`setupValue` são REAIS.

**Cobrança de enterprise = manual-payment:** `recordManualPayment` (`modules.service.ts:4610-4719`)
— lança revenue no MasterBillingLedger (`MANUAL_PAYMENT`/`PIX_MANUAL`/`TRANSFERENCIA_MANUAL`/
`DINHEIRO_MANUAL`, L4647-4672) e, com `settlePending` (default true), `status='active'` + período
+30d + resync de módulos/entitlements pelo PLANO (L4674-4695). É isso que produz o estado `paying`
que confirma comissão (§7). Alternativa legada: assinatura MP viva (webhook,
`financeiro.service.ts:1788-1897`).

**O que enterprise NÃO paga:** créditos — débito real exige o cutover 2 chaves (§3), e ENFORCE está
OFF de propósito; welcome NUNCA (auth.service.ts:121-122). Recarga self-service continua possível
tecnicamente (rechargeWithCard não checa accountType) — se um dia enterprise recarregar, vira lote
pago sem débito ativo (dinheiro entra, crédito não é consumido por enforcement — inócuo mas estranho;
candidato a validação no reconciliador, ver I-7).

**O que CONTINUA valendo para enterprise (nenhum bypass novo — S8 documenta em L5335-5340):**
- Teto diário anti-scraper S3: `assertDailyDeliveryCapNotReached` roda para TODA empresa (não olha
  accountType) — `commercial-usage-limits.service.ts:1112-1166`; default global 500
  (`CreditGlobalConfig.dailyDeliveryCapDefault`, schema:4313; override por empresa schema:121).
- Throttle da busca grátis do Radar: `RadarSearchRateLimiterService`
  (`backend/src/webscraping/radar/search-rate-limit.service.ts:26-60`) — 30/min e 400/h por empresa
  (envs `HBX_SEARCH_RATE_PER_MIN/HOUR`), freio físico contra varredura da base 28M.
- LEI DO VENDEDOR e RBAC de cargo (§2), caps por vendedor (§3).

**Atenção operacional:** enterprise nova do wizard nasce `trial`/`courtesy` (máquina legada §6);
sem manual-payment dentro do prazo ela vence (`evaluateCompanyStatus` materializa `suspended`/
`overdue`). A chavinha S8 NÃO altera `status` — ligar contrato empresarial numa empresa
`pending_checkout`/`overdue` deixa os módulos full mas o estado comercial continua bloqueando
(policy L193-227). O fluxo esperado é S8 + manual-payment (que ativa).

---

## 6. O que sobrou de PLANO legado vivo (classificado)

S7 aposentou com **410 Gone** (todos com teste): seleção de plano
(`commercial-plans.controller.ts:73` + `retired-select.test.ts`), checkout de assinatura
(`financeiro.controller.ts:37` + `retired-subscription-create.test.ts`), e no master: trocar plano
(`modules.controller.ts:616`), plan-taste grant/revoke (L622/L628), trial (L666), cortesia (L716),
editor de módulos por plano (L512/L518) — `modules.controller.retired-plan-endpoints.test.ts`.

**Pontos onde código de plano AINDA EXECUTA:**

| # | Ponto | Prova | Classificação |
|---|---|---|---|
| L1 | `getPlanModuleDefaults` no gate de acesso: sem post-it, módulo segue a "caixa do plano" (base `COMMERCIAL_PLAN_MODULE_KEYS` + overlay `PlanModuleConfig`) | `modules.service.ts:2059-2078`, uso em 2246/2252-2256 | **intencional-manter** (rede default do kill-switch; W1 documenta) |
| L2 | Fallback do policy sem snapshot deriva de `COMMERCIAL_PLAN_MODULE_KEYS[planKey]` | `module-access-policy.ts:248-250` | **intencional-manter** (defensivo) |
| L3 | Máquina de estados legada inteira p/ conta enterprise (trial/courtesy/grace/overdue/pending_checkout) | `company-access-state.ts:259-263`; transições materializadas em `modules.service.ts:1858-1949` | **intencional-manter** (É o motor de acesso da exceção) |
| L4 | Wizard master atribui `trial`/`courtesy` a enterprise NOVA (`priceIsZero→pending_checkout; manualAccess→courtesy; senão trial`) | `master-provisioning.service.ts:344-350` | **intencional-manter** (mecanismo de acesso legado da conta enterprise, decisão batida) |
| L5 | manual-payment ressincroniza módulos/entitlements PELO PLANO ao ativar | `modules.service.ts:4692-4693` | **intencional-manter** (enterprise vive de plano) |
| L6 | Reativação de conta credit também chama `syncCompanyModulesForPlanTx` | `modules.service.ts:5099-5100` | **intencional-manter** (restaura post-its do plano; inócuo p/ credit pois kill-switch manda) |
| L7 | Webhook/renovação de ASSINATURA MP legada segue ativando (`activateCompanyFromCharge`/`activateCompanyFromSubscription` → status active + sync por plano + comissão) | `financeiro.service.ts:1788-1829, 1831-1897, 2235` | **intencional-manter** (contas pagantes antigas; criação nova está 410) |
| L8 | `createSubscriptionForUser`/`createMockSubscriptionForUser` existem no service SEM rota HTTP (só o 410 aponta pra eles em comentário) | `financeiro.service.ts:3318, 1982` | **decisão-pendente** (código morto por fora; remover quando o dono confirmar que upgrade/downgrade legado não volta) |
| L9 | Sweep de trial-notice e-mails continua rodando (afeta só enterprise em trial) | `financeiro.service.ts:~1740-1786` | **intencional-manter** (inofensivo p/ credit — signup novo zera trialEndsAt, `auth.service.ts:761`) |
| L10 | Degustação (taste): endpoints 410, mas runtime completo vivo + sweep a cada 30min revertendo tastes vencidos | `modules.service.ts:1609-1610, 5643-5768` | **zumbi-remover COM PRAZO** (sem porta de entrada, tende a zerar; remover runtime+colunas taste* depois que `tastePlanKey IS NOT NULL` zerar em prod) |
| L11 | E-mail do convite `createByMaster` manda "conclua a contratação no Financeiro" — rota de checkout está 410 e a conta convidada nasce credit ATIVA (pending_checkout é ignorado na leitura p/ credit) | `companies.service.ts:610, 619` + `company-access-state.ts:254-256` | **zumbi-remover** (texto mente; ver C-3) |
| L12 | `selectedPlanKey` ainda alimenta comissão (base tabela §7), policy (planKey) e manual-payment | `hbx-commission-sync.service.ts:138-141`; `module-access-policy.ts:187-191` | **decisão-pendente** (morre junto com a mudança de base de comissão) |
| L13 | Comentário do estorno diz que dívida "não bloqueia consumo" — código bloqueia | `financeiro.service.ts:4547-4548` vs `credits.service.ts:728-734` | **zumbi-remover** (só comentário) |

---

## 7. COMISSÕES — freio publicado + 2 furos provados + contrato recomendado

**Freio comissão-fantasma (`8a134730`, PUBLICADO):**
`backend/src/commissions/hbx-commission-sync.service.ts:104-136` (`resolveClientState`):
- `trial/trial_ending` → pending (L104-106).
- **`paying` (receita real cobrando) → payable + recorrente** (L108-111) — único caminho de payable.
- **`manual`/`exempt` (inclui TODA conta credit ativa) → `sale_confirmed` + `pending`, SEM
  recorrência** (L113-123) — o freio. Comentário registra: "Comissionar RECARGA de crédito é política
  NOVA = decisão do dono, não entra aqui".
- `suspended` → canceled (L125-127); `keepPaid` preserva comissão já paga (L373-374).

**Furo (a) — recarga (e qualquer receita real) NÃO entra na base:**
`resolvePlanAmount` (`hbx-commission-sync.service.ts:138-141`) = `getCommercialPlanMonthlyPrice
(selectedPlanKey)` — **preço de TABELA** (`commercial-plan-catalog.ts:348-356`). O service inteiro não
tem nenhuma leitura de `FinanceiroCharge`/lote `recharge` (grep `recharge` = 0 hits no arquivo).
Consequência no modelo novo: cliente credit que recarrega R$597/mês gera comissão eterna `pending`
calculada sobre uma tabela que ele nunca contratou; manual-payment de enterprise (valor REAL pago,
`modules.service.ts:4632`) também fica fora — quando o estado vira `paying`, o payable sai pela
tabela, não pelo valor cobrado.

**Furo (b) — `updateLeadFromCompany` esmaga o valor negociado:**
`hbx-commission-sync.service.ts:364-512` — quando `changed`, grava `data.saleValue = baseAmount`
(**L405**) e `commissionBaseAmount = baseAmount` (**L414**), sendo `baseAmount = resolvePlanAmount
(company)` (L367) = tabela. O valor negociado que a vendedora gravou no card morre; a recorrência
herda a base contaminada (`generateSalesCompanyRecurringReceivables` usa
`lead.commissionBaseAmount || lead.saleValue`, L807). Só `setupValue` escapa (L397-401).
Gatilhos que disparam o sync (e portanto o esmagamento): `financeiro.service.ts:1826/1894/2235`,
`auth.service.ts:283/1792`, `gerencial.service.ts:592/1161`, `vendas.service.ts:3407/3650/4397/9233`.

**CONTRATO RECOMENDADO (decisão do orquestrador — documentada, NÃO implementada):**
> Base de comissão = **receita REAL cobrada** (charges pagas: recarga de crédito + manual-payment
> + assinatura MP legada), nunca tabela; sem pagamento no ciclo = `pending`.

**Mudança mínima (sem implementar):**
1. `hbx-commission-sync.service.ts` — substituir `resolvePlanAmount(company)` por
   `resolveRealRevenueForCycle(companyId, cycle)`: Σ de `FinanceiroCharge` `status='approved'`
   pagas no ciclo (inclui `description startsWith 'Recarga de créditos'`, mesmo predicado de
   `credits.service.ts:246-254`) + `MasterBillingLedgerEntry` `entryGroup='revenue'`
   `status='APPROVED'` `origin='master_manual_payment'` do ciclo. Usar em `updateLeadFromCompany`
   (baseAmount) e em `generateSalesCompanyRecurringReceivables` (base do ciclo = receita real do ciclo;
   receita 0 → skip, nada de receivable).
2. `updateLeadFromCompany` — **nunca** sobrescrever `saleValue` quando `lead.saleValue > 0`
   (preservar o negociado); `commissionBaseAmount` = receita real. Remover `salePlanKey` da escrita
   ou mantê-lo só informativo.
3. `resolveClientState` — `exempt`/`manual` COM receita real no ciclo → `payable` (não recorrente por
   tabela; a "recorrência" passa a ser dirigida pela existência de receita em cada ciclo). Sem receita
   → `pending` (comportamento atual preservado).
4. Testes em `hbx-commission-sync.service.test.ts`: recarga paga → payable com base = valor da
   recarga; manual-payment → payable base = valor pago; conta credit sem receita → pending;
   `saleValue` negociado intocado; tabela nunca aparece na base; `keepPaid` continua respeitado;
   estorno da recarga no ciclo → base abatida (ligar com `compensateCreditRechargeReversal`).

---

## 8. Reconciliador — invariantes de estado impossível

Estados que NENHUM fluxo legítimo deveria produzir (cada um com a prova de por que é possível hoje):

| # | Invariante violada | Por que pode acontecer | Fonte |
|---|---|---|---|
| I-1 | `accountType='enterprise'` E `creditsEnforceEnabled=true` (com ENFORCE global ON = mensalidade + débito de crédito ao mesmo tempo) | toggle S6/S8 não zera a flag ao virar enterprise | `modules.service.ts:5007-5039, 5342-5416`; gate em `credits.service.ts:553-555` |
| I-2 | `accountType='credit'` E `monthlyValueOverride != null` (credit não tem mensalidade) | finance-settings/S8 gravam o campo sem olhar o tipo; toggle S6 credit→ não limpa | `modules.service.ts:5186-5197` |
| I-3 | `accountType='credit'` E `status IN (trial, courtesy, pending_checkout, overdue)` — banco diz uma coisa, leitura ignora | leitura curto-circuita (exempt) mas o dado segue divergente p/ relatórios; `evaluateCompanyStatus` nunca normaliza credit não-suspensa | `company-access-state.ts:254-256` |
| I-4 | `status='suspended'` E linha `debit` no ledger com `createdAt > statusChangedAt` (suspensa consumindo) | choke de crédito NÃO revalida status da empresa (confia no gate de módulo rodar antes) | `credits.service.ts:707-755` |
| I-5 | Linha `debit` de `lead_delivery` em empresa com enforce OFF (enterprise fora do cutover) | bug futuro em call-site fora do choke; hoje não há caminho, é o alarme | `credit-meter.service.ts:93-100` |
| I-6 | `chargebackDebtCredits > 0` sem linha `chargeback_debt`, ou entregas novas após o registro do hold | agregado e trilha vivem em escritas distintas (tx cobre o par, mas ajuste manual futuro pode desalinhar) | `credit-wallet.service.ts:627-684` |
| I-7 | Lote `recharge` sem `FinanceiroCharge` (receita invisível) ou charge de recarga sem lote (crédito não entregue) | falha entre grant e charge é alertada mas não re-verificada depois | `credit-recharge.service.ts:301-431` |
| I-8 | Lote com `remaining > amount` ou `remaining < 0`; `refund` maior que a soma dos `debit` da usageKey | impossível por design (optimistic lock) — é o teste de sanidade do ledger | `credit-wallet.service.ts:411-529, 749-861` |
| I-9 | Enterprise `active` sem NENHUMA fonte de cobrança (monthlyValueOverride null E sem revenue manual no ciclo E sem assinatura MP viva) | S6 toggle deixa ativar sem combinar valor; manual-payment é passo separado | `modules.service.ts:5007-5039, 4610-4719` |
| I-10 | 2+ lotes `welcome:*` para a mesma identidade (telefone/CPF) em empresas distintas | dedup anti-farra é best-effort e fail-closed só na concessão | `auth.service.ts:106-122` |
| I-11 | Lote vencido com `remaining>0` mais velho que N dias sem linha `expire` | job `expireLots` não está agendado (P1 do §4) | `credit-wallet.service.ts:873-928` |

**Onde encaixar:** serviço novo `backend/src/credits/credit-reconciler.service.ts` (leitura pura,
Prisma direto), exposto como `GET /credits/master/reconcile` (MasterGuard, mesmo padrão de
`credits-master.controller.ts`) + varredura periódica no padrão dos sweeps existentes
(`setInterval` no boot, como o tasteSweep em `modules.service.ts:1609-1610`, ou junto do
trial-notice sweep do financeiro). Cada violação emite `emitMasterEvent` `action_required` com
`dedupKey` por (invariante, empresa) — reusa `backend/src/common/master-event.ts` (mesmo canal dos
alertas de recarga órfã/divergência, que o /master já mostra). O mesmo lugar resolve o I-11
chamando `expireLots()` — mata dois coelhos.

---

## Tabela única — ação → quem cobra → fonte de verdade → arquivo

| Ação | Quem cobra/gateia | Fonte de verdade | Arquivo |
|---|---|---|---|
| Entrega de lead (radar/vendas) | `assertAndDebitLeadDelivery` via choke do usage-limits (conta credit c/ ENABLED; enterprise só cutover 2 chaves) | `CreditLedgerEntry` usageKey `enforce:lead_delivery:<key>` | `credits.service.ts:707`; `commercial-usage-limits.service.ts:1177,1204` |
| Teto diário de entregas (anti-scraper) | `assertDailyDeliveryCapNotReached` (todas as contas) | `Company.dailyDeliveryCapOverride` ?? `CreditGlobalConfig.dailyDeliveryCapDefault` (500) | `commercial-usage-limits.service.ts:1112`; schema:121, 4313 |
| Busca grátis do Radar | throttle 30/min–400/h por empresa | memória de processo (janela deslizante) | `webscraping/radar/search-rate-limit.service.ts:26` |
| Mensagem WhatsApp automática | ninguém (track 30d) | `debit_shadow` actionKey `whatsapp_auto_send` | `credit-meter.service.ts:71`; `credit-action-catalog.ts:52` |
| IA realtime/batch | ninguém (track; IA local custo ~0) | `debit_shadow` `ai_realtime`/`ai_batch` | `credit-action-catalog.ts:60-71` |
| Entrega logística concluída | ninguém (track) | `debit_shadow` `logistica_delivery` | `credit-action-catalog.ts:72` |
| Recarga de créditos | MP cartão síncrono (Regra de Ouro), só dono/master | `FinanceiroCharge` + lote `recharge` `mp:<paymentId>` + ledger revenue | `financeiro/credit-recharge.service.ts:108` |
| Welcome 50 (cadastro grátis) | ninguém (brinde, só conta credit, 1×/empresa, dedup CPF/fone) | lote `promo` `welcome:<companyId>` | `auth.service.ts:106`; `credits.service.ts:502` |
| Concessão de crédito | master (idempotência obrigatória) | lote `grant` (paid/courtesy_internal/promo) | `credits.service.ts:109` |
| Débito manual de crédito | master | movimento `debit` `master-debit:<id>:<key>` | `credits-master.controller.ts:153` |
| Mensalidade enterprise | master via manual-payment (ativa 30d) | `MasterBillingLedgerEntry` revenue + `Company.status/subscriptionCurrentPeriod*` | `modules.service.ts:4610` |
| Valor combinado enterprise | ninguém cobra (registro do acordo) | `Company.monthlyValueOverride` (Float, REAIS) | schema:147; `modules.service.ts:5375` |
| Assinatura MP legada (renovação) | webhook financeiro | `CompanySubscription` + `FinanceiroCharge` | `financeiro.service.ts:1788,1831` |
| Estorno/chargeback de recarga | webhook MP / master → compensação automática | `purchase_reversal` + `chargebackDebtCredits` (hold) | `financeiro.service.ts:4582`; `credit-wallet.service.ts:566,627` |
| Expiração de lote | **ninguém chama hoje (P1)** | `kind:'expire'` (breakage) | `credit-wallet.service.ts:873` |
| Comissão de vendedor HBX | `HbxCommissionSyncService` (payable só `paying`) | `vendasLead.commission*` + `vendasCommissionReceivable` | `commissions/hbx-commission-sync.service.ts` |
| Acesso a módulo | kill-switch `masterEnabled && enabled` → caixa do plano → cargo → caps | `CompanyModule`/`SystemModule` (+`PlanModuleConfig` fallback) | `modules.service.ts:2181`; `module-access-policy.ts:33` |
| Bloqueio de conta | `Company.status` (credit: só suspended; enterprise: máquina legada) | `company-access-state.ts` | `company-access-state.ts:230` |

---

## Conflitos legado × novo (com recomendação)

| # | Conflito | Recomendação |
|---|---|---|
| C-1 | **Base de comissão = tabela de plano** num mundo onde a receita é recarga/manual-payment (furos a+b, §7) | Adotar o contrato recomendado (receita real cobrada); é a única mudança que torna comissão paga = dinheiro que entrou |
| C-2 | **Welcome 50 (código) × 30 (default do schema/banco)** — upsert parcial rebaixa o brinde silenciosamente | Alinhar `CreditGlobalConfig.welcomeCredits @default(50)` via migration aditiva OU upsert de expiry preencher welcome com defaults de código; conferir valor vigente na VPS |
| C-3 | **Convite `createByMaster` nasce `credit` ATIVA** (pending_checkout ignorado na leitura), com saldo 0, sem welcome (não passa pela confirmação self-service) e e-mail apontando checkout 410 | Decisão do dono: ou o convite vira porta enterprise (setar accountType + fluxo S8), ou o e-mail passa a falar de recarga de créditos; hoje a conta convidada fica "ativa" mas inoperante até alguém dar crédito |
| C-4 | **S6/S8 não limpam campos do tipo oposto** (`creditsEnforceEnabled` ao virar enterprise; `monthlyValueOverride` ao virar credit) | Toggle passar a zerar o campo alheio + invariantes I-1/I-2 no reconciliador |
| C-5 | **Enterprise do wizard nasce trial/courtesy** e vence sozinha se o manual-payment atrasar; S8 não mexe em `status` | Manter (decisão batida), mas documentar no /master que a chavinha S8 não ativa a empresa — o manual-payment ativa; I-9 pega o caso esquecido |
| C-6 | **`expireLots` sem agendamento** — breakage nunca materializa; painel master mostra "expirando em 30d" mas nunca "expirado" | Agendar junto do reconciliador (I-11) |
| C-7 | **Taste runtime + sweep vivos com porta 410** | Deixar o sweep drenar os tastes ativos e remover runtime+colunas na limpeza seguinte (L10) |
| C-8 | **Comentário do estorno desatualizado** (diz que não bloqueia; bloqueia) | Corrigir comentário `financeiro.service.ts:4547-4548` na próxima passada |
| C-9 | **`monthlyValueOverride` Float REAIS × `billingCreditCents` Int centavos** no mesmo model | Registrar a unidade no docs/Rules/PAGAMENTOS.md; qualquer código novo de cobrança confirma unidade antes de somar |

---

*Relatório gerado pela Missão C (auditor só-leitura). Nenhum arquivo de código foi alterado.*

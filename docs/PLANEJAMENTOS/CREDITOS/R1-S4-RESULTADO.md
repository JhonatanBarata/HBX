# R1-código + S4 — RESULTADO

> Executado 05/07 por worker Sonnet, local, direto no working tree (master). Sem commit/publish.
> Build teve que ser refeito várias vezes durante a execução por causa de publishes/edições
> concorrentes de outros workers no mesmo repo (créditos S3-parte2, S5, A3-welcome-batch, R2-killswitch,
> auth) — o estado final abaixo foi conferido depois de tudo estabilizar.

## O que foi feito

**Gate em 2 chaves, choke único, débito real que BLOQUEIA:**

- `backend/src/credits/credits.flags.ts` — nova `isCreditsEnforceEnabled()` (env
  `HBX_CREDITS_ENFORCE`, default OFF, mesmo padrão booleano das outras flags do módulo).
- `backend/prisma/schema.prisma` — nova coluna `Company.creditsEnforceEnabled Boolean @default(false)`.
- `backend/prisma/migrations/20260705140000_credits_enforce_company_flag/migration.sql` — migration
  ADITIVA (`ALTER TABLE "Company" ADD COLUMN`), sem tocar nada existente. (Renomeada 2x durante a
  execução por colisão de timestamp de pasta com migrations de outros workers rodando em paralelo —
  nome final garante ordem determinística depois das demais migrations de créditos do dia.)
- `backend/src/credits/credits.service.ts` — 5 métodos novos:
  - `isEnforceActiveForCompany(companyId)`: as 2 chaves (env + `Company.creditsEnforceEnabled`).
    Qualquer uma OFF → false.
  - `checkSellerCreditCap(companyId, userId, now)` (privado, S4): teto individual OPCIONAL,
    reusando `UserTeamPolicy.monthlyCardsLimit` (teto MENSAL) e `cardDeliveryDailyLimit` (teto
    DIÁRIO) via `resolveTeamPolicyStoredLimit` — o MESMO padrão `inherit`/`limited`/`unlimited`
    que o `CommercialUsageLimitsService` já usa pra cota count-based. Contagem = `count()` de
    linhas `CreditLedgerEntry.kind='debit'` com `createdByUserId` do vendedor no período
    (mesma fonte do saldo, sem contador paralelo).
  - `throwBlocked(reason, isBillingAudienceUser)` (privado): bloqueio NEUTRO
    (`company_access_paused`, mesma mensagem/código que `module-access-policy.ts` já usa pro
    vendedor) OU código claro (`CREDIT_BALANCE_EXHAUSTED`) pro dono/admin — decidido pelo flag
    `isBillingAudienceUser` que o caller passa.
  - `assertAndDebitLeadDelivery(companyId, userId, { leadId, actionKey, isBillingAudienceUser })`:
    choke principal. Gate OFF → no-op transparente (`{ applied: false, debited: 0 }`). Gate ON:
    (1) checa teto S4 do vendedor ANTES do débito da empresa — estourou, bloqueia só ele; (2)
    debita 1 via `CreditWalletService.debit` com `usageKey = enforce:<actionKey>:<leadId>`
    (idempotente, fail-closed, nunca negativo — reusa o ledger pronto, não criei ledger novo);
    sem saldo → bloqueia.
  - `refundLeadDelivery(companyId, userId, { leadId, actionKey })`: refund atômico on-failure,
    mesma usageKey (`enforce:...`) → `CreditWalletService.refund` já é idempotente por
    `refund:<usageKey>`.
- `backend/src/commercial-plans/commercial-usage-limits.service.ts` — conectado no MESMO choke do
  shadow (S2), sem criar segundo caminho de débito:
  - `enforceLeadDeliveryDebit()` (privado, novo): chama `assertAndDebitLeadDelivery` de forma
    BLOQUEANTE (await, pode lançar) — diferente do shadow que é fire-and-forget. Defensivo contra
    provider sem o método (typeof check), pra não quebrar mocks/testes parciais.
  - Chamado ANTES do `log(...)` de sucesso em `recordCardImport` e nos 2 branches de
    `recordCardCommercialUseOnce` — se bloquear, a exceção sobe e NADA é gravado como sucesso
    (fail-closed real, não só medição).
  - `recordCardRefund()`: no fim, dispara `refundLeadDelivery` best-effort (fire-and-forget),
    reusando a MESMA `resolveLeadDeliveryKey` do shadow/enforcement — cobre o gancho já existente
    de estorno de reclamação (`vendas_card_refunded`, chamado por `modules.service.ts` quando o
    master resolve uma reclamação com `refundCards > 0`).

## Testes novos (`backend/src/credits/credits.service.test.ts`)

Estendido o fake Prisma existente com `company.creditsEnforceEnabled` mutável
(`fake.__setCompanyEnforce`), `userTeamPolicy.findUnique` + helper `fake.__setUserTeamPolicy`, e
`creditLedgerEntry.count` (+ suporte a `gte` no matcher de `where`). 20 testes novos cobrindo os
6 casos do spec:

1. Flags OFF (isolado e cruzado: env ON+empresa OFF, env OFF+empresa ON) → zero débito real.
2. Gate ON + saldo ≥1 → debita 1, ledger ganha `debit` com `usageKey = enforce:lead_delivery:<id>`.
3. Saldo 0 → bloqueia fail-closed; vendedor recebe `company_access_paused` (sem "crédito/saldo/R$"
   na mensagem, checado por regex); admin recebe `CREDIT_BALANCE_EXHAUSTED`; nenhuma linha `debit`
   gravada no bloqueio.
4. Refund devolve o saldo (mesma usageKey); idempotente (2x só devolve 1x); no-op se não há débito.
5. S4: teto mensal e teto diário bloqueiam só o vendedor que estourou; outro vendedor da MESMA
   empresa segue livre (não é capado pelo teto do colega); vendedor sem teto configurado nunca
   bloqueia por S4 (default sem teto).
6. Idempotência: mesmo lead 2x (mesma usageKey) → só 1 débito real, saldo não sai 2x.

Mais 3 testes diretos de `isEnforceActiveForCompany` (as 2 combinações OFF + a combinação ON).

Também ajustado `backend/src/commercial-plans/commercial-usage-limits.service.test.ts`: o fake
`creditsService` (`buildShadowCredits`) ganhou `assertAndDebitLeadDelivery`/`refundLeadDelivery`
simulando gate OFF (no-op), pra não quebrar os testes de shadow-debit já existentes.

## Checks executados (todos verdes)

- `cd backend && npm run build` — limpo (precisou repetir algumas vezes por causa de builds
  concorrentes de outros workers deixando o `dist/` em estado parcial; build isolado do meu código
  sempre passou).
- `npx prisma validate --schema=./prisma/schema.prisma` — válido.
- `node --test dist/credits/*.test.js dist/commercial-plans/commercial-usage-limits.service.test.js`
  — **106/106 passam**, zero regressão nas suítes existentes (S1 ledger, S2 shadow, S3-parte1
  catálogo/master, S3-parte2 pack-config, A3 welcome-batch — todas de outros workers que também
  rodaram em paralelo — seguem verdes).

## Decisões / desvios do spec (pra revisão do Opus)

1. **Período do teto S4 é UTC calendário** (`Date.UTC(...)` mês/dia), não por timezone da empresa
   como o `CommercialUsageLimitsService.getMonthBounds/getDayBounds` fazem (que resolvem por
   `Company.timezone`). Optei por simplicidade e para não acoplar `CreditsService` a mais uma
   dependência de leitura de `Company.timezone` só pra isso — o efeito prático é a virada de
   mês/dia do teto individual poder ficar até ~12h deslocada da meia-noite local da empresa. Se
   isso importar pro dono, dá pra alinhar depois reusando `getMonthBounds`/`getDayBounds` (exigiria
   injetar timezone ou duplicar a função local).
2. **Teto S4 usa APENAS `monthlyCardsLimit` (mensal) e `cardDeliveryDailyLimit` (diário)** —
   *não* usei `vendasPullQuantityLimit` como o spec cita como terceira opção. Motivo: esse campo
   no `CommercialUsageLimitsService` governa quantidade de leads PUXADOS por request do Radar
   (dimensiona `allowedLimit` de uma busca), não é um contador cumulativo de período comparável a
   "linhas debit no período" — usá-lo como teto de crédito exigiria uma semântica diferente
   (por-requisição, não por-mês/dia) que o spec não detalhou. Fica como possível S4-parte2 se o
   dono quiser esse terceiro teto.
3. **Mensagem para o vendedor no caso "teto do vendedor estourado" também usa
   `company_access_paused`** (idêntica ao caso "sem saldo da empresa") — a LEI DO VENDEDOR exige
   nunca citar crédito/saldo/R$; diferenciar os dois motivos exigiria um 2º código neutro
   (ex.: `seller_quota_paused`) que o spec não pediu explicitamente. Achei mais seguro reusar o
   código neutro já em produção (`module-access-policy.ts`) do que inventar um novo vocabulário.
4. **`resolveLeadDeliveryKey`/idempotência**: o enforcement usa `usageKey = enforce:<actionKey>:<leadId>`
   (prefixo `enforce:` diferente do `shadow:` do S2) — são idempotentes de forma INDEPENDENTE
   (o `debit` real de um lead não colide com a linha `debit_shadow` do mesmo lead, propositalmente,
   já que são `kind` diferentes no ledger).
5. Não toquei em `financeiro/**`, `credit-wallet.service.ts` (só consumido via `debit`/`refund`
   já prontos), `auth.service.ts`, `module-access-policy.ts`, mixins do radar — só LI
   `module-access-policy.ts` pra copiar o vocabulário exato de bloqueio neutro (`company_access_paused`).
6. Renomeei minha pasta de migration 2x (`120000` → `130000` → `140000`) porque workers paralelos
   (A3-welcome-batch) geraram migrations de créditos no MESMO minuto — sem colisão de conteúdo,
   só reordenei pra garantir aplicação determinística.

## Arquivos tocados

- `backend/src/credits/credits.flags.ts`
- `backend/src/credits/credits.service.ts`
- `backend/src/credits/credits.service.test.ts`
- `backend/src/commercial-plans/commercial-usage-limits.service.ts`
- `backend/src/commercial-plans/commercial-usage-limits.service.test.ts`
- `backend/prisma/schema.prisma` (+ 1 coluna aditiva)
- `backend/prisma/migrations/20260705140000_credits_enforce_company_flag/migration.sql` (nova)

Nada publicado, nada commitado. `HBX_CREDITS_ENFORCE` continua ausente do `.env` (default OFF) e
`Company.creditsEnforceEnabled` nasce `false` em todas as linhas — zero mudança de comportamento em
runtime até o dono ligar as duas chaves por empresa.

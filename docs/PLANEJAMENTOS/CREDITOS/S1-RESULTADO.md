# S1 — Ledger de crédito em LOTES — RESULTADO (05/07)

> Feito DIRETO pelo Opus (frente financeira: dinheiro atômico). **LOCAL, NÃO publicado, NÃO
> commitado.** Diff aberto para revisão do dono antes das próximas ondas. Fundação inerte:
> flag `HBX_CREDITS_ENABLED=false`, ninguém no runtime de vendas debita ainda.

## O que foi criado (diff resumido)
- **schema.prisma** — 2 modelos novos + 2 relações no `Company` (`creditWallet`, `creditLedgerEntries`):
  - `CreditWallet` (1:1 com Company, `companyId @unique`) — é a LINHA DE LOCK do débito.
  - `CreditLedgerEntry` (append-only) — lotes (`grant|recharge|promo`) com `remaining`/`expiresAt`/
    `grantType`; movimentos (`debit|refund|expire|adjust`) com `remaining` 0. Índices: `[companyId,kind]`,
    `[walletId,expiresAt]`, `[walletId,usageKey]`, `[usageKey]`.
- **prisma/migrations/20260705090000_credits_wallet_ledger/migration.sql** — ADITIVA (só CREATE TABLE
  novas + FKs Cascade), idempotente (`IF NOT EXISTS`). **NÃO aplicada** (Postgres down; SQL confere com o schema).
- **src/credits/** — `credits.module.ts` (registrado no `AppModule`), `credit-wallet.service.ts`,
  `credit-wallet.service.test.ts`.
- **.env.example** — `HBX_CREDITS_ENABLED=false` documentado.
- **package.json** — script `test:credits`.

## API do `CreditWalletService`
`ensureWallet` · `getBalance` · `getWalletSnapshot` · `grant` · `debit` · `refund` · `expireLots` · `isEnabled`.
- **Saldo = Σ(lotes remaining>0 e não expirados)** — derivado do ledger, kind-agnóstico (qualquer linha
  com remaining>0; só lotes nascem com remaining>0). NUNCA conta `CompanyCommercialUsageLog`.
- **Débito atômico:** `$transaction` + `SELECT "id" FROM "CreditWallet" WHERE "companyId"=$1 FOR UPDATE`
  trava a wallet; lê lotes FIFO (expiresAt ASC nulls-last, createdAt ASC), consome com `updateMany`
  guardado por `remaining>=take` (cinto anti-negativo), grava linha `debit` por lote consumido.
- **Fail-closed (D7):** pedir 50 com 30 → debita 30, `partial:true`, saldo 0. Nunca negativa.
- **Idempotência por `usageKey`:** checada SOB o lock; retry retorna o resultado já gravado (`idempotentReplay:true`).

## Checks
- `npm run prisma:validate` → **schema válido** ✔
- `npm run build` (prisma generate + tsc) → **verde** ✔
- `npm run test:credits` (`node --test`) → **8/8 verdes** ✔ (grant/saldo, concorrência 10×1 sobre 5,
  FIFO+expiração, idempotência, overdraft parcial, refund+idempotência, expireLots, grant idempotente por usageKey).

## Decisões tomadas (precisam do aval do dono)
1. **`usageKey` é INDEXADO, não `@unique`** (o SPEC dizia `@@unique`). Motivo forte: um débito que cruza
   2 lotes grava 2 linhas `debit` com a MESMA usageKey — um unique global quebraria isso. A idempotência
   é garantida **em código sob o FOR UPDATE** (check-then-act seguro porque a wallet está travada). Mais
   correto que o unique; sinalizado por ser desvio do spec.
2. **Refund de lote-pai já expirado:** devolve num lote novo `kind:'adjust'` com graça curta de **7 dias**
   (não ressuscita saldo pra sempre). Caso raro — refund normal (PARAR/falha) ocorre segundos após o
   débito, com o lote-pai vivo (aí devolve ao próprio lote). Número editável se o dono preferir outra graça.
3. **Concorrência testada sob EMULAÇÃO do FOR UPDATE** (mutex por-empresa no Prisma falso — Postgres está
   down e a suíte roda `node --test` sem banco). Isso prova a LÓGICA de consumo (FIFO/fail-closed/idempotência)
   sob o lock; a atomicidade real do lock é do Postgres, já provada em prod pelo hbx-recovery.

## Próximo (não feito aqui)
S2 (débito shadow no puxar lead) · S3 (recarga MP + concessão master). Antes de S2, ver as correções de
arquitetura anexadas ao `PLANO.md` (hierarquia "só passa o que tem", lote grátis no lugar do trial).

# S1 — Ledger de crédito em LOTES (fundação da carteira)

> Worker Sonnet, worktree isolado, **LOCAL — NÃO publicar, NÃO commitar na master**. Frente
> financeira: o Opus revisa o diff atômico antes de liberar as próximas ondas. Este `.md` some quando
> o S1-RESULTADO.md for gravado. Contexto completo: `PLANO.md` (Sprint 0 FECHADO 04/07).

## Objetivo
Construir SÓ a carteira: schema (2 modelos) + serviço de saldo atômico com **lotes + FIFO por
expiração** + testes. **Sem enforcement, sem débito nos fluxos de vendas, sem checkout** — isso é S2/S3.
Tudo atrás de flag `HBX_CREDITS_ENABLED` (default OFF). O serviço nasce inerte.

## Regras que NÃO podem ser violadas (dinheiro)
- **Saldo = Σ(lotes com `remaining>0` E não expirados).** Fonte ÚNICA derivada do ledger — nada de
  contar `CompanyCommercialUsageLog` (esse é o modelo VELHO que vamos aposentar).
- **Débito atômico e fail-closed.** Duas chamadas concorrentes NÃO podem vender o mesmo crédito. Nunca
  deixa saldo < 0 (D7: serve o que couber até o pedido e reporta `partial`, nunca negativa).
- **Idempotência por `usageKey`.** Reexecutar o mesmo débito/recarga com a mesma `usageKey` = no-op
  (retorna o resultado já gravado). Obrigatório pra sobreviver a retry de webhook/PARAR.
- **Consumo FIFO por expiração:** o lote que expira PRIMEIRO é consumido primeiro (`expiresAt` ASC,
  nulls por último). Empate → mais antigo primeiro (`createdAt` ASC).
- **Reusar o padrão atômico do HBX-RECOVERY** (`backend/src/hbx-recovery/hbx-recovery.service.ts` —
  saldo atômico JÁ em prod). Seguir as convenções do `schema.prisma` (id `cuid()`, JSON-as-string,
  índices, mesmo estilo dos modelos recentes tipo `RadarMission`).

## Schema (migration ADITIVA — só tabelas novas, não tocar Company/existentes)
`CreditWallet` (1:1 com Company, é a linha de LOCK do débito):
- `id` cuid, `companyId Int @unique` (relação com Company, onDelete Cascade), `createdAt`, `updatedAt`.

`CreditLedgerEntry` (append-only; entradas de saldo são LOTES):
- `id` cuid, `walletId` (relação), `companyId Int` (denormalizado p/ índice/consulta).
- `kind String` — `grant | recharge | promo` (LOTES) · `debit | refund | expire | adjust` (movimentos).
- `amount Int` — positivo sempre (o `kind` dá o sinal).
- `remaining Int @default(0)` — SÓ para lotes (grant/recharge/promo): começa = amount, cai ao consumir.
  Movimentos (debit/expire) têm remaining 0.
- `expiresAt DateTime?` — SÓ para lotes; null = não expira (concessão manual permanente do master).
- `grantType String?` — `paid | courtesy_internal | promo` (SÓ lotes; alimenta o fiscal no S5).
- `actionKey String?` — SÓ débitos: o que consumiu (ex.: `lead_delivery`).
- `usageKey String?` — chave de idempotência (débito/recarga/refund). `@@unique` quando presente.
- `sourceRef String?` — id do pagamento MP / id da ação master (rastreio).
- `parentEntryId String?` — débito aponta pro LOTE que consumiu; refund aponta pro débito revertido.
- `createdByUserId Int?`, `metadataJson String?`, `createdAt DateTime @default(now())`.
- Índices: `@@index([companyId, kind])`, `@@index([walletId, expiresAt])`, `@@index([usageKey])`.
- Um débito que cruza 2 lotes gera 2 linhas `debit` (uma por lote, cada com `parentEntryId`), mas a
  MESMA `usageKey` na ação toda (idempotência é da AÇÃO). Guardar `usageKey` em todas; a checagem de
  idempotência procura QUALQUER linha com aquela usageKey antes de debitar.

## Serviço `CreditWalletService` (backend/src/credits/)
Módulo novo `CreditsModule`, registrado no `AppModule`. Métodos:
- `ensureWallet(companyId)` → cria a wallet se não existir (idempotente).
- `getBalance(companyId)` → int (Σ lotes abertos não-expirados). `getWalletSnapshot(companyId)` →
  saldo + lista de lotes (amount/remaining/expiresAt/grantType) p/ o painel do S6.
- `grant(companyId, amount, opts)` → cria lote (`kind`, `grantType`, `expiresAt`, `sourceRef`,
  `createdByUserId`, `usageKey?`). Idempotente por usageKey/sourceRef.
- `debit(companyId, amount, { actionKey, usageKey, userId })` → transação: trava a wallet
  (`SELECT ... FOR UPDATE` / padrão do hbx-recovery), lê lotes abertos não-expirados em FIFO, consome
  até `amount`, escreve linhas `debit` decrementando `remaining` dos lotes. Retorna
  `{ debited, requested, partial, balanceAfter }`. Fail-closed: se saldo 0 → debited 0. Idempotente.
- `refund({ usageKey })` → reverte o débito daquela usageKey: devolve `remaining` aos lotes originais
  se ainda não expiraram (senão `adjust` num lote novo curto — ou documentar a escolha). Idempotente.
- `expireLots(now = new Date())` → job: lotes `expiresAt < now` com `remaining>0` → escreve `expire`,
  zera `remaining`. Retorna quantos créditos expiraram (número de breakage p/ o painel do master).
- Flag `HBX_CREDITS_ENABLED` (env, default OFF): quando OFF o módulo carrega mas os métodos podem ser
  chamados em teste; ninguém no runtime de vendas chama ainda (isso é S2). NÃO wire em enforcement.

## Testes obrigatórios (backend, jest — a suíte é a prova do dinheiro)
1. **Concorrência:** 10 débitos de 1 em paralelo sobre saldo 5 → exatamente 5 sucessos, saldo final 0,
   nunca negativo.
2. **FIFO/expiração:** lotes com expiresAt diferentes → consome o que expira antes; lote expirado NÃO
   entra no saldo nem é consumido.
3. **Idempotência:** mesma `usageKey` 2× → 1 débito só.
4. **Overdraft/parcial (D7):** pedir 50 com 30 → debita 30, `partial:true`, saldo 0.
5. **Refund:** débito depois refund devolve o saldo; refund 2× = idempotente.
6. **expireLots:** marca vencidos, retorna contagem, saldo cai.

## Entregáveis
- Migration Prisma nova (aditiva) + `schema.prisma` atualizado.
- `backend/src/credits/` (module + service + service.test.ts).
- `HBX_CREDITS_ENABLED` documentado no `.env.production.example`.
- `S1-RESULTADO.md` nesta pasta: o que criou, resultado de `npm run build` + `npm run prisma:validate`
  + testes (contagem), decisões tomadas (ex.: refund de lote expirado), e o DIFF resumido pro Opus revisar.

## Checks antes de reportar concluído
`cd backend && npm run prisma:validate && npm run build` e a suíte nova verde. NÃO rodar migration
contra banco remoto. NÃO publicar. NÃO commitar na master (fica no worktree pro Opus revisar).

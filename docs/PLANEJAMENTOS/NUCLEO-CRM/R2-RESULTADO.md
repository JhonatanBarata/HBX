# R2 — Financeiro de verdade (RESULTADO)

> Sprint R2 do `PLANO-ROBUSTEZ.md`. FRENTE FINANCEIRA (dinheiro). Editado por Opus direto.
> Estado: NÃO publicado, migration NÃO aplicada em banco vivo. Commitado no master local.
> Base: origin/master `68d893a6` (verificado — não continha o R2). Nada dispara MercadoPago.

## O que mudou (arquivos)
| Arquivo | Mudança |
|---|---|
| `backend/prisma/schema.prisma` | `FinanceiroCharge` +4 colunas de link + 3 índices + relation; `CustomerProfile` ganha back-relation `financeiroCharges` |
| `backend/prisma/migrations/20260705060000_financeiro_charge_link/migration.sql` | migração à mão, aditiva, `IF NOT EXISTS`, sem DROP |
| `backend/src/logistica/logistica.service.ts` | `lancarCobranca` reescrito (por `formaPagamento`/`contabilizar`) + `fecharMes` + `extratoCliente` + helpers |
| `backend/src/logistica/logistica.controller.ts` | `POST /logistica/fechar-mes` (ADMIN-only) + `GET /logistica/clientes/:id/extrato` |
| `backend/src/logistica/dto/logistica.dto.ts` | `FecharMesDto` (clienteId?, mesRef?) |
| `backend/src/logistica/logistica.service.test.ts` | 3 testes N6 atualizados p/ o novo contrato + 6 testes R2 |

## Schema (aditivo, mata dívidas 2/3/4)
`FinanceiroCharge` ganhou (todas OPCIONAIS, charge legada segue com null):
- `customerProfileId String?` + relation (`onDelete: SetNull` — histórico sobrevive ao delete do cliente)
- `dueDate DateTime?`
- `sourceModule String?` (`logistica_entrega` | `logistica_fechamento`)
- `entregaId String?` (idempotência da cobrança por entrega)
- Índices: `[companyId, customerProfileId]`, `[companyId, dueDate, status]`, `[companyId, entregaId]`

## SQL da migração (`20260705060000_financeiro_charge_link`)
```sql
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "dueDate"           TIMESTAMP(3);
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "sourceModule"      TEXT;
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "entregaId"         TEXT;
CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_customerProfileId_idx" ON "FinanceiroCharge"("companyId", "customerProfileId");
CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_dueDate_status_idx"    ON "FinanceiroCharge"("companyId", "dueDate", "status");
CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_entregaId_idx"         ON "FinanceiroCharge"("companyId", "entregaId");
-- FK opcional SET NULL, guardada por DO $$ IF NOT EXISTS pg_constraint $$ (idempotente)
```
NÃO aplicada em banco vivo por este worker. `prisma validate` + `prisma generate` verdes.

## Nova lógica do `lancarCobranca` (o que toca dinheiro — revisar)
Antes lia `modeloCobranca`; agora lê os DOIS eixos M4 do cliente (`formaPagamento` + `contabilizar`):

| Condição | Desfecho | Charge? | `Entrega.cobrancaStatus` |
|---|---|---|---|
| `contabilizar=false` | sai | **não** | `nao_contabilizado` |
| `formaPagamento='mensal'` | não lança por entrega | **não** | `aguardando_fechamento` |
| valor ≤ 0 | sai | **não** | `isenta` |
| já existe charge desta entrega (`findFirst entregaId`) | dedupe | **não** (não duplica) | `lancada` |
| `avulso` / `na_hora` (e `aberto`) | lança | **1** charge, `dueDate=hoje` | `lancada` |
| `pendura` (fiado) | lança | **1** charge, `dueDate=proximoDiaFechamento` | `lancada` |

Charge sempre: `paymentMethod='MANUAL'`, `status='pending'`, `lifecycle='in_progress'`,
`billingCycle='ONCE'` (era o ternário bobo `'MONTHLY':'MONTHLY'` — **consertado**), linkado
(`customerProfileId`, `entregaId`, `sourceModule='logistica_entrega'`, `dueDate`). **NADA de MP.**

**Idempotência em 2 camadas:** (1) `isCobrancaResolvida(cobrancaStatus)` no topo (lancada/
isenta/faturada/aguardando_fechamento/nao_contabilizado = no-op); (2) `financeiroCharge.findFirst`
por `entregaId` antes de criar — corrida não gera 2 charges da mesma entrega.

Local no código (frente financeira):
- `lancarCobranca` — `logistica.service.ts:513` (assinatura; guarda de status na 1ª linha),
  `:526` (contabilizar=false), `:538` (mensal→aguardando_fechamento), `:554` (dedupe entregaId),
  `:568` (**create do charge da entrega**).

## Fechar-mês (`fecharMes` — `logistica.service.ts:604`)
`POST /logistica/fechar-mes {clienteId?, mesRef?}` — ADMIN-only (RolesGuard + `@Admin()`).
- Alvo: clientes `formaPagamento='mensal'` + `contabilizar=true`. Sem `clienteId` → só os que
  fecham hoje (`diaFechamento === dia atual`); com `clienteId` → só ele.
- Por cliente: soma as `Entrega` `cobrancaStatus='aguardando_fechamento'` → cria **1** charge
  (`sourceModule='logistica_fechamento'`, `billingCycle='MONTHLY'`, `dueDate=diaFechamento do mesRef`,
  `MANUAL`/`pending`) e marca as entregas `faturada`. Tudo dentro de `prisma.$transaction`
  (**atômico**: ou nasce o charge + as entregas viram faturada, ou nada).
- **Idempotente:** o `updateMany` só afeta quem estava `aguardando_fechamento`; a 2ª rodada não
  acha mais nada aberto → 0 charges novos (provado no teste).
- **create do charge:** `logistica.service.ts:645` (dentro do `$transaction`).

## Extrato (`extratoCliente` — `logistica.service.ts:687`)
`GET /logistica/clientes/:id/extrato` — read-only, company-scoped (cliente TEM de ser da empresa,
senão 404). Lista os `FinanceiroCharge` linkados via `customerProfileId` (take 500, ordem desc).
Não toca dinheiro.

## Checks
- `npx prisma validate` → **verde** ("schema is valid").
- `npx prisma generate` → **verde** (client v5.22.0).
- `npm run build` (`tsc`) → **verde** (0 erros nos meus arquivos).
- Testes `node --test dist/logistica/logistica.service.test.js` → **9/9 verde**:
  - (a) confirmar 2× mesma entrega = 1 charge (dedupe por entregaId) ✅
  - (b) `contabilizar=false` → 0 charge, `nao_contabilizado` ✅
  - (c) `mensal` → `aguardando_fechamento`, 0 charge na entrega ✅
  - (d) fechar-mês: 3 entregas → 1 charge (amount 40); 2ª rodada 0 charges (idempotente) ✅
  - (e) extrato lista os charges do cliente + cliente de outra empresa → null ✅
  - + os 3 freios N6 (flag OFF, flag ON avulso, aviso OFF) atualizados p/ o novo contrato ✅
- Sibling logistica tests (config 6/6, rota 6/6, recorrencia 10/10) → **verdes** (sem regressão).

## MercadoPago — confirmação
Todos os charges criados (entrega e fechamento) são `paymentMethod='MANUAL'` + `status='pending'`
+ `lifecycle='in_progress'`, sem `mpPreferenceId`/`mpPaymentId`/`paymentUrl` e sem chamar
`MercadoPagoClientService`. Nenhum caminho novo dispara MP. Caminho/flag do WhatsApp (N6)
intocados (`dispararWhatsappEntregue` não mudou).

## Pendente (fora do R2)
- Aplicar a migração em banco vivo + QA (R1, com o dono).
- Backfill do `customerProfileId`/`entregaId` em charges legadas de logística (se existirem) — não há
  nenhuma em prod ainda (N6 nunca rodou vivo), então nada a backfillar hoje.

# NÚCLEO-CRM R3 — Integridade da espinha (RESULTADO)

> Executado 05/07 no **master** (working tree, NÃO publicado, migrations NÃO aplicadas —
> Postgres down). Aditivo/fail-closed; nada dispara MP nem WhatsApp novo.

## Arquivos tocados (SÓ meus)
- `backend/prisma/migrations/20260705070000_integridade_espinha/migration.sql` (novo)
- `backend/prisma/schema.prisma` (2 comentários documentando os índices parciais — NÃO adiciona `@@unique`)
- `backend/src/logistica/logistica.service.ts` (charge por entrega atômico + confirmar em transação + `softDeleteEntrega`)
- `backend/src/logistica/logistica.controller.ts` (`DELETE /logistica/entregas/:id`)
- `backend/src/nucleo/nucleo-cadastro.service.ts` (`mergeContas` + `softDeleteConta` + `softDeleteContato` + helpers)
- `backend/src/nucleo/nucleo.controller.ts` (`POST /nucleo/contas/:id/merge` ADMIN + `DELETE /nucleo/contas/:id` + `DELETE /nucleo/contatos/:id`)
- `backend/src/nucleo/dto/nucleo.dto.ts` (`MergeContaDto`, `SoftDeleteDto`)
- `backend/src/nucleo/nucleo-r3.test.ts` (novo) + `backend/src/logistica/logistica.service.test.ts` (mock ganhou `$transaction`/`entregaItem`)

## (a) Unicidade + dedupe — migração `20260705070000_integridade_espinha`

### Por que raw SQL (e não `@@unique` no schema)
Prisma 5.22 **NÃO expressa índice UNIQUE PARCIAL** (`WHERE ... IS NOT NULL`) no DSL.
O padrão do repo pra isso já existe (`IntegrationSyncRun_connectionId_running_key`,
UNIQUE parcial só em SQL). Segui igual: o schema mantém só o `@@index` de consulta
(já existia nos dois models) + um comentário apontando pro índice parcial no SQL. Assim
`prisma validate`/`generate` ficam verdes e **não há drift** (o schema não promete um
unique não-parcial que o banco não tem).

### `FinanceiroCharge.entregaId` — UNIQUE PARCIAL (mata a corrida do R2)
```sql
-- defensivo: se já houver 2 charges da MESMA entrega (bug do R2 antes da trava),
-- mantém o mais ANTIGO e solta o entregaId dos demais (não apaga a cobrança).
UPDATE "FinanceiroCharge" fc SET "entregaId" = NULL
WHERE fc."entregaId" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "FinanceiroCharge" keep
  WHERE keep."entregaId" = fc."entregaId" AND keep."companyId" = fc."companyId"
    AND (keep."createdAt" < fc."createdAt"
         OR (keep."createdAt" = fc."createdAt" AND keep."id" < fc."id")));

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceiroCharge_entregaId_key"
  ON "FinanceiroCharge" ("entregaId") WHERE "entregaId" IS NOT NULL;
```
Com isso o `create` do charge por entrega vira **atômico no banco**. O serviço
(`lancarCobranca`) trata `P2002`/`23505` como "já existe" → marca `lancada` e retorna
`false` (idempotente, não propaga). Charge legada (assinatura/recovery, `entregaId` null)
não é indexada (parcial) → não colide.

### `CustomerProfile (companyId, cnpj)` — DEDUPE e DEPOIS UNIQUE PARCIAL
O índice **exige base limpa**. A migração PRIMEIRO deduplica, DEPOIS cria o índice:
1. **Elege o vencedor por grupo `[companyId, cnpj]`**: quem tem MAIS DADO vence (soma de
   colunas name/phone/email/endereco/document preenchidas); empate → `createdAt` asc;
   empate final → menor `id`. (Mesma heurística do serviço de merge.)
2. **Migra as refs** das perdedoras → vencedora: `Entrega`, `Contato`, `ClienteProduto`,
   `FinanceiroCharge`, `VendasLead` (todas `customerProfileId`). O `PARTITION BY companyId`
   garante que a fusão nunca cruza tenant.
3. **Apaga as contas perdedoras** (refs da espinha já migradas; filhas restantes com FK
   Cascade/SetNull resolvem).
4. **Cria** `CREATE UNIQUE INDEX ... ("companyId","cnpj") WHERE "cnpj" IS NOT NULL` — PF
   sem cnpj nunca colide.

`entregaId` **não** precisa de dedupe (coluna nova do R2, sem dado legado) — o passo
defensivo acima é só cinto-de-segurança. Idempotente (`IF NOT EXISTS`/`IF EXISTS`).

## (b) Merge de contas — `POST /nucleo/contas/:id/merge {into}` (ADMIN)
`mergeContas(companyId, sourceId, intoId)`:
- **Valida tenant duro**: AS DUAS contas têm de ser da empresa; senão → `null` → 404.
- **Vencedor = quem tem mais dado** (não necessariamente o `into`): `pickRicherAccount`
  (riqueza → createdAt asc → menor id). O outro é a perdedora.
- **Atômico (`$transaction`)**: migra refs (Entrega/Contato/ClienteProduto/FinanceiroCharge/
  VendasLead) loser→winner; **preenche só os buracos** do vencedor com dados da perdedora
  (não sobrescreve — ele é a base) + **acumula papéis** (só liga isLead/isCliente/isForn);
  grava `DeletionRecord` (moduleKey `nucleo`, entityType `CustomerProfile`, snapshot da
  perdedora + `mergedInto`); **deleta** a perdedora.
- **Idempotente/seguro**: fundir consigo mesma = no-op (`{noop:true}`), não apaga nada.
- **ADMIN-only** (RolesGuard + `@Admin`) — fundir é destrutivo pra base.

## (c) Atomicidade do `confirmarEntrega`
O NÚCLEO (update status/GPS + `qtdEntregue` dos EntregaItem) agora roda numa **mesma
`$transaction`**: ou o status `entregue`/GPS **e** as quantidades caem juntos, ou nada
(rollback) — some o "entregue com itens pela metade". **Não mexi no caminho blindado do
WhatsApp nem na flag**: os efeitos externos (WhatsApp `queueOutboundForCompany` + cobrança)
seguem **FORA** da tx, como antes (nada de I/O externo dentro de transação). A trava
atômica do charge por entrega (item a) fecha o outro lado da corrida.

## (d) Soft-delete (padrão `DeletionRecord` do repo)
Todos atômicos (`$transaction`: snapshot + esconde), company-scoped, idempotentes:
- **Conta** (`DELETE /nucleo/contas/:id`): snapshot + `status='deleted'` + papéis off (some
  das janelas Empresas/Clientes/Contatos). Já-deletada = no-op.
- **Contato** (`DELETE /nucleo/contatos/:id`): snapshot + remove a linha (Contato não tem
  coluna de status → o padrão é snapshot-e-apaga; histórico fica no DeletionRecord).
- **Entrega** (`DELETE /logistica/entregas/:id`): snapshot + `status='cancelada'` com nota
  (sai da rota, não some do banco). Já-cancelada = no-op.

## Checks (todos VERDES)
- `npm run build` (tsc estrito) ✅
- `npx prisma validate` ✅ · `npx prisma generate` ✅
- `node --test dist/…` (compilado, como a CI do repo) — **28/28 pass, 0 fail**:
  - **merge** provado: 2 contas duplicadas → 1 conta com 5 tabelas de refs migradas +
    papel acumulado + perdedora em `DeletionRecord` + removida do banco; +no-op consigo
    mesma; +cross-tenant → null.
  - **unique/charge por entrega** provado no R2 idem (confirmar 2× = 1 charge) + agora a
    trava de banco (P2002 → idempotente) no `lancarCobranca`.
  - **soft-delete** provado: esconde (status/papéis) **e** grava snapshot; idempotente;
    cross-tenant → null; contato snapshot+remove.

## Decisões p/ o dono
1. **Índice parcial só em SQL (não `@@unique`)** — Prisma 5.x não expressa parcial; segui
   o precedente do repo (`IntegrationSyncRun`). Se um dia migrar pro Prisma que suporte,
   dá pra promover pro DSL. **Sem drift hoje.**
2. **Merge escolhe o vencedor por DADO, não pelo `into`** — a rota é `:id/merge {into}`,
   mas quem sobrevive é a conta mais rica (regra do plano "quem tem mais dado vence"). Se
   você preferir "o `into` SEMPRE vence" (destino fixo), é 1 linha (trocar `pickRicher` por
   `winner=cb`). Deixei pela riqueza porque é o que o PLANO-ROBUSTEZ pede.
3. **Soft-delete de Conta usa `status='deleted'`** (coluna já existe). As janelas N3/N4
   filtram por `tipo`/`isCliente` mas **NÃO** excluem `status='deleted'` hoje — desliguei os
   papéis pra sumir das views. Se quiser um filtro `status != 'deleted'` explícito nas
   listagens, é um passe rápido (fora do escopo R3, sinalizo). 
4. **Dedupe defensivo do `entregaId`** roda mesmo sem legado (coluna nova) — inócuo, é
   cinto de segurança caso o R2 tenha criado duplicata antes da trava.
5. **Migrations NÃO aplicadas** (Postgres down) — aplicar junto do R1 (ordem: as N* e R2
   antes desta). O SQL está conferido; recomendo rodar o dedupe do cnpj com `EXPLAIN` num
   dump antes do ar (grupos grandes de duplicata podem ser pesados).

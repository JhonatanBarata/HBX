# S0 — Banco destravado: acabar com o drift que congela migration

## Por quê primeiro
`backend/prisma/schema.prisma` tem o model `VendasCardComplaint` (linha ~2841) e a tabela EXISTE em
prod, mas **nenhuma migration a cria**. Consequência: `prisma migrate dev` quer criar a tabela de
novo → falha → **ninguém consegue gerar migration nova**. Foi por isso que `rotaConferidaAtiva`
ficou sem coluna (lida por `(c as any)` em `logistica-config.service.ts:495`) e a frente
ROTA-CONFERIDA inteira está morta no ar. Enquanto isso não for resolvido, TODA feature futura que
precisar de coluna vai nascer com gambiarra igual.

## O que fazer

1. **Materializar a migration que falta** (padrão "baseline de drift"):
   - Gerar o SQL da tabela como ela É em prod: `npx prisma migrate diff --from-migrations
     ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script` e recortar SÓ o
     bloco do `VendasCardComplaint` (conferir contra o dump em
     `backend/backups/prod/2026071_*/prod-backup.sql`).
   - Criar `backend/prisma/migrations/<timestamp>_baseline_vendas_card_complaint/migration.sql`
     com `CREATE TABLE IF NOT EXISTS ...` (idempotente de propósito).
   - Em prod a tabela já existe → marcar como aplicada: `npx prisma migrate resolve --applied
     <timestamp>_baseline_vendas_card_complaint` (rodar na VPS no dia do publish).
2. **Aí sim, a coluna de verdade**:
   - `rotaConferidaAtiva Boolean @default(true)` no model `LogisticaConfig` (schema ~1981, ao lado
     da `agendaV2Ativa` — que na MESMA migration vira `@default(true)` também). ⚡ Lei do dono
     26/07: default = comportamento novo LIGADO; empresa nova nasce com o app atual, não com o velho.
   - `npx prisma migrate dev --name logistica_rota_conferida_flag` (agora passa).
   - Trocar `!!(c as any)?.rotaConferidaAtiva` por leitura tipada normal em
     `logistica-config.service.ts:495` e apagar o comentário-desabafo das linhas 479-494.
3. Conferir se há MAIS drift além do `VendasCardComplaint`: rodar o `migrate diff` completo e
   listar qualquer outra diferença no relatório da sprint (não corrigir nada além do combinado —
   só listar).

## Verificação (gate)
- Local: `npx prisma migrate dev` roda limpo do zero (banco dev recriado) e `npm run typecheck`
  do backend verde.
- O GET `/logistica/config` devolve `rotaConferidaAtiva:false` (tipado, sem cast).
- **NÃO aplicar em prod sem o dono mandar** — o `migrate resolve` na VPS entra no checklist do
  publish, não desta sprint.

## Risco
Baixo em código (coluna default false = nada muda de comportamento). O risco é operacional na VPS
(migrate resolve na ordem errada) — por isso o passo de prod fica pro publish com o dono olhando.

-- S4 LEAD-CENTRICO (25/07, docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/04-robozinho.md):
-- motivo de encerramento ESTRUTURADO do VendasLead (sem_interesse | nao_atendeu |
-- contato_invalido | convertido | outro). ADITIVA: só adiciona uma coluna nullable —
-- nada existente é alterado. Sem enum no Postgres (Prisma usa String, igual ao
-- resto do domínio Vendas) para não exigir migration de novo motivo no futuro.
-- migrate dev quebrado (banco dev desligado) -> migration a mao, padrao da casa
-- (aplicar com migrate deploy).

-- AlterTable
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "closureReason" TEXT;

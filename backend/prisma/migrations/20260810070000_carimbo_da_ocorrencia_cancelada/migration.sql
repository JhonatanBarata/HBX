-- F2.1 da LEI DO DESAPARECER (10/08) — CARIMBO, NÃO APAGÃO.
--
-- `agendaOcorrenciaKey` é ÚNICA por empresa e por isso tem que ser solta quando a
-- entrega é cancelada em massa (senão o generateDay acha "já existe" e pula o
-- cliente para sempre — o motivo está escrito em logistica-rota.service.ts).
-- O efeito colateral era a cancelada perder a identidade da visita: ninguém
-- conseguia responder "esta cancelada é a mesma ocorrência que renasceu depois?".
--
-- Esta coluna guarda a ORIGEM, sem índice único: preservar história não pode
-- travar a próxima geração. Aditiva pura — nada é reescrito, nada é apagado.
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "agendaOcorrenciaKeyOrigem" VARCHAR(160);

-- A busca que o histórico (F5) e a idempotência do cancelar (F2.4) fazem: "esta
-- ocorrência foi cancelada recentemente nesta empresa?". Parcial porque a coluna é
-- nula na esmagadora maioria das linhas (só cancelada em massa carimba).
CREATE INDEX IF NOT EXISTS "Entrega_companyId_agendaOcorrenciaKeyOrigem_idx"
  ON "Entrega" ("companyId", "agendaOcorrenciaKeyOrigem")
  WHERE "agendaOcorrenciaKeyOrigem" IS NOT NULL;

-- FICHA DE QUALIFICAÇÃO PERSISTIDA POR LEAD (30/07/2026 — 2º período do dia
-- de vendedor).
--
-- O lead de hoje respondeu "como que funciona ?" e o sistema não tinha ONDE
-- guardar o que já se sabe da conversa: as vagas de qualificação
-- (volume/dor_atual/decisor/urgencia/aceite, ver vendas-qualificacao.ts) só
-- existiam em memória de teste. Sem ficha, o bot não tem para onde conduzir e
-- o vendedor recebe o lead sem contexto.
--
-- Forma do JSON: { preenchidas, aceiteExplicito, ultimaVagaPerguntada?, atualizadoEm }
-- (serialize/parse em vendas-qualificacao.ts — entrada podre vira ficha vazia).
-- Aditiva pura: nullable, sem default, sem backfill, sem índice.

ALTER TABLE "VendasLead" ADD COLUMN "qualificacaoJson" TEXT;

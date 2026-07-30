-- CATÁLOGO COMERCIAL POR TENANT (30/07/2026)
--
-- Nasceu do dia de vendedor em produção: o Copiloto, pedido a rascunhar a
-- primeira mensagem para uma distribuidora de água, ofereceu "gestão fiscal".
-- A empresa vende logística e controle de frota. Não existia, em lugar nenhum
-- do schema, um campo dizendo o que a empresa VENDE — só o oposto
-- (Company.prospectingSegmentsJson = quem ela quer prospectar).
--
-- Coluna NULA é estado legítimo e carrega regra: sem catálogo, a IA é proibida
-- de afirmar produto, benefício ou preço (ver backend/src/vendas/vendas-catalogo.ts,
-- LACUNA_SEM_CATALOGO). Aditiva pura: nullable, sem default, sem backfill,
-- sem índice — nenhuma linha existente muda de comportamento.

ALTER TABLE "VendasComercialConfig" ADD COLUMN "catalogoJson" TEXT;

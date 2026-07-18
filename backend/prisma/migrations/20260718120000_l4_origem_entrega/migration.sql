-- L4-A (18/07) — coluna aditiva Entrega.origem. 100% aditivo: NULL por
-- default, nenhuma linha existente muda de comportamento (legado com
-- origem=NULL é esperado; o app trata null como recorrente).
--
-- Entrega.origem  TEXT, nullable — 'avulsa' (POST /logistica/entregas,
--   pedido público) | 'recorrente' (gerar-dia/materialize, carry-forward de
--   pendência) | null (dado legado anterior a este pacote).

ALTER TABLE "Entrega" ADD COLUMN "origem" TEXT;

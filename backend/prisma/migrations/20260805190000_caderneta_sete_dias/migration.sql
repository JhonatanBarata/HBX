-- CADERNETA 7 DIAS (PR05082026-CADERNETA-7-DIAS) — a página da caderneta onde a
-- venda foi anotada (1=seg..7=dom). Organização, nunca dinheiro: deliveredAt
-- segue o dia real. Aditivo puro (null = venda fora da caderneta/legado).

ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "cadernetaDiaSemana" INTEGER;

CREATE INDEX IF NOT EXISTS "Entrega_companyId_cadernetaDiaSemana_deliveredAt_idx"
  ON "Entrega"("companyId", "cadernetaDiaSemana", "deliveredAt");

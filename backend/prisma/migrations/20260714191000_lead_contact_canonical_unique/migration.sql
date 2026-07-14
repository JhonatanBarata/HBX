-- LeadContact passa a ser canônico por lead + tipo + valor normalizado.
-- Mantém a melhor linha existente (menor rank, maior confiança, mais antiga)
-- antes de instalar a trava física de idempotência.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "radarLeadId", "kind", "valueNormalized"
      ORDER BY "rank" ASC, "confidence" DESC NULLS LAST, "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "LeadContact"
)
DELETE FROM "LeadContact" target
USING ranked
WHERE target."id" = ranked."id"
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "LeadContact_radarLeadId_kind_valueNormalized_key"
ON "LeadContact"("radarLeadId", "kind", "valueNormalized");

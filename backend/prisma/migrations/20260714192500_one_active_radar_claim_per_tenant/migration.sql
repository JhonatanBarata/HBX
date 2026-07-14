-- Serializa a aquisição do mesmo lead por tenant. A restrição é parcial para
-- liberar uma nova tentativa somente depois de failed/refunded; completed e
-- partial são protegidos também pela regra de domínio no serviço.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", "radarLeadId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "RadarLeadProcessRun"
  WHERE "mode" = 'claim'
    AND "radarLeadId" IS NOT NULL
    AND "status" NOT IN ('completed', 'partial', 'failed', 'refunded')
)
UPDATE "RadarLeadProcessRun" AS run
SET
  "status" = 'failed',
  "errorCode" = 'RADAR_DUPLICATE_ACTIVE_CLAIM',
  "errorMessage" = 'Operação duplicada encerrada durante a migração de segurança.',
  "finishedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE run."id" = ranked."id"
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "RadarLeadProcessRun_one_active_claim_per_tenant_key"
ON "RadarLeadProcessRun"("companyId", "radarLeadId")
WHERE "mode" = 'claim'
  AND "radarLeadId" IS NOT NULL
  AND "status" NOT IN ('completed', 'partial', 'failed', 'refunded');

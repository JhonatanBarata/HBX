-- Remove duplicatas que podiam nascer quando duas telas inicializavam a régua
-- padrão simultaneamente. Mantém a primeira linha e, por ON DELETE CASCADE,
-- elimina apenas execuções redundantes presas à cópia removida.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", title, channel, "daysAfter", template
      ORDER BY "createdAt", id
    ) AS rn
  FROM "HbxRecoveryFlowStage"
  WHERE title IN (
    'Contato inicial',
    'Reforco amigavel',
    'Oferta de parcelamento',
    'Aviso de escalonamento',
    'Ultima tentativa'
  )
)
DELETE FROM "HbxRecoveryFlowStage" stage
USING ranked
WHERE stage.id = ranked.id
  AND ranked.rn > 1;

-- Idempotência estrutural: createMany(skipDuplicates) passa a ser seguro mesmo
-- sob concorrência entre API, worker e múltiplas abas.
CREATE UNIQUE INDEX IF NOT EXISTS "HbxRecoveryFlowStage_default_stage_unique"
ON "HbxRecoveryFlowStage" ("companyId", title, channel, "daysAfter", template)
WHERE title IN (
  'Contato inicial',
  'Reforco amigavel',
  'Oferta de parcelamento',
  'Aviso de escalonamento',
  'Ultima tentativa'
);

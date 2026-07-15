-- Restaura apenas o contrato FISICO aditivo perdido no revert de 15/07.
--
-- Esta migration nao reaplica as limpezas destrutivas das migrations revertidas:
-- nenhum lead, contato, credito, estado comercial ou PII existente e alterado.
-- Todos os objetos sao protegidos para poderem coexistir com bancos nos quais
-- parte do fencing tenha sido aplicada manualmente.

ALTER TABLE "MobileDevice"
  ADD COLUMN IF NOT EXISTS "accessProfile" TEXT NOT NULL DEFAULT 'ADMIN';

ALTER TABLE "MobilePairingCode"
  ADD COLUMN IF NOT EXISTS "accessProfile" TEXT NOT NULL DEFAULT 'ADMIN';

ALTER TABLE "CnpjPublicCompany"
  ADD COLUMN IF NOT EXISTS "fax" TEXT,
  ADD COLUMN IF NOT EXISTS "faxDigits" TEXT;

-- A tabela de processo e criada completa em bancos que perderam toda a cadeia.
-- Se ela ja existir, os ALTERs seguintes completam somente o fencing ausente.
CREATE TABLE IF NOT EXISTS "RadarLeadProcessRun" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "radarLeadId" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT,
  "stagesJson" TEXT NOT NULL DEFAULT '[]',
  "eventsJson" TEXT NOT NULL DEFAULT '[]',
  "snapshotJson" TEXT NOT NULL DEFAULT '{}',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "workerToken" TEXT,
  "workerLeaseUntil" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadarLeadProcessRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RadarLeadProcessRun"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "companyId" INTEGER,
  ADD COLUMN IF NOT EXISTS "userId" INTEGER,
  ADD COLUMN IF NOT EXISTS "radarLeadId" TEXT,
  ADD COLUMN IF NOT EXISTS "mode" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "stagesJson" TEXT DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "eventsJson" TEXT DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "snapshotJson" TEXT DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "workerToken" TEXT,
  ADD COLUMN IF NOT EXISTS "workerLeaseUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Uma tabela parcial criada manualmente nao pode derrubar o deploy. Reinstala a
-- PK somente quando os ids existentes permitem; caso contrario preserva tudo e
-- deixa um aviso operacional para reconciliacao explicita.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RadarLeadProcessRun"'::regclass
      AND contype = 'p'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM "RadarLeadProcessRun" WHERE "id" IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM "RadarLeadProcessRun"
        GROUP BY "id" HAVING COUNT(*) > 1
      ) THEN
      ALTER TABLE "RadarLeadProcessRun"
        ADD CONSTRAINT "RadarLeadProcessRun_pkey" PRIMARY KEY ("id");
    ELSE
      RAISE WARNING 'RadarLeadProcessRun sem PK: ids nulos/duplicados exigem auditoria manual';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RadarLeadProcessRun"
    WHERE "workerToken" IS NOT NULL
    GROUP BY "workerToken" HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'RadarLeadProcessRun workerToken pendente: duplicatas preservadas impedem o indice unico';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "RadarLeadProcessRun_workerToken_key"
      ON "RadarLeadProcessRun"("workerToken");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RadarLeadProcessRun"
    WHERE "companyId" IS NOT NULL AND "idempotencyKey" IS NOT NULL
    GROUP BY "companyId", "idempotencyKey" HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'RadarLeadProcessRun idempotencyKey pendente: duplicatas preservadas impedem o indice unico';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "RadarLeadProcessRun_companyId_idempotencyKey_key"
      ON "RadarLeadProcessRun"("companyId", "idempotencyKey");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "RadarLeadProcessRun_companyId_status_updatedAt_idx"
  ON "RadarLeadProcessRun"("companyId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "RadarLeadProcessRun_companyId_userId_createdAt_idx"
  ON "RadarLeadProcessRun"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RadarLeadProcessRun_companyId_radarLeadId_createdAt_idx"
  ON "RadarLeadProcessRun"("companyId", "radarLeadId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RadarLeadProcessRun"'::regclass
      AND conname = 'RadarLeadProcessRun_companyId_fkey'
  ) THEN
    ALTER TABLE "RadarLeadProcessRun"
      ADD CONSTRAINT "RadarLeadProcessRun_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "RadarLeadProcessRun" run
    WHERE run."companyId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Company" company WHERE company."id" = run."companyId")
  ) THEN
    RAISE WARNING 'RadarLeadProcessRun companyId fkey nao validada: orfaos existentes foram preservados';
  ELSE
    ALTER TABLE "RadarLeadProcessRun"
      VALIDATE CONSTRAINT "RadarLeadProcessRun_companyId_fkey";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RadarLeadProcessRun"'::regclass
      AND conname = 'RadarLeadProcessRun_userId_fkey'
  ) THEN
    ALTER TABLE "RadarLeadProcessRun"
      ADD CONSTRAINT "RadarLeadProcessRun_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "RadarLeadProcessRun" run
    WHERE run."userId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "User" app_user WHERE app_user."id" = run."userId")
  ) THEN
    RAISE WARNING 'RadarLeadProcessRun userId fkey nao validada: orfaos existentes foram preservados';
  ELSE
    ALTER TABLE "RadarLeadProcessRun"
      VALIDATE CONSTRAINT "RadarLeadProcessRun_userId_fkey";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RadarLeadProcessRun"'::regclass
      AND conname = 'RadarLeadProcessRun_radarLeadId_fkey'
  ) THEN
    ALTER TABLE "RadarLeadProcessRun"
      ADD CONSTRAINT "RadarLeadProcessRun_radarLeadId_fkey"
      FOREIGN KEY ("radarLeadId") REFERENCES "RadarLeadPool"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "RadarLeadProcessRun" run
    WHERE run."radarLeadId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "RadarLeadPool" lead WHERE lead."id" = run."radarLeadId")
  ) THEN
    RAISE WARNING 'RadarLeadProcessRun radarLeadId fkey nao validada: orfaos existentes foram preservados';
  ELSE
    ALTER TABLE "RadarLeadProcessRun"
      VALIDATE CONSTRAINT "RadarLeadProcessRun_radarLeadId_fkey";
  END IF;
END $$;

ALTER TABLE "RadarLeadCompanyState"
  ADD COLUMN IF NOT EXISTS "paidClaimOperationId" TEXT,
  ADD COLUMN IF NOT EXISTS "claimUsageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "acquiredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "RadarLeadCompanyState_companyId_acquiredAt_idx"
  ON "RadarLeadCompanyState"("companyId", "acquiredAt");

ALTER TABLE "VendasLead"
  ADD COLUMN IF NOT EXISTS "claimOperationId" TEXT,
  ADD COLUMN IF NOT EXISTS "contactSnapshotJson" TEXT,
  ADD COLUMN IF NOT EXISTS "opportunityScore" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "VendasLead"
    WHERE "claimOperationId" IS NOT NULL
    GROUP BY "claimOperationId" HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'VendasLead claimOperationId pendente: duplicatas preservadas impedem o indice unico';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "VendasLead_claimOperationId_key"
      ON "VendasLead"("claimOperationId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "VendasLead_companyId_claimOperationId_idx"
  ON "VendasLead"("companyId", "claimOperationId");

-- Trava canonica do contato. Duplicatas legadas nao podem abortar a restauracao
-- critica da puxada e tambem nao podem ser apagadas silenciosamente. Nesse caso
-- o indice fica pendente e um warning identificavel exige reconciliacao manual.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "LeadContact"
    GROUP BY "radarLeadId", "kind", "valueNormalized"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'LeadContact canonico pendente: duplicatas preservadas impedem o indice unico';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "LeadContact_radarLeadId_kind_valueNormalized_key"
      ON "LeadContact"("radarLeadId", "kind", "valueNormalized");
  END IF;
END $$;

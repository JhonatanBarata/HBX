-- 31/07 — recado de rota que morreu no meio (abandonada | parcial | parada).
-- Aditiva: tabela nova, nenhuma coluna existente é tocada.
CREATE TABLE "LogisticaRotaAviso" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "motoristaUserId" INTEGER NOT NULL,
    "motoristaNome" VARCHAR(120) NOT NULL,
    "rotaModeloId" TEXT,
    "rotaNome" VARCHAR(80),
    "routeDate" VARCHAR(10) NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "entregues" INTEGER NOT NULL DEFAULT 0,
    "abertas" INTEGER NOT NULL DEFAULT 0,
    "vistoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticaRotaAviso_pkey" PRIMARY KEY ("id")
);

-- FREIO: um mesmo abandono nunca vira dois avisos (o vigia roda a cada 10min).
CREATE UNIQUE INDEX "LogisticaRotaAviso_companyId_motoristaUserId_routeDate_tipo_key"
    ON "LogisticaRotaAviso"("companyId", "motoristaUserId", "routeDate", "tipo");

CREATE INDEX "LogisticaRotaAviso_companyId_vistoEm_createdAt_idx"
    ON "LogisticaRotaAviso"("companyId", "vistoEm", "createdAt");

CREATE INDEX "LogisticaRotaAviso_companyId_rotaModeloId_idx"
    ON "LogisticaRotaAviso"("companyId", "rotaModeloId");

ALTER TABLE "LogisticaRotaAviso" ADD CONSTRAINT "LogisticaRotaAviso_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

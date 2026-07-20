-- PR20072026 W1 — "Leitura de Rota": sessão de captura em campo (LEITURA com
-- GPS ou MANUAL sem GPS) que vira uma LogisticaRotaModelo ao finalizar.
-- Migration ADITIVA: só CREATE TABLE/INDEX/FK, nada destrutivo.

CREATE TABLE "LogisticaLeituraSessao" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "modo" TEXT NOT NULL DEFAULT 'LEITURA',
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticaLeituraSessao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticaLeituraParada" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "capturadoEm" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "customerProfileId" TEXT,
    "localEntregaId" TEXT,
    "itensJson" JSONB NOT NULL,
    "telefoneConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticaLeituraParada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogisticaLeituraSessao_companyId_userId_status_idx"
  ON "LogisticaLeituraSessao"("companyId", "userId", "status");

CREATE INDEX "LogisticaLeituraParada_sessaoId_ordem_idx"
  ON "LogisticaLeituraParada"("sessaoId", "ordem");

CREATE UNIQUE INDEX "LogisticaLeituraParada_sessaoId_clientKey_key"
  ON "LogisticaLeituraParada"("sessaoId", "clientKey");

ALTER TABLE "LogisticaLeituraSessao"
  ADD CONSTRAINT "LogisticaLeituraSessao_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LogisticaLeituraParada"
  ADD CONSTRAINT "LogisticaLeituraParada_sessaoId_fkey"
  FOREIGN KEY ("sessaoId") REFERENCES "LogisticaLeituraSessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LogisticaLeituraParada"
  ADD CONSTRAINT "LogisticaLeituraParada_customerProfileId_fkey"
  FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LogisticaLeituraParada"
  ADD CONSTRAINT "LogisticaLeituraParada_localEntregaId_fkey"
  FOREIGN KEY ("localEntregaId") REFERENCES "LocalEntrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

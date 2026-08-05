-- PULSO DO APP (PR04082026-PULSO-DO-APP) — última tela por aparelho (carona no
-- poll dos recados) + trilha do dia (1 linha por TROCA de tela). Aditivo puro.

ALTER TABLE "MobileDevice" ADD COLUMN IF NOT EXISTS "ultimaTela" VARCHAR(40);
ALTER TABLE "MobileDevice" ADD COLUMN IF NOT EXISTS "ultimaTelaAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "MobileTelaTrilha" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "deviceId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "tela" VARCHAR(40) NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileTelaTrilha_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MobileTelaTrilha_deviceId_at_idx"
  ON "MobileTelaTrilha"("deviceId", "at");
CREATE INDEX IF NOT EXISTS "MobileTelaTrilha_companyId_at_idx"
  ON "MobileTelaTrilha"("companyId", "at");

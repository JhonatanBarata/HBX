-- VER TELA + ERROS DO CLIENTE (PR05082026-VER-TELA-PAINEL-CLIENTE, 05/08).
--   • MobileDevice.espelhoAte  → janela de 60s em que o aparelho manda o espelho
--     da tela (o painel do master renova enquanto está aberto).
--   • MobileEspelhoQuadro      → o ÚLTIMO quadro por aparelho (espelho é ao vivo,
--     não gravação; a chave primária É o deviceId).
--   • MobileErroTrilha         → o que o usuário VIU dar errado (toast vermelho /
--     erro de JS), retenção de 7 dias.
-- Tudo aditivo puro.

ALTER TABLE "MobileDevice" ADD COLUMN IF NOT EXISTS "espelhoAte" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "MobileEspelhoQuadro" (
  "deviceId" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "tela" VARCHAR(40) NOT NULL,
  "html" TEXT NOT NULL,
  "tema" VARCHAR(20),
  "bodyClass" VARCHAR(160),
  "css" TEXT,
  "cssVersao" VARCHAR(40),
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileEspelhoQuadro_pkey" PRIMARY KEY ("deviceId")
);
CREATE INDEX IF NOT EXISTS "MobileEspelhoQuadro_companyId_at_idx"
  ON "MobileEspelhoQuadro"("companyId", "at");

CREATE TABLE IF NOT EXISTS "MobileErroTrilha" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "deviceId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "tela" VARCHAR(40) NOT NULL,
  "msg" VARCHAR(300) NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileErroTrilha_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MobileErroTrilha_deviceId_at_idx"
  ON "MobileErroTrilha"("deviceId", "at");
CREATE INDEX IF NOT EXISTS "MobileErroTrilha_companyId_at_idx"
  ON "MobileErroTrilha"("companyId", "at");

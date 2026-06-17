-- Chave-mestra do bot (PR17062026045 Bloco B): campos aditivos em Company e User.
-- Company: registra QUANDO e QUEM armou o bot, canal e motivo.
-- User: flag de propagação (Admin libera por vendedor).

ALTER TABLE "Company" ADD COLUMN "botArmedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "botArmChannel" TEXT;
ALTER TABLE "Company" ADD COLUMN "botArmedByUserId" INTEGER;
ALTER TABLE "Company" ADD COLUMN "botArmReason" TEXT;

ALTER TABLE "User" ADD COLUMN "botAccessEnabled" BOOLEAN NOT NULL DEFAULT false;

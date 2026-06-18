-- 050-2: WhatsApp por vendedor — carimba userId na sessão de conexão.
-- Aditivo: adiciona userId (nullable) e índice composto.

ALTER TABLE "WhatsAppConnectionSession" ADD COLUMN "userId" INTEGER;

CREATE INDEX "WhatsAppConnectionSession_userId_status_idx" ON "WhatsAppConnectionSession"("userId", "status");

ALTER TABLE "WhatsAppConnectionSession"
  ADD CONSTRAINT "WhatsAppConnectionSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WEBWHATS-ARQ3 Sprint 3 — Fonte única do estado de conexão (projeção canônica).
-- ADITIVO E NÃO-DESTRUTIVO: adiciona APENAS 2 colunas NULLABLE em WhatsAppConnectionSession
-- + 1 índice de leitura por frescor. NÃO altera/dropa nenhuma coluna, tabela ou índice
-- existente. NÃO toca em nenhuma lógica de conexão/reconexão/disjuntor — só carimba o
-- estado que o motor ao vivo já reportava.
--
-- lastReconciledAt: quando o app confirmou o estado desta sessão contra o motor (frescor).
-- motorState: último estado do socket reportado pelo motor (open | close | connecting | ...).
--
-- Idempotente (IF NOT EXISTS) para ser seguro de reaplicar no estilo do repo.

ALTER TABLE "WhatsAppConnectionSession" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppConnectionSession" ADD COLUMN IF NOT EXISTS "motorState" TEXT;

-- Leitura por frescor: consumidores filtram sessões ativas e ordenam/checam o carimbo.
CREATE INDEX IF NOT EXISTS "WhatsAppConnectionSession_companyId_status_lastReconciledAt_idx"
  ON "WhatsAppConnectionSession"("companyId", "status", "lastReconciledAt");

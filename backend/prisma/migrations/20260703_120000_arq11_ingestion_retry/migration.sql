-- ARQ11 S1 — Ingestão Externa de Leads: "nenhum lead pago se perde"
-- (docs/PLANEJAMENTOS/ARQ11-INGESTAO-EXTERNA-LEADS/ingestao-externa-leads-sprint1.md).
--
-- Transforma o ledger de webhooks numa fila durável com retry: o payload COMPLETO do
-- evento passa a ser guardado para replay assíncrono; o worker reclama lotes por
-- (status, nextRetryAt) e faz backoff em `attempts`. `status` agora admite também
-- 'retry' e 'dead_letter' (além de received/processed/rejected). Aditiva: todas as
-- colunas são NULLABLE ou têm DEFAULT — nada quebra as linhas existentes.

-- AlterTable ExternalWebhookEvent
ALTER TABLE "ExternalWebhookEvent" ADD COLUMN     "payload" JSONB,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT;

-- CreateIndex (claim do worker: varredura por provider/status/nextRetryAt)
CREATE INDEX "ExternalWebhookEvent_provider_status_nextRetryAt_idx" ON "ExternalWebhookEvent"("provider", "status", "nextRetryAt");

-- AlterTable MetaLeadConnection (marca da assinatura da página no webhook do Meta)
ALTER TABLE "MetaLeadConnection" ADD COLUMN     "webhookSubscribedAt" TIMESTAMP(3);

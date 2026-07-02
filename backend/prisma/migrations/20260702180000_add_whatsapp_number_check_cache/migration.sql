-- FREIO do zap-gate (W4, PR02072026 — docs/PLANEJAMENTOS/PR02072026/W4-freio-zapgate.md).
-- Cache TTL persistente do resultado de "número tem WhatsApp?" checado no motor Webwhats.
-- Chave = phoneDigits (número normalizado), NÃO radarLeadId — o mesmo número aparece em vários
-- LeadContact/leads e o freio precisa deduplicar globalmente. Lido/gravado SÓ pelo
-- ZapCheckGuardService (backend/src/messaging/zap-check-guard.service.ts), que intercepta
-- WebwhatsBridgeService.checkWhatsappNumbers — porta única por onde passa TODO check de WhatsApp
-- (Radar via applyRadarWhatsappCheck, Vendas, Inbox). ADITIVA: tabela nova, nada destrutivo.

-- CreateTable
CREATE TABLE "WhatsappNumberCheckCache" (
    "phoneDigits" TEXT NOT NULL,
    "exists" BOOLEAN NOT NULL,
    "remoteJid" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappNumberCheckCache_pkey" PRIMARY KEY ("phoneDigits")
);

-- CreateIndex
CREATE INDEX "WhatsappNumberCheckCache_checkedAt_idx" ON "WhatsappNumberCheckCache"("checkedAt");

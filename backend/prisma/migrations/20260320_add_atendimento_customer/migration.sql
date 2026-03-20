-- CreateTable
CREATE TABLE IF NOT EXISTS "AtendimentoCustomer" (
    "id"                  TEXT          NOT NULL,
    "companyId"           INTEGER       NOT NULL,
    "name"                TEXT,
    "phone"               TEXT          NOT NULL,
    "phoneNormalized"     TEXT          NOT NULL,
    "registrationOrigin"  TEXT          NOT NULL DEFAULT 'whatsapp_bot',
    "registrationStatus"  TEXT          NOT NULL DEFAULT 'pending_confirmation',
    "route"               TEXT          NOT NULL DEFAULT 'atendimento',
    "notes"               TEXT,
    "lastMessageAt"       TIMESTAMP(3),
    "conversationId"      INTEGER,
    "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtendimentoCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AtendimentoCustomer_companyId_phoneNormalized_key"
    ON "AtendimentoCustomer"("companyId", "phoneNormalized");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AtendimentoCustomer_companyId_registrationStatus_idx"
    ON "AtendimentoCustomer"("companyId", "registrationStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AtendimentoCustomer_companyId_registrationOrigin_idx"
    ON "AtendimentoCustomer"("companyId", "registrationOrigin");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AtendimentoCustomer_companyId_updatedAt_idx"
    ON "AtendimentoCustomer"("companyId", "updatedAt");

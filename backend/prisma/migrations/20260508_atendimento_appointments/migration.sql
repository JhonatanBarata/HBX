CREATE TABLE "AtendimentoAppointment" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "conversationId" INTEGER,
  "customerName" TEXT,
  "customerPhone" TEXT NOT NULL,
  "agendaGroupId" TEXT NOT NULL,
  "responsibleName" TEXT,
  "responsibleEmail" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "source" TEXT NOT NULL DEFAULT 'whatsapp_atendimento',
  "googleCalendarEventId" TEXT,
  "calendarSyncStatus" TEXT NOT NULL DEFAULT 'not_configured',
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AtendimentoAppointment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AtendimentoAppointment"
  ADD CONSTRAINT "AtendimentoAppointment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AtendimentoAppointment"
  ADD CONSTRAINT "AtendimentoAppointment_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AtendimentoAppointment_companyId_customerPhone_status_startsAt_idx"
  ON "AtendimentoAppointment"("companyId", "customerPhone", "status", "startsAt");

CREATE INDEX "AtendimentoAppointment_companyId_agendaGroupId_status_startsAt_idx"
  ON "AtendimentoAppointment"("companyId", "agendaGroupId", "status", "startsAt");

CREATE INDEX "AtendimentoAppointment_conversationId_startsAt_idx"
  ON "AtendimentoAppointment"("conversationId", "startsAt");

-- Modelo de atendimento por empresa (ordem do dono 20/06):
-- NULL = admin ainda não escolheu (banner/tutorial) | 'shared' = número único | 'individual' = chip por vendedor.
-- Aditivo e nullable: não quebra dados existentes; runtime usa effectiveMode = whatsappAttendanceMode ?? 'individual'.
ALTER TABLE "Company" ADD COLUMN "whatsappAttendanceMode" TEXT;

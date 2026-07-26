-- S5 LEAD-CENTRICO (26/07, docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/05-agenda-slots.md):
-- config comercial ENXUTA por empresa (janela de horario + teto de disparos por
-- user/chip/dia + intervalo minimo). ADITIVA PURA: so cria tabela+indice novos, nada
-- existente e tocado. Coluna companyId crua sem back-relation/FK, mesmo padrao de
-- Cadencia/Atividade/AutomationAgent (ver comentarios desses models no schema).
-- SQL escrito a mao (migrate dev local quebrado por drift preexistente, padrao da
-- casa) — shape conferido 1:1 contra o model VendasComercialConfig do schema.prisma.

-- CreateTable
CREATE TABLE IF NOT EXISTS "VendasComercialConfig" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workingHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '18:00',
    "dailyLimitPerSender" INTEGER NOT NULL DEFAULT 10,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendasComercialConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VendasComercialConfig_companyId_key" ON "VendasComercialConfig"("companyId");

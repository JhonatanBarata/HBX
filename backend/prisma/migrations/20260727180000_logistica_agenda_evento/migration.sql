-- F0 (27/07, pedido explícito do dono) — EXTRATO DE EVENTOS DA AGENDA: "dia e
-- hora EXATOS de tudo". Tabela NOVA, append-only, isolada (mesmo espírito da
-- ClienteHistorico de 22/07): apagar/remover o plano ou a entrega de origem
-- NUNCA leva o evento junto — por isso "planoEntregaId"/"entregaId" NÃO têm
-- FK (histórico sobrevive à origem). "companyId"/"customerProfileId" TÊM FK
-- (Cascade): sem empresa ou cliente dono, a linha não faz sentido. Migration
-- ADITIVA: só CREATE.

CREATE TABLE "LogisticaAgendaEvento" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "planoEntregaId" TEXT,
    "entregaId" TEXT,
    "tipo" VARCHAR(40) NOT NULL,
    "deTexto" VARCHAR(120),
    "paraTexto" VARCHAR(120),
    "origem" VARCHAR(30) NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticaAgendaEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogisticaAgendaEvento_companyId_customerProfileId_createdAt_idx" ON "LogisticaAgendaEvento"("companyId", "customerProfileId", "createdAt");

CREATE INDEX "LogisticaAgendaEvento_companyId_createdAt_idx" ON "LogisticaAgendaEvento"("companyId", "createdAt");

ALTER TABLE "LogisticaAgendaEvento" ADD CONSTRAINT "LogisticaAgendaEvento_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LogisticaAgendaEvento" ADD CONSTRAINT "LogisticaAgendaEvento_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

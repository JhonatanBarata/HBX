-- WORM-16 (02/07, docs/PLANEJAMENTOS/worm/16-tela-contatos-empresas-crm.md): contato por PESSOA
-- (nome + cargo), separado do LeadContact (por CANAL). Sócio do QSA da Receita vira Pessoa.
-- ADITIVA: só cria tabela/índices — nada do RadarLeadPool nem do LeadContact é alterado.

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeadPerson" (
    "id" TEXT NOT NULL,
    "radarLeadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phoneDigits" TEXT,
    "email" TEXT,
    "source" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LeadPerson_radarLeadId_personKey_key" ON "LeadPerson"("radarLeadId", "personKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadPerson_radarLeadId_rank_idx" ON "LeadPerson"("radarLeadId", "rank");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LeadPerson" ADD CONSTRAINT "LeadPerson_radarLeadId_fkey" FOREIGN KEY ("radarLeadId") REFERENCES "RadarLeadPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

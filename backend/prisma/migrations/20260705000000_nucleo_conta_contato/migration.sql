-- NÚCLEO-CRM N1 (04/07) — a espinha de cadastro.
-- 100% ADITIVO E NÃO-DESTRUTIVO: adiciona colunas OPCIONAIS/com DEFAULT em
-- "CustomerProfile" (agora é a CONTA: PJ com CNPJ ou PF pessoa) + 3 índices,
-- e cria 1 tabela nova "Contato" (a PESSOA dentro da conta) + 2 índices + FKs.
-- NÃO altera/dropa nenhuma coluna, tabela ou índice existente. Todos os defaults
-- preservam o comportamento legado (leads/vendas/recovery seguem intactos).
-- Usa "IF NOT EXISTS" p/ ser idempotente (padrão dos aditivos do repo).

-- 1) CustomerProfile vira CONTA (colunas aditivas)
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "tipo"         TEXT NOT NULL DEFAULT 'pf';
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "cnpj"         TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "endereco"     TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "cidade"       TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "uf"           TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "cep"          TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "lat"          DOUBLE PRECISION;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "lng"          DOUBLE PRECISION;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "isLead"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "isCliente"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "isFornecedor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "origin"       TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS "CustomerProfile_companyId_isCliente_idx" ON "CustomerProfile"("companyId", "isCliente");
CREATE INDEX IF NOT EXISTS "CustomerProfile_companyId_tipo_idx"      ON "CustomerProfile"("companyId", "tipo");
CREATE INDEX IF NOT EXISTS "CustomerProfile_companyId_cnpj_idx"      ON "CustomerProfile"("companyId", "cnpj");

-- 2) Contato = a PESSOA dentro da conta (tabela nova, filha de CustomerProfile)
CREATE TABLE IF NOT EXISTS "Contato" (
    "id"                TEXT NOT NULL,
    "companyId"         INTEGER NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "nome"              TEXT NOT NULL,
    "cargo"             TEXT,
    "whatsapp"          TEXT,
    "phone"             TEXT,
    "email"             TEXT,
    "isPrincipal"       BOOLEAN NOT NULL DEFAULT false,
    "source"            TEXT NOT NULL DEFAULT 'manual',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contato_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Contato_companyId_customerProfileId_idx" ON "Contato"("companyId", "customerProfileId");
CREATE INDEX IF NOT EXISTS "Contato_companyId_isPrincipal_idx"       ON "Contato"("companyId", "isPrincipal");

ALTER TABLE "Contato" ADD CONSTRAINT "Contato_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contato" ADD CONSTRAINT "Contato_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

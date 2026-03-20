/**
 * Script para criar a tabela AtendimentoCustomer diretamente via SQL.
 * Seguro: apenas CREATE TABLE IF NOT EXISTS + índices.
 */
const { PrismaClient } = require('@prisma/client');

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const prisma = new PrismaClient();
  console.log('Conectado ao banco. Criando tabela AtendimentoCustomer...');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AtendimentoCustomer" (
      "id"                  TEXT          NOT NULL PRIMARY KEY,
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
      CONSTRAINT "AtendimentoCustomer_companyId_phoneNormalized_key"
        UNIQUE ("companyId", "phoneNormalized")
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AtendimentoCustomer_companyId_registrationStatus_idx"
      ON "AtendimentoCustomer" ("companyId", "registrationStatus")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AtendimentoCustomer_companyId_registrationOrigin_idx"
      ON "AtendimentoCustomer" ("companyId", "registrationOrigin")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AtendimentoCustomer_companyId_updatedAt_idx"
      ON "AtendimentoCustomer" ("companyId", "updatedAt")
  `);

  console.log('Tabela AtendimentoCustomer criada/verificada com sucesso.');
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('Erro ao criar tabela:', e.message);
  process.exit(1);
});

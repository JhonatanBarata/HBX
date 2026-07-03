-- Multi-tenancy S4: trilha de nascimento do tenant (pipeline único). Coluna
-- puramente ADITIVA e NULLABLE — registra COMO cada empresa nasceu (porta,
-- preset, passos). Nenhuma coluna existente é alterada ou removida.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "provisioningLedgerJson" TEXT;

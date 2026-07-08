-- LOGÍSTICA-MOBILE TASK 5 (08/07) — permite vincular o MESMO produto 2× ao
-- mesmo cliente (ex.: 1 galão na segunda, outro na sexta, vínculos separados).
--
-- Remove o índice único "ClienteProduto_companyId_customerProfileId_productId_key"
-- (criado em 20260705030000_logistica_recorrencia/migration.sql via
-- @@unique([companyId, customerProfileId, productId])). SEGURO por natureza:
-- DROP de índice único nunca viola dado existente (só afrouxa uma restrição,
-- não aperta) — não precisa de dedupe. Os índices não-únicos
-- (companyId+ativo+proximaData / companyId+customerProfileId / companyId+productId)
-- continuam intactos (mantidos no schema.prisma), a varredura do gerarDia() segue
-- rápida. IF EXISTS p/ idempotência.

DROP INDEX IF EXISTS "ClienteProduto_companyId_customerProfileId_productId_key";

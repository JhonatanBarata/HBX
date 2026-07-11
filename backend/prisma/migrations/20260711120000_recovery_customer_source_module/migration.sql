-- QUITAR→RECOVERY escopado por origem (fix pós-revisão adversarial 11/07).
-- ADITIVO E NÃO-DESTRUTIVO: 1 coluna nova OPCIONAL. Casos existentes ficam NULL =
-- tratados como manual/externo → a baixa de fiado da logística NUNCA os auto-quita
-- (evita zerar dívida manual de um cliente que também tem fiado). Só casos NOVOS
-- injetados pelo varrer da logística nascem com 'logistica' e podem ser auto-quitados.
ALTER TABLE "HbxRecoveryCustomer" ADD COLUMN IF NOT EXISTS "sourceModule" TEXT;

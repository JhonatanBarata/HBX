DELETE FROM "CompanyModule"
WHERE "moduleId" IN (
  SELECT "id" FROM "SystemModule" WHERE "key" = 'follow_up_internacional'
);

DELETE FROM "SystemModule"
WHERE "key" = 'follow_up_internacional';

DROP TABLE IF EXISTS "AlertaImportacao" CASCADE;
DROP TABLE IF EXISTS "ImportacaoLog" CASCADE;
DROP TABLE IF EXISTS "ImportacaoPermissao" CASCADE;
DROP TABLE IF EXISTS "Importacao" CASCADE;

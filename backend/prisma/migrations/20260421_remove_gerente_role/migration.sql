UPDATE "User"
SET "role" = 'USER'
WHERE UPPER("role") = 'GERENTE';

DELETE FROM "ImportacaoPermissao"
WHERE UPPER("role") = 'GERENTE';

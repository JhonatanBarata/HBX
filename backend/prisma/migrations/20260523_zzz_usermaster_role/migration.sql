UPDATE "User"
SET "role" = 'USERMASTER'
WHERE COALESCE("isSystemMaster", false) = true
  AND UPPER(COALESCE("role", '')) <> 'USERMASTER';

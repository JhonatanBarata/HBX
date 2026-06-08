-- MIGRATION_ONLY: keep commercial modules attached only to tenant companies.

CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_company()
RETURNS trigger AS $$
BEGIN
  IF NEW."companyKind" <> 'tenant' THEN
    RETURN NEW;
  END IF;

  INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
  SELECT NEW.id, sm.id, sm."defaultEnabled", NOW(), NOW()
  FROM "SystemModule" sm
  WHERE sm."companyAssignable" = true
  ON CONFLICT ("companyId", "moduleId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_system_module()
RETURNS trigger AS $$
BEGIN
  IF NEW."companyAssignable" = true THEN
    INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
    SELECT c.id, NEW.id, NEW."defaultEnabled", NOW(), NOW()
    FROM "Company" c
    WHERE c."companyKind" = 'tenant'
    ON CONFLICT ("companyId", "moduleId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DELETE FROM "CompanyModule" cm
USING "Company" c
WHERE cm."companyId" = c."id"
  AND c."companyKind" = 'platform_infra';

-- Ensure new companies and new company-assignable modules stay synchronized.

CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_company()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
  SELECT NEW.id, sm.id, sm."defaultEnabled", NOW(), NOW()
  FROM "SystemModule" sm
  WHERE sm."companyAssignable" = true
  ON CONFLICT ("companyId", "moduleId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_insert_modules ON "Company";
CREATE TRIGGER trg_company_insert_modules
AFTER INSERT ON "Company"
FOR EACH ROW
EXECUTE FUNCTION public.ensure_company_modules_from_company();

CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_system_module()
RETURNS trigger AS $$
BEGIN
  IF NEW."companyAssignable" = true THEN
    INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
    SELECT c.id, NEW.id, NEW."defaultEnabled", NOW(), NOW()
    FROM "Company" c
    ON CONFLICT ("companyId", "moduleId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_module_insert_companies ON "SystemModule";
CREATE TRIGGER trg_system_module_insert_companies
AFTER INSERT ON "SystemModule"
FOR EACH ROW
EXECUTE FUNCTION public.ensure_company_modules_from_system_module();

INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
SELECT c.id, sm.id, sm."defaultEnabled", NOW(), NOW()
FROM "Company" c
CROSS JOIN "SystemModule" sm
WHERE sm."companyAssignable" = true
ON CONFLICT ("companyId", "moduleId") DO UPDATE
SET "enabled" = COALESCE("CompanyModule"."enabled", EXCLUDED."enabled"),
    "updatedAt" = NOW();

-- FK Company.planId -> Plan: o DROP COLUMN remove a constraint junto.
ALTER TABLE "Company" DROP COLUMN IF EXISTS "planId";

-- Join table implicita da relacao M2M PlanFeatures (Feature <-> Plan).
DROP TABLE IF EXISTS "_PlanFeatures";

DROP TABLE IF EXISTS "Feature";
DROP TABLE IF EXISTS "Plan";

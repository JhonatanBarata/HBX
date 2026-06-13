-- PR13062026007: Régua única de acesso e módulos.

-- AlterTable Company: acesso do cargo Vendedor (JSON) + valores da implantação Full
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "sellerCargoAccessJson" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "setupValue" DOUBLE PRECISION;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "monthlyValueOverride" DOUBLE PRECISION;

-- AlterTable User: flag que separa Dono (canViewBilling=true) de Gerente (false) dentro do papel ADMIN
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canViewBilling" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable VendasAutomationCampaign: triagem obrigatória antes de disparar automação
ALTER TABLE "VendasAutomationCampaign" ADD COLUMN IF NOT EXISTS "triagemConfirmedAt" TIMESTAMP(3);
ALTER TABLE "VendasAutomationCampaign" ADD COLUMN IF NOT EXISTS "triagemConfirmedByUserId" INTEGER;

-- CreateTable PlanModuleConfig: módulos padrões por plano (planKey), editáveis no /master → Planos
CREATE TABLE IF NOT EXISTS "PlanModuleConfig" (
    "planKey" TEXT NOT NULL,
    "modulesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanModuleConfig_pkey" PRIMARY KEY ("planKey")
);

-- PR13062026006: "+"/"-" de templates no /master e-mails (aditivo).
-- Templates personalizados (kind tpl_*) convivem com os de sistema
-- (normal/password_reset/email_confirmation/seller_welcome/
-- seller_onboarding_request). A coluna label guarda o nome só dos
-- personalizados; os de sistema usam o rótulo fixo no código.

-- AlterTable
ALTER TABLE "MasterEmailTemplate" ADD COLUMN IF NOT EXISTS "label" TEXT;

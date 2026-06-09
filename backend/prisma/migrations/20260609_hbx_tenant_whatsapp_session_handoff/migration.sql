-- MIGRATION_ONLY: transfere a sessao QR/Webwhats operacional legada para o tenant HBX comum.
-- Mantem o tenantKey externo existente, porque a instancia conectada no provider ja foi criada com essa chave.
DO $$
DECLARE
  source_slug TEXT := 'hbx-master-whatsapp-engine';
  target_slug TEXT := 'hbx';
  source_id INTEGER;
  target_id INTEGER;
  session_id TEXT;
  session_tenant_key TEXT;
  session_phone TEXT;
BEGIN
  SELECT "id", "currentWhatsappConnectionSessionId"
  INTO source_id, session_id
  FROM "Company"
  WHERE lower(coalesce("slug", '')) = source_slug
    AND lower(coalesce("companyKind", 'tenant')) = 'platform_infra'
  ORDER BY "id"
  LIMIT 1;

  SELECT "id"
  INTO target_id
  FROM "Company"
  WHERE lower(coalesce("slug", '')) = target_slug
    AND lower(coalesce("companyKind", 'tenant')) = 'tenant'
  ORDER BY "id"
  LIMIT 1;

  IF source_id IS NULL OR target_id IS NULL OR nullif(session_id, '') IS NULL THEN
    RETURN;
  END IF;

  SELECT "tenantKey", coalesce(nullif("displayPhone", ''), nullif("phoneNormalized", ''))
  INTO session_tenant_key, session_phone
  FROM "WhatsAppConnectionSession"
  WHERE "id" = session_id
    AND lower(coalesce("provider", '')) = 'webwhats'
    AND lower(coalesce("status", '')) = 'active'
  LIMIT 1;

  IF nullif(session_tenant_key, '') IS NULL THEN
    RETURN;
  END IF;

  UPDATE "WhatsAppConnectionSession"
  SET
    "companyId" = target_id,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = session_id;

  UPDATE "WhatsAppConnectionSession"
  SET
    "status" = 'disconnected',
    "disconnectedAt" = coalesce("disconnectedAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "companyId" = target_id
    AND lower(coalesce("provider", '')) = 'webwhats'
    AND lower(coalesce("status", '')) = 'active'
    AND "id" <> session_id;

  UPDATE "Company"
  SET
    "whatsappConnectionMode" = 'TEMPORARY',
    "whatsappModalProvider" = 'external_modal',
    "whatsappModalStatus" = 'CONNECTED',
    "whatsappModalPhone" = coalesce(nullif("whatsappModalPhone", ''), session_phone),
    "whatsappModalConnectedAt" = coalesce("whatsappModalConnectedAt", CURRENT_TIMESTAMP),
    "whatsappModalLastError" = NULL,
    "whatsappModalUpdatedAt" = CURRENT_TIMESTAMP,
    "currentWhatsappConnectionSessionId" = session_id,
    "supportWhatsapp" = coalesce(nullif("supportWhatsapp", ''), nullif("contactPhone", ''), session_phone)
  WHERE "id" = target_id
    AND "useMasterWhatsAppToken" = false
    AND nullif("whatsappAccessToken", '') IS NULL
    AND nullif("whatsappPhoneNumberId", '') IS NULL;

  UPDATE "Company"
  SET
    "whatsappModalStatus" = 'DISCONNECTED',
    "whatsappModalLastError" = 'Sessao QR transferida para o tenant HBX.',
    "whatsappModalUpdatedAt" = CURRENT_TIMESTAMP,
    "currentWhatsappConnectionSessionId" = NULL
  WHERE "id" = source_id
    AND "currentWhatsappConnectionSessionId" = session_id;
END $$;

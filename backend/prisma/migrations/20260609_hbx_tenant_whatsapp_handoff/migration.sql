-- MIGRATION_ONLY: handoff do WhatsApp operacional legado para o tenant HBX comum.
-- Nao cria regra runtime por slug; apenas corrige dados historicos conhecidos.
DO $$
DECLARE
  source_slug TEXT := 'hbx-master-whatsapp-engine';
  target_slug TEXT := 'hbx';
  source_row RECORD;
  target_id INTEGER;
  master_key TEXT;
  master_number TEXT;
  master_display_number TEXT;
BEGIN
  SELECT *
  INTO source_row
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

  IF target_id IS NULL THEN
    RETURN;
  END IF;

  WITH configured_master_whatsapp AS (
    SELECT
      'legacy-whatsapp'::TEXT AS key,
      nullif(cfg."whatsappNumber", '') AS whatsapp_number,
      nullif(cfg."whatsappDisplayNumber", '') AS display_number,
      nullif(cfg."whatsappAccessToken", '') AS access_token,
      nullif(cfg."whatsappPhoneNumberId", '') AS phone_number_id,
      2 AS priority,
      0 AS position
    FROM "MasterGlobalIntegrationConfig" cfg
    WHERE cfg."key" = 'default'

    UNION ALL

    SELECT
      nullif(entry.value->>'key', '') AS key,
      nullif(entry.value->>'whatsappNumber', '') AS whatsapp_number,
      nullif(entry.value->>'displayNumber', '') AS display_number,
      nullif(entry.value->>'accessToken', '') AS access_token,
      nullif(entry.value->>'phoneNumberId', '') AS phone_number_id,
      CASE
        WHEN source_row."id" IS NOT NULL
          AND (entry.value->>'sourceCompanyId') ~ '^[0-9]+$'
          AND (entry.value->>'sourceCompanyId')::INTEGER = source_row."id"
          THEN 0
        ELSE 1
      END AS priority,
      entry.ordinality::INTEGER AS position
    FROM "MasterGlobalIntegrationConfig" cfg
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN nullif(trim(coalesce(cfg."whatsappLibrary", '')), '') IS NULL THEN '[]'::jsonb
        ELSE cfg."whatsappLibrary"::jsonb
      END
    ) WITH ORDINALITY AS entry(value, ordinality)
    WHERE cfg."key" = 'default'
  )
  SELECT
    key,
    whatsapp_number,
    coalesce(display_number, whatsapp_number)
  INTO master_key, master_number, master_display_number
  FROM configured_master_whatsapp
  WHERE access_token IS NOT NULL
    AND phone_number_id IS NOT NULL
  ORDER BY priority, position
  LIMIT 1;

  IF master_key IS NOT NULL THEN
    UPDATE "Company"
    SET
      "useMasterWhatsAppToken" = true,
      "masterWhatsAppCredentialKey" = coalesce(nullif("masterWhatsAppCredentialKey", ''), master_key),
      "whatsappConnectionMode" = CASE
        WHEN upper(coalesce("whatsappConnectionMode", '')) = 'TEMPORARY'
          AND upper(coalesce("whatsappModalStatus", '')) IN ('CONNECTED', 'RECONNECTING')
          THEN "whatsappConnectionMode"
        ELSE 'OFFICIAL'
      END,
      "whatsappNumber" = coalesce(nullif("whatsappNumber", ''), master_number),
      "whatsappDisplayNumber" = coalesce(nullif("whatsappDisplayNumber", ''), master_display_number, master_number),
      "whatsappStatus" = CASE
        WHEN upper(coalesce("whatsappStatus", '')) = 'ERROR' THEN "whatsappStatus"
        ELSE 'CONNECTED'
      END,
      "whatsappStatusError" = CASE
        WHEN nullif("whatsappStatusError", '') IS NULL THEN source_row."whatsappStatusError"
        ELSE "whatsappStatusError"
      END,
      "whatsappStatusUpdatedAt" = coalesce("whatsappStatusUpdatedAt", source_row."whatsappStatusUpdatedAt", CURRENT_TIMESTAMP),
      "supportWhatsapp" = coalesce(nullif("supportWhatsapp", ''), nullif("contactPhone", ''), master_display_number, master_number)
    WHERE "id" = target_id;
  END IF;

  IF source_row."id" IS NOT NULL
     AND nullif(source_row."whatsappAccessToken", '') IS NOT NULL
     AND nullif(source_row."whatsappPhoneNumberId", '') IS NOT NULL
     AND master_key IS NULL THEN
    UPDATE "Company"
    SET
      "useMasterWhatsAppToken" = false,
      "whatsappConnectionMode" = 'OFFICIAL',
      "whatsappAccessToken" = coalesce(nullif("whatsappAccessToken", ''), source_row."whatsappAccessToken"),
      "whatsappPhoneNumberId" = coalesce(nullif("whatsappPhoneNumberId", ''), source_row."whatsappPhoneNumberId"),
      "whatsappWabaId" = coalesce(nullif("whatsappWabaId", ''), source_row."whatsappWabaId"),
      "whatsappNumber" = coalesce(nullif("whatsappNumber", ''), source_row."whatsappNumber"),
      "whatsappDisplayNumber" = coalesce(nullif("whatsappDisplayNumber", ''), source_row."whatsappDisplayNumber", source_row."whatsappNumber"),
      "whatsappStatus" = coalesce(nullif("whatsappStatus", ''), source_row."whatsappStatus"),
      "whatsappStatusError" = coalesce(nullif("whatsappStatusError", ''), source_row."whatsappStatusError"),
      "whatsappStatusUpdatedAt" = coalesce("whatsappStatusUpdatedAt", source_row."whatsappStatusUpdatedAt", CURRENT_TIMESTAMP),
      "supportWhatsapp" = coalesce(nullif("supportWhatsapp", ''), nullif("contactPhone", ''), source_row."whatsappDisplayNumber", source_row."whatsappNumber")
    WHERE "id" = target_id;
  END IF;

  IF source_row."id" IS NOT NULL
     AND nullif(source_row."whatsappModalStatus", '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "Company" target_company
       WHERE target_company."id" = target_id
         AND (
           target_company."useMasterWhatsAppToken" = true
           OR nullif(target_company."whatsappAccessToken", '') IS NOT NULL
           OR nullif(target_company."whatsappPhoneNumberId", '') IS NOT NULL
         )
     ) THEN
    UPDATE "Company"
    SET
      "whatsappConnectionMode" = 'TEMPORARY',
      "whatsappModalStatus" = CASE
        WHEN upper(source_row."whatsappModalStatus") = 'CONNECTED' THEN 'RECONNECTING'
        ELSE source_row."whatsappModalStatus"
      END,
      "whatsappModalProvider" = coalesce(nullif("whatsappModalProvider", ''), source_row."whatsappModalProvider", 'external_modal'),
      "whatsappModalPhone" = coalesce(nullif("whatsappModalPhone", ''), source_row."whatsappModalPhone"),
      "whatsappModalConnectedAt" = coalesce("whatsappModalConnectedAt", source_row."whatsappModalConnectedAt"),
      "whatsappModalLastError" = coalesce(
        nullif("whatsappModalLastError", ''),
        'Sessao QR antiga localizada na empresa tecnica. Reabrir/reconectar no tenant HBX para criar a instancia company-' || target_id || '.'
      ),
      "whatsappModalUpdatedAt" = CURRENT_TIMESTAMP,
      "supportWhatsapp" = coalesce(nullif("supportWhatsapp", ''), nullif("contactPhone", ''), source_row."whatsappModalPhone")
    WHERE "id" = target_id;
  END IF;
END $$;

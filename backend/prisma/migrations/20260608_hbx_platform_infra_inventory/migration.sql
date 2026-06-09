-- MIGRATION_ONLY: inventario idempotente e nao destrutivo dos dados comerciais
-- que ainda estejam na empresa tecnica platform_infra antes de qualquer transferencia
-- manual para um tenant comum.

CREATE TABLE IF NOT EXISTS "PlatformInfraTenantTransferInventory" (
  "id" TEXT PRIMARY KEY,
  "category" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "sourceCompanyId" INTEGER,
  "sourceCompanySlug" TEXT,
  "sourceItemCount" INTEGER NOT NULL DEFAULT 0,
  "targetCompanyId" INTEGER,
  "targetCompanySlug" TEXT,
  "targetItemCount" INTEGER NOT NULL DEFAULT 0,
  "existsInSchema" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformInfraTenantTransferInventory_category_table_idx"
  ON "PlatformInfraTenantTransferInventory"("category", "tableName");

CREATE OR REPLACE FUNCTION pg_temp.platform_infra_tenant_count(
  table_ref_text TEXT,
  company_column TEXT,
  company_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
  table_ref REGCLASS;
  result_count INTEGER;
BEGIN
  table_ref := to_regclass(table_ref_text);
  IF table_ref IS NULL OR company_id IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', table_ref, company_column)
    INTO result_count
    USING company_id;

  RETURN COALESCE(result_count, 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.platform_infra_tenant_inventory_upsert(
  category TEXT,
  table_name TEXT,
  source_company_id INTEGER,
  source_company_slug TEXT,
  source_count INTEGER,
  target_company_id INTEGER,
  target_company_slug TEXT,
  target_count INTEGER,
  exists_in_schema BOOLEAN,
  note TEXT
) RETURNS VOID AS $$
DECLARE
  final_note TEXT;
BEGIN
  final_note := note;
  IF NOT exists_in_schema THEN
    final_note := 'Tabela ausente no schema atual; nada a transferir nesta categoria.';
  ELSIF source_company_id IS NULL THEN
    final_note := 'Empresa tecnica de origem nao encontrada; inventario registrado sem contagem de origem.';
  ELSIF target_company_id IS NULL THEN
    final_note := 'Tenant destino hbx nao encontrado; criar/confirmar tenant antes de transferir dados.';
  END IF;

  INSERT INTO "PlatformInfraTenantTransferInventory" (
    "id",
    "category",
    "tableName",
    "sourceCompanyId",
    "sourceCompanySlug",
    "sourceItemCount",
    "targetCompanyId",
    "targetCompanySlug",
    "targetItemCount",
    "existsInSchema",
    "note",
    "updatedAt"
  ) VALUES (
    md5(category || ':' || table_name),
    category,
    table_name,
    source_company_id,
    source_company_slug,
    COALESCE(source_count, 0),
    target_company_id,
    target_company_slug,
    COALESCE(target_count, 0),
    exists_in_schema,
    final_note,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO UPDATE SET
    "sourceCompanyId" = EXCLUDED."sourceCompanyId",
    "sourceCompanySlug" = EXCLUDED."sourceCompanySlug",
    "sourceItemCount" = EXCLUDED."sourceItemCount",
    "targetCompanyId" = EXCLUDED."targetCompanyId",
    "targetCompanySlug" = EXCLUDED."targetCompanySlug",
    "targetItemCount" = EXCLUDED."targetItemCount",
    "existsInSchema" = EXCLUDED."existsInSchema",
    "note" = EXCLUDED."note",
    "updatedAt" = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  source_slug TEXT := 'hbx-master-whatsapp-engine';
  target_slug TEXT := 'hbx';
  source_id INTEGER;
  target_id INTEGER;
BEGIN
  SELECT "id" INTO source_id
  FROM "Company"
  WHERE lower(coalesce("slug", '')) = source_slug
    AND lower(coalesce("companyKind", 'tenant')) = 'platform_infra'
  ORDER BY "id"
  LIMIT 1;

  SELECT "id" INTO target_id
  FROM "Company"
  WHERE lower(coalesce("slug", '')) = target_slug
    AND lower(coalesce("companyKind", 'tenant')) = 'tenant'
  ORDER BY "id"
  LIMIT 1;

  IF to_regclass('public."RadarAutoDistributionRule"') IS NOT NULL THEN
    UPDATE "RadarAutoDistributionRule" old_rule
    SET "scope" = 'tenant_distribution',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE old_rule."scope" = 'hbx_master'
      AND NOT EXISTS (
        SELECT 1
        FROM "RadarAutoDistributionRule" existing_rule
        WHERE existing_rule."companyId" = old_rule."companyId"
          AND existing_rule."scope" = 'tenant_distribution'
      );

    UPDATE "RadarAutoDistributionRule"
    SET "scope" = 'legacy_distribution_archived_' || substr("id", 1, 8),
        "status" = 'paused',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "scope" = 'hbx_master';
  END IF;

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'companies',
    'Company',
    source_id,
    source_slug,
    CASE WHEN source_id IS NULL THEN 0 ELSE 1 END,
    target_id,
    target_slug,
    CASE WHEN target_id IS NULL THEN 0 ELSE 1 END,
    to_regclass('public."Company"') IS NOT NULL,
    'Confirma existencia da empresa tecnica de origem e do tenant comum destino.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'users',
    'User',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."User"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."User"', 'companyId', target_id),
    to_regclass('public."User"') IS NOT NULL,
    'Usuarios devem ser avaliados antes de qualquer copia para tenant.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'vendas_leads',
    'VendasLead',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."VendasLead"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."VendasLead"', 'companyId', target_id),
    to_regclass('public."VendasLead"') IS NOT NULL,
    'Cards comerciais de Vendas exigem validacao de dono, vendedor e historico antes de mover.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'radar_rules',
    'RadarAutoDistributionRule',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."RadarAutoDistributionRule"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."RadarAutoDistributionRule"', 'companyId', target_id),
    to_regclass('public."RadarAutoDistributionRule"') IS NOT NULL,
    'Escopos antigos foram normalizados para tenant_distribution ou arquivados sem uso runtime.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'radar_runs',
    'WebscrapingSearchRun',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."WebscrapingSearchRun"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."WebscrapingSearchRun"', 'companyId', target_id),
    to_regclass('public."WebscrapingSearchRun"') IS NOT NULL,
    'Execucoes historicas do Radar ficam apenas inventariadas.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'company_modules',
    'CompanyModule',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."CompanyModule"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."CompanyModule"', 'companyId', target_id),
    to_regclass('public."CompanyModule"') IS NOT NULL,
    'Modulos comerciais em platform_infra devem ficar zerados pelo cleanup de triggers.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'commercial_entitlements',
    'CompanyCommercialEntitlement',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."CompanyCommercialEntitlement"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."CompanyCommercialEntitlement"', 'companyId', target_id),
    to_regclass('public."CompanyCommercialEntitlement"') IS NOT NULL,
    'Entitlements precisam ser recriados via plano/provisionamento, nao copiados automaticamente.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'email_logs_company_scoped',
    'CommercialEmailMessageLog',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."CommercialEmailMessageLog"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."CommercialEmailMessageLog"', 'companyId', target_id),
    to_regclass('public."CommercialEmailMessageLog"') IS NOT NULL,
    'Logs de e-mail por empresa ficam inventariados; templates Master sao globais e nao entram como tenant.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'email_templates_global',
    'MasterEmailTemplate',
    source_id,
    source_slug,
    0,
    target_id,
    target_slug,
    0,
    to_regclass('public."MasterEmailTemplate"') IS NOT NULL,
    'Tabela global sem companyId; nao ha transferencia por tenant.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'whatsapp_company_fields',
    'Company',
    source_id,
    source_slug,
    CASE WHEN source_id IS NULL THEN 0 ELSE 1 END,
    target_id,
    target_slug,
    CASE WHEN target_id IS NULL THEN 0 ELSE 1 END,
    to_regclass('public."Company"') IS NOT NULL,
    'Configuracoes WhatsApp em colunas da Company exigem revisao manual de tokens, telefones e status.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'whatsapp_endpoints',
    'CompanyWhatsAppEndpoint',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."CompanyWhatsAppEndpoint"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."CompanyWhatsAppEndpoint"', 'companyId', target_id),
    to_regclass('public."CompanyWhatsAppEndpoint"') IS NOT NULL,
    'Endpoints WhatsApp devem ser conferidos antes de qualquer recriacao no tenant.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'whatsapp_sessions',
    'WhatsAppConnectionSession',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."WhatsAppConnectionSession"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."WhatsAppConnectionSession"', 'companyId', target_id),
    to_regclass('public."WhatsAppConnectionSession"') IS NOT NULL,
    'Sessoes WhatsApp sao historico tecnico e nao devem ser copiadas sem decisao operacional.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'bot_auto_reply_rules',
    'AutoReplyRule',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."AutoReplyRule"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."AutoReplyRule"', 'companyId', target_id),
    to_regclass('public."AutoReplyRule"') IS NOT NULL,
    'Regras de bot por empresa devem ser recriadas ou transferidas manualmente.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'automation_campaigns',
    'VendasAutomationCampaign',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."VendasAutomationCampaign"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."VendasAutomationCampaign"', 'companyId', target_id),
    to_regclass('public."VendasAutomationCampaign"') IS NOT NULL,
    'Campanhas de automacao ficam inventariadas para transferencia assistida.'
  );

  PERFORM pg_temp.platform_infra_tenant_inventory_upsert(
    'automation_jobs',
    'VendasAutomationJob',
    source_id,
    source_slug,
    pg_temp.platform_infra_tenant_count('public."VendasAutomationJob"', 'companyId', source_id),
    target_id,
    target_slug,
    pg_temp.platform_infra_tenant_count('public."VendasAutomationJob"', 'companyId', target_id),
    to_regclass('public."VendasAutomationJob"') IS NOT NULL,
    'Jobs de automacao sao historico operacional; nao transferir automaticamente.'
  );
END $$;

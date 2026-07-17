-- Sprint 4/6 - contrato transacional local_deep_enrich_v1.
--
-- Esta migration apenas prepara o contrato. Ela NAO cria LOGIN, senha, tunel,
-- conexao externa ou ativacao. Os papeis abaixo sao grupos NOLOGIN e somente
-- poderao ser vinculados a uma credencial tecnica no Gate D.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hbx_local_enrichment_owner') THEN
    CREATE ROLE hbx_local_enrichment_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hbx_local_enrichment_executor') THEN
    CREATE ROLE hbx_local_enrichment_executor NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hbx_local_enrichment_reverter') THEN
    CREATE ROLE hbx_local_enrichment_reverter NOLOGIN NOINHERIT;
  END IF;

  ALTER ROLE hbx_local_enrichment_owner NOLOGIN NOINHERIT;
  ALTER ROLE hbx_local_enrichment_executor NOLOGIN NOINHERIT;
  ALTER ROLE hbx_local_enrichment_reverter NOLOGIN NOINHERIT;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS hbx_local_enrichment AUTHORIZATION hbx_local_enrichment_owner;
ALTER SCHEMA hbx_local_enrichment OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON SCHEMA hbx_local_enrichment FROM PUBLIC;
REVOKE ALL ON SCHEMA hbx_local_enrichment FROM hbx_local_enrichment_executor;
REVOKE ALL ON SCHEMA hbx_local_enrichment FROM hbx_local_enrichment_reverter;
GRANT USAGE ON SCHEMA hbx_local_enrichment TO hbx_local_enrichment_executor;
GRANT USAGE ON SCHEMA hbx_local_enrichment TO hbx_local_enrichment_reverter;

DO $database_grants$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO hbx_local_enrichment_executor',
    current_database()
  );
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO hbx_local_enrichment_reverter',
    current_database()
  );
END
$database_grants$;

-- Colunas materiais: o payload deixa de ser a unica fonte para lease, tenant,
-- versao, progresso e recibo.
ALTER TABLE public."RadarMission"
  ADD COLUMN IF NOT EXISTS "companyId" INTEGER,
  ADD COLUMN IF NOT EXISTS "radarLeadId" TEXT,
  ADD COLUMN IF NOT EXISTS "requestedByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "runId" TEXT,
  ADD COLUMN IF NOT EXISTS "workVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "consumerKind" TEXT NOT NULL DEFAULT 'vps',
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastPhase" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptJson" JSONB;

DO $mission_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."RadarMission"'::regclass
      AND conname = 'RadarMission_companyId_fkey'
  ) THEN
    ALTER TABLE public."RadarMission"
      ADD CONSTRAINT "RadarMission_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES public."Company"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."RadarMission"'::regclass
      AND conname = 'RadarMission_radarLeadId_fkey'
  ) THEN
    ALTER TABLE public."RadarMission"
      ADD CONSTRAINT "RadarMission_radarLeadId_fkey"
      FOREIGN KEY ("radarLeadId") REFERENCES public."RadarLeadPool"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."RadarMission"'::regclass
      AND conname = 'RadarMission_requestedByUserId_fkey'
  ) THEN
    ALTER TABLE public."RadarMission"
      ADD CONSTRAINT "RadarMission_requestedByUserId_fkey"
      FOREIGN KEY ("requestedByUserId") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."RadarMission"'::regclass
      AND conname = 'RadarMission_local_deep_enrich_materialized_check'
  ) THEN
    ALTER TABLE public."RadarMission"
      ADD CONSTRAINT "RadarMission_local_deep_enrich_materialized_check"
      CHECK (
        "stage" <> 'local_deep_enrich_v1'
        OR (
          "radarLeadId" IS NOT NULL
          AND "workVersion" IS NOT NULL
          AND "workVersion" > 0
          AND "consumerKind" = 'owner_local'
          AND COALESCE(NULLIF("runId", ''), NULLIF("correlationId", '')) IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END
$mission_constraints$;

ALTER TABLE public."RadarMission" VALIDATE CONSTRAINT "RadarMission_companyId_fkey";
ALTER TABLE public."RadarMission" VALIDATE CONSTRAINT "RadarMission_radarLeadId_fkey";
ALTER TABLE public."RadarMission" VALIDATE CONSTRAINT "RadarMission_requestedByUserId_fkey";
ALTER TABLE public."RadarMission" VALIDATE CONSTRAINT "RadarMission_local_deep_enrich_materialized_check";

CREATE UNIQUE INDEX IF NOT EXISTS "RadarMission_stage_radarLeadId_workVersion_key"
  ON public."RadarMission"("stage", "radarLeadId", "workVersion");
CREATE INDEX IF NOT EXISTS "RadarMission_consumerKind_status_nextAttemptAt_priority_idx"
  ON public."RadarMission"("consumerKind", "status", "nextAttemptAt", "priority");
CREATE INDEX IF NOT EXISTS "RadarMission_radarLeadId_createdAt_idx"
  ON public."RadarMission"("radarLeadId", "createdAt");
CREATE INDEX IF NOT EXISTS "RadarMission_companyId_status_createdAt_idx"
  ON public."RadarMission"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "RadarMission_runId_status_idx"
  ON public."RadarMission"("runId", "status");

-- Proveniencia material por contato/pessoa. Campos nulos preservam todos os
-- escritores existentes; a funcao v1 preenche apenas nas linhas que ela cria.
ALTER TABLE public."LeadContact"
  ADD COLUMN IF NOT EXISTS "createdByMissionId" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceId" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceHash" TEXT;
CREATE INDEX IF NOT EXISTS "LeadContact_createdByMissionId_idx"
  ON public."LeadContact"("createdByMissionId");

ALTER TABLE public."LeadPerson"
  ADD COLUMN IF NOT EXISTS "createdByMissionId" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceId" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceHash" TEXT;
CREATE INDEX IF NOT EXISTS "LeadPerson_createdByMissionId_idx"
  ON public."LeadPerson"("createdByMissionId");

-- O writer depende do indice fisico para ON CONFLICT. Duplicata preexistente
-- e um bloqueio de seguranca: nada e apagado ou reconciliado silenciosamente.
DO $contact_unique$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."LeadContact"
    GROUP BY "radarLeadId", "kind", "valueNormalized"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'hbx_local_enrichment:lead_contact_unique_blocked';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "LeadContact_radarLeadId_kind_valueNormalized_key"
    ON public."LeadContact"("radarLeadId", "kind", "valueNormalized");
END
$contact_unique$;

CREATE TABLE IF NOT EXISTS public."RadarLocalEnrichmentAudit" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "radarLeadId" TEXT NOT NULL,
  "companyId" INTEGER,
  "workerId" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  "workVersion" INTEGER NOT NULL,
  "requestHash" TEXT NOT NULL,
  "requestBodyFingerprint" TEXT NOT NULL,
  "resultHash" TEXT NOT NULL,
  "beforeJson" JSONB NOT NULL,
  "deltaJson" JSONB NOT NULL,
  "createdContactIds" JSONB NOT NULL,
  "createdPersonIds" JSONB NOT NULL,
  "vendasLeadIds" JSONB NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "receiptJson" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "durationMs" INTEGER NOT NULL,
  CONSTRAINT "RadarLocalEnrichmentAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadarLocalEnrichmentAudit_missionId_key" UNIQUE ("missionId"),
  CONSTRAINT "RadarLocalEnrichmentAudit_json_check" CHECK (
    jsonb_typeof("beforeJson") = 'object'
    AND jsonb_typeof("deltaJson") = 'object'
    AND jsonb_typeof("createdContactIds") = 'array'
    AND jsonb_typeof("createdPersonIds") = 'array'
    AND jsonb_typeof("vendasLeadIds") = 'array'
    AND jsonb_typeof("evidenceJson") = 'array'
    AND jsonb_typeof("receiptJson") = 'object'
  )
);
CREATE INDEX IF NOT EXISTS "RadarLocalEnrichmentAudit_radarLeadId_committedAt_idx"
  ON public."RadarLocalEnrichmentAudit"("radarLeadId", "committedAt");
CREATE INDEX IF NOT EXISTS "RadarLocalEnrichmentAudit_companyId_committedAt_idx"
  ON public."RadarLocalEnrichmentAudit"("companyId", "committedAt");
CREATE INDEX IF NOT EXISTS "RadarLocalEnrichmentAudit_workerId_committedAt_idx"
  ON public."RadarLocalEnrichmentAudit"("workerId", "committedAt");

CREATE TABLE IF NOT EXISTS public."RadarLocalEnrichmentReversal" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "removedContactIds" JSONB NOT NULL,
  "removedPersonIds" JSONB NOT NULL,
  "restoredJson" JSONB NOT NULL,
  "skippedJson" JSONB NOT NULL,
  "receiptJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarLocalEnrichmentReversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadarLocalEnrichmentReversal_missionId_key" UNIQUE ("missionId"),
  CONSTRAINT "RadarLocalEnrichmentReversal_json_check" CHECK (
    jsonb_typeof("removedContactIds") = 'array'
    AND jsonb_typeof("removedPersonIds") = 'array'
    AND jsonb_typeof("restoredJson") = 'object'
    AND jsonb_typeof("skippedJson") = 'object'
    AND jsonb_typeof("receiptJson") = 'object'
  )
);
CREATE INDEX IF NOT EXISTS "RadarLocalEnrichmentReversal_auditId_idx"
  ON public."RadarLocalEnrichmentReversal"("auditId");
CREATE INDEX IF NOT EXISTS "RadarLocalEnrichmentReversal_createdAt_idx"
  ON public."RadarLocalEnrichmentReversal"("createdAt");

CREATE OR REPLACE FUNCTION hbx_local_enrichment.reject_append_only_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'hbx_local_enrichment:append_only_violation';
END
$function$;
ALTER FUNCTION hbx_local_enrichment.reject_append_only_mutation_v1()
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.reject_append_only_mutation_v1() FROM PUBLIC;

DROP TRIGGER IF EXISTS "RadarLocalEnrichmentAudit_append_only" ON public."RadarLocalEnrichmentAudit";
CREATE TRIGGER "RadarLocalEnrichmentAudit_append_only"
  BEFORE UPDATE OR DELETE ON public."RadarLocalEnrichmentAudit"
  FOR EACH ROW EXECUTE FUNCTION hbx_local_enrichment.reject_append_only_mutation_v1();

DROP TRIGGER IF EXISTS "RadarLocalEnrichmentReversal_append_only" ON public."RadarLocalEnrichmentReversal";
CREATE TRIGGER "RadarLocalEnrichmentReversal_append_only"
  BEFORE UPDATE OR DELETE ON public."RadarLocalEnrichmentReversal"
  FOR EACH ROW EXECUTE FUNCTION hbx_local_enrichment.reject_append_only_mutation_v1();

CREATE OR REPLACE FUNCTION hbx_local_enrichment.assert_object_keys_v1(
  payload JSONB,
  allowed_keys TEXT[],
  field_path TEXT
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  unexpected_key TEXT;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:%_must_be_object', field_path;
  END IF;

  SELECT key INTO unexpected_key
  FROM jsonb_object_keys(payload) AS key
  WHERE NOT (key = ANY(allowed_keys))
  ORDER BY key
  LIMIT 1;

  IF unexpected_key IS NOT NULL THEN
    RAISE EXCEPTION 'hbx_local_enrichment:%_unexpected_key:%', field_path, unexpected_key;
  END IF;
END
$function$;
ALTER FUNCTION hbx_local_enrichment.assert_object_keys_v1(JSONB, TEXT[], TEXT)
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.assert_object_keys_v1(JSONB, TEXT[], TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hbx_local_enrichment.evidence_by_id_v1(
  evidence JSONB,
  evidence_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  found_evidence JSONB;
BEGIN
  IF evidence_id IS NULL OR evidence_id = '' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:evidence_id_required';
  END IF;

  SELECT item INTO found_evidence
  FROM jsonb_array_elements(evidence) AS item
  WHERE item->>'id' = evidence_id
  LIMIT 1;

  IF found_evidence IS NULL THEN
    RAISE EXCEPTION 'hbx_local_enrichment:evidence_not_found:%', evidence_id;
  END IF;
  RETURN found_evidence;
END
$function$;
ALTER FUNCTION hbx_local_enrichment.evidence_by_id_v1(JSONB, TEXT)
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.evidence_by_id_v1(JSONB, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hbx_local_enrichment.hbx_local_enrichment_contract_v1()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'contractVersion', 'local_deep_enrich_v1',
    'stage', 'local_deep_enrich_v1',
    'consumerKind', 'owner_local',
    'commitFunction', 'hbx_local_enrichment.hbx_commit_local_enrichment_v1(jsonb)',
    'maxPayloadBytes', 262144,
    'database', current_database()
  );
$function$;
ALTER FUNCTION hbx_local_enrichment.hbx_local_enrichment_contract_v1()
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.hbx_local_enrichment_contract_v1() FROM PUBLIC;

CREATE OR REPLACE FUNCTION hbx_local_enrichment.validate_patch_entry_v1(
  entry JSONB,
  evidence JSONB,
  field_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  literal_evidence JSONB;
BEGIN
  PERFORM hbx_local_enrichment.assert_object_keys_v1(
    entry,
    ARRAY[
      'value', 'evidenceId', 'domainCompatible', 'officialSite',
      'sameCompany', 'sourceIdentified', 'whatsappConfirmed'
    ],
    'delta.patch.' || field_name
  );
  IF NOT (entry ? 'value') OR jsonb_typeof(entry->'value') = 'null' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:patch_value_required:%', field_name;
  END IF;
  literal_evidence := hbx_local_enrichment.evidence_by_id_v1(
    evidence,
    entry->>'evidenceId'
  );
  RETURN literal_evidence;
END
$function$;
ALTER FUNCTION hbx_local_enrichment.validate_patch_entry_v1(JSONB, JSONB, TEXT)
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.validate_patch_entry_v1(JSONB, JSONB, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hbx_local_enrichment.assert_literal_evidence_v1(
  evidence JSONB,
  candidate_value TEXT,
  candidate_kind TEXT
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  evidence_text TEXT := COALESCE(evidence->>'excerpt', '');
  candidate_digits TEXT;
  evidence_digits TEXT;
BEGIN
  IF candidate_value IS NULL OR btrim(candidate_value) = '' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:empty_candidate:%', candidate_kind;
  END IF;

  IF candidate_kind IN ('phone', 'whatsapp') THEN
    candidate_digits := regexp_replace(candidate_value, '[^0-9]', '', 'g');
    evidence_digits := regexp_replace(evidence_text, '[^0-9]', '', 'g');
    IF length(candidate_digits) < 10 OR length(candidate_digits) > 15
      OR position(candidate_digits IN evidence_digits) = 0 THEN
      RAISE EXCEPTION 'hbx_local_enrichment:literal_evidence_missing:%', candidate_kind;
    END IF;
  ELSIF candidate_kind IN ('instagram', 'facebook', 'website') THEN
    IF position(lower(candidate_value) IN lower(evidence_text)) = 0
      AND lower(COALESCE(evidence->>'sourceUrl', '')) <> lower(candidate_value) THEN
      RAISE EXCEPTION 'hbx_local_enrichment:literal_evidence_missing:%', candidate_kind;
    END IF;
  ELSIF position(lower(candidate_value) IN lower(evidence_text)) = 0 THEN
    RAISE EXCEPTION 'hbx_local_enrichment:literal_evidence_missing:%', candidate_kind;
  END IF;
END
$function$;
ALTER FUNCTION hbx_local_enrichment.assert_literal_evidence_v1(JSONB, TEXT, TEXT)
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.assert_literal_evidence_v1(JSONB, TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hbx_local_enrichment.validate_business_patch_v1(
  patch JSONB,
  evidence JSONB,
  patch_scope TEXT
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  field_name TEXT;
  entry JSONB;
  literal_evidence JSONB;
  candidate TEXT;
  candidate_digits TEXT;
BEGIN
  IF patch_scope = 'radar' THEN
    PERFORM hbx_local_enrichment.assert_object_keys_v1(
      patch,
      ARRAY['email', 'phone', 'website', 'address', 'instagramUrl', 'facebookUrl', 'rating', 'reviews'],
      'delta.radarPatch'
    );
  ELSIF patch_scope = 'vendas' THEN
    PERFORM hbx_local_enrichment.assert_object_keys_v1(
      patch,
      ARRAY['email', 'phone', 'website', 'address', 'rating', 'reviews'],
      'delta.vendasPatch'
    );
  ELSE
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_patch_scope';
  END IF;

  FOR field_name, entry IN SELECT key, value FROM jsonb_each(patch)
  LOOP
    literal_evidence := hbx_local_enrichment.validate_patch_entry_v1(
      entry,
      evidence,
      patch_scope || '.' || field_name
    );
    candidate := entry->>'value';

    CASE field_name
      WHEN 'email' THEN
        IF entry->>'domainCompatible' <> 'true'
          OR length(candidate) > 320
          OR candidate !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_email_patch';
        END IF;
        PERFORM hbx_local_enrichment.assert_literal_evidence_v1(literal_evidence, candidate, 'email');
      WHEN 'phone' THEN
        candidate_digits := regexp_replace(candidate, '[^0-9]', '', 'g');
        IF entry->>'whatsappConfirmed' <> 'true'
          OR length(candidate_digits) < 10 OR length(candidate_digits) > 15 THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_phone_patch';
        END IF;
        PERFORM hbx_local_enrichment.assert_literal_evidence_v1(literal_evidence, candidate, 'phone');
      WHEN 'website' THEN
        IF entry->>'officialSite' <> 'true'
          OR length(candidate) > 2048
          OR candidate !~* '^https?://' THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_website_patch';
        END IF;
        PERFORM hbx_local_enrichment.assert_literal_evidence_v1(literal_evidence, candidate, 'website');
      WHEN 'address' THEN
        IF entry->>'sameCompany' <> 'true' OR length(candidate) > 500 THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_address_patch';
        END IF;
        PERFORM hbx_local_enrichment.assert_literal_evidence_v1(literal_evidence, candidate, 'address');
      WHEN 'instagramUrl' THEN
        IF entry->>'sameCompany' <> 'true'
          OR length(candidate) > 2048
          OR candidate !~* '^https?://([^/]+\.)?instagram\.com/' THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_instagram_patch';
        END IF;
        PERFORM hbx_local_enrichment.assert_literal_evidence_v1(literal_evidence, candidate, 'instagram');
      WHEN 'facebookUrl' THEN
        IF entry->>'sameCompany' <> 'true'
          OR length(candidate) > 2048
          OR candidate !~* '^https?://([^/]+\.)?facebook\.com/' THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_facebook_patch';
        END IF;
        PERFORM hbx_local_enrichment.assert_literal_evidence_v1(literal_evidence, candidate, 'facebook');
      WHEN 'rating' THEN
        IF entry->>'sourceIdentified' <> 'true'
          OR jsonb_typeof(entry->'value') <> 'number'
          OR (entry->>'value')::numeric < 0
          OR (entry->>'value')::numeric > 5 THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_rating_patch';
        END IF;
      WHEN 'reviews' THEN
        IF entry->>'sourceIdentified' <> 'true'
          OR jsonb_typeof(entry->'value') <> 'number'
          OR (entry->>'value')::numeric <> trunc((entry->>'value')::numeric)
          OR (entry->>'value')::numeric < 0
          OR (entry->>'value')::numeric > 1000000000 THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_reviews_patch';
        END IF;
      ELSE
        RAISE EXCEPTION 'hbx_local_enrichment:unsupported_patch_field:%', field_name;
    END CASE;
  END LOOP;
END
$function$;
ALTER FUNCTION hbx_local_enrichment.validate_business_patch_v1(JSONB, JSONB, TEXT)
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.validate_business_patch_v1(JSONB, JSONB, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hbx_local_enrichment.hbx_commit_local_enrichment_v1(
  payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  mission_payload JSONB;
  delta_payload JSONB;
  evidence_payload JSONB;
  contacts_payload JSONB;
  people_payload JSONB;
  radar_patch JSONB;
  vendas_patch JSONB;
  metadata_block JSONB;
  mission_row public."RadarMission"%ROWTYPE;
  radar_row public."RadarLeadPool"%ROWTYPE;
  prior_audit public."RadarLocalEnrichmentAudit"%ROWTYPE;
  item JSONB;
  evidence_item JSONB;
  field_name TEXT;
  entry JSONB;
  candidate TEXT;
  candidate_digits TEXT;
  created_id TEXT;
  contact_source TEXT;
  contact_kind TEXT;
  contact_rank INTEGER;
  contact_confidence INTEGER;
  person_rank INTEGER;
  created_contact_ids JSONB := '[]'::jsonb;
  created_person_ids JSONB := '[]'::jsonb;
  created_contacts_delta JSONB := '{}'::jsonb;
  created_people_delta JSONB := '{}'::jsonb;
  vendas_lead_ids JSONB := '[]'::jsonb;
  radar_before JSONB := '{}'::jsonb;
  radar_delta JSONB := '{}'::jsonb;
  vendas_before JSONB := '{}'::jsonb;
  vendas_delta JSONB := '{}'::jsonb;
  vendas_field_delta JSONB;
  vendas_field_before JSONB;
  metadata_root JSONB;
  metadata_before JSONB;
  metadata_after JSONB;
  before_payload JSONB;
  effective_delta JSONB;
  receipt JSONB;
  payload_company_id INTEGER;
  payload_work_version INTEGER;
  payload_no_new_data BOOLEAN;
  request_hash TEXT;
  request_body_fingerprint TEXT;
  result_hash TEXT;
  audit_id TEXT;
  commit_at TIMESTAMP(3);
  mission_started_at TIMESTAMP(3);
  duration_ms INTEGER;
  business_write_count INTEGER := 0;
  radar_fields_updated TEXT[] := ARRAY[]::TEXT[];
  all_vendas_fields_updated TEXT[] := ARRAY[]::TEXT[];
  vendas_record RECORD;
  event_description TEXT;
BEGIN
  PERFORM set_config('lock_timeout', '3000ms', true);
  PERFORM set_config('statement_timeout', '15000ms', true);

  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:payload_must_be_object';
  END IF;
  IF pg_column_size(payload) > 262144 THEN
    RAISE EXCEPTION 'hbx_local_enrichment:payload_too_large';
  END IF;

  PERFORM hbx_local_enrichment.assert_object_keys_v1(
    payload,
    ARRAY['contractVersion', 'mission', 'evidence', 'delta', 'noNewData'],
    'payload'
  );
  IF payload->>'contractVersion' <> 'local_deep_enrich_v1' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:contract_version_mismatch';
  END IF;
  IF jsonb_typeof(payload->'noNewData') <> 'boolean' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:no_new_data_must_be_boolean';
  END IF;
  payload_no_new_data := (payload->>'noNewData')::boolean;

  mission_payload := payload->'mission';
  PERFORM hbx_local_enrichment.assert_object_keys_v1(
    mission_payload,
    ARRAY['id', 'leaseId', 'workerId', 'radarLeadId', 'companyId', 'workVersion', 'correlationId', 'requestHash'],
    'mission'
  );
  IF COALESCE(mission_payload->>'id', '') = ''
    OR COALESCE(mission_payload->>'leaseId', '') = ''
    OR COALESCE(mission_payload->>'workerId', '') = ''
    OR COALESCE(mission_payload->>'radarLeadId', '') = ''
    OR COALESCE(mission_payload->>'correlationId', '') = '' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:mission_identity_incomplete';
  END IF;
  IF jsonb_typeof(mission_payload->'workVersion') <> 'number'
    OR (mission_payload->>'workVersion')::numeric <> trunc((mission_payload->>'workVersion')::numeric)
    OR (mission_payload->>'workVersion')::numeric <= 0
    OR (mission_payload->>'workVersion')::numeric > 2147483647 THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_work_version';
  END IF;
  payload_work_version := (mission_payload->>'workVersion')::integer;

  IF mission_payload ? 'companyId'
    AND jsonb_typeof(mission_payload->'companyId') <> 'null' THEN
    IF jsonb_typeof(mission_payload->'companyId') <> 'number'
      OR (mission_payload->>'companyId')::numeric <> trunc((mission_payload->>'companyId')::numeric)
      OR (mission_payload->>'companyId')::numeric <= 0
      OR (mission_payload->>'companyId')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_company_id';
    END IF;
    payload_company_id := (mission_payload->>'companyId')::integer;
  ELSE
    payload_company_id := NULL;
  END IF;

  request_hash := mission_payload->>'requestHash';
  IF request_hash IS NULL OR request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_request_hash';
  END IF;
  request_body_fingerprint := md5(
    jsonb_set(payload, '{mission}', mission_payload - 'requestHash', false)::text
  );

  evidence_payload := payload->'evidence';
  IF evidence_payload IS NULL OR jsonb_typeof(evidence_payload) <> 'array'
    OR jsonb_array_length(evidence_payload) > 50 THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_evidence_array';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT evidence->>'id')
    FROM jsonb_array_elements(evidence_payload) AS evidence
  ) THEN
    RAISE EXCEPTION 'hbx_local_enrichment:duplicate_evidence_id';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(evidence_payload)
  LOOP
    PERFORM hbx_local_enrichment.assert_object_keys_v1(
      item,
      ARRAY['id', 'sourceUrl', 'pageType', 'capturedAt', 'contentHash', 'excerpt'],
      'evidence[]'
    );
    IF COALESCE(item->>'id', '') = '' OR length(item->>'id') > 160 THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_evidence_id';
    END IF;
    IF COALESCE(item->>'sourceUrl', '') !~* '^https?://'
      OR length(item->>'sourceUrl') > 2048 THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_evidence_url';
    END IF;
    IF COALESCE(item->>'pageType', '') NOT IN (
      'home', 'contact', 'about', 'social', 'directory', 'search', 'legal', 'other'
    ) THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_evidence_page_type';
    END IF;
    IF COALESCE(item->>'contentHash', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_evidence_hash';
    END IF;
    IF length(COALESCE(item->>'excerpt', '')) > 2000 THEN
      RAISE EXCEPTION 'hbx_local_enrichment:evidence_excerpt_too_large';
    END IF;
    BEGIN
      PERFORM (item->>'capturedAt')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_evidence_captured_at';
    END;
  END LOOP;

  delta_payload := payload->'delta';
  PERFORM hbx_local_enrichment.assert_object_keys_v1(
    delta_payload,
    ARRAY['contacts', 'people', 'radarPatch', 'vendasPatch', 'metadataBlock'],
    'delta'
  );
  contacts_payload := delta_payload->'contacts';
  people_payload := delta_payload->'people';
  radar_patch := delta_payload->'radarPatch';
  vendas_patch := delta_payload->'vendasPatch';
  metadata_block := delta_payload->'metadataBlock';

  IF contacts_payload IS NULL OR jsonb_typeof(contacts_payload) <> 'array'
    OR jsonb_array_length(contacts_payload) > 30 THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_contacts_array';
  END IF;
  IF people_payload IS NULL OR jsonb_typeof(people_payload) <> 'array'
    OR jsonb_array_length(people_payload) > 20 THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_people_array';
  END IF;
  IF metadata_block IS NULL OR jsonb_typeof(metadata_block) <> 'object'
    OR pg_column_size(metadata_block) > 32768
    OR metadata_block ?| ARRAY[
      'localDeepEnrich', 'aiSaneamento', 'aiNote', 'cnpj', 'placeId',
      'status', 'credit', 'ownerCompanyId', 'companyId'
    ] THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_metadata_block';
  END IF;

  PERFORM hbx_local_enrichment.validate_business_patch_v1(radar_patch, evidence_payload, 'radar');
  PERFORM hbx_local_enrichment.validate_business_patch_v1(vendas_patch, evidence_payload, 'vendas');

  IF payload_no_new_data AND (
    jsonb_array_length(contacts_payload) > 0
    OR jsonb_array_length(people_payload) > 0
    OR radar_patch <> '{}'::jsonb
    OR vendas_patch <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'hbx_local_enrichment:no_new_data_has_business_delta';
  END IF;

  SELECT * INTO mission_row
  FROM public."RadarMission"
  WHERE "id" = mission_payload->>'id'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hbx_local_enrichment:mission_not_found';
  END IF;
  IF mission_row."stage" <> 'local_deep_enrich_v1'
    OR mission_row."consumerKind" <> 'owner_local'
    OR mission_row."radarLeadId" IS DISTINCT FROM mission_payload->>'radarLeadId'
    OR mission_row."companyId" IS DISTINCT FROM payload_company_id
    OR mission_row."workVersion" IS DISTINCT FROM payload_work_version
    OR COALESCE(mission_row."runId", mission_row."correlationId") IS DISTINCT FROM mission_payload->>'correlationId' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:mission_contract_mismatch';
  END IF;

  SELECT * INTO prior_audit
  FROM public."RadarLocalEnrichmentAudit"
  WHERE "missionId" = mission_row."id";
  IF FOUND THEN
    IF prior_audit."workerId" IS DISTINCT FROM mission_payload->>'workerId'
      OR mission_row."leaseId" IS DISTINCT FROM mission_payload->>'leaseId'
      OR prior_audit."requestHash" IS DISTINCT FROM request_hash
      OR prior_audit."requestBodyFingerprint" IS DISTINCT FROM request_body_fingerprint THEN
      RAISE EXCEPTION 'hbx_local_enrichment:request_hash_mismatch';
    END IF;
    RETURN jsonb_set(prior_audit."receiptJson", '{idempotentReplay}', 'true'::jsonb, true);
  END IF;

  IF mission_row."status" <> 'leased'
    OR mission_row."leaseId" IS DISTINCT FROM mission_payload->>'leaseId'
    OR mission_row."leasedBy" IS DISTINCT FROM mission_payload->>'workerId' THEN
    RAISE EXCEPTION 'hbx_local_enrichment:lease_mismatch';
  END IF;
  IF mission_row."leaseExpiresAt" IS NULL OR mission_row."leaseExpiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'hbx_local_enrichment:lease_expired';
  END IF;

  SELECT * INTO radar_row
  FROM public."RadarLeadPool"
  WHERE "id" = mission_row."radarLeadId"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hbx_local_enrichment:radar_lead_not_found';
  END IF;

  IF mission_row."companyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."RadarLeadCompanyState"
    WHERE "radarLeadId" = mission_row."radarLeadId"
      AND "companyId" = mission_row."companyId"
  ) THEN
    RAISE EXCEPTION 'hbx_local_enrichment:mission_company_state_missing';
  END IF;

  -- Valida todas as aquisicoes antes da primeira escrita. O worker nunca
  -- escolhe vendasLeadId; qualquer vinculo cruzado aborta tudo.
  IF EXISTS (
    SELECT 1
    FROM public."RadarLeadCompanyState" state
    JOIN public."VendasLead" vendas ON vendas."id" = state."vendasLeadId"
    WHERE state."radarLeadId" = mission_row."radarLeadId"
      AND state."vendasLeadId" IS NOT NULL
      AND state."acquiredAt" IS NOT NULL
      AND state."paidClaimOperationId" IS NOT NULL
      AND vendas."companyId" <> state."companyId"
  ) THEN
    RAISE EXCEPTION 'hbx_local_enrichment:tenant_mismatch';
  END IF;

  -- Contatos: append-only, literal, deduplicado pela chave fisica canonica.
  FOR item IN SELECT value FROM jsonb_array_elements(contacts_payload)
  LOOP
    PERFORM hbx_local_enrichment.assert_object_keys_v1(
      item,
      ARRAY['kind', 'value', 'valueNormalized', 'rank', 'source', 'confidence', 'evidenceId', 'whatsappConfirmed'],
      'delta.contacts[]'
    );
    contact_kind := item->>'kind';
    candidate := item->>'value';
    candidate_digits := item->>'valueNormalized';
    contact_source := item->>'source';
    contact_rank := COALESCE((item->>'rank')::integer, 1);
    contact_confidence := COALESCE((item->>'confidence')::integer, 0);
    IF contact_kind NOT IN ('email', 'phone', 'whatsapp', 'instagram', 'facebook')
      OR contact_source NOT IN ('website_crawl', 'local_lab', 'owner_social', 'ia_30b', 'ia')
      OR contact_rank < 1 OR contact_rank > 100
      OR contact_confidence < 0 OR contact_confidence > 100
      OR length(COALESCE(candidate, '')) > 2048
      OR length(COALESCE(candidate_digits, '')) > 2048 THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_contact';
    END IF;
    evidence_item := hbx_local_enrichment.evidence_by_id_v1(evidence_payload, item->>'evidenceId');
    PERFORM hbx_local_enrichment.assert_literal_evidence_v1(evidence_item, candidate, contact_kind);
    IF contact_kind = 'email' THEN
      IF lower(btrim(candidate)) <> candidate_digits
        OR candidate_digits !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION 'hbx_local_enrichment:invalid_normalized_email';
      END IF;
    ELSIF contact_kind IN ('phone', 'whatsapp') THEN
      IF regexp_replace(candidate, '[^0-9]', '', 'g') <> candidate_digits
        OR length(candidate_digits) < 10 OR length(candidate_digits) > 15 THEN
        RAISE EXCEPTION 'hbx_local_enrichment:invalid_normalized_phone';
      END IF;
      IF contact_kind = 'whatsapp' AND item->>'whatsappConfirmed' <> 'true' THEN
        RAISE EXCEPTION 'hbx_local_enrichment:whatsapp_not_confirmed';
      END IF;
    ELSIF lower(btrim(candidate)) <> lower(btrim(candidate_digits)) THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_normalized_social';
    END IF;

    created_id := 'hbx_lc_' || md5(
      mission_row."id" || ':' || contact_kind || ':' || candidate_digits
    );
    INSERT INTO public."LeadContact" (
      "id", "radarLeadId", "kind", "value", "valueNormalized", "rank",
      "source", "confidence", "createdByMissionId", "evidenceId",
      "evidenceUrl", "evidenceHash", "createdAt"
    ) VALUES (
      created_id, mission_row."radarLeadId", contact_kind, candidate,
      candidate_digits, contact_rank, contact_source, contact_confidence,
      mission_row."id", item->>'evidenceId', evidence_item->>'sourceUrl',
      evidence_item->>'contentHash', clock_timestamp()
    )
    ON CONFLICT ("radarLeadId", "kind", "valueNormalized") DO NOTHING
    RETURNING "id" INTO created_id;

    IF created_id IS NOT NULL THEN
      created_contact_ids := created_contact_ids || jsonb_build_array(created_id);
      created_contacts_delta := created_contacts_delta || jsonb_build_object(
        created_id,
        jsonb_build_object(
          'kind', contact_kind,
          'value', candidate,
          'valueNormalized', candidate_digits,
          'rank', contact_rank,
          'source', contact_source,
          'confidence', contact_confidence,
          'evidenceId', item->>'evidenceId',
          'evidenceUrl', evidence_item->>'sourceUrl',
          'evidenceHash', evidence_item->>'contentHash'
        )
      );
      business_write_count := business_write_count + 1;
    END IF;
    created_id := NULL;
  END LOOP;

  -- Pessoas: nome/cargo literal; canais continuam exclusivamente em LeadContact.
  FOR item IN SELECT value FROM jsonb_array_elements(people_payload)
  LOOP
    PERFORM hbx_local_enrichment.assert_object_keys_v1(
      item,
      ARRAY['name', 'role', 'personKey', 'rank', 'source', 'evidenceId'],
      'delta.people[]'
    );
    IF COALESCE(item->>'name', '') = '' OR length(item->>'name') > 200
      OR length(COALESCE(item->>'role', '')) > 160
      OR COALESCE(item->>'personKey', '') !~ '^[a-z0-9][a-z0-9:_-]{2,127}$'
      OR item->>'source' NOT IN ('website_crawl', 'local_lab', 'ia_30b', 'ia') THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_person';
    END IF;
    person_rank := COALESCE((item->>'rank')::integer, 1);
    IF person_rank < 1 OR person_rank > 100 THEN
      RAISE EXCEPTION 'hbx_local_enrichment:invalid_person_rank';
    END IF;
    evidence_item := hbx_local_enrichment.evidence_by_id_v1(evidence_payload, item->>'evidenceId');
    PERFORM hbx_local_enrichment.assert_literal_evidence_v1(evidence_item, item->>'name', 'person');
    created_id := 'hbx_lp_' || md5(mission_row."id" || ':' || item->>'personKey');
    INSERT INTO public."LeadPerson" (
      "id", "radarLeadId", "name", "role", "source", "personKey", "rank",
      "createdByMissionId", "evidenceId", "evidenceUrl", "evidenceHash", "createdAt"
    ) VALUES (
      created_id, mission_row."radarLeadId", item->>'name', NULLIF(item->>'role', ''),
      item->>'source', item->>'personKey', person_rank, mission_row."id",
      item->>'evidenceId', evidence_item->>'sourceUrl', evidence_item->>'contentHash',
      clock_timestamp()
    )
    ON CONFLICT ("radarLeadId", "personKey") DO NOTHING
    RETURNING "id" INTO created_id;
    IF created_id IS NOT NULL THEN
      created_person_ids := created_person_ids || jsonb_build_array(created_id);
      created_people_delta := created_people_delta || jsonb_build_object(
        created_id,
        jsonb_build_object(
          'name', item->>'name', 'role', NULLIF(item->>'role', ''),
          'source', item->>'source', 'personKey', item->>'personKey',
          'rank', person_rank, 'evidenceId', item->>'evidenceId',
          'evidenceUrl', evidence_item->>'sourceUrl',
          'evidenceHash', evidence_item->>'contentHash'
        )
      );
      business_write_count := business_write_count + 1;
    END IF;
    created_id := NULL;
  END LOOP;

  -- O bloco 30B tem dono proprio e preserva todos os irmaos do metadataJson.
  BEGIN
    metadata_root := COALESCE(NULLIF(btrim(radar_row."metadataJson"), '')::jsonb, '{}'::jsonb);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_existing_metadata_json';
  END;
  IF jsonb_typeof(metadata_root) <> 'object'
    OR (metadata_root ? 'localDeepEnrich' AND jsonb_typeof(metadata_root->'localDeepEnrich') <> 'object') THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_existing_metadata_shape';
  END IF;
  metadata_before := metadata_root->'localDeepEnrich';
  metadata_after := COALESCE(metadata_before, '{}'::jsonb)
    || metadata_block
    || jsonb_build_object(
      'missionId', mission_row."id",
      'contractVersion', 'local_deep_enrich_v1',
      'workVersion', mission_row."workVersion",
      'requestHash', request_hash,
      'noNewData', payload_no_new_data,
      'committedAt', to_jsonb(clock_timestamp())
    );
  UPDATE public."RadarLeadPool"
  SET "metadataJson" = jsonb_set(metadata_root, '{localDeepEnrich}', metadata_after, true)::text
  WHERE "id" = radar_row."id";
  radar_before := radar_before || jsonb_build_object(
    'metadata.localDeepEnrich', COALESCE(metadata_before, 'null'::jsonb)
  );
  radar_delta := radar_delta || jsonb_build_object(
    'metadata.localDeepEnrich', jsonb_build_object(
      'before', COALESCE(metadata_before, 'null'::jsonb),
      'after', metadata_after
    )
  );

  -- Merge Radar estritamente aditivo: vazios apenas, ou maior para rating/reviews.
  IF radar_patch ? 'email' AND COALESCE(btrim(radar_row."email"), '') = '' THEN
    candidate := radar_patch#>>'{email,value}';
    radar_before := radar_before || jsonb_build_object(
      'email', radar_row."email", 'emailStatus', radar_row."emailStatus", 'emailSource', radar_row."emailSource"
    );
    radar_delta := radar_delta
      || jsonb_build_object('email', jsonb_build_object('before', radar_row."email", 'after', candidate))
      || jsonb_build_object('emailStatus', jsonb_build_object('before', radar_row."emailStatus", 'after', 'confirmed'))
      || jsonb_build_object('emailSource', jsonb_build_object('before', radar_row."emailSource", 'after', 'local_deep_enrich_v1'));
    UPDATE public."RadarLeadPool"
    SET "email" = candidate, "emailStatus" = 'confirmed', "emailSource" = 'local_deep_enrich_v1'
    WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['email'];
    business_write_count := business_write_count + 1;
  END IF;

  IF radar_patch ? 'phone' AND COALESCE(btrim(radar_row."phone"), '') = '' THEN
    candidate := radar_patch#>>'{phone,value}';
    candidate_digits := regexp_replace(candidate, '[^0-9]', '', 'g');
    IF EXISTS (
      SELECT 1 FROM public."RadarLeadPool"
      WHERE "phoneDigits" = candidate_digits AND "id" <> radar_row."id"
    ) THEN
      RAISE EXCEPTION 'hbx_local_enrichment:radar_phone_conflict';
    END IF;
    radar_before := radar_before || jsonb_build_object('phone', radar_row."phone", 'phoneDigits', radar_row."phoneDigits");
    radar_delta := radar_delta
      || jsonb_build_object('phone', jsonb_build_object('before', radar_row."phone", 'after', candidate))
      || jsonb_build_object('phoneDigits', jsonb_build_object('before', radar_row."phoneDigits", 'after', candidate_digits));
    UPDATE public."RadarLeadPool" SET "phone" = candidate, "phoneDigits" = candidate_digits
    WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['phone'];
    business_write_count := business_write_count + 1;
  END IF;

  IF radar_patch ? 'website' AND COALESCE(btrim(radar_row."website"), '') = '' THEN
    candidate := radar_patch#>>'{website,value}';
    radar_before := radar_before || jsonb_build_object('website', radar_row."website", 'websiteStatus', radar_row."websiteStatus");
    radar_delta := radar_delta
      || jsonb_build_object('website', jsonb_build_object('before', radar_row."website", 'after', candidate))
      || jsonb_build_object('websiteStatus', jsonb_build_object('before', radar_row."websiteStatus", 'after', 'present'));
    UPDATE public."RadarLeadPool" SET "website" = candidate, "websiteStatus" = 'present'
    WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['website'];
    business_write_count := business_write_count + 1;
  END IF;

  IF radar_patch ? 'address' AND COALESCE(btrim(radar_row."address"), '') = '' THEN
    candidate := radar_patch#>>'{address,value}';
    radar_before := radar_before || jsonb_build_object('address', radar_row."address");
    radar_delta := radar_delta || jsonb_build_object('address', jsonb_build_object('before', radar_row."address", 'after', candidate));
    UPDATE public."RadarLeadPool" SET "address" = candidate WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['address'];
    business_write_count := business_write_count + 1;
  END IF;

  IF radar_patch ? 'instagramUrl' AND COALESCE(btrim(radar_row."instagramUrl"), '') = '' THEN
    candidate := radar_patch#>>'{instagramUrl,value}';
    radar_before := radar_before || jsonb_build_object('instagramUrl', radar_row."instagramUrl", 'socialStatus', radar_row."socialStatus");
    radar_delta := radar_delta
      || jsonb_build_object('instagramUrl', jsonb_build_object('before', radar_row."instagramUrl", 'after', candidate))
      || jsonb_build_object('socialStatus', jsonb_build_object('before', radar_row."socialStatus", 'after', 'found'));
    UPDATE public."RadarLeadPool" SET "instagramUrl" = candidate, "socialStatus" = 'found'
    WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['instagramUrl'];
    business_write_count := business_write_count + 1;
  END IF;

  IF radar_patch ? 'facebookUrl' AND COALESCE(btrim(radar_row."facebookUrl"), '') = '' THEN
    candidate := radar_patch#>>'{facebookUrl,value}';
    radar_before := radar_before || jsonb_build_object('facebookUrl', radar_row."facebookUrl", 'socialStatus', radar_row."socialStatus");
    radar_delta := radar_delta
      || jsonb_build_object('facebookUrl', jsonb_build_object('before', radar_row."facebookUrl", 'after', candidate))
      || CASE WHEN radar_delta ? 'socialStatus' THEN '{}'::jsonb
         ELSE jsonb_build_object('socialStatus', jsonb_build_object('before', radar_row."socialStatus", 'after', 'found')) END;
    UPDATE public."RadarLeadPool" SET "facebookUrl" = candidate, "socialStatus" = 'found'
    WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['facebookUrl'];
    business_write_count := business_write_count + 1;
  END IF;

  IF radar_patch ? 'rating'
    AND (radar_row."rating" IS NULL OR (radar_patch#>>'{rating,value}')::double precision > radar_row."rating") THEN
    radar_before := radar_before || jsonb_build_object('rating', radar_row."rating");
    radar_delta := radar_delta || jsonb_build_object(
      'rating', jsonb_build_object('before', radar_row."rating", 'after', (radar_patch#>>'{rating,value}')::double precision)
    );
    UPDATE public."RadarLeadPool" SET "rating" = (radar_patch#>>'{rating,value}')::double precision
    WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['rating'];
    business_write_count := business_write_count + 1;
  END IF;

  IF radar_patch ? 'reviews'
    AND (radar_patch#>>'{reviews,value}')::integer > radar_row."reviews" THEN
    radar_before := radar_before || jsonb_build_object('reviews', radar_row."reviews");
    radar_delta := radar_delta || jsonb_build_object(
      'reviews', jsonb_build_object('before', radar_row."reviews", 'after', (radar_patch#>>'{reviews,value}')::integer)
    );
    UPDATE public."RadarLeadPool" SET "reviews" = (radar_patch#>>'{reviews,value}')::integer
    WHERE "id" = radar_row."id";
    radar_fields_updated := radar_fields_updated || ARRAY['reviews'];
    business_write_count := business_write_count + 1;
  END IF;

  -- Cards adquiridos sao resolvidos exclusivamente pelo vinculo tenant-safe.
  FOR vendas_record IN
    SELECT
      vendas."id",
      vendas."companyId",
      vendas."email",
      vendas."phone",
      vendas."phoneNormalized",
      vendas."website",
      vendas."address",
      vendas."rating",
      vendas."reviews",
      state."companyId" AS "stateCompanyId"
    FROM public."RadarLeadCompanyState" state
    JOIN public."VendasLead" vendas ON vendas."id" = state."vendasLeadId"
    WHERE state."radarLeadId" = mission_row."radarLeadId"
      AND state."vendasLeadId" IS NOT NULL
      AND state."acquiredAt" IS NOT NULL
      AND state."paidClaimOperationId" IS NOT NULL
    ORDER BY vendas."id"
    FOR UPDATE OF vendas
  LOOP
    IF vendas_record."companyId" <> vendas_record."stateCompanyId" THEN
      RAISE EXCEPTION 'hbx_local_enrichment:tenant_mismatch';
    END IF;

    vendas_field_delta := '{}'::jsonb;
    vendas_field_before := '{}'::jsonb;

    IF vendas_patch ? 'email' AND COALESCE(btrim(vendas_record."email"), '') = '' THEN
      candidate := vendas_patch#>>'{email,value}';
      UPDATE public."VendasLead" SET "email" = candidate WHERE "id" = vendas_record."id";
      vendas_field_before := vendas_field_before || jsonb_build_object('email', vendas_record."email");
      vendas_field_delta := vendas_field_delta || jsonb_build_object(
        'email', jsonb_build_object('before', vendas_record."email", 'after', candidate)
      );
      all_vendas_fields_updated := array_append(all_vendas_fields_updated, 'email');
      business_write_count := business_write_count + 1;
    END IF;

    IF vendas_patch ? 'phone' AND COALESCE(btrim(vendas_record."phone"), '') = '' THEN
      candidate := vendas_patch#>>'{phone,value}';
      candidate_digits := regexp_replace(candidate, '[^0-9]', '', 'g');
      IF EXISTS (
        SELECT 1 FROM public."VendasLead"
        WHERE "companyId" = vendas_record."companyId"
          AND "phoneNormalized" = candidate_digits
          AND "id" <> vendas_record."id"
      ) THEN
        RAISE EXCEPTION 'hbx_local_enrichment:vendas_phone_conflict';
      END IF;
      UPDATE public."VendasLead"
      SET "phone" = candidate, "phoneNormalized" = candidate_digits
      WHERE "id" = vendas_record."id";
      vendas_field_before := vendas_field_before || jsonb_build_object(
        'phone', vendas_record."phone", 'phoneNormalized', vendas_record."phoneNormalized"
      );
      vendas_field_delta := vendas_field_delta
        || jsonb_build_object('phone', jsonb_build_object('before', vendas_record."phone", 'after', candidate))
        || jsonb_build_object('phoneNormalized', jsonb_build_object('before', vendas_record."phoneNormalized", 'after', candidate_digits));
      all_vendas_fields_updated := array_append(all_vendas_fields_updated, 'phone');
      business_write_count := business_write_count + 1;
    END IF;

    IF vendas_patch ? 'website' AND COALESCE(btrim(vendas_record."website"), '') = '' THEN
      candidate := vendas_patch#>>'{website,value}';
      UPDATE public."VendasLead" SET "website" = candidate WHERE "id" = vendas_record."id";
      vendas_field_before := vendas_field_before || jsonb_build_object('website', vendas_record."website");
      vendas_field_delta := vendas_field_delta || jsonb_build_object(
        'website', jsonb_build_object('before', vendas_record."website", 'after', candidate)
      );
      all_vendas_fields_updated := array_append(all_vendas_fields_updated, 'website');
      business_write_count := business_write_count + 1;
    END IF;

    IF vendas_patch ? 'address' AND COALESCE(btrim(vendas_record."address"), '') = '' THEN
      candidate := vendas_patch#>>'{address,value}';
      UPDATE public."VendasLead" SET "address" = candidate WHERE "id" = vendas_record."id";
      vendas_field_before := vendas_field_before || jsonb_build_object('address', vendas_record."address");
      vendas_field_delta := vendas_field_delta || jsonb_build_object(
        'address', jsonb_build_object('before', vendas_record."address", 'after', candidate)
      );
      all_vendas_fields_updated := array_append(all_vendas_fields_updated, 'address');
      business_write_count := business_write_count + 1;
    END IF;

    IF vendas_patch ? 'rating'
      AND (vendas_record."rating" IS NULL OR (vendas_patch#>>'{rating,value}')::double precision > vendas_record."rating") THEN
      UPDATE public."VendasLead"
      SET "rating" = (vendas_patch#>>'{rating,value}')::double precision
      WHERE "id" = vendas_record."id";
      vendas_field_before := vendas_field_before || jsonb_build_object('rating', vendas_record."rating");
      vendas_field_delta := vendas_field_delta || jsonb_build_object(
        'rating', jsonb_build_object(
          'before', vendas_record."rating",
          'after', (vendas_patch#>>'{rating,value}')::double precision
        )
      );
      all_vendas_fields_updated := array_append(all_vendas_fields_updated, 'rating');
      business_write_count := business_write_count + 1;
    END IF;

    IF vendas_patch ? 'reviews'
      AND (vendas_patch#>>'{reviews,value}')::integer > vendas_record."reviews" THEN
      UPDATE public."VendasLead"
      SET "reviews" = (vendas_patch#>>'{reviews,value}')::integer
      WHERE "id" = vendas_record."id";
      vendas_field_before := vendas_field_before || jsonb_build_object('reviews', vendas_record."reviews");
      vendas_field_delta := vendas_field_delta || jsonb_build_object(
        'reviews', jsonb_build_object(
          'before', vendas_record."reviews",
          'after', (vendas_patch#>>'{reviews,value}')::integer
        )
      );
      all_vendas_fields_updated := array_append(all_vendas_fields_updated, 'reviews');
      business_write_count := business_write_count + 1;
    END IF;

    vendas_lead_ids := vendas_lead_ids || jsonb_build_array(vendas_record."id");
    IF vendas_field_delta <> '{}'::jsonb THEN
      vendas_before := vendas_before || jsonb_build_object(vendas_record."id", vendas_field_before);
      vendas_delta := vendas_delta || jsonb_build_object(
        vendas_record."id",
        jsonb_build_object(
          'companyId', vendas_record."companyId",
          'fields', vendas_field_delta
        )
      );
    END IF;
  END LOOP;

  commit_at := clock_timestamp();
  mission_started_at := COALESCE(mission_row."startedAt", commit_at);
  duration_ms := GREATEST(
    0,
    floor(EXTRACT(epoch FROM (commit_at - mission_started_at)) * 1000)::integer
  );
  before_payload := jsonb_build_object(
    'radar', radar_before,
    'vendas', vendas_before
  );
  effective_delta := jsonb_build_object(
    'radar', radar_delta,
    'contacts', created_contacts_delta,
    'people', created_people_delta,
    'vendas', vendas_delta
  );
  result_hash := md5(effective_delta::text);

  receipt := jsonb_build_object(
    'missionId', mission_row."id",
    'idempotentReplay', false,
    'radarLeadId', mission_row."radarLeadId",
    'companyId', mission_row."companyId",
    'createdContactIds', created_contact_ids,
    'createdPersonIds', created_person_ids,
    'radarFieldsUpdated', to_jsonb(radar_fields_updated),
    'vendasLeadIds', vendas_lead_ids,
    'vendasFieldsUpdated', to_jsonb(ARRAY(
      SELECT DISTINCT value FROM unnest(all_vendas_fields_updated) AS value ORDER BY value
    )),
    'noNewData', business_write_count = 0,
    'committedAt', to_jsonb(commit_at)
  );
  audit_id := 'hbx_lae_' || md5(mission_row."id");

  INSERT INTO public."RadarLocalEnrichmentAudit" (
    "id", "missionId", "radarLeadId", "companyId", "workerId",
    "contractVersion", "workVersion", "requestHash", "requestBodyFingerprint",
    "resultHash", "beforeJson", "deltaJson", "createdContactIds",
    "createdPersonIds", "vendasLeadIds", "evidenceJson", "receiptJson",
    "startedAt", "committedAt", "durationMs"
  ) VALUES (
    audit_id, mission_row."id", mission_row."radarLeadId", mission_row."companyId",
    mission_payload->>'workerId', 'local_deep_enrich_v1', mission_row."workVersion",
    request_hash, request_body_fingerprint, result_hash, before_payload,
    effective_delta, created_contact_ids, created_person_ids, vendas_lead_ids,
    evidence_payload, receipt, mission_started_at, commit_at, duration_ms
  );

  -- Timeline/recibo contam apenas o delta desta missao. Eventos sao historico
  -- e, por contrato, nao sao removidos numa reversao operacional.
  INSERT INTO public."RadarLeadEvent" (
    "id", "leadId", "companyId", "eventType", "note", "createdAt"
  ) VALUES (
    'hbx_rle_' || md5(mission_row."id"),
    mission_row."radarLeadId",
    NULL,
    CASE WHEN business_write_count = 0
      THEN 'local_deep_enrich_no_new_data'
      ELSE 'local_deep_enrich_completed'
    END,
    jsonb_build_object(
      'missionId', mission_row."id",
      'createdContactCount', jsonb_array_length(created_contact_ids),
      'createdPersonCount', jsonb_array_length(created_person_ids),
      'radarFieldsUpdated', to_jsonb(radar_fields_updated)
    )::text,
    commit_at
  );

  event_description := jsonb_build_object(
    'missionId', mission_row."id",
    'createdContactCount', jsonb_array_length(created_contact_ids),
    'createdPersonCount', jsonb_array_length(created_person_ids),
    'fields', to_jsonb(ARRAY(
      SELECT DISTINCT value FROM unnest(all_vendas_fields_updated) AS value ORDER BY value
    ))
  )::text;
  INSERT INTO public."VendasLeadTimelineEvent" (
    "id", "leadId", "eventType", "title", "description", "sourceType",
    "resultLabel", "idempotencyKey", "createdAt"
  )
  SELECT
    'hbx_vte_' || md5(mission_row."id" || ':' || lead_id),
    lead_id,
    'local_deep_enrich',
    'Enriquecimento local concluido',
    event_description,
    'local_deep_enrich_v1',
    CASE WHEN business_write_count = 0 THEN 'no_new_data' ELSE 'enriched' END,
    'local_deep_enrich_v1:' || mission_row."id",
    commit_at
  FROM jsonb_array_elements_text(vendas_lead_ids) AS lead_id
  ON CONFLICT ("leadId", "idempotencyKey") DO NOTHING;

  UPDATE public."RadarMission"
  SET "status" = 'completed',
      "lastPhase" = 'committed',
      "receiptJson" = receipt,
      "resultJson" = receipt,
      "lastError" = NULL,
      "completedAt" = commit_at,
      "updatedAt" = commit_at
  WHERE "id" = mission_row."id";

  RETURN receipt;
END
$function$;
ALTER FUNCTION hbx_local_enrichment.hbx_commit_local_enrichment_v1(JSONB)
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.hbx_commit_local_enrichment_v1(JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hbx_local_enrichment.hbx_revert_local_enrichment_v1(
  request JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  audit_row public."RadarLocalEnrichmentAudit"%ROWTYPE;
  prior_reversal public."RadarLocalEnrichmentReversal"%ROWTYPE;
  radar_row public."RadarLeadPool"%ROWTYPE;
  vendas_row public."VendasLead"%ROWTYPE;
  field_name TEXT;
  field_delta JSONB;
  entity_id TEXT;
  entity_delta JSONB;
  vendas_entry JSONB;
  current_value JSONB;
  before_value JSONB;
  after_value JSONB;
  metadata_root JSONB;
  removed_contact_ids JSONB := '[]'::jsonb;
  removed_person_ids JSONB := '[]'::jsonb;
  restored_radar JSONB := '{}'::jsonb;
  restored_vendas JSONB := '{}'::jsonb;
  skipped_radar JSONB := '{}'::jsonb;
  skipped_vendas JSONB := '{}'::jsonb;
  skipped_contacts JSONB := '[]'::jsonb;
  skipped_people JSONB := '[]'::jsonb;
  receipt JSONB;
  reversal_id TEXT;
  reverted_at TIMESTAMP(3) := clock_timestamp();
BEGIN
  PERFORM set_config('lock_timeout', '3000ms', true);
  PERFORM set_config('statement_timeout', '15000ms', true);
  PERFORM hbx_local_enrichment.assert_object_keys_v1(
    request,
    ARRAY['missionId', 'requestedBy', 'reason'],
    'reversal'
  );
  IF COALESCE(request->>'missionId', '') = ''
    OR COALESCE(request->>'requestedBy', '') = ''
    OR COALESCE(request->>'reason', '') = ''
    OR length(request->>'requestedBy') > 200
    OR length(request->>'reason') > 1000 THEN
    RAISE EXCEPTION 'hbx_local_enrichment:invalid_reversal_request';
  END IF;

  SELECT * INTO audit_row
  FROM public."RadarLocalEnrichmentAudit"
  WHERE "missionId" = request->>'missionId'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hbx_local_enrichment:audit_not_found';
  END IF;

  SELECT * INTO prior_reversal
  FROM public."RadarLocalEnrichmentReversal"
  WHERE "missionId" = audit_row."missionId";
  IF FOUND THEN
    RETURN jsonb_set(prior_reversal."receiptJson", '{idempotentReplay}', 'true'::jsonb, true);
  END IF;

  PERFORM 1 FROM public."RadarMission"
  WHERE "id" = audit_row."missionId"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hbx_local_enrichment:mission_not_found';
  END IF;

  SELECT * INTO radar_row
  FROM public."RadarLeadPool"
  WHERE "id" = audit_row."radarLeadId"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hbx_local_enrichment:radar_lead_not_found';
  END IF;

  -- Contato/pessoa so e removido se todos os valores ainda forem exatamente
  -- aqueles inseridos pela missao. Qualquer edicao posterior e preservada.
  FOR entity_id, entity_delta IN
    SELECT key, value FROM jsonb_each(COALESCE(audit_row."deltaJson"->'contacts', '{}'::jsonb))
  LOOP
    DELETE FROM public."LeadContact"
    WHERE "id" = entity_id
      AND "createdByMissionId" = audit_row."missionId"
      AND "radarLeadId" = audit_row."radarLeadId"
      AND "kind" = entity_delta->>'kind'
      AND "value" = entity_delta->>'value'
      AND "valueNormalized" = entity_delta->>'valueNormalized'
      AND "rank" = (entity_delta->>'rank')::integer
      AND "source" IS NOT DISTINCT FROM NULLIF(entity_delta->>'source', '')
      AND "confidence" IS NOT DISTINCT FROM (entity_delta->>'confidence')::integer
      AND "evidenceId" IS NOT DISTINCT FROM NULLIF(entity_delta->>'evidenceId', '')
      AND "evidenceUrl" IS NOT DISTINCT FROM NULLIF(entity_delta->>'evidenceUrl', '')
      AND "evidenceHash" IS NOT DISTINCT FROM NULLIF(entity_delta->>'evidenceHash', '')
    RETURNING "id" INTO entity_id;
    IF entity_id IS NULL THEN
      skipped_contacts := skipped_contacts || jsonb_build_array(entity_delta);
    ELSE
      removed_contact_ids := removed_contact_ids || jsonb_build_array(entity_id);
    END IF;
    entity_id := NULL;
  END LOOP;

  FOR entity_id, entity_delta IN
    SELECT key, value FROM jsonb_each(COALESCE(audit_row."deltaJson"->'people', '{}'::jsonb))
  LOOP
    DELETE FROM public."LeadPerson"
    WHERE "id" = entity_id
      AND "createdByMissionId" = audit_row."missionId"
      AND "radarLeadId" = audit_row."radarLeadId"
      AND "name" = entity_delta->>'name'
      AND "role" IS NOT DISTINCT FROM NULLIF(entity_delta->>'role', '')
      AND "source" = entity_delta->>'source'
      AND "personKey" = entity_delta->>'personKey'
      AND "rank" = (entity_delta->>'rank')::integer
      AND "evidenceId" IS NOT DISTINCT FROM NULLIF(entity_delta->>'evidenceId', '')
      AND "evidenceUrl" IS NOT DISTINCT FROM NULLIF(entity_delta->>'evidenceUrl', '')
      AND "evidenceHash" IS NOT DISTINCT FROM NULLIF(entity_delta->>'evidenceHash', '')
    RETURNING "id" INTO entity_id;
    IF entity_id IS NULL THEN
      skipped_people := skipped_people || jsonb_build_array(entity_delta);
    ELSE
      removed_person_ids := removed_person_ids || jsonb_build_array(entity_id);
    END IF;
    entity_id := NULL;
  END LOOP;

  FOR field_name, field_delta IN
    SELECT key, value FROM jsonb_each(COALESCE(audit_row."deltaJson"->'radar', '{}'::jsonb))
  LOOP
    before_value := field_delta->'before';
    after_value := field_delta->'after';
    current_value := NULL;

    CASE field_name
      WHEN 'email' THEN current_value := to_jsonb(radar_row."email");
      WHEN 'emailStatus' THEN current_value := to_jsonb(radar_row."emailStatus");
      WHEN 'emailSource' THEN current_value := to_jsonb(radar_row."emailSource");
      WHEN 'phone' THEN current_value := to_jsonb(radar_row."phone");
      WHEN 'phoneDigits' THEN current_value := to_jsonb(radar_row."phoneDigits");
      WHEN 'website' THEN current_value := to_jsonb(radar_row."website");
      WHEN 'websiteStatus' THEN current_value := to_jsonb(radar_row."websiteStatus");
      WHEN 'address' THEN current_value := to_jsonb(radar_row."address");
      WHEN 'instagramUrl' THEN current_value := to_jsonb(radar_row."instagramUrl");
      WHEN 'facebookUrl' THEN current_value := to_jsonb(radar_row."facebookUrl");
      WHEN 'socialStatus' THEN current_value := to_jsonb(radar_row."socialStatus");
      WHEN 'rating' THEN current_value := to_jsonb(radar_row."rating");
      WHEN 'reviews' THEN current_value := to_jsonb(radar_row."reviews");
      WHEN 'metadata.localDeepEnrich' THEN
        BEGIN
          metadata_root := COALESCE(NULLIF(btrim(radar_row."metadataJson"), '')::jsonb, '{}'::jsonb);
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'hbx_local_enrichment:invalid_existing_metadata_json';
        END;
        current_value := COALESCE(metadata_root->'localDeepEnrich', 'null'::jsonb);
      ELSE
        RAISE EXCEPTION 'hbx_local_enrichment:unsafe_audit_radar_field:%', field_name;
    END CASE;

    IF current_value IS DISTINCT FROM after_value THEN
      skipped_radar := skipped_radar || jsonb_build_object(
        field_name,
        jsonb_build_object('expected', after_value, 'current', current_value)
      );
      CONTINUE;
    END IF;

    CASE field_name
      WHEN 'email' THEN UPDATE public."RadarLeadPool" SET "email" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'emailStatus' THEN UPDATE public."RadarLeadPool" SET "emailStatus" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'emailSource' THEN UPDATE public."RadarLeadPool" SET "emailSource" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'phone' THEN UPDATE public."RadarLeadPool" SET "phone" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'phoneDigits' THEN UPDATE public."RadarLeadPool" SET "phoneDigits" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'website' THEN UPDATE public."RadarLeadPool" SET "website" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'websiteStatus' THEN UPDATE public."RadarLeadPool" SET "websiteStatus" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'address' THEN UPDATE public."RadarLeadPool" SET "address" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'instagramUrl' THEN UPDATE public."RadarLeadPool" SET "instagramUrl" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'facebookUrl' THEN UPDATE public."RadarLeadPool" SET "facebookUrl" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'socialStatus' THEN UPDATE public."RadarLeadPool" SET "socialStatus" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = radar_row."id";
      WHEN 'rating' THEN UPDATE public."RadarLeadPool" SET "rating" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE (before_value#>>'{}')::double precision END WHERE "id" = radar_row."id";
      WHEN 'reviews' THEN UPDATE public."RadarLeadPool" SET "reviews" = (before_value#>>'{}')::integer WHERE "id" = radar_row."id";
      WHEN 'metadata.localDeepEnrich' THEN
        IF before_value = 'null'::jsonb THEN
          metadata_root := metadata_root - 'localDeepEnrich';
        ELSE
          metadata_root := jsonb_set(metadata_root, '{localDeepEnrich}', before_value, true);
        END IF;
        UPDATE public."RadarLeadPool" SET "metadataJson" = metadata_root::text WHERE "id" = radar_row."id";
    END CASE;
    restored_radar := restored_radar || jsonb_build_object(field_name, before_value);
  END LOOP;

  FOR entity_id, vendas_entry IN
    SELECT key, value FROM jsonb_each(COALESCE(audit_row."deltaJson"->'vendas', '{}'::jsonb))
  LOOP
    SELECT * INTO vendas_row FROM public."VendasLead" WHERE "id" = entity_id FOR UPDATE;
    IF NOT FOUND THEN
      skipped_vendas := skipped_vendas || jsonb_build_object(entity_id, jsonb_build_object('reason', 'lead_missing'));
      CONTINUE;
    END IF;
    IF vendas_row."companyId" IS DISTINCT FROM (vendas_entry->>'companyId')::integer THEN
      RAISE EXCEPTION 'hbx_local_enrichment:tenant_mismatch';
    END IF;

    FOR field_name, field_delta IN
      SELECT key, value FROM jsonb_each(vendas_entry->'fields')
    LOOP
      before_value := field_delta->'before';
      after_value := field_delta->'after';
      CASE field_name
        WHEN 'email' THEN current_value := to_jsonb(vendas_row."email");
        WHEN 'phone' THEN current_value := to_jsonb(vendas_row."phone");
        WHEN 'phoneNormalized' THEN current_value := to_jsonb(vendas_row."phoneNormalized");
        WHEN 'website' THEN current_value := to_jsonb(vendas_row."website");
        WHEN 'address' THEN current_value := to_jsonb(vendas_row."address");
        WHEN 'rating' THEN current_value := to_jsonb(vendas_row."rating");
        WHEN 'reviews' THEN current_value := to_jsonb(vendas_row."reviews");
        ELSE RAISE EXCEPTION 'hbx_local_enrichment:unsafe_audit_vendas_field:%', field_name;
      END CASE;
      IF current_value IS DISTINCT FROM after_value THEN
        skipped_vendas := skipped_vendas || jsonb_build_object(
          entity_id || ':' || field_name,
          jsonb_build_object('expected', after_value, 'current', current_value)
        );
        CONTINUE;
      END IF;
      CASE field_name
        WHEN 'email' THEN UPDATE public."VendasLead" SET "email" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = entity_id;
        WHEN 'phone' THEN UPDATE public."VendasLead" SET "phone" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = entity_id;
        WHEN 'phoneNormalized' THEN UPDATE public."VendasLead" SET "phoneNormalized" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = entity_id;
        WHEN 'website' THEN UPDATE public."VendasLead" SET "website" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = entity_id;
        WHEN 'address' THEN UPDATE public."VendasLead" SET "address" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE before_value#>>'{}' END WHERE "id" = entity_id;
        WHEN 'rating' THEN UPDATE public."VendasLead" SET "rating" = CASE WHEN before_value = 'null'::jsonb THEN NULL ELSE (before_value#>>'{}')::double precision END WHERE "id" = entity_id;
        WHEN 'reviews' THEN UPDATE public."VendasLead" SET "reviews" = (before_value#>>'{}')::integer WHERE "id" = entity_id;
      END CASE;
      restored_vendas := restored_vendas || jsonb_build_object(entity_id || ':' || field_name, before_value);
    END LOOP;
  END LOOP;

  receipt := jsonb_build_object(
    'missionId', audit_row."missionId",
    'idempotentReplay', false,
    'removedContactIds', removed_contact_ids,
    'removedPersonIds', removed_person_ids,
    'restored', jsonb_build_object('radar', restored_radar, 'vendas', restored_vendas),
    'skipped', jsonb_build_object(
      'radar', skipped_radar,
      'vendas', skipped_vendas,
      'contacts', skipped_contacts,
      'people', skipped_people
    ),
    'revertedAt', to_jsonb(reverted_at)
  );
  reversal_id := 'hbx_ler_' || md5(audit_row."missionId");
  INSERT INTO public."RadarLocalEnrichmentReversal" (
    "id", "missionId", "auditId", "requestedBy", "reason",
    "removedContactIds", "removedPersonIds", "restoredJson", "skippedJson",
    "receiptJson", "createdAt"
  ) VALUES (
    reversal_id, audit_row."missionId", audit_row."id", request->>'requestedBy',
    request->>'reason', removed_contact_ids, removed_person_ids,
    jsonb_build_object('radar', restored_radar, 'vendas', restored_vendas),
    jsonb_build_object(
      'radar', skipped_radar, 'vendas', skipped_vendas,
      'contacts', skipped_contacts, 'people', skipped_people
    ),
    receipt, reverted_at
  );

  UPDATE public."RadarMission"
  SET "lastPhase" = 'reverted', "updatedAt" = reverted_at
  WHERE "id" = audit_row."missionId";

  RETURN receipt;
END
$function$;
ALTER FUNCTION hbx_local_enrichment.hbx_revert_local_enrichment_v1(JSONB)
  OWNER TO hbx_local_enrichment_owner;
REVOKE ALL ON FUNCTION hbx_local_enrichment.hbx_revert_local_enrichment_v1(JSONB) FROM PUBLIC;

-- O owner NOLOGIN recebe somente o minimo que as funcoes SECURITY DEFINER usam.
GRANT USAGE ON SCHEMA public TO hbx_local_enrichment_owner;
GRANT SELECT, UPDATE ON public."RadarMission" TO hbx_local_enrichment_owner;
GRANT SELECT, UPDATE ON public."RadarLeadPool" TO hbx_local_enrichment_owner;
GRANT SELECT ON public."RadarLeadCompanyState" TO hbx_local_enrichment_owner;
GRANT SELECT, UPDATE ON public."VendasLead" TO hbx_local_enrichment_owner;
GRANT SELECT, INSERT, DELETE ON public."LeadContact" TO hbx_local_enrichment_owner;
GRANT SELECT, INSERT, DELETE ON public."LeadPerson" TO hbx_local_enrichment_owner;
GRANT INSERT ON public."RadarLeadEvent" TO hbx_local_enrichment_owner;
GRANT INSERT ON public."VendasLeadTimelineEvent" TO hbx_local_enrichment_owner;
GRANT SELECT, INSERT ON public."RadarLocalEnrichmentAudit" TO hbx_local_enrichment_owner;
GRANT SELECT, INSERT ON public."RadarLocalEnrichmentReversal" TO hbx_local_enrichment_owner;

-- Executor e reverter nao recebem DML, DDL nem DELETE direto. O reverter e um
-- grupo separado para que apenas o System Master seja vinculado no Gate D.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hbx_local_enrichment_executor;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM hbx_local_enrichment_executor;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hbx_local_enrichment_reverter;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM hbx_local_enrichment_reverter;
REVOKE CREATE ON SCHEMA public FROM hbx_local_enrichment_executor;
REVOKE CREATE ON SCHEMA public FROM hbx_local_enrichment_reverter;

GRANT EXECUTE ON FUNCTION hbx_local_enrichment.hbx_local_enrichment_contract_v1()
  TO hbx_local_enrichment_executor;
GRANT EXECUTE ON FUNCTION hbx_local_enrichment.hbx_commit_local_enrichment_v1(JSONB)
  TO hbx_local_enrichment_executor;
GRANT EXECUTE ON FUNCTION hbx_local_enrichment.hbx_local_enrichment_contract_v1()
  TO hbx_local_enrichment_reverter;
GRANT EXECUTE ON FUNCTION hbx_local_enrichment.hbx_revert_local_enrichment_v1(JSONB)
  TO hbx_local_enrichment_reverter;

-- Reparação aditiva do contrato local_deep_enrich_v1.
-- A migration 20260716233000 já havia sido aplicada em produção quando estas
-- definições canônicas e permissões foram endurecidas no código-fonte.
-- Não modificar nem remover: esta migration reconcilia bancos já migrados.

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
  ELSIF candidate_kind = 'website' THEN
    IF position(lower(candidate_value) IN lower(evidence_text)) = 0
      AND lower(rtrim(COALESCE(evidence->>'sourceUrl', ''), '/')) <> lower(rtrim(candidate_value, '/'))
      AND lower(COALESCE(evidence->>'sourceUrl', '')) NOT LIKE lower(rtrim(candidate_value, '/')) || '/%' THEN
      RAISE EXCEPTION 'hbx_local_enrichment:literal_evidence_missing:%', candidate_kind;
    END IF;
  ELSIF candidate_kind IN ('instagram', 'facebook') THEN
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

CREATE OR REPLACE FUNCTION hbx_local_enrichment.hbx_commit_local_enrichment_v1(
  payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
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
  created_contacts_receipt JSONB := '[]'::jsonb;
  receipt_summary JSONB := '{}'::jsonb;
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
  metadata_business_changed BOOLEAN := false;
  radar_fields_updated TEXT[] := ARRAY[]::TEXT[];
  all_vendas_fields_updated TEXT[] := ARRAY[]::TEXT[];
  vendas_record RECORD;
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
  IF NOT (mission_payload ?& ARRAY[
      'id', 'leaseId', 'workerId', 'radarLeadId', 'companyId',
      'workVersion', 'correlationId', 'requestHash'
    ])
    OR COALESCE(mission_payload->>'id', '') = ''
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
    IF NOT (item ?& ARRAY[
        'id', 'sourceUrl', 'pageType', 'capturedAt', 'contentHash', 'excerpt'
      ])
      OR jsonb_typeof(item->'capturedAt') <> 'string'
      OR jsonb_typeof(item->'excerpt') <> 'string'
      OR COALESCE(item->>'id', '') = '' OR length(item->>'id') > 160 THEN
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
    OR metadata_block <> '{}'::jsonb
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
    OR mission_row."correlationId" IS DISTINCT FROM mission_payload->>'correlationId' THEN
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

  -- Valida todos os vínculos explícitos antes da primeira escrita. O contrato
  -- aprovado deste estágio usa exclusivamente RadarLeadCompanyState -> vendasLeadId
  -- e igualdade de tenant. O worker nunca escolhe esse ID e não interpreta ledger,
  -- crédito ou a futura saga de aquisição.
  IF EXISTS (
    SELECT 1
    FROM public."RadarLeadCompanyState" state
    JOIN public."VendasLead" vendas ON vendas."id" = state."vendasLeadId"
    WHERE state."radarLeadId" = mission_row."radarLeadId"
      AND state."vendasLeadId" IS NOT NULL
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
    IF COALESCE(btrim(item->>'role'), '') <> '' THEN
      PERFORM hbx_local_enrichment.assert_literal_evidence_v1(evidence_item, item->>'role', 'person_role');
    END IF;
    created_id := 'hbx_lp_' || md5(mission_row."id" || ':' || (item->>'personKey'));
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
  metadata_business_changed := metadata_block <> '{}'::jsonb
    AND NOT COALESCE(metadata_before, '{}'::jsonb) @> metadata_block;
  metadata_after := COALESCE(metadata_before, '{}'::jsonb)
    || metadata_block
    || jsonb_build_object(
      'missionId', mission_row."id",
      'contractVersion', 'local_deep_enrich_v1',
      'workVersion', mission_row."workVersion",
      'requestHash', request_hash,
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
  IF metadata_business_changed THEN
    radar_fields_updated := radar_fields_updated || ARRAY['metadata.localDeepEnrich'];
    business_write_count := business_write_count + 1;
  END IF;

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

  -- Cards adquiridos são resolvidos exclusivamente pelo vínculo tenant-safe e
  -- explícito; telefone/sourceHistoryId nunca entram na resolução.
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

    IF vendas_field_delta <> '{}'::jsonb THEN
      vendas_lead_ids := vendas_lead_ids || jsonb_build_array(vendas_record."id");
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
  created_contacts_receipt := COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('id', contact_id, 'kind', contact_delta->>'kind')
      ORDER BY contact_id
    )
    FROM jsonb_each(created_contacts_delta) AS created_contact(contact_id, contact_delta)
  ), '[]'::jsonb);
  receipt_summary := jsonb_build_object(
    'emailsAdded', (
      SELECT count(*)
      FROM jsonb_each(created_contacts_delta) AS contact_delta
      WHERE contact_delta.value->>'kind' = 'email'
    ),
    'phonesAdded', (
      SELECT count(*)
      FROM jsonb_each(created_contacts_delta) AS contact_delta
      WHERE contact_delta.value->>'kind' IN ('phone', 'whatsapp')
    ),
    'peopleAdded', jsonb_array_length(created_person_ids),
    -- Alias preservado para o painel local já publicado; peopleAdded é o nome canônico.
    'ownersAdded', jsonb_array_length(created_person_ids),
    'metadataUpdated', metadata_business_changed,
    'radarFieldsUpdated', cardinality(radar_fields_updated),
    'vendasLeadsUpdated', (SELECT count(*) FROM jsonb_object_keys(vendas_delta))
  );

  receipt := jsonb_build_object(
    'missionId', mission_row."id",
    'idempotentReplay', false,
    'radarLeadId', mission_row."radarLeadId",
    'companyId', mission_row."companyId",
    'createdContactIds', created_contact_ids,
    'createdContacts', created_contacts_receipt,
    'createdPersonIds', created_person_ids,
    'summary', receipt_summary,
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

  -- Cada card de Vendas recebe timeline somente quando ele próprio mudou. O delta
  -- gravado no evento é o before/after exato daquele card, sem resumo global.
  INSERT INTO public."VendasLeadTimelineEvent" (
    "id", "leadId", "eventType", "title", "description", "sourceType",
    "resultLabel", "idempotencyKey", "createdAt"
  )
  SELECT
    'hbx_vte_' || md5(mission_row."id" || ':' || changed_vendas.lead_id),
    changed_vendas.lead_id,
    'local_deep_enrich',
    'Enriquecimento local concluido',
    jsonb_build_object(
      'missionId', mission_row."id",
      'fields', to_jsonb(ARRAY(
        SELECT changed_field.name
        FROM jsonb_object_keys(changed_vendas.lead_delta->'fields') AS changed_field(name)
        ORDER BY changed_field.name
      )),
      'delta', changed_vendas.lead_delta->'fields'
    )::text,
    'local_deep_enrich_v1',
    'enriched',
    'local_deep_enrich_v1:' || mission_row."id",
    commit_at
  FROM jsonb_each(vendas_delta) AS changed_vendas(lead_id, lead_delta)
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
SET search_path = pg_catalog
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
  skip_radar_email_group BOOLEAN := false;
  skip_radar_phone_group BOOLEAN := false;
  skip_radar_website_group BOOLEAN := false;
  skip_radar_social_status BOOLEAN := false;
  skip_vendas_phone_group BOOLEAN;
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
  WHERE "missionId" = request->>'missionId';
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

  skip_radar_email_group := audit_row."deltaJson"->'radar' ? 'email'
    AND to_jsonb(radar_row."email") IS DISTINCT FROM audit_row."deltaJson"#>'{radar,email,after}';
  skip_radar_phone_group := audit_row."deltaJson"->'radar' ? 'phone'
    AND to_jsonb(radar_row."phone") IS DISTINCT FROM audit_row."deltaJson"#>'{radar,phone,after}';
  skip_radar_website_group := audit_row."deltaJson"->'radar' ? 'website'
    AND to_jsonb(radar_row."website") IS DISTINCT FROM audit_row."deltaJson"#>'{radar,website,after}';
  skip_radar_social_status := (
      audit_row."deltaJson"->'radar' ? 'instagramUrl'
      AND to_jsonb(radar_row."instagramUrl") IS DISTINCT FROM audit_row."deltaJson"#>'{radar,instagramUrl,after}'
    ) OR (
      audit_row."deltaJson"->'radar' ? 'facebookUrl'
      AND to_jsonb(radar_row."facebookUrl") IS DISTINCT FROM audit_row."deltaJson"#>'{radar,facebookUrl,after}'
    );

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

    IF (skip_radar_email_group AND field_name IN ('email', 'emailStatus', 'emailSource'))
      OR (skip_radar_phone_group AND field_name IN ('phone', 'phoneDigits'))
      OR (skip_radar_website_group AND field_name IN ('website', 'websiteStatus'))
      OR (skip_radar_social_status AND field_name = 'socialStatus') THEN
      skipped_radar := skipped_radar || jsonb_build_object(
        field_name,
        jsonb_build_object('expected', after_value, 'reason', 'related_field_changed_later')
      );
      CONTINUE;
    END IF;

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
    skip_vendas_phone_group := vendas_entry->'fields' ? 'phone'
      AND to_jsonb(vendas_row."phone") IS DISTINCT FROM vendas_entry#>'{fields,phone,after}';

    FOR field_name, field_delta IN
      SELECT key, value FROM jsonb_each(vendas_entry->'fields')
    LOOP
      before_value := field_delta->'before';
      after_value := field_delta->'after';
      IF skip_vendas_phone_group AND field_name IN ('phone', 'phoneNormalized') THEN
        skipped_vendas := skipped_vendas || jsonb_build_object(
          entity_id || ':' || field_name,
          jsonb_build_object('expected', after_value, 'reason', 'related_field_changed_later')
        );
        CONTINUE;
      END IF;
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

-- As funções SECURITY DEFINER consultam estes eventos para replay/auditoria.
-- O owner já possuía INSERT na versão aplicada; o GRANT aditivo restaura SELECT.
GRANT SELECT, INSERT ON public."RadarLeadEvent" TO hbx_local_enrichment_owner;
GRANT SELECT, INSERT ON public."VendasLeadTimelineEvent" TO hbx_local_enrichment_owner;

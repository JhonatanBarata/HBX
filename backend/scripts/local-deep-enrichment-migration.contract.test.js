const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const backendRoot = join(__dirname, '..');
const schema = readFileSync(join(backendRoot, 'prisma', 'schema.prisma'), 'utf8');
const baseMigration = readFileSync(
  join(
    backendRoot,
    'prisma',
    'migrations',
    '20260716233000_local_deep_enrichment_contract_v1',
    'migration.sql',
  ),
  'utf8',
);
const repairMigration = readFileSync(
  join(
    backendRoot,
    'prisma',
    'migrations',
    '20260716235900_reapply_local_deep_enrichment_contract_v1',
    'migration.sql',
  ),
  'utf8',
);

function withoutSupersededFunction(sql, functionName) {
  const startMarker =
    `CREATE OR REPLACE FUNCTION hbx_local_enrichment.${functionName}(`;
  const revokeMarker =
    `REVOKE ALL ON FUNCTION hbx_local_enrichment.${functionName}(`;
  const start = sql.indexOf(startMarker);
  assert.notEqual(start, -1, `CREATE histórico ausente para ${functionName}`);
  const revoke = sql.indexOf(revokeMarker, start);
  assert.notEqual(revoke, -1, `REVOKE histórico ausente para ${functionName}`);
  const end = sql.indexOf(';', revoke);
  assert.notEqual(end, -1, `fim histórico ausente para ${functionName}`);
  return sql.slice(0, start) + sql.slice(end + 1);
}

const migration =
  [
    'assert_literal_evidence_v1',
    'hbx_commit_local_enrichment_v1',
    'hbx_revert_local_enrichment_v1',
  ].reduce(withoutSupersededFunction, baseMigration) + repairMigration;

test('materializa a missão local e a chave idempotente no Prisma', () => {
  const mission = schema.match(/model RadarMission \{[\s\S]*?\n\}/)?.[0] ?? '';
  for (const field of [
    'companyId',
    'radarLeadId',
    'requestedByUserId',
    'runId',
    'workVersion',
    'consumerKind',
    'startedAt',
    'lastPhase',
    'receiptJson',
  ]) {
    assert.match(mission, new RegExp(`\\b${field}\\b`));
  }
  assert.match(mission, /@@unique\(\[stage, radarLeadId, workVersion\]\)/);
  assert.match(schema, /model RadarLocalEnrichmentAudit \{/);
  assert.match(schema, /model RadarLocalEnrichmentReversal \{/);
  assert.match(schema, /createdByMissionId\s+String\?/);
});

test('expõe somente handshake e commit ao papel executor NOLOGIN', () => {
  assert.match(migration, /CREATE ROLE hbx_local_enrichment_owner NOLOGIN NOINHERIT/);
  assert.match(migration, /CREATE ROLE hbx_local_enrichment_executor NOLOGIN NOINHERIT/);
  assert.match(migration, /CREATE ROLE hbx_local_enrichment_reverter NOLOGIN NOINHERIT/);
  assert.doesNotMatch(migration, /CREATE ROLE\s+\w+\s+LOGIN/i);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION hbx_local_enrichment\.hbx_commit_local_enrichment_v1\(JSONB\)[\s\S]*?TO hbx_local_enrichment_executor/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION hbx_local_enrichment\.hbx_revert_local_enrichment_v1\(JSONB\)[\s\S]*?TO hbx_local_enrichment_executor/,
  );
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hbx_local_enrichment_executor/,
  );
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC/g);
  assert.doesNotMatch(migration, /PASSWORD\s|postgres(?:ql)?:\/\//i);
});

test('função de commit falha fechada em contrato, lease, replay e tenant', () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION hbx_local_enrichment\.hbx_commit_local_enrichment_v1/,
  );
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = pg_catalog/);
  assert.doesNotMatch(migration, /SECURITY DEFINER\s+SET search_path = [^\n]*public/);
  assert.match(migration, /mission_row\."stage" <> 'local_deep_enrich_v1'/);
  assert.match(migration, /mission_row\."consumerKind" <> 'owner_local'/);
  assert.match(migration, /mission_row\."leaseExpiresAt" <= clock_timestamp\(\)/);
  assert.match(
    migration,
    /mission_row\."correlationId" IS DISTINCT FROM mission_payload->>'correlationId'/,
  );
  assert.doesNotMatch(
    migration,
    /COALESCE\(mission_row\."runId", mission_row\."correlationId"\)/,
  );
  assert.match(migration, /requestBodyFingerprint/);
  assert.match(migration, /hbx_local_enrichment:request_hash_mismatch/);
  assert.match(
    migration,
    /JOIN public\."VendasLead" vendas ON vendas\."id" = state\."vendasLeadId"/,
  );
  assert.match(migration, /vendas\."companyId" <> state\."companyId"/);
  assert.doesNotMatch(
    migration.match(
      /assert_object_keys_v1\(\s*mission_payload,[\s\S]*?'mission'\s*\)/,
    )?.[0] ?? '',
    /vendasLeadId/,
  );
});

test('merge é aditivo e não escreve estados comerciais, negativos ou crédito', () => {
  assert.match(migration, /COALESCE\(btrim\(radar_row\."email"\), ''\) = ''/);
  assert.match(migration, /COALESCE\(btrim\(vendas_record\."email"\), ''\) = ''/);
  assert.match(migration, /"rating" IS NULL OR[\s\S]*?> radar_row\."rating"/);
  assert.match(migration, /ON CONFLICT \("radarLeadId", "kind", "valueNormalized"\) DO NOTHING/);
  assert.match(migration, /metadata_root->'localDeepEnrich'/);
  assert.match(migration, /metadata_root, '\{localDeepEnrich\}'/);
  assert.match(
    migration,
    /sourceUrl[\s\S]*?NOT LIKE lower\(rtrim\(candidate_value, '\/'\)\) \|\| '\/%'/,
  );

  const commitBody = migration.match(
    /CREATE OR REPLACE FUNCTION hbx_local_enrichment\.hbx_commit_local_enrichment_v1[\s\S]*?ALTER FUNCTION hbx_local_enrichment\.hbx_commit_local_enrichment_v1/,
  )?.[0] ?? '';
  assert.doesNotMatch(commitBody, /UPDATE public\."RadarLeadCompanyState"/);
  assert.doesNotMatch(commitBody, /UPDATE public\."Company"/);
  assert.doesNotMatch(commitBody, /"negativeReason"|"complaintReason"|"deniedReason"/);
  assert.match(commitBody, /'status', 'credit', 'ownerCompanyId', 'companyId'/);
  assert.match(
    commitBody,
    /assert_literal_evidence_v1\(evidence_item, item->>'role', 'person_role'\)/,
  );
});

test('auditoria é append-only e reversão preserva valores alterados depois', () => {
  assert.match(migration, /RadarLocalEnrichmentAudit_append_only/);
  assert.match(migration, /RadarLocalEnrichmentReversal_append_only/);
  assert.match(migration, /hbx_local_enrichment:append_only_violation/);
  assert.match(
    migration,
    /current_value IS DISTINCT FROM after_value[\s\S]*?CONTINUE/,
  );
  assert.match(migration, /related_field_changed_later/);
  assert.match(migration, /"createdByMissionId" = audit_row\."missionId"/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION hbx_local_enrichment\.hbx_revert_local_enrichment_v1\(JSONB\)[\s\S]*?TO hbx_local_enrichment_reverter/,
  );
});

test('resultado sem novidade ainda gera recibo e conclui a missão', () => {
  assert.match(migration, /'noNewData', business_write_count = 0/);
  assert.match(migration, /"status" = 'completed'/);
  assert.match(migration, /"receiptJson" = receipt/);
  assert.match(migration, /local_deep_enrich_no_new_data/);
});

test('recibo e timeline materializam somente o delta exato da missão e de cada card', () => {
  assert.match(migration, /'createdContacts', created_contacts_receipt/);
  assert.match(migration, /'summary', receipt_summary/);
  assert.match(migration, /'phonesAdded',[\s\S]*?'phone', 'whatsapp'/);
  assert.match(migration, /'peopleAdded', jsonb_array_length\(created_person_ids\)/);
  assert.match(migration, /metadata_business_changed := metadata_block <> '\{\}'::jsonb/);
  assert.match(migration, /FROM jsonb_each\(vendas_delta\) AS changed_vendas/);
  assert.match(migration, /'delta', changed_vendas\.lead_delta->'fields'/);
  assert.doesNotMatch(
    migration.match(
      /INSERT INTO public\."VendasLeadTimelineEvent"[\s\S]*?ON CONFLICT \("leadId", "idempotencyKey"\) DO NOTHING/,
    )?.[0] ?? '',
    /jsonb_array_elements_text\(vendas_lead_ids\)/,
  );
});

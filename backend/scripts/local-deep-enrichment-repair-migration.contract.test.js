const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const migrationsRoot = join(__dirname, '..', 'prisma', 'migrations');
const original = readFileSync(
  join(
    migrationsRoot,
    '20260716233000_local_deep_enrichment_contract_v1',
    'migration.sql',
  ),
);
const repair = readFileSync(
  join(
    migrationsRoot,
    '20260716235900_reapply_local_deep_enrichment_contract_v1',
    'migration.sql',
  ),
  'utf8',
);
const originalSha256 = 'b242b81f607cb7371264b2b5e04af4a2caf2fa8c465c57ebf95eeaee5b58fefa';
const expectedFunctionSha256 = Object.freeze({
  assert_literal_evidence_v1: 'a05d4a6977b1b8cef5a9f61463ff096382085a413bdd883f0c1f8fd6cb4f2e13',
  hbx_commit_local_enrichment_v1: 'b5d8181e8d28b94d3eaecc8c8646e47dbcacabb6fbeb323bc6f34c042ad87f30',
  hbx_revert_local_enrichment_v1: '7d7069a24f7730077cb6b55273fa63cab7af7ade6a70b7cf04d8d89c5eb27c04',
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function extractFunctionBlock(sql, functionName) {
  const startMarker =
    'CREATE OR REPLACE FUNCTION hbx_local_enrichment.' + functionName + '(';
  const revokeMarker =
    'REVOKE ALL ON FUNCTION hbx_local_enrichment.' + functionName + '(';
  const start = sql.indexOf(startMarker);
  assert.notEqual(start, -1, 'CREATE ausente para ' + functionName);
  const revoke = sql.indexOf(revokeMarker, start);
  assert.notEqual(revoke, -1, 'REVOKE ausente para ' + functionName);
  const end = sql.indexOf(';', revoke);
  assert.notEqual(end, -1, 'fim do REVOKE ausente para ' + functionName);
  return sql.slice(start, end + 1).replace(/\r\n/g, '\n');
}

test('migration histórica permanece byte-for-byte igual à aplicada', () => {
  assert.equal(sha256(original), originalSha256);
});

test('migration corretiva reaplica exatamente as três definições aprovadas', () => {
  for (const [name, expectedSha256] of Object.entries(expectedFunctionSha256)) {
    assert.equal(sha256(extractFunctionBlock(repair, name)), expectedSha256);
  }
  assert.equal(
    (repair.match(/CREATE OR REPLACE FUNCTION hbx_local_enrichment\./g) ?? []).length,
    Object.keys(expectedFunctionSha256).length,
  );
});

test('migration corretiva restaura leitura dos eventos sem ampliar o executor', () => {
  assert.match(
    repair,
    /GRANT SELECT, INSERT ON public\."RadarLeadEvent" TO hbx_local_enrichment_owner;/,
  );
  assert.match(
    repair,
    /GRANT SELECT, INSERT ON public\."VendasLeadTimelineEvent" TO hbx_local_enrichment_owner;/,
  );
  assert.doesNotMatch(repair, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*hbx_local_enrichment_executor/i);
  assert.doesNotMatch(repair, /CREATE ROLE|CREATE TABLE|ALTER TABLE/i);
});

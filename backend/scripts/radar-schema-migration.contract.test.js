'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');
const migrationPath = path.join(
  backendRoot,
  'prisma',
  'migrations',
  '20260715170000_restore_radar_schema_contract',
  'migration.sql',
);

const schema = fs.readFileSync(schemaPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

const fieldsByModel = {
  MobileDevice: ['accessProfile'],
  MobilePairingCode: ['accessProfile'],
  CnpjPublicCompany: ['fax', 'faxDigits'],
  RadarLeadProcessRun: [
    'id',
    'companyId',
    'userId',
    'radarLeadId',
    'mode',
    'status',
    'idempotencyKey',
    'stagesJson',
    'eventsJson',
    'snapshotJson',
    'errorCode',
    'errorMessage',
    'startedAt',
    'finishedAt',
    'workerToken',
    'workerLeaseUntil',
    'version',
    'createdAt',
    'updatedAt',
  ],
  RadarLeadCompanyState: ['paidClaimOperationId', 'claimUsageKey', 'acquiredAt'],
  VendasLead: ['claimOperationId', 'contactSnapshotJson', 'opportunityScore'],
};

const requiredIndexes = [
  'RadarLeadProcessRun_workerToken_key',
  'RadarLeadProcessRun_companyId_idempotencyKey_key',
  'RadarLeadProcessRun_companyId_status_updatedAt_idx',
  'RadarLeadProcessRun_companyId_userId_createdAt_idx',
  'RadarLeadProcessRun_companyId_radarLeadId_createdAt_idx',
  'RadarLeadCompanyState_companyId_acquiredAt_idx',
  'VendasLead_claimOperationId_key',
  'VendasLead_companyId_claimOperationId_idx',
  'LeadContact_radarLeadId_kind_valueNormalized_key',
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function modelBlock(model) {
  const match = schema.match(new RegExp(`model\\s+${escapeRegex(model)}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${model} precisa existir no schema.prisma`);
  return match[1];
}

test('campos usados pela puxada existem no schema e na migration forward-only', () => {
  for (const [model, fields] of Object.entries(fieldsByModel)) {
    const block = modelBlock(model);
    for (const field of fields) {
      assert.match(block, new RegExp(`^\\s*${escapeRegex(field)}\\s+`, 'm'), `${model}.${field} ausente no schema`);
      assert.match(migration, new RegExp(`"${escapeRegex(field)}"`), `${model}.${field} sem DDL correspondente`);
      if (model === 'RadarLeadProcessRun') {
        assert.match(
          migration,
          new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+"${escapeRegex(field)}"`, 'i'),
          `${model}.${field} precisa reparar tambem uma tabela parcial`,
        );
      }
    }
  }
});

test('indices do fencing sao idempotentes e permanecem materializados', () => {
  for (const index of requiredIndexes) {
    assert.match(
      migration,
      new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+"${escapeRegex(index)}"`, 'i'),
      `${index} precisa usar CREATE INDEX IF NOT EXISTS`,
    );
  }
});

test('indices unicos preservam conflitos de tabela parcial para reconciliacao explicita', () => {
  const protectedIndexes = [
    ['RadarLeadProcessRun_workerToken_key', 'RadarLeadProcessRun workerToken pendente'],
    ['RadarLeadProcessRun_companyId_idempotencyKey_key', 'RadarLeadProcessRun idempotencyKey pendente'],
    ['VendasLead_claimOperationId_key', 'VendasLead claimOperationId pendente'],
    ['LeadContact_radarLeadId_kind_valueNormalized_key', 'LeadContact canonico pendente'],
  ];
  for (const [index, warning] of protectedIndexes) {
    assert.match(
      migration,
      new RegExp(`HAVING\\s+COUNT\\(\\*\\)\\s*>\\s*1[\\s\\S]*?RAISE\\s+WARNING\\s+'${escapeRegex(warning)}[\\s\\S]*?CREATE\\s+UNIQUE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+"${escapeRegex(index)}"`, 'i'),
      `${index} precisa preservar duplicatas e deixar warning antes de criar o indice`,
    );
  }
});

test('fks da tabela parcial entram NOT VALID e so validam quando nao ha orfaos', () => {
  for (const field of ['companyId', 'userId', 'radarLeadId']) {
    assert.match(
      migration,
      new RegExp(`ADD\\s+CONSTRAINT\\s+"RadarLeadProcessRun_${field}_fkey"[\\s\\S]*?FOREIGN\\s+KEY\\s+\\("${field}"\\)[\\s\\S]*?NOT\\s+VALID`, 'i'),
      `${field} precisa preservar orfaos legados com NOT VALID`,
    );
    assert.match(
      migration,
      new RegExp(`NOT\\s+EXISTS\\s*\\(SELECT\\s+1[\\s\\S]*?"${field}"[\\s\\S]*?RAISE\\s+WARNING[\\s\\S]*?VALIDATE\\s+CONSTRAINT\\s+"RadarLeadProcessRun_${field}_fkey"`, 'i'),
      `${field} precisa avisar sobre orfaos e validar apenas o estado limpo`,
    );
  }
});

test('migration de restauracao nao altera nem remove dados existentes', () => {
  const executableSql = migration.replace(/^\s*--.*$/gm, '');
  assert.doesNotMatch(executableSql, /(?:^|;)\s*(?:DELETE|UPDATE|TRUNCATE|DROP)\b/im);
  assert.doesNotMatch(executableSql, /ALTER\s+TABLE[\s\S]*?\bDROP\b/i);
  assert.doesNotMatch(migration, /ALTER\s+COLUMN/i);
  assert.match(migration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  assert.match(migration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"RadarLeadProcessRun"/i);
  assert.match(migration, /conrelid\s*=\s*'"RadarLeadProcessRun"'::regclass/i);
  assert.match(migration, /LeadContact[\s\S]*HAVING\s+COUNT\(\*\)\s*>\s*1/i);
  assert.match(migration, /RAISE\s+WARNING\s+'LeadContact canonico pendente/i);
});

#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config();

const strictMode = process.argv.includes('--strict');

const runtimeEnsures = [
  {
    key: 'company-commission-settings-columns',
    method: 'ensureCompanyCommissionSettingsColumns',
    target: 'Company.commissionDueBusinessDays',
    shouldBecomeMigration: true,
  },
  {
    key: 'user-sales-profile-columns',
    method: 'ensureUserSalesProfileColumns',
    target: 'User seller profile and distribution columns',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbx-partner-referral-candidate-tables',
    method: 'ensureHbxPartnerReferralCandidateTables',
    target: 'HbxPartnerReferralCandidate table, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-lead-assignment-columns',
    method: 'ensureVendasLeadAssignmentColumns',
    target: 'VendasLead assignment, sale and commission columns',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-commission-payout-tables',
    method: 'ensureVendasCommissionPayoutTables',
    target: 'VendasCommissionPayout table, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-commission-receivable-tables',
    method: 'ensureVendasCommissionReceivableTables',
    target: 'VendasCommissionReceivable table, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'master-notice-tables',
    method: 'ensureMasterNoticeTables',
    target: 'MasterNotice and MasterNoticeAck tables, constraints and indexes',
    shouldBecomeMigration: true,
  },
];

const healthChecks = [
  column('company.commissionDueBusinessDays', 'company-commission-settings-columns', 'Company', 'commissionDueBusinessDays', true),
  column('user.phone', 'user-sales-profile-columns', 'User', 'phone', true),
  column('user.commissionPercent', 'user-sales-profile-columns', 'User', 'commissionPercent', true),
  column('user.canRegisterHbxSellers', 'user-sales-profile-columns', 'User', 'canRegisterHbxSellers', true),
  column('user.sellerReferralCommissionPercent', 'user-sales-profile-columns', 'User', 'sellerReferralCommissionPercent', true),
  column('user.referredByUserId', 'user-sales-profile-columns', 'User', 'referredByUserId', true),
  table('hbxPartnerReferralCandidate.table', 'hbx-partner-referral-candidate-tables', 'HbxPartnerReferralCandidate', true),
  column('hbxPartnerReferralCandidate.phoneNormalized', 'hbx-partner-referral-candidate-tables', 'HbxPartnerReferralCandidate', 'phoneNormalized', true),
  column('hbxPartnerReferralCandidate.status', 'hbx-partner-referral-candidate-tables', 'HbxPartnerReferralCandidate', 'status', true),
  column('vendasLead.assignedUserId', 'vendas-lead-assignment-columns', 'VendasLead', 'assignedUserId', true),
  column('vendasLead.commissionStatus', 'vendas-lead-assignment-columns', 'VendasLead', 'commissionStatus', true),
  column('vendasLead.commissionAmount', 'vendas-lead-assignment-columns', 'VendasLead', 'commissionAmount', true),
  column('vendasLead.commissionPayoutId', 'vendas-lead-assignment-columns', 'VendasLead', 'commissionPayoutId', true),
  table('vendasCommissionPayout.table', 'vendas-commission-payout-tables', 'VendasCommissionPayout', true),
  table('vendasCommissionReceivable.table', 'vendas-commission-receivable-tables', 'VendasCommissionReceivable', true),
  column('vendasCommissionReceivable.cycleKey', 'vendas-commission-receivable-tables', 'VendasCommissionReceivable', 'cycleKey', true),
  table('masterNotice.table', 'master-notice-tables', 'MasterNotice', true),
  table('masterNoticeAck.table', 'master-notice-tables', 'MasterNoticeAck', true),
  table('externalWebhookEvent.table', null, 'ExternalWebhookEvent', false),
  column('externalWebhookEvent.payloadHash', null, 'ExternalWebhookEvent', 'payloadHash', false),
  table('whatsappConsentLedger.table', null, 'WhatsappConsentLedger', false),
  column('whatsappConsentLedger.phoneNormalized', null, 'WhatsappConsentLedger', 'phoneNormalized', false),
];

function table(key, ensureKey, tableName, shouldBecomeMigration) {
  return {
    key,
    ensureKey: ensureKey || undefined,
    type: 'table',
    table: tableName,
    shouldBecomeMigration,
  };
}

function column(key, ensureKey, tableName, columnName, shouldBecomeMigration) {
  return {
    key,
    ensureKey: ensureKey || undefined,
    type: 'column',
    table: tableName,
    column: columnName,
    shouldBecomeMigration,
  };
}

function describeDatabaseTarget(databaseUrl) {
  const value = String(databaseUrl || '').trim();
  if (!value) return 'DATABASE_URL not configured';

  try {
    const parsed = new URL(value);
    const databaseName = String(parsed.pathname || '').replace(/^\//, '') || null;
    const connectionLimit = parsed.searchParams.get('connection_limit');
    const poolTimeout = parsed.searchParams.get('pool_timeout');
    return [
      `host=${parsed.hostname || 'unknown'}`,
      parsed.port ? `port=${parsed.port}` : null,
      databaseName ? `database=${databaseName}` : null,
      connectionLimit ? `connection_limit=${connectionLimit}` : null,
      poolTimeout ? `pool_timeout=${poolTimeout}` : null,
    ].filter(Boolean).join(' ');
  } catch {
    return 'DATABASE_URL configured';
  }
}

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  return Boolean(rows && rows[0] && rows[0].exists);
}

async function columnExists(prisma, tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `;
  return Boolean(rows && rows[0] && rows[0].exists);
}

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const generatedAt = new Date().toISOString();
  const databaseTarget = describeDatabaseTarget(process.env.DATABASE_URL);
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    const checks = [];
    for (const check of healthChecks) {
      const ok = check.type === 'table'
        ? await tableExists(prisma, check.table)
        : await columnExists(prisma, check.table, check.column);
      checks.push({ ...check, ok });
    }

    const missing = checks.filter((check) => !check.ok);
    const report = {
      ok: missing.length === 0,
      dbAvailable: true,
      generatedAt,
      databaseTarget,
      strictMode,
      checkedCount: checks.length,
      missingCount: missing.length,
      runtimeEnsures,
      checks,
      missing,
    };

    printReport(report);
    if (strictMode && missing.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    printReport({
      ok: false,
      dbAvailable: false,
      generatedAt,
      databaseTarget,
      strictMode,
      checkedCount: healthChecks.length,
      missingCount: null,
      runtimeEnsures,
      checks: healthChecks.map((check) => ({ ...check, ok: false })),
      missing: [],
      fallbackReason: 'Database unavailable or DATABASE_URL not usable; no schema mutation was attempted.',
      error: error && error.message ? error.message : String(error),
    });
    process.exitCode = 0;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();

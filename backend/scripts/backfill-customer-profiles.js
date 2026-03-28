const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? digits.slice(-13) : null;
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function pickDisplayName(atendimentoRow, recoveryRow) {
  return (
    normalizeText(atendimentoRow?.name) ||
    normalizeText(recoveryRow?.clientName) ||
    normalizeText(recoveryRow?.name) ||
    null
  );
}

function buildReportPath() {
  const explicit = getArgValue('--report');
  if (explicit) return path.resolve(explicit);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(__dirname, '..', 'tmp', `customer-profile-backfill-report-${stamp}.json`);
}

function createEmptyReport(options) {
  return {
    mode: options.apply ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    companyId: options.companyId,
    linked: [],
    ambiguous: [],
    ignored: [],
    errors: [],
    summary: {
      linked: 0,
      ambiguous: 0,
      ignored: 0,
      errors: 0,
      createdProfiles: 0,
      updatedAtendimentoRows: 0,
      updatedRecoveryRows: 0,
    },
  };
}

function buildGroupKey(companyId, phoneNormalized) {
  return `${companyId}:${phoneNormalized}`;
}

function collectDistinctProfileIds(group) {
  const values = new Set();
  for (const row of group.atendimentoRows) {
    if (row.customerProfileId) values.add(String(row.customerProfileId));
  }
  for (const row of group.recoveryRows) {
    if (row.customerProfileId) values.add(String(row.customerProfileId));
  }
  for (const row of group.profileRows) {
    values.add(String(row.id));
  }
  return [...values];
}

function pushReport(report, key, payload) {
  report[key].push(payload);
  report.summary[key] += 1;
}

async function loadData(companyId) {
  const where = companyId ? { companyId } : undefined;
  const [atendimentoRows, recoveryRows, profileRows] = await Promise.all([
    prisma.atendimentoCustomer.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        name: true,
        phone: true,
        phoneNormalized: true,
        customerProfileId: true,
        createdAt: true,
      },
      orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.hbxRecoveryCustomer.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        name: true,
        clientName: true,
        whatsappNumber: true,
        customerProfileId: true,
        createdAt: true,
      },
      orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.customerProfile.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        name: true,
        phone: true,
        phoneNormalized: true,
        createdAt: true,
      },
      orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return { atendimentoRows, recoveryRows, profileRows };
}

function groupRows(data) {
  const groups = new Map();

  const ensureGroup = (companyId, phoneNormalized) => {
    const key = buildGroupKey(companyId, phoneNormalized);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        companyId,
        phoneNormalized,
        atendimentoRows: [],
        recoveryRows: [],
        profileRows: [],
      });
    }
    return groups.get(key);
  };

  for (const row of data.atendimentoRows) {
    const phoneNormalized = normalizePhone(row.phoneNormalized || row.phone);
    if (!phoneNormalized) continue;
    ensureGroup(row.companyId, phoneNormalized).atendimentoRows.push(row);
  }

  for (const row of data.recoveryRows) {
    const phoneNormalized = normalizePhone(row.whatsappNumber);
    if (!phoneNormalized) continue;
    ensureGroup(row.companyId, phoneNormalized).recoveryRows.push(row);
  }

  for (const row of data.profileRows) {
    const phoneNormalized = normalizePhone(row.phoneNormalized || row.phone);
    if (!phoneNormalized) continue;
    ensureGroup(row.companyId, phoneNormalized).profileRows.push(row);
  }

  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function classifyGroup(group) {
  const distinctProfileIds = collectDistinctProfileIds(group);

  if (!group.phoneNormalized) {
    return {
      kind: 'ignored',
      reason: 'missing_phone_normalized',
    };
  }

  if (!group.atendimentoRows.length && !group.recoveryRows.length) {
    return {
      kind: 'ignored',
      reason: 'no_source_rows',
    };
  }

  if (group.atendimentoRows.length > 1 || group.recoveryRows.length > 1 || group.profileRows.length > 1) {
    return {
      kind: 'ambiguous',
      reason: 'multiple_rows_for_same_phone',
      distinctProfileIds,
    };
  }

  if (distinctProfileIds.length > 1) {
    return {
      kind: 'ambiguous',
      reason: 'conflicting_profile_links',
      distinctProfileIds,
    };
  }

  return {
    kind: 'linkable',
    distinctProfileIds,
  };
}

async function applyGroup(group, report) {
  const atendimentoRow = group.atendimentoRows[0] || null;
  const recoveryRow = group.recoveryRows[0] || null;
  const existingProfile = group.profileRows[0] || null;
  const displayName = pickDisplayName(atendimentoRow, recoveryRow);
  const phone = normalizeText(atendimentoRow?.phone) || normalizeText(recoveryRow?.whatsappNumber);
  const source = atendimentoRow ? 'atendimento' : recoveryRow ? 'recovery' : 'backfill';

  const result = await prisma.$transaction(async (tx) => {
    let profileId = existingProfile?.id || null;
    let createdProfile = false;
    let updatedAtendimentoRows = 0;
    let updatedRecoveryRows = 0;

    if (!profileId) {
      const created = await tx.customerProfile.create({
        data: {
          companyId: group.companyId,
          name: displayName,
          phone,
          phoneNormalized: group.phoneNormalized,
          externalSource: source,
          status: 'active',
        },
        select: { id: true },
      });
      profileId = created.id;
      createdProfile = true;
    }

    if (atendimentoRow && atendimentoRow.customerProfileId !== profileId) {
      const updated = await tx.atendimentoCustomer.updateMany({
        where: { id: atendimentoRow.id },
        data: { customerProfileId: profileId },
      });
      updatedAtendimentoRows += updated.count;
    }

    if (recoveryRow && recoveryRow.customerProfileId !== profileId) {
      const updated = await tx.hbxRecoveryCustomer.updateMany({
        where: { id: recoveryRow.id },
        data: { customerProfileId: profileId },
      });
      updatedRecoveryRows += updated.count;
    }

    return { profileId, createdProfile, updatedAtendimentoRows, updatedRecoveryRows };
  });

  report.summary.createdProfiles += result.createdProfile ? 1 : 0;
  report.summary.updatedAtendimentoRows += result.updatedAtendimentoRows;
  report.summary.updatedRecoveryRows += result.updatedRecoveryRows;

  pushReport(report, 'linked', {
    companyId: group.companyId,
    phoneNormalized: group.phoneNormalized,
    atendimentoCustomerId: atendimentoRow?.id || null,
    recoveryCustomerId: recoveryRow?.id || null,
    customerProfileId: result.profileId,
    createdProfile: result.createdProfile,
    updatedAtendimentoRows: result.updatedAtendimentoRows,
    updatedRecoveryRows: result.updatedRecoveryRows,
  });
}

function simulateGroup(group, report) {
  const atendimentoRow = group.atendimentoRows[0] || null;
  const recoveryRow = group.recoveryRows[0] || null;
  const existingProfile = group.profileRows[0] || null;

  report.summary.createdProfiles += existingProfile ? 0 : 1;
  report.summary.updatedAtendimentoRows += atendimentoRow && atendimentoRow.customerProfileId !== existingProfile?.id ? 1 : 0;
  report.summary.updatedRecoveryRows += recoveryRow && recoveryRow.customerProfileId !== existingProfile?.id ? 1 : 0;

  pushReport(report, 'linked', {
    companyId: group.companyId,
    phoneNormalized: group.phoneNormalized,
    atendimentoCustomerId: atendimentoRow?.id || null,
    recoveryCustomerId: recoveryRow?.id || null,
    customerProfileId: existingProfile?.id || null,
    wouldCreateProfile: !existingProfile,
    wouldLinkAtendimento: Boolean(atendimentoRow && atendimentoRow.customerProfileId !== existingProfile?.id),
    wouldLinkRecovery: Boolean(recoveryRow && recoveryRow.customerProfileId !== existingProfile?.id),
  });
}

async function main() {
  const options = {
    apply: hasFlag('--apply'),
    dryRun: hasFlag('--dry-run') || !hasFlag('--apply'),
    companyId: Number(getArgValue('--company-id') || 0) || null,
    reportPath: buildReportPath(),
  };

  const report = createEmptyReport(options);
  const data = await loadData(options.companyId);
  const groups = groupRows(data);

  for (const group of groups) {
    const classification = classifyGroup(group);

    if (classification.kind === 'ignored') {
      pushReport(report, 'ignored', {
        companyId: group.companyId,
        phoneNormalized: group.phoneNormalized,
        reason: classification.reason,
      });
      continue;
    }

    if (classification.kind === 'ambiguous') {
      pushReport(report, 'ambiguous', {
        companyId: group.companyId,
        phoneNormalized: group.phoneNormalized,
        reason: classification.reason,
        atendimentoIds: group.atendimentoRows.map((row) => row.id),
        recoveryIds: group.recoveryRows.map((row) => row.id),
        customerProfileIds: classification.distinctProfileIds,
      });
      continue;
    }

    try {
      if (options.apply) {
        await applyGroup(group, report);
      } else {
        simulateGroup(group, report);
      }
    } catch (error) {
      pushReport(report, 'errors', {
        companyId: group.companyId,
        phoneNormalized: group.phoneNormalized,
        atendimentoIds: group.atendimentoRows.map((row) => row.id),
        recoveryIds: group.recoveryRows.map((row) => row.id),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    mode: report.mode,
    companyId: report.companyId,
    reportPath: options.reportPath,
    summary: report.summary,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
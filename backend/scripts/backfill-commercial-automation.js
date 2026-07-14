// Backfill conservador dos executores legados para o estado canônico.
//
// Uso (dry-run por padrão):
//   node scripts/backfill-commercial-automation.js
//   node scripts/backfill-commercial-automation.js --company-id 5
//   node scripts/backfill-commercial-automation.js --company-id 5 --apply
//
// Nunca cria mensagens, não chama provedor e não inicia/retoma campanhas. Leads
// com mais de um executor legado ou job em `sending` são reportados e ignorados.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const ACTIVE_BOT_STATUSES = ['pending', 'scheduled', 'sending', 'sent'];
const ACTIVE_CADENCE_STATUSES = ['ativa', 'pausada'];
const SLOT = 'commercial';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(String(raw || ''));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function keyOf(row) {
  return `${row.companyId}:${row.leadId}`;
}

function stepForLegacy(row) {
  if (row.kind === 'bot') {
    return {
      stepKey: 'first_contact',
      sequence: 0,
      channel: 'whatsapp',
      status: row.status === 'sent' ? 'succeeded' : 'scheduled',
      scheduledAt: row.scheduledAt || null,
      completedAt: row.status === 'sent' ? row.sentAt || row.updatedAt || new Date() : null,
      idempotencyKey: `vendas_automation_job:${row.id}:step:first_contact`,
    };
  }
  const steps = parseJson(row.stepsJson, []);
  const step = Array.isArray(steps) ? steps[Math.max(0, Number(row.currentStep || 0))] : null;
  return {
    stepKey: String(Math.max(0, Number(row.currentStep || 0))),
    sequence: Math.max(0, Number(row.currentStep || 0)),
    channel: String(step?.canal || 'atividade'),
    status: 'scheduled',
    scheduledAt: row.nextStepAt || null,
    completedAt: null,
    idempotencyKey: `cadencia_inscricao:${row.id}:step:${Math.max(0, Number(row.currentStep || 0))}`,
  };
}

async function applyOne(row) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      'WITH advisory_lock AS (SELECT pg_advisory_xact_lock($1::integer, hashtext($2::text))) SELECT 1::integer AS locked FROM advisory_lock',
      Number(row.companyId),
      String(row.leadId),
    );
    const existing = await tx.automationEnrollment.findFirst({
      where: {
        companyId: row.companyId,
        leadId: row.leadId,
        activeCommercialSlot: SLOT,
        status: { in: ['active', 'paused'] },
      },
      select: { id: true },
    });
    if (existing) return { outcome: 'skipped', reason: 'canonical_already_active', enrollmentId: existing.id };

    const enrollmentStatus = row.kind === 'cadence' && row.status === 'pausada' ? 'paused' : 'active';
    const enrollment = await tx.automationEnrollment.create({
      data: {
        companyId: row.companyId,
        leadId: row.leadId,
        definitionKind: row.kind === 'bot' ? 'prospecting_campaign' : 'cadence',
        definitionId: row.definitionId,
        definitionSnapshotJson: JSON.stringify({ backfilled: true, name: row.definitionName || null }),
        legacySource: row.kind === 'bot' ? 'vendas_automation_job' : 'cadencia_inscricao',
        legacyExecutionId: row.id,
        status: enrollmentStatus,
        activeCommercialSlot: SLOT,
        currentStep: row.kind === 'bot' ? 0 : Math.max(0, Number(row.currentStep || 0)),
        nextStepAt: row.kind === 'bot' ? row.scheduledAt || null : row.nextStepAt || null,
        pausedAt: enrollmentStatus === 'paused' ? new Date() : null,
        metadataJson: JSON.stringify({ backfillSource: 'backfill-commercial-automation' }),
      },
    });
    const step = stepForLegacy(row);
    const stepRun = await tx.automationStepRun.create({
      data: {
        companyId: row.companyId,
        leadId: row.leadId,
        enrollmentId: enrollment.id,
        stepKey: step.stepKey,
        sequence: step.sequence,
        attemptNumber: 1,
        channel: step.channel,
        purpose: 'commercial_contact',
        status: step.status,
        idempotencyKey: step.idempotencyKey,
        scheduledAt: step.scheduledAt,
        completedAt: step.completedAt,
        metadataJson: JSON.stringify({ backfilled: true, legacyStatus: row.status }),
      },
    });
    await tx.automationLedgerEvent.create({
      data: {
        companyId: row.companyId,
        leadId: row.leadId,
        enrollmentId: enrollment.id,
        stepRunId: stepRun.id,
        eventType: 'enrollment_backfilled',
        source: row.kind === 'bot' ? 'vendas_automation_job' : 'cadencia_inscricao',
        statusTo: enrollmentStatus,
        idempotencyKey: `enrollment:${enrollment.id}:backfilled`,
        metadataJson: JSON.stringify({ legacyExecutionId: row.id, legacyStatus: row.status }),
      },
    });
    return { outcome: 'created', enrollmentId: enrollment.id, stepRunId: stepRun.id };
  });
}

async function main() {
  const apply = hasFlag('--apply');
  const companyIdRaw = arg('--company-id');
  const companyId = companyIdRaw == null ? null : Number(companyIdRaw);
  if (companyIdRaw != null && (!Number.isInteger(companyId) || companyId <= 0)) {
    throw new Error('Informe --company-id com um ID positivo.');
  }
  // Falha cedo e com mensagem clara quando a migration canônica ainda não foi
  // aplicada. O script nunca tenta criar schema em runtime.
  await prisma.automationEnrollment.count({ where: companyId ? { companyId } : {} });

  const companyWhere = companyId ? { companyId } : {};
  const [jobs, cadences, canonical] = await Promise.all([
    prisma.vendasAutomationJob.findMany({
      where: {
        ...companyWhere,
        status: { in: ACTIVE_BOT_STATUSES },
        OR: [{ classification: null }, { classification: { not: 'inbound_received' } }],
        campaign: { status: 'running' },
      },
      select: {
        id: true,
        companyId: true,
        leadId: true,
        campaignId: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        updatedAt: true,
        campaign: { select: { segment: true, city: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.cadenciaInscricao.findMany({
      where: {
        ...companyWhere,
        status: { in: ACTIVE_CADENCE_STATUSES },
        cadencia: { ativa: true },
      },
      select: {
        id: true,
        companyId: true,
        leadId: true,
        cadenciaId: true,
        status: true,
        currentStep: true,
        nextStepAt: true,
        updatedAt: true,
        cadencia: { select: { nome: true, passosJson: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.automationEnrollment.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        activeCommercialSlot: SLOT,
        status: { in: ['active', 'paused'] },
      },
      select: { id: true, companyId: true, leadId: true, legacySource: true, legacyExecutionId: true },
    }),
  ]);

  const rows = [
    ...jobs.map((row) => ({
      kind: 'bot',
      id: row.id,
      companyId: row.companyId,
      leadId: row.leadId,
      definitionId: row.campaignId,
      definitionName: [row.campaign?.segment, row.campaign?.city].filter(Boolean).join(' - ') || null,
      status: row.status,
      scheduledAt: row.scheduledAt,
      sentAt: row.sentAt,
      updatedAt: row.updatedAt,
    })),
    ...cadences.map((row) => ({
      kind: 'cadence',
      id: row.id,
      companyId: row.companyId,
      leadId: row.leadId,
      definitionId: row.cadenciaId,
      definitionName: row.cadencia?.nome || null,
      status: row.status,
      currentStep: row.currentStep,
      nextStepAt: row.nextStepAt,
      stepsJson: row.cadencia?.passosJson || '[]',
      updatedAt: row.updatedAt,
    })),
  ];
  const byLead = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    byLead.set(key, [...(byLead.get(key) || []), row]);
  }
  const canonicalKeys = new Set(canonical.map(keyOf));
  const eligible = [];
  const skipped = [];
  for (const [key, candidates] of byLead) {
    if (canonicalKeys.has(key)) {
      skipped.push({ key, reason: 'canonical_already_active', legacyExecutions: candidates.map((row) => `${row.kind}:${row.id}`) });
    } else if (candidates.length !== 1) {
      skipped.push({ key, reason: 'ambiguous_multiple_legacy_executions', legacyExecutions: candidates.map((row) => `${row.kind}:${row.id}`) });
    } else if (candidates[0].kind === 'bot' && candidates[0].status === 'sending') {
      skipped.push({ key, reason: 'in_flight_sending_requires_reconciliation', legacyExecutions: [`bot:${candidates[0].id}`] });
    } else {
      eligible.push(candidates[0]);
    }
  }

  const applied = [];
  if (apply) {
    for (const row of eligible) {
      try {
        applied.push({ key: keyOf(row), legacyExecution: `${row.kind}:${row.id}`, ...(await applyOne(row)) });
      } catch (error) {
        applied.push({
          key: keyOf(row),
          legacyExecution: `${row.kind}:${row.id}`,
          outcome: 'failed',
          reason: String(error?.message || error),
        });
      }
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry_run',
    companyId,
    scanned: { botJobs: jobs.length, cadenceEnrollments: cadences.length, canonicalActive: canonical.length },
    eligible: eligible.map((row) => ({ key: keyOf(row), kind: row.kind, id: row.id, status: row.status })),
    skipped,
    applied,
    safety: {
      messagesCreated: 0,
      providersCalled: 0,
      campaignsChanged: 0,
      ambiguousRowsSkipped: true,
      inFlightRowsSkipped: true,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`[backfill-commercial-automation] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

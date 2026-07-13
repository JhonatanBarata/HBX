// Diagnóstico estritamente read-only do Bot de Prospecção.
//
// Uso:
//   node scripts/diagnose-vendas-prospecting.js --company-id 5
//
// Não ativa campanha, não confirma triagem, não cria jobs e não toca no provedor.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const COMMERCIAL_SOURCES = ['vendas_prospeccao_bot', 'prospeccao_bot'];
const WORKER_INTERVAL_MS = 15_000;

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function startOfSaoPauloDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00-03:00`);
}

function inWorkingHours(campaign, now = new Date()) {
  if (!campaign) return false;
  const hhmm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return hhmm >= String(campaign.workingHoursStart || '09:00') &&
    hhmm <= String(campaign.workingHoursEnd || '17:30');
}

async function latestBotConfig(companyId, domain) {
  const row = await prisma.botConfig.findFirst({
    where: { companyId, domain },
    orderBy: { version: 'desc' },
    select: { payload: true, version: true, createdAt: true },
  });
  return row ? { ...row, parsed: parseJson(row.payload) } : null;
}

async function main() {
  const companyId = Number(arg('--company-id') || 0);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error('Informe --company-id com um ID positivo.');
  }

  const now = new Date();
  const today = startOfSaoPauloDay(now);
  const [company, campaign, masterConfig, atendimentoConfig, activeSessions] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        botArmedAt: true,
        prospectingBotLiveAt: true,
        whatsappStatus: true,
        whatsappModalStatus: true,
      },
    }),
    prisma.vendasAutomationCampaign.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    }),
    latestBotConfig(companyId, 'bot_master_switch'),
    latestBotConfig(companyId, 'atendimento_bot'),
    prisma.whatsAppConnectionSession.count({ where: { companyId, status: 'active' } }),
  ]);
  if (!company) throw new Error(`Empresa ${companyId} não encontrada.`);

  const campaignId = campaign?.id || '__none__';
  const [
    jobGroups,
    dueScheduledJobs,
    sentToday,
    commercialOutboxGroups,
    failedOutbox24h,
    recentJobs,
    recentOutbox,
  ] = await Promise.all([
    campaign
      ? prisma.vendasAutomationJob.groupBy({
          by: ['status'],
          where: { companyId, campaignId: campaign.id },
          _count: { _all: true },
        })
      : [],
    campaign
      ? prisma.vendasAutomationJob.count({
          where: {
            companyId,
            campaignId: campaign.id,
            // O worker seleciona exclusivamente `scheduled`; `pending` prova que a
            // tarefa existe, mas ainda nao chegou ao estagio executavel.
            status: 'scheduled',
            scheduledAt: { lte: now },
          },
        })
      : 0,
    campaign
      ? prisma.vendasAutomationJob.count({
          where: { companyId, campaignId: campaign.id, sentAt: { gte: today } },
        })
      : 0,
    prisma.outboundMessage.groupBy({
      by: ['status'],
      where: {
        companyId,
        sourceModule: { in: COMMERCIAL_SOURCES },
      },
      _count: { _all: true },
    }),
    prisma.outboundMessage.count({
      where: {
        companyId,
        status: 'FAILED',
        failedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        sourceModule: { in: COMMERCIAL_SOURCES },
      },
    }),
    campaign
      ? prisma.vendasAutomationJob.findMany({
          where: { companyId, campaignId: campaign.id },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            leadId: true,
            status: true,
            classification: true,
            scheduledAt: true,
            sentAt: true,
            repliedAt: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [],
    prisma.outboundMessage.findMany({
      where: { companyId, sourceModule: { in: COMMERCIAL_SOURCES } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        deliveryStatus: true,
        provider: true,
        providerMessageId: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        lastError: true,
        createdAt: true,
      },
    }),
  ]);

  const jobs = Object.fromEntries(jobGroups.map((row) => [row.status, row._count._all]));
  const outbox = Object.fromEntries(commercialOutboxGroups.map((row) => [row.status, row._count._all]));
  const masterSwitchOff = Boolean(masterConfig?.parsed?.off);
  const atendimentoGlobalOff = atendimentoConfig
    ? atendimentoConfig.parsed?.routingRules?.globalBotEnabled !== true
    : true;
  const channelConnected = activeSessions > 0 ||
    String(company.whatsappStatus || '').toUpperCase() === 'CONNECTED' ||
    ['CONNECTED', 'RECONNECTING'].includes(String(company.whatsappModalStatus || '').toUpperCase());

  const checklistMissing = [];
  if (campaign && !String(campaign.messageTemplate || '').trim()) checklistMissing.push('message_template');
  if (campaign && !String(campaign.optOutMessage || '').trim()) checklistMissing.push('opt_out_message');
  if (campaign && Number(campaign.dailyLimit || 0) <= 0) checklistMissing.push('daily_limit');
  if (campaign && (!String(campaign.workingHoursStart || '').trim() || !String(campaign.workingHoursEnd || '').trim())) {
    checklistMissing.push('working_hours');
  }

  // Ordem espelha o caminho real: query do worker -> gates do job -> outbox ->
  // dispatcher/provedor. Assim `firstBlocker` aponta onde a execucao para primeiro.
  const blockers = [];
  if (!campaign) blockers.push('campaign_missing');
  if (campaign && campaign.status !== 'running') blockers.push('campaign_not_running');
  if (campaign && !campaign.triagemConfirmedAt) blockers.push('triage_not_confirmed');
  if (campaign && checklistMissing.length) blockers.push('triage_config_incomplete');
  if (campaign && Number(jobs.scheduled || 0) === 0) blockers.push('no_scheduled_jobs');
  if (campaign && Number(jobs.scheduled || 0) > 0 && dueScheduledJobs === 0) blockers.push('no_due_scheduled_jobs');
  if (atendimentoGlobalOff) blockers.push('atendimento_bot_global_off');
  if (!company.prospectingBotLiveAt) blockers.push('prospecting_not_live');
  if (campaign && !inWorkingHours(campaign, now)) blockers.push('outside_working_hours');
  if (campaign && sentToday >= Math.max(0, Number(campaign.dailyLimit || 0))) {
    blockers.push('daily_limit_reached');
  }
  if (!channelConnected) blockers.push('channel_disconnected');
  if (masterSwitchOff) blockers.push('master_switch_off');
  if (campaign && dueScheduledJobs === 0 && Number(jobs.pending || 0) + Number(jobs.scheduled || 0) === 0) {
    blockers.push('no_eligible_leads');
  }
  if (Number(outbox.PENDING || 0) + Number(outbox.SENDING || 0) > 0) blockers.push('waiting_outbox');
  if (failedOutbox24h > 0) blockers.push('provider_failed');

  console.log(JSON.stringify({
    mode: 'read_only',
    checkedAt: now.toISOString(),
    company: {
      id: company.id,
      name: company.name,
      botArmed: Boolean(company.botArmedAt),
      prospectingLive: Boolean(company.prospectingBotLiveAt),
      channelConnected,
      activeSessions,
    },
    campaign: campaign ? {
      id: campaign.id,
      status: campaign.status,
      triageConfirmed: Boolean(campaign.triagemConfirmedAt),
      workingHours: `${campaign.workingHoursStart}-${campaign.workingHoursEnd}`,
      insideWorkingHours: inWorkingHours(campaign, now),
      dailyLimit: campaign.dailyLimit,
      sentToday,
      dueScheduledJobs,
      checklistMissing,
      jobs,
      recentJobs,
    } : null,
    executionStages: {
      worker: {
        implementation: 'always_on_in_backend_process',
        intervalMs: WORKER_INTERVAL_MS,
        featureFlag: null,
        durableHeartbeat: false,
        note: 'A existencia do timer e confirmada pelo codigo; liveness do processo exige health/logs do runtime.',
      },
      tasks: {
        created: Object.values(jobs).reduce((total, value) => total + Number(value || 0), 0),
        pending: Number(jobs.pending || 0),
        scheduled: Number(jobs.scheduled || 0),
        dueScheduled: dueScheduledJobs,
      },
      outbox: {
        counts: outbox,
        reached: Object.values(outbox).some((value) => Number(value || 0) > 0),
        waitingDispatcher: Number(outbox.PENDING || 0),
        dispatching: Number(outbox.SENDING || 0),
      },
      provider: {
        confirmed: Number(outbox.SENT || 0) + Number(outbox.DELIVERED || 0) + Number(outbox.READ || 0),
        failed: Number(outbox.FAILED || 0),
        failedLast24h: failedOutbox24h,
      },
    },
    recentOutbox,
    gates: {
      masterSwitchOff,
      atendimentoGlobalOff,
    },
    blockers,
    firstBlocker: blockers[0] || null,
    campaignId,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`[diagnose-vendas-prospecting] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

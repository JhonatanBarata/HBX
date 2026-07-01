// PR3 (30/06, docs/PLANEJAMENTOS/PR30062026/arvore-final-owner-enriquecimento.md)
//
// STAGED — NÃO RODAR sem o dono presente. Cancela as campanhas mass_data AUTÔNOMAS (a "fábrica" que
// auto-perpetua varredura cidade×segmento) e reseta o RadarFactoryCursor, para a sessão conjunta de
// publish do VPS (decisão final do dono: scraping autônomo só roda local; VPS só guarda/serve).
//
// Espelha o método de cancelamento seguro já usado em `purgeDeadMassDataQueue`
// (backend/src/webscraping/radar/01-search/radar-core-factory-admin.mixin.ts): cancela
// WebscrapingCampaign (mode='mass_data') + libera/cancela WebscrapingCampaignTask em fila/rodando +
// reseta RadarFactoryCursor pro estado idle. NÃO toca em campanhas mode!=='mass_data' (scraping
// on-demand do cliente) nem em RadarLeadPool/LeadContact (dados já capturados ficam intactos).
//
// GUARD DE SEGURANÇA: por padrão roda em DRY-RUN (só conta e imprime, NÃO altera nada). Só executa de
// verdade com --confirm. Roda contra QUALQUER DATABASE_URL apontado no ambiente (local hoje; VPS só
// na sessão conjunta com o dono).
//
// Uso:
//   node scripts/cleanup-vps-autonomous-factory.js                 (DRY-RUN — só relata)
//   node scripts/cleanup-vps-autonomous-factory.js --confirm        (EXECUTA de verdade)

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CONFIRMED = process.argv.includes('--confirm');

const ACTIVE_CAMPAIGN_STATUSES = ['queued', 'running', 'sleeping', 'partial_error'];
const ACTIVE_TASK_STATUSES = ['queued', 'running'];

async function main() {
  console.log(`[cleanup-vps-autonomous-factory] iniciando — modo=${CONFIRMED ? 'EXECUTA (--confirm)' : 'DRY-RUN (sem --confirm)'}`);

  const campaignsToCancel = await prisma.webscrapingCampaign.findMany({
    where: { mode: 'mass_data', status: { in: ACTIVE_CAMPAIGN_STATUSES } },
    select: { id: true, city: true, state: true, segment: true, status: true },
  });
  const campaignIds = campaignsToCancel.map((c) => c.id);

  const tasksToCancelCount = campaignIds.length
    ? await prisma.webscrapingCampaignTask.count({
        where: { campaignId: { in: campaignIds }, status: { in: ACTIVE_TASK_STATUSES } },
      })
    : 0;

  const cursor = await prisma.radarFactoryCursor.findUnique({ where: { key: 'main' } });

  console.log('[cleanup-vps-autonomous-factory] diagnóstico:', {
    campanhasMassDataAtivas: campaignsToCancel.length,
    tarefasEmFila: tasksToCancelCount,
    cursorAtual: cursor
      ? {
          status: cursor.status,
          enabled: cursor.enabled,
          currentState: cursor.currentState,
          currentCity: cursor.currentCity,
          currentSegment: cursor.currentSegment,
          reasonStopped: cursor.reasonStopped,
        }
      : null,
  });

  if (campaignsToCancel.length) {
    console.log('[cleanup-vps-autonomous-factory] campanhas que seriam canceladas:');
    for (const c of campaignsToCancel) {
      console.log(`  - ${c.id} :: ${c.city || '(nacional)'}/${c.state || '?'} :: ${c.segment || '(segmentos internos)'} :: status=${c.status}`);
    }
  }

  if (!CONFIRMED) {
    console.log('[cleanup-vps-autonomous-factory] DRY-RUN concluído — nada foi alterado. Rode com --confirm para executar de verdade.');
    return;
  }

  console.log('[cleanup-vps-autonomous-factory] EXECUTANDO cancelamento real...');

  let canceledCampaigns = { count: 0 };
  let canceledTasks = { count: 0 };

  if (campaignIds.length) {
    canceledCampaigns = await prisma.webscrapingCampaign.updateMany({
      where: { id: { in: campaignIds } },
      data: {
        status: 'canceled',
        nextRunAt: null,
        finishedAt: new Date(),
        lastErrorMessage: 'Fábrica autônoma desligada no VPS (scraping autônomo passou a ser só local — limpeza da sessão conjunta).',
      },
    });

    canceledTasks = await prisma.webscrapingCampaignTask.updateMany({
      where: { campaignId: { in: campaignIds }, status: { in: ACTIVE_TASK_STATUSES } },
      data: { status: 'canceled', lockedByEngineId: null, lockedUntil: null },
    });
  }

  await prisma.radarFactoryCursor.upsert({
    where: { key: 'main' },
    create: {
      key: 'main',
      enabled: false,
      forcedOn: false,
      status: 'idle',
      currentState: null,
      currentCity: null,
      currentSegment: null,
      lastCampaignId: null,
      consecutiveEmptyCount: 0,
      consecutiveFailureCount: 0,
      reasonStopped: 'Fábrica autônoma desligada (VPS — scraping é local).',
      nextRunAt: null,
    },
    update: {
      enabled: false,
      forcedOn: false,
      status: 'idle',
      currentState: null,
      currentCity: null,
      currentSegment: null,
      lastCampaignId: null,
      consecutiveEmptyCount: 0,
      consecutiveFailureCount: 0,
      reasonStopped: 'Fábrica autônoma desligada (VPS — scraping é local).',
      nextRunAt: null,
    },
  });

  console.log('[cleanup-vps-autonomous-factory] concluído', {
    campanhasCanceladas: canceledCampaigns.count,
    tarefasCanceladas: canceledTasks.count,
    cursorResetado: true,
  });
  console.log('[cleanup-vps-autonomous-factory] LEMBRETE: isso só impede a fábrica de RECRIAR campanhas se HBX_FACTORY_AUTONOMOUS_DISABLED também estiver setado no ambiente do VPS — sem o env, o próximo ciclo (ensureNightFactoryWork, a cada 60s) recria uma campanha nova.');
}

main()
  .catch((error) => {
    console.error('[cleanup-vps-autonomous-factory] falha fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

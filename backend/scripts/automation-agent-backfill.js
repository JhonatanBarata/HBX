/* eslint-disable no-console */
// S09 (MOTOR-ÚNICO, docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/S09-schema-automation-agent.md).
//
// Backfill de `AutomationAgent` a partir dos 2 stores legados do Atendente
// (AssistenteConfig + BotConfig domain='atendimento_bot'). NÃO roda no boot —
// script manual que o orquestrador chama no VPS DEPOIS do publish final desta
// frente (README: "publish é do dono, 1 vez, no final"). Idempotente:
// reexecutar não duplica nem regride edição/migração já sincronizada (guard
// por updatedAt em AgentBackfillService — ver o service pra detalhe).
//
// Stores antigos continuam intocados; o runtime só passa a LER
// `AutomationAgent` na S10 (flag). Este script só faz a cópia de dados.
//
// Uso:
//   node scripts/automation-agent-backfill.js                (aplica de verdade, todas as empresas)
//   node scripts/automation-agent-backfill.js --dry-run       (só reporta, não grava)
//   node scripts/automation-agent-backfill.js --company-id 5  (só uma empresa)
//   node scripts/automation-agent-backfill.js --company-id 5 --dry-run
//
// Requer `npm run build` antes (lê de dist/ — mesmo padrão de
// scripts/f2-fabrica-stop-resume.js: instancia os services DONOS direto,
// fora do bootstrap HTTP completo do Nest). Roda contra QUALQUER
// DATABASE_URL (local hoje, VPS no publish do dono).

const { PrismaService } = require('../dist/prisma/prisma.service');
const { BotConfigStoreService } = require('../dist/bot/config/bot-config-store.service');
const { BotActivationService } = require('../dist/bot/bot-activation.service');
const { AgentBackfillService } = require('../dist/automation/agent-backfill.service');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const companyIdRaw = getArgValue('--company-id');
  const companyId = companyIdRaw == null ? null : Number(companyIdRaw);
  if (companyIdRaw != null && (!Number.isInteger(companyId) || companyId <= 0)) {
    throw new Error('Informe --company-id com um ID positivo.');
  }

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const botConfigStore = new BotConfigStoreService(prisma);
    const botActivationService = new BotActivationService(prisma, botConfigStore);
    const service = new AgentBackfillService(prisma, botConfigStore, botActivationService);

    const summary = await service.runBackfill({ companyId, apply: !dryRun });

    console.log(JSON.stringify(summary, null, 2));
    console.log('--- resumo ---');
    console.log(
      JSON.stringify(
        {
          mode: summary.mode,
          scannedCompanies: summary.scannedCompanies,
          created: summary.created,
          updated: summary.updated,
          skipped: summary.skipped,
          errors: summary.errors,
        },
        null,
        2,
      ),
    );
    if (summary.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[automation-agent-backfill] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

// INTENTENGINE S3 (docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint3.md).
//
// Backfill IDEMPOTENTE: copia os canais mágicos legados de HbxRecoveryFlowStage (JSON
// serializado numa tabela emprestada) para a tabela BotConfig (versionada, auditada),
// version 1, por empresa. NÃO é obrigatório rodar antes do deploy — o
// BotConfigStoreService já faz dual-read (BotConfig primeiro, fallback pro canal legado
// se a empresa ainda não tiver linha em BotConfig). Este script só acelera a migração e
// permite medir quantas empresas já saíram do fallback.
//
// NÃO deleta as linhas legadas (ficam mortas como rede de segurança por 1 release).
//
// Idempotente: se a empresa já tem QUALQUER version em BotConfig para aquele domain,
// pula (não sobrescreve — rollback/histórico são responsabilidade do fluxo normal do
// app a partir daí, não deste script).
//
// Uso:
//   node scripts/backfill-bot-config.js               (aplica de verdade)
//   node scripts/backfill-bot-config.js --dry-run      (só reporta, não grava)
//   node scripts/backfill-bot-config.js --company-id 7 (só uma empresa)
//
// Roda contra QUALQUER DATABASE_URL (local hoje, VPS no publish do dono).

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DOMAIN_BY_LEGACY_CHANNEL = {
  __ATENDIMENTO_BOT_CONFIG__: 'atendimento_bot',
  __ATENDIMENTO_AGENDA_CONFIG__: 'atendimento_agenda',
  __BOT_MASTER_SWITCH__: 'bot_master_switch',
  __HBX_RECOVERY_BOT_CONFIG__: 'recovery_bot',
};

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
  const onlyCompanyId = Number(getArgValue('--company-id') || 0) || null;

  const legacyChannels = Object.keys(DOMAIN_BY_LEGACY_CHANNEL);

  const rows = await prisma.hbxRecoveryFlowStage.findMany({
    where: {
      channel: { in: legacyChannels },
      ...(onlyCompanyId ? { companyId: onlyCompanyId } : {}),
    },
    orderBy: [{ companyId: 'asc' }, { updatedAt: 'desc' }],
    select: { id: true, companyId: true, channel: true, template: true, updatedAt: true },
  });

  // Uma linha "mais recente" por (companyId, channel) — mesma lógica do getConfigRow legado
  // (findFirst orderBy updatedAt desc). Como já ordenamos desc, a primeira ocorrência vence.
  const latestByKey = new Map();
  for (const row of rows) {
    const key = `${row.companyId}:${row.channel}`;
    if (!latestByKey.has(key)) latestByKey.set(key, row);
  }

  const summary = { migrated: 0, skippedAlreadyMigrated: 0, skippedInvalidJson: 0, errors: 0 };

  for (const row of latestByKey.values()) {
    const domain = DOMAIN_BY_LEGACY_CHANNEL[row.channel];
    if (!domain) continue;

    try {
      const existing = await prisma.botConfig.findFirst({
        where: { companyId: row.companyId, domain },
        select: { id: true },
      });
      if (existing) {
        summary.skippedAlreadyMigrated += 1;
        continue;
      }

      let payload;
      try {
        payload = JSON.parse(row.template || '{}');
      } catch {
        summary.skippedInvalidJson += 1;
        console.warn(`[skip] JSON inválido: companyId=${row.companyId} domain=${domain}`);
        continue;
      }

      console.log(`[migrar] companyId=${row.companyId} domain=${domain} -> BotConfig version 1`);
      if (!dryRun) {
        await prisma.botConfig.create({
          data: {
            companyId: row.companyId,
            domain,
            version: 1,
            payload: JSON.stringify(payload),
            updatedByUserId: null,
          },
        });
      }
      summary.migrated += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[erro] companyId=${row.companyId} domain=${domain}:`, err?.message || err);
    }
  }

  console.log('--- resumo ---');
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', ...summary }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

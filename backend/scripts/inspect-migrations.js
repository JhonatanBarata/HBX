const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const migrations = await prisma.$queryRawUnsafe(
      "SELECT migration_name, started_at, finished_at, applied_steps_count, logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 20",
    );

    console.log('Recent migrations:');
    for (const m of migrations) {
      console.log({
        migration_name: m.migration_name,
        started_at: m.started_at,
        finished_at: m.finished_at,
        applied_steps_count: m.applied_steps_count,
        logsPreview: m.logs ? String(m.logs).slice(0, 180) : null,
      });
    }

    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('PasswordReset','PlanFeatures','_PlanFeatures') ORDER BY name",
    );
    console.log('Tables present among PasswordReset/PlanFeatures/_PlanFeatures:', tables);

    const userCols = await prisma.$queryRawUnsafe("PRAGMA table_info('User')");
    console.log('User columns:', userCols.map((c) => c.name));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

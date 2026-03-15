const { PrismaClient } = require('@prisma/client');

function normalizeDatabaseUrlForHost(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== 'string') return databaseUrl;
  return databaseUrl
    .replace(/(@)db(?=[:/])/g, '$1localhost')
    .replace(/:\/\/db(?=[:/])/g, '://localhost');
}

async function main() {
  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = normalizeDatabaseUrlForHost(process.env.DATABASE_URL);
  }
  if (process.env.DIRECT_URL) {
    process.env.DIRECT_URL = normalizeDatabaseUrlForHost(process.env.DIRECT_URL);
  }

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

    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('PasswordReset', 'Plan', 'Feature', '_FeatureToPlan', 'User', 'Company', 'SystemModule', 'CompanyModule', 'UserModuleAccess')
      ORDER BY table_name
    `);
    console.log('Critical tables present:', tables);

    const userCols = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User'
      ORDER BY ordinal_position
    `);
    console.log('User columns:', userCols.map((c) => c.column_name));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

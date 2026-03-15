const { spawnSync } = require('child_process');

const env = { ...process.env };
if (!env.DATABASE_URL || env.DATABASE_URL.trim() === '') {
  console.error('gen-prisma.js: DATABASE_URL is required. SQLite fallback has been removed from the main flow.');
  process.exit(1);
}

if (!env.DIRECT_URL || env.DIRECT_URL.trim() === '') {
  env.DIRECT_URL = env.DATABASE_URL;
}

const result = spawnSync('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);

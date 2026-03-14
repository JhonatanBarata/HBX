const { spawnSync } = require('child_process');

const env = { ...process.env };
if (!env.DATABASE_URL || env.DATABASE_URL.trim() === '') {
  env.DATABASE_URL = 'file:./prisma/dev.db';
}

const result = spawnSync('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);

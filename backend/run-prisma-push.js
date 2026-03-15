const { spawnSync } = require('child_process');
const env = { ...process.env };
env.DATABASE_URL = 'postgresql://postgres.kywtbcvvboubhtyudqhq:MeuCu5439J1@aws-0-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require';
env.DIRECT_URL = env.DATABASE_URL;
console.log('Using DATABASE_URL=', env.DATABASE_URL);
const r = spawnSync('npx', ['prisma', 'db', 'push', '--schema=./prisma/schema.prisma', '--accept-data-loss'], { stdio: 'inherit', env });
process.exit(r.status);

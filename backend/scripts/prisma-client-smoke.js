const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  override: true,
});

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (expected backend/.env)');
}

try {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname === 'db') {
    url.hostname = 'localhost';
    process.env.DATABASE_URL = url.toString();
  }
} catch {
  // If DATABASE_URL isn't parseable by WHATWG URL, keep it as-is.
}

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const [usersCount, companiesCount] = await Promise.all([
      prisma.user.count(),
      prisma.company.count(),
    ]);
    console.log('ok', { usersCount, companiesCount });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('err', e);
  process.exitCode = 1;
});

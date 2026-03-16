'use strict';

const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const structuralDefaults = require('../src/bootstrap/structural-defaults.json');
const { isLocalDatabaseUrl, loadEnvFromFiles, normalizeHostDatabaseUrl } = require('../../scripts/lib/runtime');
const { runStructuralSeed } = require('./structural-seed');

const backendEnvPath = path.resolve(__dirname, '..', '.env');

function resolveLocalDatabaseUrl() {
  loadEnvFromFiles([backendEnvPath], { applyToProcess: true, overrideProcess: true });
  const databaseUrl = normalizeHostDatabaseUrl(String(process.env.DATABASE_URL || '').trim());
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in backend/.env for seed:dev');
  }
  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error('seed:dev only runs against a local development database');
  }
  return databaseUrl;
}

async function main() {
  const databaseUrl = resolveLocalDatabaseUrl();
  await runStructuralSeed({ mode: 'apply', databaseUrl });

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const companySeed = structuralDefaults.developmentSeed.company;
    const plan = await prisma.plan.findFirst({ where: { name: companySeed.planName } });
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const company = await prisma.company.upsert({
      where: { slug: companySeed.slug },
      update: {
        name: companySeed.name,
        isActive: true,
        paymentStatus: 'TRIAL',
        subscriptionStatus: 'trialing',
        planId: plan ? plan.id : null,
        trialStartsAt: now,
        trialEndsAt,
        deactivatedAt: null,
      },
      create: {
        name: companySeed.name,
        slug: companySeed.slug,
        isActive: true,
        paymentStatus: 'TRIAL',
        subscriptionStatus: 'trialing',
        planId: plan ? plan.id : null,
        trialStartsAt: now,
        trialEndsAt,
      },
    });

    const defaultPassword = String(process.env.DEV_SEED_PASSWORD || 'dev123456').trim();
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    for (const userSeed of structuralDefaults.developmentSeed.users) {
      const existing = await prisma.user.findUnique({ where: { email: userSeed.email } });

      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            username: userSeed.username,
            name: userSeed.name,
            role: userSeed.role,
            companyId: company.id,
            password: passwordHash,
            isActive: true,
            deactivatedAt: null,
          },
        });
        continue;
      }

      await prisma.user.create({
        data: {
          username: userSeed.username,
          email: userSeed.email,
          name: userSeed.name,
          role: userSeed.role,
          companyId: company.id,
          password: passwordHash,
          isActive: true,
        },
      });
    }

    await runStructuralSeed({ mode: 'apply', databaseUrl });

    console.log(JSON.stringify({
      ok: true,
      company: {
        slug: company.slug,
        name: company.name,
      },
      users: structuralDefaults.developmentSeed.users.map((user) => ({
        username: user.username,
        email: user.email,
        role: user.role,
      })),
      defaultPassword,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
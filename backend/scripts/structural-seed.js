'use strict';

const path = require('path');
const { PrismaClient } = require('@prisma/client');
const structuralDefaults = require('../src/bootstrap/structural-defaults.json');
const { loadEnvFromFiles, normalizeHostDatabaseUrl } = require('../../scripts/lib/runtime');

const backendEnvPath = path.resolve(__dirname, '..', '.env');

function parseArgs(argv) {
  const options = {
    mode: 'apply',
    databaseUrl: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check') {
      options.mode = 'check';
      continue;
    }
    if (token === '--apply') {
      options.mode = 'apply';
      continue;
    }
    if (token === '--mode' && argv[index + 1]) {
      options.mode = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--mode=')) {
      options.mode = token.split('=', 2)[1] || options.mode;
      continue;
    }
    if (token === '--database-url' && argv[index + 1]) {
      options.databaseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--database-url=')) {
      options.databaseUrl = token.split('=', 2)[1] || '';
    }
  }

  if (!['apply', 'check'].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }

  return options;
}

function resolveDatabaseUrl(explicitDatabaseUrl) {
  loadEnvFromFiles([backendEnvPath], { applyToProcess: true, overrideProcess: true });
  return normalizeHostDatabaseUrl(String(explicitDatabaseUrl || process.env.DATABASE_URL || '').trim());
}

function createPrisma(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for structural seed operations');
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

function equalValue(left, right) {
  return (left ?? null) === (right ?? null);
}

function normalizeCurrencyAmount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

function normalizeRetiredModuleKeys() {
  return Array.isArray(structuralDefaults.retiredModuleKeys)
    ? structuralDefaults.retiredModuleKeys.map((key) => String(key || '').trim()).filter(Boolean)
    : [];
}

async function ensureMasterRuntimeColumns(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "SystemModule"
    ADD COLUMN IF NOT EXISTS "monthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0
  `);
}

async function ensureSystemModules(prisma, mode, summary) {
  const retiredModuleKeys = normalizeRetiredModuleKeys();

  for (const moduleDef of structuralDefaults.systemModules) {
    const existing = await prisma.systemModule.findUnique({ where: { key: moduleDef.key } });
    const expected = {
      name: moduleDef.name,
      description: moduleDef.description || null,
      monthlyPrice: normalizeCurrencyAmount(moduleDef.monthlyPrice || 0),
      defaultEnabled: Boolean(moduleDef.defaultEnabled),
      companyAssignable: Boolean(moduleDef.companyAssignable),
      serviceUrl: moduleDef.serviceUrl || null,
    };

    if (mode === 'check') {
      if (!existing) {
        summary.errors.push(`Missing system module: ${moduleDef.key}`);
        continue;
      }

      const mismatch = !equalValue(existing.name, expected.name)
        || !equalValue(existing.description, expected.description)
        || !equalValue(existing.monthlyPrice, expected.monthlyPrice)
        || !equalValue(existing.defaultEnabled, expected.defaultEnabled)
        || !equalValue(existing.companyAssignable, expected.companyAssignable)
        || !equalValue(existing.serviceUrl, expected.serviceUrl);

      if (mismatch) {
        summary.errors.push(`System module out of sync: ${moduleDef.key}`);
      }
      continue;
    }

    await prisma.systemModule.upsert({
      where: { key: moduleDef.key },
      update: expected,
      create: {
        key: moduleDef.key,
        ...expected,
      },
    });
    summary.systemModules += 1;
  }

  if (mode === 'check' && retiredModuleKeys.length) {
    const existingRetiredModules = await prisma.systemModule.findMany({
      where: { key: { in: retiredModuleKeys } },
      select: { key: true },
    });
    if (existingRetiredModules.length > 0) {
      summary.errors.push(
        `Retired system modules still present: ${existingRetiredModules.map((item) => item.key).join(', ')}`,
      );
    }
  }

  if (mode === 'apply') {
    await prisma.systemModule.updateMany({
      where: { key: { in: structuralDefaults.legacyModuleKeys } },
      data: { companyAssignable: false, defaultEnabled: false },
    });

    if (retiredModuleKeys.length) {
      const retiredModules = await prisma.systemModule.findMany({
        where: { key: { in: retiredModuleKeys } },
        select: { id: true },
      });
      if (retiredModules.length) {
        const retiredModuleIds = retiredModules.map((item) => item.id);
        await prisma.$transaction([
          prisma.userModuleAccess.deleteMany({ where: { moduleId: { in: retiredModuleIds } } }),
          prisma.companyModule.deleteMany({ where: { moduleId: { in: retiredModuleIds } } }),
          prisma.systemModule.deleteMany({ where: { id: { in: retiredModuleIds } } }),
        ]);
      }
    }
  }
}

async function ensurePlansAndFeatures(prisma, mode, summary) {
  const featureMap = new Map();

  for (const featureDef of structuralDefaults.featureDefinitions) {
    const existing = await prisma.feature.findUnique({ where: { key: featureDef.key } });

    if (mode === 'check') {
      if (!existing) {
        summary.errors.push(`Missing structural feature: ${featureDef.key}`);
      }
      continue;
    }

    const feature = existing
      ? await prisma.feature.update({
          where: { key: featureDef.key },
          data: { description: featureDef.description || null },
        })
      : await prisma.feature.create({
          data: { key: featureDef.key, description: featureDef.description || null },
        });

    featureMap.set(feature.key, feature);
    summary.features += 1;
  }

  if (mode === 'check') {
    for (const planDef of structuralDefaults.plans) {
      const matches = await prisma.plan.findMany({
        where: { name: planDef.name },
        include: { features: true },
      });

      if (matches.length === 0) {
        summary.errors.push(`Missing structural plan: ${planDef.name}`);
        continue;
      }

      if (matches.length > 1) {
        summary.errors.push(`Duplicate structural plan name detected: ${planDef.name}`);
        continue;
      }

      const [plan] = matches;
      if (!equalValue(plan.price, planDef.price)) {
        summary.errors.push(`Structural plan price mismatch: ${planDef.name}`);
      }

      const featureKeys = new Set(plan.features.map((feature) => feature.key));
      for (const featureKey of planDef.features) {
        if (!featureKeys.has(featureKey)) {
          summary.errors.push(`Plan ${planDef.name} is missing feature ${featureKey}`);
        }
      }
    }
    return;
  }

  for (const planDef of structuralDefaults.plans) {
    const matches = await prisma.plan.findMany({
      where: { name: planDef.name },
      include: { features: true },
      take: 2,
    });

    if (matches.length > 1) {
      throw new Error(`Cannot safely seed plan ${planDef.name}: duplicate names already exist`);
    }

    const existing = matches[0] || null;
    const plan = existing
      ? await prisma.plan.update({
          where: { id: existing.id },
          data: { price: planDef.price },
          include: { features: true },
        })
      : await prisma.plan.create({
          data: { name: planDef.name, price: planDef.price },
          include: { features: true },
        });

    const connectedKeys = new Set(plan.features.map((feature) => feature.key));
    for (const featureKey of planDef.features) {
      const feature = featureMap.get(featureKey) || await prisma.feature.findUnique({ where: { key: featureKey } });
      if (!feature) {
        throw new Error(`Feature ${featureKey} is missing while seeding plan ${planDef.name}`);
      }
      if (!connectedKeys.has(featureKey)) {
        await prisma.plan.update({
          where: { id: plan.id },
          data: { features: { connect: { id: feature.id } } },
        });
      }
    }

    summary.plans += 1;
  }
}

async function ensureCompanyModules(prisma, mode, summary) {
  if (mode === 'check') {
    const missingRows = await prisma.$queryRawUnsafe(`
      SELECT c.id AS "companyId", sm.id AS "moduleId"
      FROM "Company" c
      CROSS JOIN "SystemModule" sm
      LEFT JOIN "CompanyModule" cm
        ON cm."companyId" = c.id
       AND cm."moduleId" = sm.id
      WHERE sm."companyAssignable" = true
        AND cm.id IS NULL
      LIMIT 10
    `);

    if (Array.isArray(missingRows) && missingRows.length > 0) {
      summary.errors.push(`CompanyModule is missing ${missingRows.length} required structural rows (sample check)`);
    }
    return;
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
    SELECT c.id, sm.id, sm."defaultEnabled", NOW(), NOW()
    FROM "Company" c
    CROSS JOIN "SystemModule" sm
    WHERE sm."companyAssignable" = true
    ON CONFLICT ("companyId", "moduleId") DO NOTHING
  `);

  summary.companyModules = await prisma.companyModule.count();
}

async function ensureCompanyPermissions(prisma, mode, summary) {
  const companies = await prisma.company.findMany({ select: { id: true } });
  const roles = Object.keys(structuralDefaults.companyRolePermissions);

  for (const company of companies) {
    for (const role of roles) {
      const actions = structuralDefaults.companyRolePermissions[role];
      for (const [acao, allowed] of Object.entries(actions)) {
        if (mode === 'check') {
          const existing = await prisma.importacaoPermissao.findUnique({
            where: {
              empresaId_role_acao: {
                empresaId: company.id,
                role,
                acao,
              },
            },
          });

          if (!existing) {
            summary.errors.push(`Missing ImportacaoPermissao default row for company ${company.id}, role ${role}, action ${acao}`);
          }
          continue;
        }

        await prisma.importacaoPermissao.upsert({
          where: {
            empresaId_role_acao: {
              empresaId: company.id,
              role,
              acao,
            },
          },
          update: {},
          create: {
            empresaId: company.id,
            role,
            acao,
            allowed,
          },
        });
        summary.permissions += 1;
      }
    }
  }
}

async function runStructuralSeed(options = {}) {
  const mode = options.mode || 'apply';
  const databaseUrl = resolveDatabaseUrl(options.databaseUrl);
  const prisma = createPrisma(databaseUrl);
  const summary = {
    mode,
    systemModules: 0,
    features: 0,
    plans: 0,
    companyModules: 0,
    permissions: 0,
    errors: [],
  };

  try {
    await ensureMasterRuntimeColumns(prisma);
    await ensureSystemModules(prisma, mode, summary);
    await ensurePlansAndFeatures(prisma, mode, summary);
    await ensureCompanyModules(prisma, mode, summary);
    await ensureCompanyPermissions(prisma, mode, summary);

    if (summary.errors.length > 0) {
      throw new Error(summary.errors.join('\n'));
    }

    return summary;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runStructuralSeed(parseArgs(process.argv.slice(2)))
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error && error.message ? error.message : error);
      process.exit(1);
    });
}

module.exports = {
  runStructuralSeed,
};

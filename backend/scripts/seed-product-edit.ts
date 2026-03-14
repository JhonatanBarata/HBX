/*
  Standalone seed script to add the feature `product_edit` to the
  'ouro' plan and also ensure an administrative plan has an edit feature.

  Notes about schema constraints:
  - In the Prisma schema `Feature.key` is unique across the table.
    That means the exact same key cannot belong to two different plans.
  - This script will create `product_edit` and attach it to the 'ouro' plan.
  - For the 'admin' plan, if `product_edit` is already taken by another plan,
    the script will create an alias key `product_edit_admin` to allow admin
    editing without changing table constraints.

  Usage (run locally from repository root):
    npx ts-node backend/scripts/seed-product-edit.ts
  Or (if you prefer):
    npx ts-node-dev backend/scripts/seed-product-edit.ts

  The script does NOT run automatically and does not alter your existing
  seed endpoints.
*/

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensurePlan(name: string, price = 0) {
  let plan = await prisma.plan.findFirst({ where: { name } });
  if (!plan) {
    plan = await prisma.plan.create({ data: { name, price } });
    console.log(`Created plan '${name}' (id=${plan.id})`);
  } else {
    console.log(`Found plan '${name}' (id=${plan.id})`);
  }
  return plan;
}

async function createFeatureForPlan(key: string, description: string, planId: number) {
  // create feature if not exists, then connect to plan via many-to-many
  let feat = await prisma.feature.findUnique({ where: { key } });
  if (!feat) {
    feat = await prisma.feature.create({ data: { key, description } });
    console.log(`Created feature '${key}' (id=${feat.id})`);
  } else {
    console.log(`Found feature '${key}' (id=${feat.id})`);
  }

  // connect to plan (safe to call even if already connected)
  await prisma.plan.update({ where: { id: planId }, data: { features: { connect: { id: feat.id } } } });
  console.log(`Connected feature '${key}' to planId=${planId}`);
  return feat;
}

async function main() {
  await prisma.$connect();

  const ouro = await ensurePlan('ouro', 29.9);
  const admin = await ensurePlan('admin', 0);

  // 1) Ensure 'product_edit' exists for Ouro (or create it)
  const productEditKey = 'product_edit';
  const productEditDesc = 'Allow editing and deleting products';

  try {
    const f = await createFeatureForPlan(productEditKey, productEditDesc, ouro.id);
    // check which plans this feature is attached to
    const fWithPlans = await prisma.feature.findUnique({ where: { key: productEditKey }, include: { plans: true } });
    const attachedPlanIds = (fWithPlans?.plans ?? []).map((p) => p.id);
    if (!attachedPlanIds.includes(ouro.id)) {
      console.log(`Note: '${productEditKey}' exists but is not attached to ouro (attached to plans: ${attachedPlanIds.join(',')})`);
    }
  } catch (e) {
    console.error('Failed to ensure product_edit for ouro:', e);
  }

  // 2) For admin plan, try to create the same key. If it's already taken
  //    and belongs to a different plan, create an admin-specific alias key.
  const existing = await prisma.feature.findUnique({ where: { key: productEditKey }, include: { plans: true } });
  const attachedToAdmin = (existing?.plans ?? []).some((p) => p.id === admin.id);
  if (!existing || attachedToAdmin) {
    try {
      await createFeatureForPlan(productEditKey, productEditDesc, admin.id);
    } catch (e) {
      console.error('Could not create/connect product_edit for admin plan:', e);
    }
  } else {
    // create alias feature and connect to admin plan
    const aliasKey = 'product_edit_admin';
    const aliasExists = await prisma.feature.findUnique({ where: { key: aliasKey } });
    let aliasFeat;
    if (!aliasExists) {
      aliasFeat = await prisma.feature.create({ data: { key: aliasKey, description: 'Admin alias for product_edit' } });
      console.log(`Created alias feature '${aliasKey}' (id=${aliasFeat.id})`);
    } else {
      aliasFeat = aliasExists;
      console.log(`Alias feature '${aliasKey}' already exists (id=${aliasFeat.id})`);
    }
    await prisma.plan.update({ where: { id: admin.id }, data: { features: { connect: { id: aliasFeat.id } } } });
    console.log(`Connected alias '${aliasKey}' to admin plan`);
    const ownerPlanNames = (existing.plans ?? []).map((p) => p.name).join(', ');
    console.log(`Created admin alias because '${productEditKey}' is owned by plan(s): ${ownerPlanNames}`);
  }

  console.log('Done. Review the features via Prisma Studio or your admin endpoints.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

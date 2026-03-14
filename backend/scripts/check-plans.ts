import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const plans = await prisma.plan.findMany({ include: { features: true } });
    console.log(JSON.stringify(plans, null, 2));
  } catch (err) {
    console.error('Error listing plans:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

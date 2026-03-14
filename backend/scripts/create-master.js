const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function run() {
  const email = process.env.MASTER_EMAIL || 'jbinformatica1100@gmail.com';
  const password = process.env.MASTER_PASSWORD || 'Perspective';
  const hashed = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Master user already exists:', email);
    await prisma.$disconnect();
    return;
  }

  const user = await prisma.user.create({ data: { email, password: hashed, name: 'Master', role: 'ADMIN' } });
  console.log('Created master user with id', user.id, 'and email', email);
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

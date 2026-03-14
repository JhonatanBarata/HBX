const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  const name = process.env.SEED_COMPANY_NAME || 'Jho';
  const slug = (process.env.SEED_COMPANY_SLUG || 'jho').toLowerCase();
  const email = process.env.SEED_USER_EMAIL || 'Jbinformatica1100@gmail.com';
  const rawPassword = process.env.SEED_USER_PASSWORD || '123456';

  const company = await prisma.company.upsert({
    where: { slug },
    create: { name, slug, whatsappPhoneNumberId: process.env.SEED_WHATSAPP_PHONE_NUMBER_ID || null },
    update: { name },
  });

  const hashed = await bcrypt.hash(rawPassword, 10);

  const existing = await prisma.user.findUnique({ where: { email } });
  let user;
  if (existing) {
    user = await prisma.user.update({ where: { email }, data: { password: hashed, companyId: company.id } });
  } else {
    user = await prisma.user.create({ data: { email, password: hashed, name: 'User 1', companyId: company.id } });
  }

  console.log('company:', { id: company.id, slug: company.slug, name: company.name });
  console.log('user:', { id: user.id, email: user.email, companyId: user.companyId });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

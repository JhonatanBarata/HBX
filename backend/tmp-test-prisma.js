const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  try {
    const users = await p.user.count();
    const companies = await p.company.count();
    console.log('ok', { users, companies });
  } catch (e) {
    console.error('err', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();

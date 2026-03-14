const {PrismaClient} = require('@prisma/client');
(async ()=>{
  const p = new PrismaClient();
  const companies = await p.company.findMany({select:{id:true,name:true,slug:true,whatsappPhoneNumberId:true}});
  console.log('companies:', companies);
  const users = await p.user.findMany({select:{id:true,email:true,companyId:true,password:true}});
  console.log('users:', users);
  await p.$disconnect();
})();

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CONFIRM_TOKEN = 'SIM_APAGAR';
const DELETE_MODULE_KEY = 'bulk_cleanup_manual';

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

function normalize(value) {
  const s = String(value || '').trim();
  return s || null;
}

async function tableExists(tx, tableName) {
  const rows = await tx.$queryRawUnsafe(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    LIMIT 1
  `);
  return rows.length > 0;
}

async function safeDeleteByCompanyId(tx, tableName, companyId) {
  if (await tableExists(tx, tableName)) {
    await tx.$executeRawUnsafe(`DELETE FROM "${tableName}" WHERE "companyId" = ${Number(companyId)}`);
  }
}

async function safeDeleteByUserIds(tx, tableName, userIds) {
  if (!userIds.length) return;
  if (await tableExists(tx, tableName)) {
    await tx.$executeRawUnsafe(`DELETE FROM "${tableName}" WHERE "userId" IN (${userIds.join(',')})`);
  }
}

async function supportsWhatsAppEndpointTable(tx) {
  return tableExists(tx, 'CompanyWhatsAppEndpoint');
}

function buildSnapshot(company, deletedByUserId) {
  return JSON.stringify({
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug || null,
      createdAt: company.createdAt ? company.createdAt.toISOString() : null,
      paymentStatus: company.paymentStatus || null,
      subscriptionStatus: company.subscriptionStatus || null,
      isActive: Boolean(company.isActive),
    },
    users: (company.users || []).map((u) => ({
      id: u.id,
      email: u.email || null,
      username: u.username || null,
      isSystemMaster: Boolean(u.isSystemMaster),
    })),
    deletedAt: new Date().toISOString(),
    deletedByUserId: deletedByUserId || null,
    mode: 'bulk_manual_script',
  });
}

async function deleteCompanyCascade(companyId, deletedByUserId = null) {
  const company = await prisma.company.findUnique({
    where: { id: Number(companyId) },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      paymentStatus: true,
      subscriptionStatus: true,
      isActive: true,
      users: {
        select: {
          id: true,
          email: true,
          username: true,
          isSystemMaster: true,
        },
      },
    },
  });

  if (!company) {
    console.log(`- Empresa ${companyId} não encontrada, pulando.`);
    return;
  }

  if (company.users.some((u) => u.isSystemMaster)) {
    console.log(`- Empresa ${companyId} (${company.name}) vinculada a MASTER. Pulando.`);
    return;
  }

  const userIds = company.users.map((u) => Number(u.id)).filter(Boolean);
  const snapshot = buildSnapshot(company, deletedByUserId);
  const deletedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const hasWhatsAppEndpointTable = await supportsWhatsAppEndpointTable(tx);

    await tx.deletionRecord.create({
      data: {
        moduleKey: DELETE_MODULE_KEY,
        entityType: 'COMPANY',
        entityId: String(company.id),
        companyId: null,
        motivo: 'Bulk delete manual de empresas de teste',
        snapshot,
        deletedByUserId: deletedByUserId || null,
        deletedAt,
        permanentlyDeletedById: deletedByUserId || null,
        permanentlyDeletedAt: deletedAt,
      },
    });

    await safeDeleteByCompanyId(tx, 'WebsiteAdminEntryToken', company.id);
    await safeDeleteByCompanyId(tx, 'CompanyWebsiteConfig', company.id);
    await safeDeleteByCompanyId(tx, 'MasterBillingLedgerEntry', company.id);
    await safeDeleteByCompanyId(tx, 'FinanceiroCharge', company.id);

    await tx.satisfactionSurvey.deleteMany({ where: { conversation: { companyId: company.id } } });
    await tx.message.deleteMany({ where: { conversation: { companyId: company.id } } });
    await tx.conversation.deleteMany({ where: { companyId: company.id } });
    await tx.customer.deleteMany({ where: { conversations: { none: {} } } });

    await tx.outboundAttempt.deleteMany({ where: { message: { companyId: company.id } } });
    await tx.companyMessage.deleteMany({ where: { companyId: company.id } });
    await tx.outboundMessage.deleteMany({ where: { companyId: company.id } });
    await tx.inboundMessage.deleteMany({ where: { companyId: company.id } });

    await tx.autoReplyResponse.deleteMany({ where: { rule: { companyId: company.id } } });
    await tx.autoReplyRule.deleteMany({ where: { companyId: company.id } });

    await tx.orderDraft.deleteMany({ where: { companyId: company.id } });
    await tx.conversationSession.deleteMany({ where: { companyId: company.id } });
    await tx.companyConversation.deleteMany({ where: { companyId: company.id } });

    await tx.hbxRecoveryPayment.deleteMany({ where: { companyId: company.id } });
    await tx.vendasLeadTimelineEvent.deleteMany({ where: { lead: { companyId: company.id } } });
    await tx.vendasLead.deleteMany({ where: { companyId: company.id } });
    await tx.atendimentoCustomer.deleteMany({ where: { companyId: company.id } });
    await tx.hbxRecoveryCustomer.deleteMany({ where: { companyId: company.id } });
    await tx.debtCase.deleteMany({ where: { companyId: company.id } });
    await tx.hbxRecoveryFlowStage.deleteMany({ where: { companyId: company.id } });
    await tx.customerProfile.deleteMany({ where: { companyId: company.id } });

    await tx.auvoExternalRecord.deleteMany({ where: { companyId: company.id } });
    await tx.integrationSyncRun.deleteMany({ where: { companyId: company.id } });
    await tx.integrationConnection.deleteMany({ where: { companyId: company.id } });

    await tx.whatsAppAuditLog.deleteMany({ where: { companyId: company.id } });
    await tx.whatsAppWebhookEvent.deleteMany({ where: { companyId: company.id } });
    await tx.webscrapingUsageLog.deleteMany({ where: { companyId: company.id } });
    await tx.webscrapingSearchHistory.deleteMany({ where: { companyId: company.id } });
    await tx.techAssistantInteraction.deleteMany({ where: { companyId: company.id } });

    if (hasWhatsAppEndpointTable) {
      await tx.companyWhatsAppEndpoint.deleteMany({ where: { companyId: company.id } });
    }

    await tx.masterSupportAuditLog.deleteMany({ where: { companyId: company.id } });
    await tx.masterAssumedContextSession.deleteMany({ where: { companyId: company.id } });

    await tx.cadastroTransitTime.deleteMany({ where: { empresaId: company.id } });
    await tx.cadastroFornecedor.deleteMany({ where: { empresaId: company.id } });
    await tx.cadastroPorto.deleteMany({ where: { empresaId: company.id } });
    await tx.cadastroPais.deleteMany({ where: { empresaId: company.id } });

    await tx.companyModule.deleteMany({ where: { companyId: company.id } });
    await tx.deletionRecord.deleteMany({ where: { companyId: company.id } });
    await tx.productVersion.deleteMany({ where: { product: { companyId: company.id } } });
    await tx.product.deleteMany({ where: { companyId: company.id } });

    if (userIds.length > 0) {
      await tx.importacao.updateMany({
        where: {
          OR: [
            { createdBy: { in: userIds } },
            { finalizedBy: { in: userIds } },
            { reabertoPor: { in: userIds } },
          ],
        },
        data: {
          createdBy: null,
          finalizedBy: null,
          reabertoPor: null,
        },
      });

      await tx.productVersion.updateMany({
        where: { authorId: { in: userIds } },
        data: { authorId: null },
      });

      await tx.deletionRecord.updateMany({
        where: { deletedByUserId: { in: userIds } },
        data: { deletedByUserId: null },
      });

      await tx.masterAssumedContextSession.updateMany({
        where: { endedByUserId: { in: userIds } },
        data: { endedByUserId: null },
      });

      await tx.techAssistantInteraction.deleteMany({ where: { userId: { in: userIds } } });
      await tx.webscrapingUsageLog.deleteMany({ where: { userId: { in: userIds } } });
      await tx.webscrapingSearchHistory.deleteMany({ where: { userId: { in: userIds } } });
      await tx.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
      await tx.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });

      if (await tableExists(tx, 'MasterBillingLedgerEntry')) {
        await tx.$executeRawUnsafe(
          `UPDATE "MasterBillingLedgerEntry" SET "createdByUserId" = NULL WHERE "createdByUserId" IN (${userIds.join(',')})`
        );
      }

      await safeDeleteByUserIds(tx, 'WebsiteAdminEntryToken', userIds);

      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }

    await tx.company.delete({ where: { id: company.id } });
  });

  console.log(`OK -> deletada empresa ${company.id} | ${company.name} | ${company.slug || '-'}`);
}

async function main() {
  const ids = parseIds(process.env.DELETE_COMPANY_IDS);
  const nameLike = normalize(process.env.DELETE_COMPANY_NAME_LIKE);
  const slugLike = normalize(process.env.DELETE_COMPANY_SLUG_LIKE);
  const masterUserId = Number(process.env.MASTER_USER_ID || 0) || null;
  const execute = String(process.env.CONFIRM_BULK_DELETE || '').trim() === CONFIRM_TOKEN;

  if (!ids.length && !nameLike && !slugLike) {
    throw new Error(
      'Defina DELETE_COMPANY_IDS ou DELETE_COMPANY_NAME_LIKE ou DELETE_COMPANY_SLUG_LIKE'
    );
  }

  const or = [];
  if (ids.length) or.push({ id: { in: ids } });
  if (nameLike) or.push({ name: { contains: nameLike, mode: 'insensitive' } });
  if (slugLike) or.push({ slug: { contains: slugLike, mode: 'insensitive' } });

  const companies = await prisma.company.findMany({
    where: {
      OR: or,
      NOT: {
        users: {
          some: {
            isSystemMaster: true,
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      users: {
        select: { id: true, email: true },
      },
    },
    orderBy: { id: 'desc' },
  });

  console.log('\nEmpresas candidatas:\n');
  console.table(
    companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug || '',
      createdAt: c.createdAt,
      users: c.users.length,
    }))
  );

  if (!companies.length) {
    console.log('\nNenhuma empresa encontrada.');
    return;
  }

  if (!execute) {
    console.log('\nDRY RUN.');
    console.log(`Para executar de verdade, defina CONFIRM_BULK_DELETE=${CONFIRM_TOKEN}`);
    return;
  }

  for (const company of companies) {
    await deleteCompanyCascade(company.id, masterUserId);
  }

  console.log('\nFinalizado.');
}

main()
  .catch((err) => {
    console.error('\nERRO:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const companyId = Number(process.env.COMPANY_ID || 7);
  const phoneSuffix = String(process.env.PHONE_SUFFIX || '').replace(/\D/g, '');

  try {
    const customerWhere = phoneSuffix
      ? {
          companyId,
          whatsappNumber: {
            endsWith: phoneSuffix,
          },
        }
      : { companyId };

    const customers = await prisma.hbxRecoveryCustomer.findMany({
      where: customerWhere,
      take: 5,
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        clientName: true,
        whatsappNumber: true,
        lastContact: true,
        openAmount: true,
        updatedAt: true,
      },
    });

    const contactIds = customers.map((item) => item.id);
    const phoneDigits = customers.map((item) => String(item.whatsappNumber || '').replace(/\D/g, ''));

    const companyMessageOr = [
      contactIds.length ? { contactId: { in: contactIds } } : undefined,
      phoneDigits.length ? { contactId: { in: phoneDigits } } : undefined,
    ].filter(Boolean);

    const companyMessages = await prisma.companyMessage.findMany({
      where: companyMessageOr.length
        ? {
            companyId,
            OR: companyMessageOr,
          }
        : { companyId },
      take: 20,
      orderBy: [{ id: 'desc' }],
      select: {
        id: true,
        direction: true,
        messageType: true,
        body: true,
        status: true,
        error: true,
        sourceModule: true,
        senderType: true,
        contactId: true,
        providerMessageId: true,
        timestamp: true,
        rawPayload: true,
      },
    });

    const outboundIds = companyMessages
      .map((item) => item.id)
      .filter(Boolean);

    const outboundOr = [
      contactIds.length ? { contactId: { in: contactIds } } : undefined,
      phoneDigits.length ? { to: { in: phoneDigits.map((digits) => `+${digits}`) } } : undefined,
    ].filter(Boolean);

    const outboundMessages = await prisma.outboundMessage.findMany({
      where: outboundOr.length
        ? {
            companyId,
            OR: outboundOr,
          }
        : { companyId },
      take: 20,
      orderBy: [{ id: 'desc' }],
      include: {
        attempts: {
          take: 5,
          orderBy: [{ id: 'desc' }],
        },
      },
    });

    const providerIds = outboundMessages
      .map((item) => item.providerMessageId)
      .filter(Boolean);

    const conversations = await prisma.companyConversation.findMany({
      where: phoneSuffix
        ? {
            companyId,
            contact: {
              contains: phoneSuffix,
            },
          }
        : { companyId },
      take: 10,
      orderBy: [{ id: 'desc' }],
      select: {
        id: true,
        contact: true,
        channel: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const webhookEvents = await prisma.whatsAppWebhookEvent.findMany({
      where: {
        companyId,
        OR: [
          providerIds.length ? { providerMessageId: { in: providerIds } } : undefined,
          { kind: 'messages' },
        ].filter(Boolean),
      },
      take: 20,
      orderBy: [{ id: 'desc' }],
      select: {
        id: true,
        kind: true,
        providerMessageId: true,
        receivedAt: true,
        payload: true,
      },
    });

    const matchingWebhookEvents = phoneSuffix
      ? webhookEvents.filter((item) => String(item.payload || '').includes(phoneSuffix))
      : webhookEvents;

    console.log(
      JSON.stringify(
        { customers, conversations, companyMessages, outboundMessages, webhookEvents, matchingWebhookEvents },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
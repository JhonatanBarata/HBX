import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function requireCompanyIdFromUser(user: any): number {
  const companyId = Number(user?.companyId);
  if (!companyId) throw new ForbiddenException('Company context required');
  return companyId;
}

@Injectable()
export class GerencialService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: any) {
    const companyId = requireCompanyIdFromUser(user);

    const [
      totalConversations,
      totalMessages,
      inboundCount,
      outboundCount,
      totalComplaints,
      recentMessages,
      companyUsers,
      companyContacts,
      surveys,
    ] = await Promise.all([
      this.prisma.companyConversation.count({ where: { companyId } }),
      this.prisma.companyMessage.count({ where: { companyId } }),
      this.prisma.companyMessage.count({ where: { companyId, direction: 'INBOUND' } }),
      this.prisma.companyMessage.count({ where: { companyId, direction: 'OUTBOUND' } }),
      this.prisma.companyMessage.count({ where: { companyId, isComplaint: true } as any }),
      this.prisma.companyMessage.findMany({
        where: { companyId },
        orderBy: { timestamp: 'desc' },
        take: 100,
        include: {
          conversation: {
            select: { id: true, contact: true, channel: true },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { companyId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, username: true, email: true, name: true, role: true, isActive: true, deactivatedAt: true, retentionUntil: true, createdAt: true },
      }),
      this.prisma.companyConversation.findMany({ where: { companyId }, select: { contact: true } }),
      this.prisma.satisfactionSurvey.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          conversation: {
            include: {
              customer: {
                select: { phone: true, name: true },
              },
            },
          },
        },
      }),
    ]);

    const contactSet = new Set(companyContacts.map((item) => String(item.contact || '').trim()));
    const companySurveys = surveys
      .filter((item) => contactSet.has(String(item?.conversation?.customer?.phone || '').trim()))
      .map((item) => ({
        id: item.id,
        rating: item.rating,
        feedback: item.feedback,
        createdAt: item.createdAt,
        customerPhone: item.conversation?.customer?.phone || null,
        customerName: item.conversation?.customer?.name || null,
      }));

    return {
      companyId,
      totals: {
        conversations: totalConversations,
        messages: totalMessages,
        inbound: inboundCount,
        outbound: outboundCount,
        complaints: totalComplaints,
        users: companyUsers.length,
        surveys: companySurveys.length,
      },
      users: companyUsers,
      recentMessages: recentMessages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        timestamp: m.timestamp,
        conversation: m.conversation ? { id: m.conversation.id, contact: m.conversation.contact, channel: m.conversation.channel } : undefined,
        isComplaint: Boolean((m as any).isComplaint),
      })),
      surveys: companySurveys,
    };
  }

  async markComplaint(user: any, messageId: number, isComplaint: boolean) {
    const companyId = requireCompanyIdFromUser(user);
    const msg = await this.prisma.companyMessage.findUnique({ where: { id: messageId } });
    if (!msg || msg.companyId !== companyId) throw new NotFoundException('Message not found');
    await this.prisma.companyMessage.update({ where: { id: messageId }, data: { isComplaint } as any });
    return { ok: true };
  }
}

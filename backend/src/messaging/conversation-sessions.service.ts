import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

@Injectable()
export class ConversationSessionsService {
  private readonly ttlMinutes = 30;

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateActiveSession(input: { companyId: number; channel: string; from: string }) {
    const now = new Date();
    const companyId = Number(input.companyId);
    const channel = String(input.channel || 'whatsapp');
    const from = String(input.from || '').trim();

    const active = await this.prisma.conversationSession.findFirst({
      where: {
        companyId,
        channel,
        from,
        expiresAt: { gt: now },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (!active) {
      // If there is a most recent expired session, abandon its draft (keep history).
      const lastExpired = await this.prisma.conversationSession.findFirst({
        where: {
          companyId,
          channel,
          from,
          expiresAt: { lte: now },
        },
        orderBy: { lastMessageAt: 'desc' },
      });
      if (lastExpired) {
        await this.prisma.orderDraft.updateMany({
          where: { sessionId: lastExpired.id, status: 'DRAFT' },
          data: { status: 'ABANDONED' },
        });
      }

      return this.prisma.conversationSession.create({
        data: {
          companyId,
          channel,
          from,
          state: 'NEW',
          context: JSON.stringify({}),
          lastMessageAt: now,
          expiresAt: addMinutes(now, this.ttlMinutes),
        },
      });
    }

    // touch/extend
    return this.prisma.conversationSession.update({
      where: { id: active.id },
      data: {
        lastMessageAt: now,
        expiresAt: addMinutes(now, this.ttlMinutes),
      },
    });
  }

  async updateSession(sessionId: number, patch: { state?: string; context?: any }) {
    return this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        state: patch.state,
        context: patch.context === undefined ? undefined : JSON.stringify(patch.context),
      },
    });
  }
}

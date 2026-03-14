import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrderDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertForSession(input: { companyId: number; sessionId: number; items: any }) {
    const companyId = Number(input.companyId);
    const sessionId = Number(input.sessionId);
    const itemsJson = JSON.stringify(input.items ?? {});

    return this.prisma.orderDraft.upsert({
      where: { sessionId },
      create: {
        companyId,
        sessionId,
        status: 'DRAFT',
        items: itemsJson,
      },
      update: {
        companyId,
        status: 'DRAFT',
        items: itemsJson,
      },
    });
  }

  async abandonForSession(sessionId: number) {
    return this.prisma.orderDraft.updateMany({
      where: { sessionId, status: 'DRAFT' },
      data: { status: 'ABANDONED' },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuditInput = {
  companyId: number;
  scope: string;
  event: string;
  level?: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class WhatsAppAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput) {
    const companyId = Number(input.companyId || 0);
    if (!companyId) return;
    await this.prisma.whatsAppAuditLog.create({
      data: {
        companyId,
        scope: String(input.scope || 'whatsapp'),
        event: String(input.event || 'event'),
        level: String(input.level || 'INFO'),
        message: String(input.message || ''),
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  }
}

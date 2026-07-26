import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    companyId: number;
    leadId?: string | null;
    automationStepRunId?: string | null;
    recoveryStepRunId?: string | null;
    requestedByUserId?: number | null;
    recipient: string;
    subject: string;
    bodyText: string;
    // S6 LEAD-CENTRICO (06-email-v1.md): versão HTML (texto + assinatura sóbria do
    // remetente + frase de saída limpa). Opcional/aditiva — sem ela o worker manda
    // só texto puro, igual comportamento de hoje.
    bodyHtml?: string | null;
    sourceModule: string;
    purpose?: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const data = {
      companyId: input.companyId,
      leadId: input.leadId || null,
      automationStepRunId: input.automationStepRunId || null,
      recoveryStepRunId: input.recoveryStepRunId || null,
      requestedByUserId: input.requestedByUserId ?? null,
      recipient: String(input.recipient || '').trim().toLowerCase(),
      subject: String(input.subject || '').trim().slice(0, 240),
      bodyText: String(input.bodyText || '').trim().slice(0, 20_000),
      bodyHtml: input.bodyHtml ? String(input.bodyHtml).trim().slice(0, 40_000) || null : null,
      sourceModule: String(input.sourceModule || 'automation').trim(),
      purpose: String(input.purpose || 'commercial_contact').trim(),
      idempotencyKey: String(input.idempotencyKey || '').trim(),
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    };
    if (!data.recipient || !data.subject || !data.bodyText || !data.idempotencyKey) {
      throw new Error('email_outbox_invalid_payload');
    }

    let row: any;
    try {
      row = await (this.prisma as any).emailOutboundMessage.create({ data });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      row = await (this.prisma as any).emailOutboundMessage.findFirst({
        where: { companyId: input.companyId, idempotencyKey: data.idempotencyKey },
      });
    }

    if (input.automationStepRunId) {
      await (this.prisma as any).automationStepRun.updateMany({
        where: {
          id: input.automationStepRunId,
          companyId: input.companyId,
          status: { in: ['claimed', 'scheduled', 'queued'] },
        },
        data: { status: 'queued', queuedAt: new Date(), leaseUntil: null },
      });
    }
    if (input.recoveryStepRunId) {
      await (this.prisma as any).recoveryAutomationStepRun.updateMany({
        where: {
          id: input.recoveryStepRunId,
          companyId: input.companyId,
          status: { in: ['processing', 'pending', 'queued'] },
        },
        data: { status: 'queued', leaseUntil: null },
      });
    }
    return row;
  }
}

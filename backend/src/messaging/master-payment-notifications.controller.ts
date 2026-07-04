import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WebwhatsBridgeService } from './webwhats-bridge.service';

type MercadoPagoApprovedNotificationDto = {
  companyId?: number | string;
  to?: string;
  text?: string;
};

@Controller('master/payment-notifications')
export class MasterPaymentNotificationsController {
  constructor(
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly prisma: PrismaService,
  ) {}

  private assertNotifySecret(secret?: string) {
    const expected = String(process.env.MASTER_PAYMENT_NOTIFY_SECRET || '').trim();
    if (!expected) {
      throw new BadRequestException('MASTER_PAYMENT_NOTIFY_SECRET not configured');
    }
    if (!secret || secret !== expected) {
      throw new ForbiddenException('invalid payment notification secret');
    }
  }

  private normalizeCompanyId(value: unknown) {
    const companyId = Number(value);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('companyId invalido');
    }
    return companyId;
  }

  private normalizeWhatsAppTarget(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      throw new BadRequestException('destinatario invalido');
    }
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  private normalizeText(value: unknown) {
    const text = String(value || '').trim();
    if (!text) {
      throw new BadRequestException('texto da mensagem obrigatorio');
    }
    if (text.length > 4000) {
      throw new BadRequestException('texto da mensagem excede 4000 caracteres');
    }
    return text;
  }

  // E8 (PLAN12062026001): histórico best-effort — falha de log NUNCA
  // bloqueia nem derruba o disparo do aviso (canal de produção).
  private async recordNotificationLog(entry: {
    companyId: number;
    target: string;
    text: string;
    status: 'sent' | 'failed';
    providerMessageId?: string | null;
    errorMessage?: string | null;
  }) {
    try {
      await this.prisma.masterPaymentNotificationLog.create({
        data: {
          companyId: entry.companyId,
          target: entry.target,
          text: entry.text,
          status: entry.status,
          providerMessageId: entry.providerMessageId || null,
          errorMessage: entry.errorMessage || null,
        },
      });
    } catch {
      // tabela indisponível (ambiente sem ensure) — segue sem histórico
    }
  }

  @Post('mercadopago-approved')
  async sendMercadoPagoApprovedNotification(
    @Body() body: MercadoPagoApprovedNotificationDto,
    @Headers('x-master-payment-notify-secret') secret?: string,
  ) {
    this.assertNotifySecret(secret);

    const companyId = this.normalizeCompanyId(body?.companyId);
    const to = this.normalizeWhatsAppTarget(body?.to);
    const text = this.normalizeText(body?.text);
    try {
      const result = await this.webwhatsBridge.sendText(companyId, { to, text });
      await this.recordNotificationLog({
        companyId,
        target: result.target,
        text,
        status: 'sent',
        providerMessageId: result.providerMessageId,
      });

      return {
        ok: true,
        companyId,
        to: result.target,
        providerMessageId: result.providerMessageId,
        rawMessageId: result.rawMessageId,
      };
    } catch (error) {
      await this.recordNotificationLog({
        companyId,
        target: to,
        text,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error || 'falha no envio'),
      });
      throw error;
    }
  }

  // COCKPIT-MASTER Sprint 4 (entrega opcional 4): além do MasterPaymentNotificationLog
  // (tabela antiga, intacta), a janela Pagamentos também enxerga MasterEvent com
  // severity=action_required — são os MESMOS "toque à mão" que hoje só aparecem em
  // e-mail/zap (implantacao.sold, fullplan.requested, bot.config_missing etc.), agora
  // também no histórico. Mapeados pro MESMO shape de NotificationRow do frontend
  // (status sempre 'sent' — evento é informativo, não um disparo que pode falhar).
  // Best-effort: se a consulta de MasterEvent falhar, o histórico antigo segue
  // respondendo normalmente (união silenciosamente vira só a tabela antiga).
  private async fetchActionRequiredEvents(opts: { companyId: number; limit: number }): Promise<Array<{
    id: string;
    companyId: number;
    companyName: string | null;
    target: string;
    text: string;
    status: string;
    providerMessageId: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>> {
    try {
      const events = await this.prisma.masterEvent.findMany({
        where: {
          severity: 'action_required',
          companyId: { not: null },
          ...(opts.companyId > 0 ? { companyId: opts.companyId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: opts.limit,
      });
      if (!events.length) return [];

      const companyIds = Array.from(new Set(events.map((e) => e.companyId).filter((id): id is number => id != null)));
      const companies = companyIds.length
        ? await this.prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
        : [];
      const nameById = new Map(companies.map((c) => [c.id, c.name]));

      return events.map((event) => {
        const payload = this.safeParseEventPayload(event.payloadJson);
        return {
          id: `master-event:${event.id}`,
          companyId: Number(event.companyId || 0),
          companyName: event.companyId ? nameById.get(event.companyId) || null : null,
          target: this.eventTypeLabel(event.type),
          text: this.buildEventText(event.type, payload),
          status: 'sent',
          providerMessageId: null,
          errorMessage: null,
          createdAt: event.createdAt.toISOString(),
        };
      });
    } catch {
      return []; // MasterEvent indisponível neste ambiente — histórico antigo segue sozinho.
    }
  }

  private safeParseEventPayload(payloadJson: string | null): Record<string, unknown> | null {
    if (!payloadJson) return null;
    try {
      const parsed = JSON.parse(payloadJson);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private eventTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'fullplan.requested': 'HBX Full solicitado',
      'implantacao.sold': 'Venda com implantação',
      'bot.config_missing': 'Bot IA sem configuração',
      'chip.dropped': 'Chip do WhatsApp caiu',
      'billing.webhook_stale': 'Webhook de cobrança sem novidade',
    };
    return labels[type] || type;
  }

  private buildEventText(type: string, payload: Record<string, unknown> | null): string {
    const label = this.eventTypeLabel(type);
    if (!payload) return label;
    const lines = Object.entries(payload)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`);
    return [label, ...lines].join('\n');
  }

  // E8: leitura do histórico para a janela Pagamentos do /master.
  @Get('history')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async listNotificationHistory(
    @Query('status') status?: string,
    @Query('companyId') companyId?: string,
    @Query('take') take?: string,
  ) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedCompanyId = Number(companyId || 0) || 0;
    const limit = Math.min(Math.max(Number(take || 100) || 100, 1), 500);
    try {
      const rows = await this.prisma.masterPaymentNotificationLog.findMany({
        where: {
          ...(normalizedStatus && normalizedStatus !== 'all' ? { status: normalizedStatus } : {}),
          ...(normalizedCompanyId > 0 ? { companyId: normalizedCompanyId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      const companyIds = Array.from(new Set(rows.map((row) => row.companyId)));
      const companies = companyIds.length
        ? await this.prisma.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, name: true },
          })
        : [];
      const nameById = new Map(companies.map((company) => [company.id, company.name]));
      const legacyNotifications = rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        companyName: nameById.get(row.companyId) || null,
        target: row.target,
        text: row.text,
        status: row.status,
        providerMessageId: row.providerMessageId,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt.toISOString(),
      }));

      // União com MasterEvent (action_required) SÓ quando o filtro de status
      // não pede algo que só existe na tabela antiga ('failed' não tem
      // equivalente em MasterEvent — evento nunca "falha", é write-through).
      const includeEvents = !normalizedStatus || normalizedStatus === 'all' || normalizedStatus === 'sent';
      const eventNotifications = includeEvents
        ? await this.fetchActionRequiredEvents({ companyId: normalizedCompanyId, limit })
        : [];

      const merged = [...legacyNotifications, ...eventNotifications]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      return {
        ok: true,
        notifications: merged,
      };
    } catch {
      return { ok: false, notifications: [], message: 'Histórico indisponível neste ambiente (tabela ainda não criada).' };
    }
  }
}

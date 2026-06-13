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
      return {
        ok: true,
        notifications: rows.map((row) => ({
          id: row.id,
          companyId: row.companyId,
          companyName: nameById.get(row.companyId) || null,
          target: row.target,
          text: row.text,
          status: row.status,
          providerMessageId: row.providerMessageId,
          errorMessage: row.errorMessage,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    } catch {
      return { ok: false, notifications: [], message: 'Histórico indisponível neste ambiente (tabela ainda não criada).' };
    }
  }
}

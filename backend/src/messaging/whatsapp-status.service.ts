import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWhatsAppCredentials } from './whatsapp-credentials.util';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class WhatsAppStatusService {
  private readonly logger = new Logger(WhatsAppStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get cloudApiBaseUrl(): string {
    return (process.env.WHATSAPP_CLOUD_API_BASE_URL || 'https://graph.facebook.com/v20.0').replace(/\/$/, '');
  }

  async getStatusForCompany(companyId: number, opts?: { refresh?: boolean }) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const creds = resolveWhatsAppCredentials(company);
    const phoneNumberId = String(creds.phoneNumberId || '').trim();
    const token = String(creds.accessToken || '').trim();

    const configured = Boolean(phoneNumberId);
    if (!configured) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          whatsappStatus: 'DISCONNECTED',
          whatsappStatusError: null,
          whatsappStatusUpdatedAt: new Date(),
          whatsappDisplayNumber: null,
        },
      });
      return { configured: false, connected: false, status: 'DISCONNECTED' as const, displayNumber: undefined };
    }

    const cachedStatus = String(company.whatsappStatus || '').trim();
    if (!opts?.refresh && cachedStatus === 'CONNECTED' && company.whatsappStatusUpdatedAt) {
      return {
        configured: true,
        connected: true,
        status: 'CONNECTED' as const,
        displayNumber: company.whatsappDisplayNumber || undefined,
      };
    }

    if (!token) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          whatsappStatus: 'DISCONNECTED',
          whatsappStatusError: 'WhatsApp access token nao configurado',
          whatsappStatusUpdatedAt: new Date(),
        },
      });
      return { configured: true, connected: false, status: 'DISCONNECTED' as const, displayNumber: company.whatsappDisplayNumber || undefined };
    }

    const endpoint = `${this.cloudApiBaseUrl}/${encodeURIComponent(phoneNumberId)}`;
    const params = { fields: 'display_phone_number' };

    try {
      const res = await axios.get(endpoint, {
        timeout: clamp(Number(process.env.WHATSAPP_STATUS_TIMEOUT_MS || '8000'), 1000, 20000),
        headers: { Authorization: `Bearer ${token}` },
        params,
        validateStatus: () => true,
      });

      const ok = res.status >= 200 && res.status < 300;
      if (!ok) {
        const providerError = res.data?.error?.message ? String(res.data.error.message) : `HTTP ${res.status}`;
        await this.prisma.company.update({
          where: { id: companyId },
          data: {
            whatsappStatus: 'ERROR',
            whatsappStatusError: providerError,
            whatsappStatusUpdatedAt: new Date(),
          },
        });
        return {
          configured: true,
          connected: false,
          status: 'ERROR' as const,
          displayNumber: company.whatsappDisplayNumber || undefined,
        };
      }

      const displayPhone = res.data?.display_phone_number ? String(res.data.display_phone_number) : '';
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          whatsappStatus: 'CONNECTED',
          whatsappStatusError: null,
          whatsappStatusUpdatedAt: new Date(),
          whatsappDisplayNumber: displayPhone || company.whatsappDisplayNumber || null,
        },
      });

      return {
        configured: true,
        connected: true,
        status: 'CONNECTED' as const,
        displayNumber: displayPhone || company.whatsappDisplayNumber || undefined,
      };
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Falha ao validar conexao com a Meta';
      this.logger.warn(`WhatsApp status validation failed for companyId=${companyId}: ${msg}`);
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          whatsappStatus: 'ERROR',
          whatsappStatusError: msg,
          whatsappStatusUpdatedAt: new Date(),
        },
      });
      return {
        configured: true,
        connected: false,
        status: 'ERROR' as const,
        displayNumber: company.whatsappDisplayNumber || undefined,
      };
    }
  }

  async ensureConnected(companyId: number) {
    const status = await this.getStatusForCompany(companyId, { refresh: true });
    if (!status.configured) {
      throw new BadRequestException('WhatsApp nao configurado. Defina o whatsappPhoneNumberId da empresa (Meta Cloud API).');
    }
    if (status.status !== 'CONNECTED') {
      const detail = status.status === 'ERROR' ? 'Falha ao validar token/phoneNumberId na Meta' : 'Nao conectado';
      throw new BadRequestException(`WhatsApp nao conectado (${detail}). Conclua o onboarding da empresa antes de enviar.`);
    }
    return status;
  }
}

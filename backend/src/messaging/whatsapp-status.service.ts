import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { pickWhatsAppEndpoint, resolveWhatsAppCredentials } from './whatsapp-credentials.util';
import { applyMasterWhatsAppCredentials } from '../modules/master-global-integrations.util';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class WhatsAppStatusService {
  private readonly logger = new Logger(WhatsAppStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get cloudApiBaseUrl(): string {
    return (process.env.WHATSAPP_CLOUD_API_BASE_URL || 'https://graph.facebook.com/v20.0').replace(
      /\/$/,
      '',
    );
  }

  private async supportsWhatsAppEndpointTable() {
    return this.prisma.hasTable('CompanyWhatsAppEndpoint');
  }

  private async findCompanyForStatus(companyId: number) {
    const supportsEndpointTable = await this.supportsWhatsAppEndpointTable();
    const company = !supportsEndpointTable
      ? await this.prisma.company.findUnique({ where: { id: companyId } })
      : await this.prisma.company.findUnique({
          where: { id: companyId },
          include: {
            whatsappEndpoints: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        });

    const resolved = await applyMasterWhatsAppCredentials(this.prisma, company);
    return resolved.company || null;
  }

  private async validateStatusWithCredentials(input: {
    phoneNumberId: string;
    accessToken: string;
    fallbackDisplayNumber?: string | null;
  }) {
    const endpoint = `${this.cloudApiBaseUrl}/${encodeURIComponent(input.phoneNumberId)}`;
    const params = { fields: 'display_phone_number' };

    try {
      const res = await axios.get(endpoint, {
        timeout: clamp(Number(process.env.WHATSAPP_STATUS_TIMEOUT_MS || '8000'), 1000, 20000),
        headers: { Authorization: `Bearer ${input.accessToken}` },
        params,
        validateStatus: () => true,
      });

      const ok = res.status >= 200 && res.status < 300;
      if (!ok) {
        const providerError = res.data?.error?.message
          ? String(res.data.error.message)
          : `HTTP ${res.status}`;
        return {
          configured: true,
          connected: false,
          status: 'ERROR' as const,
          displayNumber: input.fallbackDisplayNumber || undefined,
          errorMessage: providerError,
        };
      }

      const displayPhone = res.data?.display_phone_number ? String(res.data.display_phone_number) : '';
      return {
        configured: true,
        connected: true,
        status: 'CONNECTED' as const,
        displayNumber: displayPhone || input.fallbackDisplayNumber || undefined,
        errorMessage: null,
      };
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Falha ao validar conexao com a Meta';
      return {
        configured: true,
        connected: false,
        status: 'ERROR' as const,
        displayNumber: input.fallbackDisplayNumber || undefined,
        errorMessage: msg,
      };
    }
  }

  private async syncCompanyStatusFromPrimaryEndpoint(companyId: number) {
    if (!(await this.supportsWhatsAppEndpointTable())) return;
    const company = await this.findCompanyForStatus(companyId);
    if (!company) return;
    const primary = pickWhatsAppEndpoint(company);
    if (!primary) return;

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        whatsappNumber: String(primary.whatsappNumber || '').trim() || null,
        whatsappPhoneNumberId: String(primary.whatsappPhoneNumberId || '').trim() || null,
        whatsappWabaId: String(primary.whatsappWabaId || '').trim() || null,
        whatsappAccessToken: String(primary.whatsappAccessToken || '').trim() || null,
        whatsappDisplayNumber:
          String(primary.whatsappDisplayNumber || '').trim() ||
          String(primary.whatsappNumber || '').trim() ||
          null,
        whatsappStatus: (primary as any).whatsappStatus || 'DISCONNECTED',
        whatsappStatusError: (primary as any).whatsappStatusError || null,
        whatsappStatusUpdatedAt: (primary as any).whatsappStatusUpdatedAt || new Date(),
      },
    });
  }

  async getStatusForCompanyEndpoint(endpointId: string, opts?: { refresh?: boolean }) {
    if (!(await this.supportsWhatsAppEndpointTable())) {
      throw new BadRequestException(
        'A configuracao de multiplos numeros ainda nao esta disponivel neste banco. Publique a migration primeiro.',
      );
    }
    const normalizedEndpointId = String(endpointId || '').trim();
    if (!normalizedEndpointId) throw new BadRequestException('Numero WhatsApp nao encontrado');

    const endpoint = await this.prisma.companyWhatsAppEndpoint.findUnique({
      where: { id: normalizedEndpointId },
    });
    if (!endpoint) throw new BadRequestException('Numero WhatsApp nao encontrado');

    const phoneNumberId = String(endpoint.whatsappPhoneNumberId || '').trim();
    const token = String(endpoint.whatsappAccessToken || '').trim();
    const configured = Boolean(phoneNumberId);
    if (!configured) {
      await this.prisma.companyWhatsAppEndpoint.update({
        where: { id: normalizedEndpointId },
        data: {
          whatsappStatus: 'DISCONNECTED',
          whatsappStatusError: null,
          whatsappStatusUpdatedAt: new Date(),
          whatsappDisplayNumber: null,
        },
      });
      await this.syncCompanyStatusFromPrimaryEndpoint(endpoint.companyId);
      return {
        configured: false,
        connected: false,
        status: 'DISCONNECTED' as const,
        displayNumber: undefined,
      };
    }

    const cachedStatus = String(endpoint.whatsappStatus || '').trim();
    if (!opts?.refresh && cachedStatus === 'CONNECTED' && endpoint.whatsappStatusUpdatedAt) {
      return {
        configured: true,
        connected: true,
        status: 'CONNECTED' as const,
        displayNumber: endpoint.whatsappDisplayNumber || undefined,
      };
    }

    if (!token) {
      await this.prisma.companyWhatsAppEndpoint.update({
        where: { id: normalizedEndpointId },
        data: {
          whatsappStatus: 'DISCONNECTED',
          whatsappStatusError: 'WhatsApp access token nao configurado',
          whatsappStatusUpdatedAt: new Date(),
        },
      });
      await this.syncCompanyStatusFromPrimaryEndpoint(endpoint.companyId);
      return {
        configured: true,
        connected: false,
        status: 'DISCONNECTED' as const,
        displayNumber: endpoint.whatsappDisplayNumber || undefined,
      };
    }

    const result = await this.validateStatusWithCredentials({
      phoneNumberId,
      accessToken: token,
      fallbackDisplayNumber: endpoint.whatsappDisplayNumber || endpoint.whatsappNumber || undefined,
    });

    await this.prisma.companyWhatsAppEndpoint.update({
      where: { id: normalizedEndpointId },
      data: {
        whatsappStatus: result.status,
        whatsappStatusError: result.errorMessage || null,
        whatsappStatusUpdatedAt: new Date(),
        whatsappDisplayNumber:
          result.displayNumber || endpoint.whatsappDisplayNumber || endpoint.whatsappNumber || null,
      },
    });
    await this.syncCompanyStatusFromPrimaryEndpoint(endpoint.companyId);
    return result;
  }

  async getStatusForCompany(companyId: number, opts?: { refresh?: boolean }) {
    const company = await this.findCompanyForStatus(companyId);
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const creds = resolveWhatsAppCredentials(company);
    if (creds.endpointId) {
      return this.getStatusForCompanyEndpoint(creds.endpointId, opts);
    }

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
      return {
        configured: false,
        connected: false,
        status: 'DISCONNECTED' as const,
        displayNumber: undefined,
      };
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
      return {
        configured: true,
        connected: false,
        status: 'DISCONNECTED' as const,
        displayNumber: company.whatsappDisplayNumber || undefined,
      };
    }

    const result = await this.validateStatusWithCredentials({
      phoneNumberId,
      accessToken: token,
      fallbackDisplayNumber: company.whatsappDisplayNumber || company.whatsappNumber || undefined,
    });

    if (result.status === 'ERROR' && result.errorMessage) {
      this.logger.warn(
        `WhatsApp status validation failed for companyId=${companyId}: ${result.errorMessage}`,
      );
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        whatsappStatus: result.status,
        whatsappStatusError: result.errorMessage || null,
        whatsappStatusUpdatedAt: new Date(),
        whatsappDisplayNumber: result.displayNumber || company.whatsappDisplayNumber || null,
      },
    });

    return result;
  }

  async ensureConnected(
    companyId: number,
    opts?: { endpointId?: string; preferredModuleKey?: string; sourceModule?: string },
  ) {
    const company = await this.findCompanyForStatus(companyId);
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const creds = resolveWhatsAppCredentials(company, opts);
    const status = creds.endpointId
      ? await this.getStatusForCompanyEndpoint(creds.endpointId, { refresh: true })
      : await this.getStatusForCompany(companyId, { refresh: true });
    if (!status.configured) {
      throw new BadRequestException(
        'WhatsApp nao configurado. Defina um numero ativo da Meta no MASTER.',
      );
    }
    if (status.status !== 'CONNECTED') {
      const detail =
        status.status === 'ERROR' ? 'Falha ao validar token/phoneNumberId na Meta' : 'Nao conectado';
      throw new BadRequestException(
        `WhatsApp nao conectado (${detail}). Conclua o onboarding da empresa antes de enviar.`,
      );
    }
    return status;
  }
}

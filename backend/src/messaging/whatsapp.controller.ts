import { BadRequestException, Body, Controller, ForbiddenException, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Admin } from '../auth/admin.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';
import { WhatsAppStatusService } from './whatsapp-status.service';
import { WhatsAppAuditService } from './whatsapp-audit.service';

class UpdateWhatsAppConfigDto {
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  whatsappAccessToken?: string;
}

class SendTestMessageDto {
  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @IsIn(['text', 'template'])
  messageType?: 'text' | 'template';

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  templateComponents?: unknown[];

  @IsOptional()
  @IsString()
  sourceModule?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('atendimento')
export class WhatsAppController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly prisma: PrismaService,
    private readonly whatsappStatus: WhatsAppStatusService,
    private readonly whatsappAudit: WhatsAppAuditService,
  ) {}

  private requireCompanyId(req: any): number {
    const companyId = Number(req?.user?.companyId || 0);
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  private ensureMasterOnly(req: any) {
    if (!req?.user?.isSystemMaster) {
      throw new ForbiddenException('Configuracao WhatsApp centralizada no MASTER.');
    }
  }

  private async buildConfigPayload(companyId: number, opts?: { refresh?: boolean }) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ForbiddenException('Company not found');

    const status = await this.whatsappStatus.getStatusForCompany(companyId, { refresh: Boolean(opts?.refresh) });
    return {
      whatsappNumber: company.whatsappNumber || null,
      whatsappPhoneNumberId: company.whatsappPhoneNumberId || null,
      accessTokenConfigured: Boolean(company.whatsappAccessToken),
      accessTokenPreview: company.whatsappAccessToken ? `***${String(company.whatsappAccessToken).slice(-6)}` : null,
      status: status.status,
      connected: Boolean(status.connected),
      displayNumber: status.displayNumber || null,
      statusError: company.whatsappStatusError || null,
      lastValidatedAt: company.whatsappStatusUpdatedAt,
    };
  }

  @Post('send')
  @ModuleAccess('atendimento', 'webscraping', 'follow_up_internacional')
  async send(@Req() req: any, @Body() dto: SendTestMessageDto) {
    const companyId = this.requireCompanyId(req);
    const sourceModule = String(dto.sourceModule || 'atendimento').trim().toLowerCase() || 'atendimento';
    try {
      return await this.conversations.queueOutboundForCompany(companyId, {
        to: dto.to,
        body: dto.body,
        messageType: dto.messageType,
        templateName: dto.templateName,
        templateLanguage: dto.templateLanguage,
        templateComponents: dto.templateComponents,
        sourceModule,
        contactId: dto.contactId,
      });
    } catch (e: any) {
      const message = String(e?.message || '').toLowerCase();
      const needsTemplate = message.includes('24h') || message.includes('template');
      if (!needsTemplate) throw e;

      const fallbackCandidatesByModule: Record<string, Array<{ name: string; language: string }>> = {
        webscraping: [
          {
            name: String(process.env.WHATSAPP_WEBSCRAPING_TEMPLATE_NAME || '').trim(),
            language: String(process.env.WHATSAPP_WEBSCRAPING_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
          },
          {
            name: String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME || '').trim(),
            language: String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
          },
        ],
        hbx_recovery: [
          {
            name: String(process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_NAME || '').trim(),
            language: String(process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
          },
          {
            name: String(process.env.WHATSAPP_SUPPORT_TEMPLATE_NAME || '').trim(),
            language: String(process.env.WHATSAPP_SUPPORT_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
          },
          {
            name: String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME || '').trim(),
            language: String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
          },
        ],
      };
      const fallbackCandidates = (fallbackCandidatesByModule[sourceModule] || []).filter((item) => item.name);
      const fallback = fallbackCandidates[0];
      if (!fallback?.name) {
        throw new BadRequestException(
          sourceModule === 'hbx_recovery'
            ? 'Fora da janela de 24h. Configure WHATSAPP_HBX_RECOVERY_TEMPLATE_NAME com um template aprovado na Meta.'
            : 'Fora da janela de 24h. Configure um template aprovado na Meta para este modulo.',
        );
      }

      return this.conversations.queueOutboundForCompany(companyId, {
        to: dto.to,
        body: dto.body,
        messageType: 'template',
        templateName: fallback.name,
        templateLanguage: fallback.language,
        sourceModule,
        contactId: dto.contactId,
      });
    }
  }

  @Get('config')
  async getConfig(@Req() req: any, @Query('refresh') refresh?: string) {
    this.ensureMasterOnly(req);
    const companyId = this.requireCompanyId(req);
    const shouldRefresh = String(refresh || '').trim().toLowerCase() === 'true';
    return this.buildConfigPayload(companyId, { refresh: shouldRefresh });
  }

  @Patch('config')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
  @Admin()
  async updateConfig(@Req() req: any, @Body() dto: UpdateWhatsAppConfigDto) {
    this.ensureMasterOnly(req);
    const companyId = this.requireCompanyId(req);
    const data: any = {};

    if (dto.whatsappNumber !== undefined) data.whatsappNumber = String(dto.whatsappNumber || '').trim() || null;
    if (dto.whatsappPhoneNumberId !== undefined) data.whatsappPhoneNumberId = String(dto.whatsappPhoneNumberId || '').trim() || null;
    if (dto.whatsappAccessToken !== undefined) data.whatsappAccessToken = String(dto.whatsappAccessToken || '').trim() || null;
    data.whatsappStatus = 'DISCONNECTED';
    data.whatsappStatusError = null;
    data.whatsappStatusUpdatedAt = new Date();
    if (dto.whatsappNumber !== undefined) data.whatsappDisplayNumber = data.whatsappNumber;

    await this.prisma.company.update({ where: { id: companyId }, data });
    await this.whatsappAudit.log({
      companyId,
      scope: 'onboarding',
      event: 'config_updated',
      message: 'Configuracao de WhatsApp atualizada pela empresa',
      metadata: {
        hasPhoneNumberId: data.whatsappPhoneNumberId !== undefined ? Boolean(data.whatsappPhoneNumberId) : undefined,
        hasAccessToken: data.whatsappAccessToken !== undefined ? Boolean(data.whatsappAccessToken) : undefined,
        whatsappNumber: data.whatsappNumber ?? undefined,
      },
    });

    return this.buildConfigPayload(companyId, { refresh: false });
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
  @Admin()
  async validateCredentials(@Req() req: any) {
    this.ensureMasterOnly(req);
    const companyId = this.requireCompanyId(req);
    const status = await this.whatsappStatus.getStatusForCompany(companyId, { refresh: true });
    await this.whatsappAudit.log({
      companyId,
      scope: 'onboarding',
      event: status.connected ? 'credentials_valid' : 'credentials_invalid',
      level: status.connected ? 'INFO' : 'WARN',
      message: status.connected ? 'Credenciais WhatsApp validadas com sucesso' : 'Falha ao validar credenciais WhatsApp',
      metadata: {
        status: status.status,
        connected: status.connected,
        displayNumber: status.displayNumber || null,
      },
    });

    return this.buildConfigPayload(companyId, { refresh: false });
  }

  @Post('test')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
  @Admin()
  async sendTestMessage(@Req() req: any, @Body() dto: SendTestMessageDto) {
    this.ensureMasterOnly(req);
    const companyId = this.requireCompanyId(req);
    const queued = await this.conversations.queueOutboundForCompany(companyId, {
      to: dto.to,
      body: dto.body || 'Teste de integracao WhatsApp HBX',
      messageType: dto.messageType || 'text',
      templateName: dto.templateName,
      templateLanguage: dto.templateLanguage,
      templateComponents: dto.templateComponents,
      sourceModule: 'onboarding_test',
    });

    await this.whatsappAudit.log({
      companyId,
      scope: 'onboarding',
      event: 'test_message_queued',
      message: `Mensagem teste enfileirada para ${dto.to}`,
      metadata: {
        outboundMessageId: queued.outboundMessageId,
        conversationId: queued.conversationId,
        messageType: dto.messageType || 'text',
      },
    });

    return queued;
  }

  @Get('logs')
  async listLogs(@Req() req: any, @Query('take') takeRaw?: string) {
    this.ensureMasterOnly(req);
    const companyId = this.requireCompanyId(req);
    const take = Math.min(Math.max(Number(takeRaw || 50) || 50, 1), 200);

    const [audit, outbound] = await Promise.all([
      this.prisma.whatsAppAuditLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.outboundMessage.findMany({
        where: { companyId },
        orderBy: { id: 'desc' },
        take,
        select: {
          id: true,
          companyId: true,
          contactId: true,
          to: true,
          body: true,
          messageType: true,
          templateName: true,
          templateLanguage: true,
          templateComponents: true,
          sourceModule: true,
          status: true,
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
          lastError: true,
          provider: true,
          providerMessageId: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          failedAt: true,
          deliveryStatus: true,
          createdAt: true,
          attempts: { orderBy: { id: 'desc' }, take: 5 },
        },
      }),
    ]);

    return { audit, outbound };
  }
}

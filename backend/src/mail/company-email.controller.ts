import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CompanyEmailSettingsService } from './company-email-settings.service';
import { CompanyEmailTemplateService } from './company-email-template.service';
import { CompanyMailerService } from './company-mailer.service';
import { EmailTemplateService, EmailTemplateVariables } from './email-template.service';
import { BUSINESS_CARD_CID, HbxPresentationEmailService } from './hbx-presentation-email.service';
import { MailAttachment } from './mail.service';

// PR12062026005: módulo E-mail da EMPRESA (todo admin). Espelha o contrato da
// janela do Master, mas 100% escopado pelo companyId do token — nenhum
// endpoint master é tocado. Envio sempre pelo CompanyMailerService.

const COMPANY_PPTX_LIMIT_BYTES = 25 * 1024 * 1024;
const COMPANY_BUSINESS_CARD_LIMIT_BYTES = 10 * 1024 * 1024;

class SaveCompanyEmailSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  smtpHost?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  smtpPort?: number | null;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  smtpUser?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpPass?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fromEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  replyTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  testEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sampleName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  sampleCompany?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  welcomeTemplateKind?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  onboardingTemplateKind?: string | null;
}

class CreateCompanyTemplateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  text?: string;
}

class SaveCompanyTemplateDto {
  @IsString()
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MaxLength(12000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  html?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

class TestCompanyTemplateDto {
  @IsEmail()
  @MaxLength(180)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sampleName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  sampleCompany?: string | null;
}

class SendCompanyEmailDto {
  @IsString()
  @MaxLength(120)
  templateKind!: string;

  @IsString()
  @MaxLength(120)
  recipientName!: string;

  @IsEmail()
  @MaxLength(180)
  recipientEmail!: string;
}

@Controller('company-email')
@UseGuards(JwtAuthGuard, RolesGuard)
@Admin()
export class CompanyEmailController {
  constructor(
    private readonly settingsService: CompanyEmailSettingsService,
    private readonly templatesService: CompanyEmailTemplateService,
    private readonly companyMailer: CompanyMailerService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly hbxPresentationEmails: HbxPresentationEmailService,
  ) {}

  private companyIdOf(req: any) {
    const companyId = Math.trunc(Number(req?.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Contexto de empresa obrigatório.');
    return companyId;
  }

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
  }

  private buildSampleVariables(input?: { to?: string | null; sampleName?: string | null; sampleCompany?: string | null }): EmailTemplateVariables {
    const appUrl = this.buildAppUrl();
    const sampleName = String(input?.sampleName || '').trim() || 'Amanda';
    const sampleCompany = String(input?.sampleCompany || '').trim() || 'Empresa Teste';
    const sampleEmail = String(input?.to || 'cliente@empresa.com.br').trim().toLowerCase();
    return {
      nome: sampleName,
      email: sampleEmail,
      empresa: sampleCompany,
      vendedor: sampleName,
      acesso: sampleEmail,
      senha: 'Tmp@ExemploA1',
      emailvendedor: sampleEmail,
      senhavendedor: 'Tmp@ExemploA1',
      comissao: '20%',
      comissaoheranca: '2%',
      diascomissao: 3,
      linkAcesso: `${appUrl}/login`,
      linkMobile: `${appUrl}/mobile/login`,
      linkRecuperacao: `${appUrl}/reset-password?token=exemplo`,
      linkConfirmacao: `${appUrl}/hbx-vendedor/onboarding?token=exemplo`,
      tipoAcesso: 'vendedor',
      nomecard: sampleCompany,
      telefonecard: '(11) 99999-0000',
      emailcard: sampleEmail,
      cidadecard: 'São Paulo',
      estadocard: 'SP',
      segmentocard: 'serviços locais',
      responsavelcard: sampleName,
      observacaocard: 'Exemplo de observação do card.',
    };
  }

  private async buildBusinessCardAttachment(companyId: number) {
    const asset = await this.settingsService.readAssetContent(companyId, 'business_card');
    if (!asset) return { attachments: [] as MailAttachment[], appendHtml: null as string | null };
    const base = {
      filename: asset.meta.originalName || 'cartao-visitas.png',
      content: asset.content,
      contentType: asset.contentType,
    };
    // O cartão vai DUAS vezes: como anexo de verdade (paperclip) e inline (CID) na assinatura do HTML.
    return {
      attachments: [
        { ...base } satisfies MailAttachment,
        { ...base, cid: BUSINESS_CARD_CID } satisfies MailAttachment,
      ] as MailAttachment[],
      appendHtml: this.hbxPresentationEmails.buildBusinessCardHtml(),
    };
  }

  @Get()
  async getState(@Req() req: any) {
    const companyId = this.companyIdOf(req);
    const state = await this.settingsService.getPublicState(companyId);
    return {
      ...state,
      attachment: await this.settingsService.readAssetMeta(companyId, 'presentation_pptx'),
      businessCard: await this.settingsService.readAssetMeta(companyId, 'business_card'),
    };
  }

  @Put('settings')
  async saveSettings(@Req() req: any, @Body() dto: SaveCompanyEmailSettingsDto) {
    const companyId = this.companyIdOf(req);
    const state = await this.settingsService.save(companyId, dto || {});
    return { ok: true, ...state };
  }

  @Get('templates')
  async listTemplates(@Req() req: any) {
    const companyId = this.companyIdOf(req);
    return { templates: await this.templatesService.list(companyId) };
  }

  @Post('templates')
  async createTemplate(@Req() req: any, @Body() dto: CreateCompanyTemplateDto) {
    const companyId = this.companyIdOf(req);
    const template = await this.templatesService.create(companyId, dto || ({} as CreateCompanyTemplateDto));
    return { ok: true, template };
  }

  @Put('templates/:kind')
  async saveTemplate(@Req() req: any, @Param('kind') kind: string, @Body() dto: SaveCompanyTemplateDto) {
    const companyId = this.companyIdOf(req);
    const template = await this.templatesService.save(companyId, kind, dto || ({} as SaveCompanyTemplateDto));
    return { ok: true, template };
  }

  @Delete('templates/:kind')
  async deleteTemplate(@Req() req: any, @Param('kind') kind: string) {
    const companyId = this.companyIdOf(req);
    return this.templatesService.remove(companyId, kind);
  }

  @Post('templates/:kind/restore')
  async restoreTemplate(@Req() req: any, @Param('kind') kind: string) {
    const companyId = this.companyIdOf(req);
    const template = await this.templatesService.restore(companyId, kind);
    return { ok: true, template };
  }

  @Post('templates/:kind/test')
  async sendTemplateTest(@Req() req: any, @Param('kind') kind: string, @Body() dto: TestCompanyTemplateDto) {
    const companyId = this.companyIdOf(req);
    const to = String(dto?.to || '').trim().toLowerCase();
    if (!to) throw new BadRequestException('Informe o e-mail de teste.');

    const row = await this.templatesService.getSafe(companyId, kind);
    const variables = this.buildSampleVariables({ to, sampleName: dto?.sampleName, sampleCompany: dto?.sampleCompany });
    const card = await this.buildBusinessCardAttachment(companyId);
    const rendered = this.templatesService.renderRow(row, variables, { appendHtml: card.appendHtml });

    const attachments: MailAttachment[] = [...card.attachments];
    const delivery = await this.companyMailer.sendForCompany(companyId, {
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments,
    });
    if (!delivery.ok && delivery.errorCode === 'COMPANY_EMAIL_NOT_CONFIGURED') {
      throw new BadRequestException(delivery.errorMessage || 'E-mail da empresa não configurado.');
    }
    return { ok: delivery.ok, sentAt: new Date().toISOString(), delivery };
  }

  @Post('attachment')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: COMPANY_PPTX_LIMIT_BYTES } }))
  async uploadAttachment(@Req() req: any, @UploadedFile() file?: any) {
    const companyId = this.companyIdOf(req);
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo PPTX.');
    const originalName = this.hbxPresentationEmails.normalizeUploadedOriginalName(file.originalname, 'apresentacao.pptx');
    if (extname(originalName).toLowerCase() !== '.pptx') {
      throw new BadRequestException('O anexo precisa ser um arquivo .pptx.');
    }
    const attachment = await this.settingsService.saveAsset(companyId, 'presentation_pptx', {
      content: Buffer.from(file.buffer),
      originalName,
      mimeType: file.mimetype || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    return { ok: true, attachment };
  }

  @Delete('attachment')
  async deleteAttachment(@Req() req: any) {
    const companyId = this.companyIdOf(req);
    await this.settingsService.deleteAsset(companyId, 'presentation_pptx');
    return { ok: true, attachment: null };
  }

  @Post('business-card')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: COMPANY_BUSINESS_CARD_LIMIT_BYTES } }))
  async uploadBusinessCard(@Req() req: any, @UploadedFile() file?: any) {
    const companyId = this.companyIdOf(req);
    if (!file?.buffer?.length) throw new BadRequestException('Cole ou envie uma imagem do cartão de visitas.');
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      throw new BadRequestException('O cartão precisa ser PNG, JPG ou WEBP.');
    }
    const originalName = this.hbxPresentationEmails.normalizeUploadedOriginalName(file.originalname, 'cartao-visitas.png');
    const businessCard = await this.settingsService.saveAsset(companyId, 'business_card', {
      content: Buffer.from(file.buffer),
      originalName,
      mimeType,
    });
    return { ok: true, businessCard };
  }

  @Delete('business-card')
  async deleteBusinessCard(@Req() req: any) {
    const companyId = this.companyIdOf(req);
    await this.settingsService.deleteAsset(companyId, 'business_card');
    return { ok: true, businessCard: null };
  }

  @Post('send')
  async sendCompanyEmail(@Req() req: any, @Body() dto: SendCompanyEmailDto) {
    const companyId = this.companyIdOf(req);
    const row = await this.templatesService.getSafe(companyId, dto.templateKind);
    const card = await this.buildBusinessCardAttachment(companyId);
    const rendered = this.templatesService.renderRow(
      row,
      {
        ...this.buildSampleVariables({ to: dto.recipientEmail }),
        nome: dto.recipientName,
        email: dto.recipientEmail.toLowerCase(),
        empresa: '',
      },
      { appendHtml: card.appendHtml },
    );

    const attachments: MailAttachment[] = [];
    const pptx = await this.settingsService.readAssetContent(companyId, 'presentation_pptx');
    if (pptx) {
      attachments.push({
        filename: pptx.meta.originalName || 'apresentacao.pptx',
        content: pptx.content,
        contentType: pptx.contentType,
      });
    }
    attachments.push(...card.attachments);

    const delivery = await this.companyMailer.sendForCompany(companyId, {
      to: dto.recipientEmail.toLowerCase(),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments,
    });
    if (!delivery.ok && delivery.errorCode === 'COMPANY_EMAIL_NOT_CONFIGURED') {
      throw new BadRequestException(delivery.errorMessage || 'E-mail da empresa não configurado.');
    }
    return { ok: delivery.ok, delivery };
  }
}

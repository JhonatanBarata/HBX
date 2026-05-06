import {
  BadRequestException,
  Body,
  Controller,
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
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { EmailTemplate, EmailTemplateKind, EmailTemplateService } from './email-template.service';
import {
  ATTACHMENT_DIR,
  ATTACHMENT_META_PATH,
  ATTACHMENT_PATH,
  BUSINESS_CARD_CID,
  BUSINESS_CARD_META_PATH,
  BUSINESS_CARD_PATH,
  HbxPresentationEmailService,
  type AttachmentMeta,
} from './hbx-presentation-email.service';
import { MailAttachment } from './mail.service';

const MASTER_PPTX_LIMIT_BYTES = 50 * 1024 * 1024;
const MASTER_BUSINESS_CARD_LIMIT_BYTES = 15 * 1024 * 1024;

class SendMasterEmailDto {
  @IsString()
  @MaxLength(120)
  recipientName!: string;

  @IsEmail()
  @MaxLength(180)
  recipientEmail!: string;

  @IsString()
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MaxLength(8000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  html?: string | null;
}

class SaveEmailTemplateDto {
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
}

class TestEmailTemplateDto {
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

@Controller('master/email')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterEmailController {
  constructor(
    private readonly hbxPresentationEmails: HbxPresentationEmailService,
    private readonly emailTemplates: EmailTemplateService,
  ) {}

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
  }

  private formatTemplate(template: EmailTemplate) {
    return {
      ...template,
      variables: this.emailTemplates.getAvailableVariables(template.kind),
      requiredVariable: this.emailTemplates.getRequiredVariable(template.kind),
      usesSignature: template.kind === 'normal',
      usesAttachment: template.kind === 'normal',
    };
  }

  private buildSampleVariables(kind: EmailTemplateKind, dto?: TestEmailTemplateDto) {
    const appUrl = this.buildAppUrl();
    const sampleName = this.hbxPresentationEmails.normalizeName(dto?.sampleName) || 'Amanda';
    const sampleCompany = this.hbxPresentationEmails.normalizeName(dto?.sampleCompany) || 'Empresa Teste';
    return {
      nome: sampleName,
      email: String(dto?.to || 'cliente@empresa.com.br').trim().toLowerCase(),
      empresa: sampleCompany,
      linkRecuperacao: `${appUrl}/reset-password?token=exemplo`,
      linkConfirmacao: `${appUrl}/confirm-email?token=exemplo`,
      ano: new Date().getFullYear(),
    };
  }

  @Get('templates')
  async listTemplates() {
    const templates = await this.emailTemplates.listTemplates();
    return {
      templates: templates.map((template) => this.formatTemplate(template)),
    };
  }

  @Get('templates/:kind')
  async getTemplate(@Param('kind') kindParam: string) {
    const kind = this.emailTemplates.normalizeKind(kindParam);
    return { template: this.formatTemplate(await this.emailTemplates.getTemplate(kind)) };
  }

  @Put('templates/:kind')
  async saveTemplate(@Param('kind') kindParam: string, @Body() dto: SaveEmailTemplateDto) {
    const kind = this.emailTemplates.normalizeKind(kindParam);
    const template = await this.emailTemplates.saveTemplate(kind, dto);
    return { ok: true, template: this.formatTemplate(template) };
  }

  @Post('templates/:kind/restore')
  async restoreTemplate(@Param('kind') kindParam: string) {
    const kind = this.emailTemplates.normalizeKind(kindParam);
    const template = await this.emailTemplates.restoreTemplate(kind);
    return { ok: true, template: this.formatTemplate(template) };
  }

  @Post('templates/:kind/test')
  async sendTemplateTest(@Param('kind') kindParam: string, @Body() dto: TestEmailTemplateDto) {
    const kind = this.emailTemplates.normalizeKind(kindParam);
    const to = String(dto.to || '').trim().toLowerCase();
    if (!to) throw new BadRequestException('Informe o e-mail de teste.');

    const template = await this.emailTemplates.getTemplate(kind);
    this.emailTemplates.validateTemplateInput(kind, template.subject, template.text);
    const variables = this.buildSampleVariables(kind, dto);
    const businessCardMeta = kind === 'normal' ? await this.hbxPresentationEmails.readBusinessCardMeta(false) : null;
    const hasBusinessCard = Boolean(businessCardMeta) && existsSync(BUSINESS_CARD_PATH);
    const rendered = this.emailTemplates.renderTemplate(template, variables, {
      appendHtml: hasBusinessCard ? this.hbxPresentationEmails.buildBusinessCardHtml() : null,
    });
    const attachments: MailAttachment[] = [];

    if (hasBusinessCard && businessCardMeta) {
      attachments.push({
        filename: businessCardMeta.originalName || 'cartao-visitas.png',
        content: await readFile(BUSINESS_CARD_PATH),
        contentType: businessCardMeta.mimeType || 'image/png',
        cid: BUSINESS_CARD_CID,
      });
    }

    const delivery = await this.hbxPresentationEmails.sendRawMail({
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments,
    });

    return {
      ok: delivery.ok,
      sentAt: new Date().toISOString(),
      delivery,
    };
  }

  @Get()
  async getMasterEmailState() {
    const config = this.hbxPresentationEmails.getConfigurationSummary();
    const template = await this.emailTemplates.getTemplate('normal');
    return {
      subject: template.subject,
      template: template.text,
      preview: this.emailTemplates.renderString(template.text, { nome: 'Amanda' }),
      html: template.html || null,
      variables: this.emailTemplates.getAvailableVariables('normal'),
      sender: {
        from: config.from || 'HBX <jhonatan@hbxsystem.com.br>',
        replyTo: config.replyTo || null,
        ready: config.ready,
        mode: config.mode,
        missing: config.missing,
      },
      attachment: await this.hbxPresentationEmails.readAttachmentMeta(),
      businessCard: await this.hbxPresentationEmails.readBusinessCardMeta(true),
    };
  }

  @Post('attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MASTER_PPTX_LIMIT_BYTES },
    }),
  )
  async uploadAttachment(@UploadedFile() file?: any) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo PPTX.');
    }
    const originalName = this.hbxPresentationEmails.normalizeUploadedOriginalName(file.originalname, 'apresentacao-hbx.pptx');
    if (extname(originalName).toLowerCase() !== '.pptx') {
      throw new BadRequestException('O anexo precisa ser um arquivo .pptx.');
    }
    await mkdir(ATTACHMENT_DIR, { recursive: true });
    await writeFile(ATTACHMENT_PATH, file.buffer);
    const meta: AttachmentMeta = {
      originalName,
      uploadedAt: new Date().toISOString(),
      size: Number(file.size || file.buffer.length || 0),
    };
    await writeFile(ATTACHMENT_META_PATH, JSON.stringify(meta, null, 2), 'utf8');
    return { ok: true, attachment: await this.hbxPresentationEmails.readAttachmentMeta() };
  }

  @Post('business-card')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MASTER_BUSINESS_CARD_LIMIT_BYTES },
    }),
  )
  async uploadBusinessCard(@UploadedFile() file?: any) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Cole ou envie uma imagem do cartão de visitas.');
    }

    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      throw new BadRequestException('O cartão precisa ser PNG, JPG ou WEBP.');
    }

    const originalName = this.hbxPresentationEmails.normalizeUploadedOriginalName(file.originalname, 'cartao-visitas.png');
    await mkdir(ATTACHMENT_DIR, { recursive: true });
    await writeFile(BUSINESS_CARD_PATH, file.buffer);
    const meta: AttachmentMeta = {
      originalName,
      uploadedAt: new Date().toISOString(),
      size: Number(file.size || file.buffer.length || 0),
      mimeType,
    };
    await writeFile(BUSINESS_CARD_META_PATH, JSON.stringify(meta, null, 2), 'utf8');
    return { ok: true, businessCard: await this.hbxPresentationEmails.readBusinessCardMeta(true) };
  }

  @Post('send')
  async sendPresentationEmail(@Req() req: any, @Body() dto: SendMasterEmailDto) {
    return this.hbxPresentationEmails.sendPresentationToContact({
      userId: Number(req.user?.id || 0) || null,
      recipientName: dto.recipientName,
      recipientEmail: dto.recipientEmail,
      subject: dto.subject,
      text: dto.text,
      html: dto.html,
      source: 'master',
    });
  }
}

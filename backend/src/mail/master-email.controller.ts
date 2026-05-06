import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
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
import { extname, join } from 'path';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { EmailTemplate, EmailTemplateKind, EmailTemplateService } from './email-template.service';
import { MailAttachment, MailService } from './mail.service';

const ATTACHMENT_DIR = join(process.cwd(), 'storage', 'master-email');
const ATTACHMENT_PATH = join(ATTACHMENT_DIR, 'apresentacao-hbx.pptx');
const ATTACHMENT_META_PATH = join(ATTACHMENT_DIR, 'apresentacao-hbx.json');
const BUSINESS_CARD_PATH = join(ATTACHMENT_DIR, 'cartao-visitas');
const BUSINESS_CARD_META_PATH = join(ATTACHMENT_DIR, 'cartao-visitas.json');
const MASTER_PPTX_LIMIT_BYTES = 50 * 1024 * 1024;
const MASTER_BUSINESS_CARD_LIMIT_BYTES = 15 * 1024 * 1024;
const BUSINESS_CARD_CID = 'hbx-business-card';

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

type AttachmentMeta = {
  originalName: string;
  uploadedAt: string;
  size: number;
  mimeType?: string;
  previewDataUrl?: string;
};

@Controller('master/email')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterEmailController {
  private readonly logger = new Logger(MasterEmailController.name);

  constructor(
    private readonly mailService: MailService,
    private readonly emailTemplates: EmailTemplateService,
  ) {}

  private normalizeName(value: unknown) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  private buildBusinessCardHtml() {
    return `<img src="cid:${BUSINESS_CARD_CID}" alt="Cartão de visitas" style="display:block;max-width:100%;width:auto;height:auto;border:0;outline:none;text-decoration:none">`;
  }

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
  }

  private async readAttachmentMeta() {
    if (!existsSync(ATTACHMENT_PATH)) return null;
    const fileStat = await stat(ATTACHMENT_PATH);
    let meta: Partial<AttachmentMeta> = {};
    if (existsSync(ATTACHMENT_META_PATH)) {
      try {
        meta = JSON.parse(await readFile(ATTACHMENT_META_PATH, 'utf8'));
      } catch {
        meta = {};
      }
    }
    return {
      originalName: this.normalizeUploadedOriginalName(meta.originalName, 'apresentacao-hbx.pptx'),
      uploadedAt: String(meta.uploadedAt || fileStat.mtime.toISOString()),
      size: Number(meta.size || fileStat.size || 0),
    };
  }

  private async readBusinessCardMeta(includePreview = false) {
    if (!existsSync(BUSINESS_CARD_PATH)) return null;
    const fileStat = await stat(BUSINESS_CARD_PATH);
    let meta: Partial<AttachmentMeta> = {};
    if (existsSync(BUSINESS_CARD_META_PATH)) {
      try {
        meta = JSON.parse(await readFile(BUSINESS_CARD_META_PATH, 'utf8'));
      } catch {
        meta = {};
      }
    }
    const mimeType = String(meta.mimeType || 'image/png');
    const card: AttachmentMeta = {
      originalName: this.normalizeUploadedOriginalName(meta.originalName, 'cartao-visitas.png'),
      uploadedAt: String(meta.uploadedAt || fileStat.mtime.toISOString()),
      size: Number(meta.size || fileStat.size || 0),
      mimeType,
    };
    if (includePreview) {
      const content = await readFile(BUSINESS_CARD_PATH);
      card.previewDataUrl = `data:${mimeType};base64,${content.toString('base64')}`;
    }
    return card;
  }

  private normalizeUploadedOriginalName(value: unknown, fallback: string) {
    const raw = String(value || fallback || '')
      .replace(/[\\/]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || fallback;
    if (!/[ÃÂ]/.test(raw)) return raw;

    const decoded = Buffer.from(raw, 'latin1').toString('utf8').trim();
    return decoded && !decoded.includes('�') ? decoded : raw;
  }

  private buildDeliveryErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();
    if (normalized.includes('domain is not verified') || normalized.includes('verify your domain')) {
      return 'O provedor de e-mail recusou o remetente configurado. Use um domínio verificado no Resend ou ajuste MAIL_FROM no servidor.';
    }
    if (normalized.includes('too large') || normalized.includes('size') || normalized.includes('attachment')) {
      return 'O provedor de e-mail recusou o envio por tamanho de anexo. Reduza o PPTX ou use um link público.';
    }
    if (normalized.includes('configuration') || normalized.includes('not configured') || normalized.includes('missing')) {
      return 'Configuração de e-mail incompleta no servidor. Verifique SMTP/Resend antes de enviar.';
    }
    return 'Falha no provedor de e-mail. Verifique a configuração SMTP/Resend e tente novamente.';
  }

  private async sendMasterMail(input: Parameters<MailService['sendMail']>[0]) {
    try {
      return await this.mailService.sendMail(input);
    } catch (error) {
      this.logger.error(
        `Master email delivery failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(this.buildDeliveryErrorMessage(error));
    }
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
    const sampleName = this.normalizeName(dto?.sampleName) || 'Amanda';
    const sampleCompany = this.normalizeName(dto?.sampleCompany) || 'Empresa Teste';
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
    const businessCardMeta = kind === 'normal' ? await this.readBusinessCardMeta(false) : null;
    const hasBusinessCard = Boolean(businessCardMeta) && existsSync(BUSINESS_CARD_PATH);
    const rendered = this.emailTemplates.renderTemplate(template, variables, {
      appendHtml: hasBusinessCard ? this.buildBusinessCardHtml() : null,
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

    const delivery = await this.sendMasterMail({
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
    const config = this.mailService.getConfigurationSummary();
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
      attachment: await this.readAttachmentMeta(),
      businessCard: await this.readBusinessCardMeta(true),
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
    const originalName = this.normalizeUploadedOriginalName(file.originalname, 'apresentacao-hbx.pptx');
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
    return { ok: true, attachment: await this.readAttachmentMeta() };
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

    const originalName = this.normalizeUploadedOriginalName(file.originalname, 'cartao-visitas.png');
    await mkdir(ATTACHMENT_DIR, { recursive: true });
    await writeFile(BUSINESS_CARD_PATH, file.buffer);
    const meta: AttachmentMeta = {
      originalName,
      uploadedAt: new Date().toISOString(),
      size: Number(file.size || file.buffer.length || 0),
      mimeType,
    };
    await writeFile(BUSINESS_CARD_META_PATH, JSON.stringify(meta, null, 2), 'utf8');
    return { ok: true, businessCard: await this.readBusinessCardMeta(true) };
  }

  @Post('send')
  async sendPresentationEmail(@Req() req: any, @Body() dto: SendMasterEmailDto) {
    const recipientName = this.normalizeName(dto.recipientName);
    const recipientEmail = String(dto.recipientEmail || '').trim().toLowerCase();
    const subject = String(dto.subject || '').replace(/\s+/g, ' ').trim();
    const text = String(dto.text || '').replace(/\r\n/g, '\n').trim();
    const html = String(dto.html || '').trim();
    if (!recipientName) throw new BadRequestException('Informe o nome do contato.');
    if (!recipientEmail) throw new BadRequestException('Informe o e-mail do contato.');
    if (!subject) throw new BadRequestException('Informe o assunto do e-mail.');
    if (!text) throw new BadRequestException('Informe a mensagem do e-mail.');
    if (!existsSync(ATTACHMENT_PATH)) {
      throw new BadRequestException('Faça upload do PPTX antes de enviar.');
    }

    const attachmentMeta = await this.readAttachmentMeta();
    const businessCardMeta = await this.readBusinessCardMeta(false);
    const hasBusinessCard = Boolean(businessCardMeta) && existsSync(BUSINESS_CARD_PATH);
    const attachment = await readFile(ATTACHMENT_PATH);
    const attachments: MailAttachment[] = [
      {
        filename: attachmentMeta?.originalName || 'apresentacao-hbx.pptx',
        content: attachment,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    ];

    if (businessCardMeta && hasBusinessCard) {
      attachments.push({
        filename: businessCardMeta.originalName || 'cartao-visitas.png',
        content: await readFile(BUSINESS_CARD_PATH),
        contentType: businessCardMeta.mimeType || 'image/png',
        cid: BUSINESS_CARD_CID,
      });
    }

    const template = await this.emailTemplates.getTemplateSafe('normal');
    const renderedText = this.emailTemplates.renderString(text || template.text, {
      nome: recipientName,
      email: recipientEmail,
      ano: new Date().getFullYear(),
    });
    const renderedSubject = this.emailTemplates.renderString(subject || template.subject, {
      nome: recipientName,
      email: recipientEmail,
      ano: new Date().getFullYear(),
    });
    const renderedHtml = html
      ? this.emailTemplates.renderString(html, {
          nome: recipientName,
          email: recipientEmail,
          ano: new Date().getFullYear(),
        })
      : null;
    const delivery = await this.sendMasterMail({
      to: recipientEmail,
      subject: renderedSubject,
      text: renderedText,
      html: this.emailTemplates.buildHtmlEmail(renderedText, {
        html: renderedHtml,
        appendHtml: hasBusinessCard ? this.buildBusinessCardHtml() : null,
      }),
      attachments,
    });

    return {
      ok: delivery.ok,
      sentAt: new Date().toISOString(),
      recipientName,
      recipientEmail,
      subject: renderedSubject,
      attachment: attachmentMeta,
      businessCard: businessCardMeta,
      delivery,
      sentBy: Number(req.user?.id || 0) || null,
    };
  }
}

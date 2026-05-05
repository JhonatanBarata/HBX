import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
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
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { MailAttachment, MailService } from './mail.service';

const MASTER_EMAIL_TEMPLATE = [
  'Boa tarde, tudo bem {{nome}}?',
  'Me foi Encaminhado me encaminhou seu email, sou dono de um sistema , que está ajudando muitas empresas se organizarem, com foco em CRM, localizar clientes, cards, whatsapp automático com IA e bot nas prospecções.',
  'Segue uma pequena apresentação, mas assim, em 1 contato consigo te explicar as telas do sistema (ele é grátis por 30 dias).',
  'Qualquer dúvida me coloco à disposição.',
  '',
  'Atenciosamente,',
  '',
  '🌐 Site: www.hbxsystem.com.br',
  '📞 Telefone: +55 19 99702-4884',
  '💬 WhatsApp: wa.me/5519997024884',
  '💼 LinkedIn: linkedin.com/in/jhonatan-barata-666310ba',
  '📘 Facebook: facebook.com/jhonatan.barata',
  '📸 Instagram: instagram.com',
].join('\n');

const MASTER_EMAIL_SUBJECT = 'Apresentação HBX System';
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
  constructor(private readonly mailService: MailService) {}

  private normalizeName(value: unknown) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  private renderTemplate(name: string) {
    return MASTER_EMAIL_TEMPLATE.replace('{{nome}}', this.normalizeName(name) || 'cliente');
  }

  private escapeHtml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildHtmlEmail(text: string, hasBusinessCard: boolean) {
    const paragraphs = this.escapeHtml(text)
      .split('\n')
      .map((line) => (line ? line : '&nbsp;'))
      .join('<br>');

    const businessCard = hasBusinessCard
      ? [
          '<div style="margin-top:18px">',
          `<img src="cid:${BUSINESS_CARD_CID}" alt="Cartao de visitas" style="display:block;max-width:640px;width:100%;height:auto;border:0;outline:none;text-decoration:none">`,
          '</div>',
        ].join('')
      : '';

    return [
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827">',
      paragraphs,
      businessCard,
      '</div>',
    ].join('');
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
      originalName: String(meta.originalName || 'apresentacao-hbx.pptx'),
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
      originalName: String(meta.originalName || 'cartao-visitas.png'),
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

  @Get()
  async getMasterEmailState() {
    const config = this.mailService.getConfigurationSummary();
    return {
      subject: MASTER_EMAIL_SUBJECT,
      template: MASTER_EMAIL_TEMPLATE,
      preview: this.renderTemplate('Amanda'),
      sender: {
        from: config.from || 'jhonatan@hbx.com.br',
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
    const originalName = String(file.originalname || '').trim() || 'apresentacao-hbx.pptx';
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

    const originalName = String(file.originalname || '').trim() || 'cartao-visitas.png';
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
    if (!recipientName) throw new BadRequestException('Informe o nome do contato.');
    if (!recipientEmail) throw new BadRequestException('Informe o email do contato.');
    if (!subject) throw new BadRequestException('Informe o assunto do email.');
    if (!text) throw new BadRequestException('Informe a mensagem do email.');
    if (!existsSync(ATTACHMENT_PATH)) {
      throw new BadRequestException('Faça upload do PPTX antes de enviar.');
    }

    const attachmentMeta = await this.readAttachmentMeta();
    const businessCardMeta = await this.readBusinessCardMeta(false);
    const attachment = await readFile(ATTACHMENT_PATH);
    const attachments: MailAttachment[] = [
      {
        filename: attachmentMeta?.originalName || 'apresentacao-hbx.pptx',
        content: attachment,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    ];

    if (businessCardMeta && existsSync(BUSINESS_CARD_PATH)) {
      attachments.push({
        filename: businessCardMeta.originalName || 'cartao-visitas.png',
        content: await readFile(BUSINESS_CARD_PATH),
        contentType: businessCardMeta.mimeType || 'image/png',
        cid: BUSINESS_CARD_CID,
      });
    }

    const delivery = await this.mailService.sendMail({
      to: recipientEmail,
      subject,
      text,
      html: this.buildHtmlEmail(text, Boolean(businessCardMeta)),
      from: 'Jhonatan | HBX <jhonatan@hbx.com.br>',
      replyTo: 'jhonatan@hbx.com.br',
      attachments,
    });

    return {
      ok: delivery.ok,
      sentAt: new Date().toISOString(),
      recipientName,
      recipientEmail,
      subject,
      attachment: attachmentMeta,
      businessCard: businessCardMeta,
      delivery,
      sentBy: Number(req.user?.id || 0) || null,
    };
  }
}

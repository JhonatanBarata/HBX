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
import { MailService } from './mail.service';

const MASTER_EMAIL_TEMPLATE = [
  'Boa tarde, tudo bem {{nome}}?',
  'O Filipe me encaminhou seu email, sou dono de um sistema , que está ajudando muitas empresas se organizarem, com foco em CRM, localizar clientes, cards, whatsapp automático com IA e bot nas prospecções.',
  'Segue uma pequena apresentação, mas assim, em 1 contato consigo te explicar as telas do sistema (ele é grátis por 30 dias).',
  'Qualquer dúvida me coloco à disposição. 19-997024884',
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

class SendMasterEmailDto {
  @IsString()
  @MaxLength(120)
  recipientName!: string;

  @IsEmail()
  @MaxLength(180)
  recipientEmail!: string;
}

type AttachmentMeta = {
  originalName: string;
  uploadedAt: string;
  size: number;
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
    };
  }

  @Post('attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
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

  @Post('send')
  async sendPresentationEmail(@Req() req: any, @Body() dto: SendMasterEmailDto) {
    const recipientName = this.normalizeName(dto.recipientName);
    const recipientEmail = String(dto.recipientEmail || '').trim().toLowerCase();
    if (!recipientName) throw new BadRequestException('Informe o nome do contato.');
    if (!recipientEmail) throw new BadRequestException('Informe o email do contato.');
    if (!existsSync(ATTACHMENT_PATH)) {
      throw new BadRequestException('Faça upload do PPTX antes de enviar.');
    }

    const attachmentMeta = await this.readAttachmentMeta();
    const attachment = await readFile(ATTACHMENT_PATH);
    const text = this.renderTemplate(recipientName);
    const delivery = await this.mailService.sendMail({
      to: recipientEmail,
      subject: MASTER_EMAIL_SUBJECT,
      text,
      from: 'Jhonatan | HBX <jhonatan@hbx.com.br>',
      replyTo: 'jhonatan@hbx.com.br',
      attachments: [
        {
          filename: attachmentMeta?.originalName || 'apresentacao-hbx.pptx',
          content: attachment,
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      ],
    });

    return {
      ok: delivery.ok,
      sentAt: new Date().toISOString(),
      recipientName,
      recipientEmail,
      subject: MASTER_EMAIL_SUBJECT,
      attachment: attachmentMeta,
      delivery,
      sentBy: Number(req.user?.id || 0) || null,
    };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { EmailTemplate, EmailTemplateKind, EmailTemplateService } from './email-template.service';
import {
  BUSINESS_CARD_CID,
  HbxPresentationEmailService,
} from './hbx-presentation-email.service';
import { MasterEmailSettingsService } from './master-email-settings.service';
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

class SaveMasterEmailSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  recipientEmail?: string | null;

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
}

@Controller('master/email')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterEmailController {
  constructor(
    private readonly hbxPresentationEmails: HbxPresentationEmailService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly emailSettings: MasterEmailSettingsService,
  ) {}

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
  }

  private formatTemplate(template: EmailTemplate) {
    const usesSignature = template.kind === 'normal' || template.kind === 'seller_welcome' || template.kind === 'seller_onboarding_request';
    return {
      ...template,
      variables: this.emailTemplates.getAvailableVariables(template.kind),
      variableDefinitions: this.emailTemplates.getVariableDefinitions(template.kind),
      requiredVariable: this.emailTemplates.getRequiredVariable(template.kind),
      usesSignature,
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
      acesso: String(dto?.to || 'vendedor@hbxsystem.com.br').trim().toLowerCase(),
      senha: 'Tmp@ExemploA1',
      linkAcesso: `${appUrl}/login`,
      linkMobile: `${appUrl}/mobile/login`,
      tipoAcesso: 'vendedor',
      ano: new Date().getFullYear(),
      vendedor: sampleName,
      emailvendedor: String(dto?.to || 'vendedor@hbxsystem.com.br').trim().toLowerCase(),
      senhavendedor: 'Tmp@ExemploA1',
      comissao: '20%',
      comissaoheranca: '2%',
      d3: 'D+3 úteis',
      diascomissao: 3,
      sellerName: sampleName,
      sellerCpf: '123.456.789-00',
      sellerEmail: String(dto?.to || 'vendedor@hbxsystem.com.br').trim().toLowerCase(),
      sellerPhone: '(11) 99999-0000',
      sellerAddress: 'Av. Paulista, 1000',
      commissionPercent: '20',
      commissionDueBusinessDays: 3,
      contractDate: new Date().toLocaleDateString('pt-BR'),
      documentosConfirmados: 'Documentos confirmados:\nDocumento com foto',
      documentosRecebidos: 'Documento com foto',
      documentosPendentes: 'Contrato assinado',
      documentosFaltantes: 'Contrato assinado',
      contrato: 'CONTRATO DE PARCERIA HBX\n\nTexto de exemplo do contrato para assinatura.',
      saudacao: 'Boa tarde',
      nomecard: sampleCompany,
      razaosocialcard: `${sampleCompany} LTDA`,
      telefonecard: '(11) 99999-0000',
      whatsappcard: '5511999990000',
      emailcard: 'contato@empresaexemplo.com.br',
      cidadecard: 'São Paulo',
      estadocard: 'SP',
      enderecocard: 'Av. Paulista, 1000',
      bairrocard: 'Bela Vista',
      segmentocard: 'serviços locais',
      sitecard: 'https://empresaexemplo.com.br',
      instagramcard: '@empresaexemplo',
      facebookcard: 'facebook.com/empresaexemplo',
      responsavelcard: sampleName,
      observacaocard: 'Lead com bom potencial para apresentação HBX.',
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
    const formatted = this.formatTemplate(template);
    const businessCardFile = formatted.usesSignature ? await this.hbxPresentationEmails.readBusinessCardContent() : null;
    const businessCardMeta = businessCardFile?.meta || null;
    const hasBusinessCard = Boolean(businessCardFile);
    const rendered = this.emailTemplates.renderTemplate(template, variables, {
      appendHtml: hasBusinessCard ? this.hbxPresentationEmails.buildBusinessCardHtml() : null,
    });
    const attachments: MailAttachment[] = [];

    if (hasBusinessCard && businessCardMeta) {
      attachments.push({
        filename: businessCardMeta.originalName || 'cartao-visitas.png',
        content: businessCardFile?.content || Buffer.alloc(0),
        contentType: businessCardFile?.contentType || businessCardMeta.mimeType || 'image/png',
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
      formState: await this.emailSettings.getFormState(),
    };
  }

  @Put('settings')
  async saveMasterEmailSettings(@Body() dto: SaveMasterEmailSettingsDto) {
    return { ok: true, formState: await this.emailSettings.saveFormState(dto) };
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
    const attachment = await this.hbxPresentationEmails.savePresentationAttachment(Buffer.from(file.buffer), originalName);
    return { ok: true, attachment };
  }

  @Delete('attachment')
  async deleteAttachment() {
    await this.hbxPresentationEmails.deletePresentationAttachment();
    return { ok: true, attachment: null };
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
    const businessCard = await this.hbxPresentationEmails.saveBusinessCard(Buffer.from(file.buffer), { originalName, mimeType });
    return { ok: true, businessCard };
  }

  @Delete('business-card')
  async deleteBusinessCard() {
    await this.hbxPresentationEmails.deleteBusinessCard();
    return { ok: true, businessCard: null };
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

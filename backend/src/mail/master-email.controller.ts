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
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { EmailTemplateKind, EmailTemplateService, ManagedEmailTemplate } from './email-template.service';
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

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

class CreateMasterTemplateDto {
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

  private formatTemplate(template: ManagedEmailTemplate) {
    const definitions = template.isSystem
      ? this.emailTemplates.getVariableDefinitions(template.kind)
      : this.emailTemplates.getCustomVariableDefinitions();
    const usesSignature = template.isSystem
      ? template.kind === 'normal' || template.kind === 'seller_welcome' || template.kind === 'seller_onboarding_request'
      : true;
    return {
      kind: template.kind,
      label: template.label,
      isSystem: template.isSystem,
      subject: template.subject,
      text: template.text,
      html: template.html,
      updatedAt: template.updatedAt,
      variables: definitions.map((variable) => variable.token),
      variableDefinitions: definitions,
      requiredVariable: template.isSystem ? this.emailTemplates.getRequiredVariable(template.kind) : null,
      usesSignature,
      usesAttachment: template.isSystem ? template.kind === 'normal' : true,
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
      linkRecuperacao: `${appUrl}/reset-password?token=teste`,
      linkConfirmacao: `${appUrl}/hbx-vendedor/onboarding?token=teste`,
      acesso: String(dto?.to || 'vendedor@hbxsystem.com.br').trim().toLowerCase(),
      senha: 'Tmp@TesteA1',
      linkAcesso: `${appUrl}/login`,
      linkMobile: `${appUrl}/mobile/login`,
      tipoAcesso: 'vendedor',
      ano: new Date().getFullYear(),
      vendedor: sampleName,
      emailvendedor: String(dto?.to || 'vendedor@hbxsystem.com.br').trim().toLowerCase(),
      senhavendedor: 'Tmp@TesteA1',
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
      saudacao: 'Boa tarde',
      nomecard: sampleCompany,
      razaosocialcard: `${sampleCompany} LTDA`,
      telefonecard: '(11) 99999-0000',
      whatsappcard: '5511999990000',
      emailcard: 'contato@empresateste.com.br',
      cidadecard: 'São Paulo',
      estadocard: 'SP',
      enderecocard: 'Av. Paulista, 1000',
      bairrocard: 'Bela Vista',
      segmentocard: 'serviços locais',
      sitecard: 'https://empresateste.com.br',
      instagramcard: '@empresateste',
      facebookcard: 'facebook.com/empresateste',
      responsavelcard: sampleName,
      observacaocard: 'Lead com bom potencial para apresentação HBX.',
    };
  }

  @Get('templates')
  async listTemplates() {
    const templates = await this.emailTemplates.listManagedTemplates();
    return {
      templates: templates.map((template) => this.formatTemplate(template)),
    };
  }

  @Get('templates/:kind')
  async getTemplate(@Param('kind') kindParam: string) {
    return { template: this.formatTemplate(await this.emailTemplates.getManagedTemplate(kindParam)) };
  }

  // "+" — cria um template personalizado do Master (kind tpl_*).
  @Post('templates')
  async createTemplate(@Body() dto: CreateMasterTemplateDto) {
    const template = await this.emailTemplates.createCustomTemplate(dto || ({} as CreateMasterTemplateDto));
    return { ok: true, template: this.formatTemplate(template) };
  }

  @Put('templates/:kind')
  async saveTemplate(@Param('kind') kindParam: string, @Body() dto: SaveEmailTemplateDto) {
    if (this.emailTemplates.isSystemKind(kindParam)) {
      await this.emailTemplates.saveTemplate(kindParam as EmailTemplateKind, dto);
      return { ok: true, template: this.formatTemplate(await this.emailTemplates.getManagedTemplate(kindParam)) };
    }
    const template = await this.emailTemplates.saveCustomTemplate(kindParam, dto);
    return { ok: true, template: this.formatTemplate(template) };
  }

  // "-" — remove um template personalizado (os de sistema não removem).
  @Delete('templates/:kind')
  async deleteTemplate(@Param('kind') kindParam: string) {
    if (this.emailTemplates.isSystemKind(kindParam)) {
      throw new BadRequestException('Template padrão do sistema não pode ser removido — use "Restaurar padrão".');
    }
    return this.emailTemplates.removeCustomTemplate(kindParam);
  }

  @Post('templates/:kind/restore')
  async restoreTemplate(@Param('kind') kindParam: string) {
    if (!this.emailTemplates.isSystemKind(kindParam)) {
      throw new BadRequestException('Só templates padrão têm "Restaurar" — os seus você edita ou remove.');
    }
    const kind = this.emailTemplates.normalizeKind(kindParam);
    await this.emailTemplates.restoreTemplate(kind);
    return { ok: true, template: this.formatTemplate(await this.emailTemplates.getManagedTemplate(kind)) };
  }

  @Post('templates/:kind/test')
  async sendTemplateTest(@Param('kind') kindParam: string, @Body() dto: TestEmailTemplateDto) {
    const to = String(dto.to || '').trim().toLowerCase();
    if (!to) throw new BadRequestException('Informe o e-mail de teste.');

    const template = await this.emailTemplates.getManagedTemplate(kindParam);
    if (template.isSystem) {
      this.emailTemplates.validateTemplateInput(template.kind, template.subject, template.text);
    } else if (!template.subject || !template.text) {
      throw new BadRequestException('Preencha o assunto e o corpo do template antes de testar.');
    }
    const variables = this.buildSampleVariables(template.isSystem ? template.kind : 'normal', dto);
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

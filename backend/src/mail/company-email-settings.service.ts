import { BadRequestException, Injectable } from '@nestjs/common';
import { isHbxPlatformCompany } from '../common/hbx-platform-company';
import { IntegrationSecretsService } from '../integrations/integration-secrets.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

// PR12062026005: configuração de e-mail POR EMPRESA. Cada tenant usa o
// próprio SMTP; a empresa HBX é a única que compartilha o transporte do
// Master (mode hbx_shared) — e nada além do transporte.

export type CompanySenderSummary = {
  mode: 'hbx_shared' | 'smtp';
  ready: boolean;
  from: string | null;
  replyTo: string | null;
  missing: string[];
};

export type SaveCompanyEmailSettingsInput = {
  enabled?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  smtpPass?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  testEmail?: string | null;
  sampleName?: string | null;
  sampleCompany?: string | null;
  welcomeTemplateKind?: string | null;
  onboardingTemplateKind?: string | null;
};

const COMPANY_EMAIL_ASSET_KEYS = ['presentation_pptx', 'business_card'] as const;
export type CompanyEmailAssetKey = (typeof COMPANY_EMAIL_ASSET_KEYS)[number];

function normalizeText(value: unknown, max: number) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

@Injectable()
export class CompanyEmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: IntegrationSecretsService,
    private readonly mailService: MailService,
  ) {}

  async getRaw(companyId: number) {
    return this.prisma.companyEmailSettings.findUnique({ where: { companyId } });
  }

  buildFromAddress(settings: { fromName?: string | null; fromEmail?: string | null; smtpUser?: string | null } | null) {
    const fromEmail = String(settings?.fromEmail || settings?.smtpUser || '').trim();
    if (!fromEmail) return null;
    const fromName = String(settings?.fromName || '').trim();
    return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  }

  buildSenderSummary(companyId: number, settings: Awaited<ReturnType<CompanyEmailSettingsService['getRaw']>>): CompanySenderSummary {
    if (isHbxPlatformCompany(companyId)) {
      const platform = this.mailService.getConfigurationSummary();
      return {
        mode: 'hbx_shared',
        ready: platform.ready,
        from: platform.from,
        replyTo: platform.replyTo,
        missing: platform.ready ? [] : ['Transporte da plataforma indisponível — avise o suporte HBX.'],
      };
    }

    const missing: string[] = [];
    if (!String(settings?.smtpHost || '').trim()) missing.push('Servidor SMTP');
    if (!Number(settings?.smtpPort || 0)) missing.push('Porta');
    if (!String(settings?.smtpUser || '').trim()) missing.push('Usuário');
    if (!String(settings?.smtpPassEncrypted || '').trim()) missing.push('Senha');
    const from = this.buildFromAddress(settings);
    if (!from) missing.push('Remetente (e-mail)');

    return {
      mode: 'smtp',
      ready: missing.length === 0,
      from,
      replyTo: String(settings?.replyTo || '').trim() || null,
      missing,
    };
  }

  async getPublicState(companyId: number) {
    const settings = await this.getRaw(companyId);
    const sender = this.buildSenderSummary(companyId, settings);
    const hbxShared = isHbxPlatformCompany(companyId);
    return {
      enabled: Boolean(settings?.enabled),
      hbxShared,
      smtp: hbxShared
        ? null
        : {
            host: settings?.smtpHost || null,
            port: settings?.smtpPort || null,
            secure: settings?.smtpSecure ?? true,
            user: settings?.smtpUser || null,
            passPreview: this.secrets.previewSecret(settings?.smtpPassEncrypted ? '********' : null),
            hasPass: Boolean(settings?.smtpPassEncrypted),
          },
      fromName: settings?.fromName || null,
      fromEmail: settings?.fromEmail || null,
      replyTo: settings?.replyTo || null,
      sender,
      formState: {
        testEmail: settings?.testEmail || null,
        sampleName: settings?.sampleName || null,
        sampleCompany: settings?.sampleCompany || null,
      },
      dispatch: {
        welcomeTemplateKind: settings?.welcomeTemplateKind || null,
        onboardingTemplateKind: settings?.onboardingTemplateKind || null,
      },
    };
  }

  async save(companyId: number, input: SaveCompanyEmailSettingsInput) {
    const existing = await this.getRaw(companyId);
    const data: Record<string, unknown> = {};

    if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
    if (input.smtpHost !== undefined) data.smtpHost = normalizeText(input.smtpHost, 180);
    if (input.smtpPort !== undefined) {
      const port = Math.trunc(Number(input.smtpPort || 0));
      data.smtpPort = port > 0 && port <= 65535 ? port : null;
    }
    if (input.smtpSecure !== undefined) data.smtpSecure = Boolean(input.smtpSecure);
    if (input.smtpUser !== undefined) data.smtpUser = normalizeText(input.smtpUser, 180);
    if (input.smtpPass !== undefined) {
      const pass = String(input.smtpPass ?? '').trim();
      // string vazia = manter a senha atual; só sobrescreve quando vier valor
      if (pass) data.smtpPassEncrypted = this.encryptPass(pass);
    }
    if (input.fromName !== undefined) data.fromName = normalizeText(input.fromName, 120);
    if (input.fromEmail !== undefined) data.fromEmail = normalizeText(input.fromEmail, 180)?.toLowerCase() ?? null;
    if (input.replyTo !== undefined) data.replyTo = normalizeText(input.replyTo, 180)?.toLowerCase() ?? null;
    if (input.testEmail !== undefined) data.testEmail = normalizeText(input.testEmail, 180)?.toLowerCase() ?? null;
    if (input.sampleName !== undefined) data.sampleName = normalizeText(input.sampleName, 120);
    if (input.sampleCompany !== undefined) data.sampleCompany = normalizeText(input.sampleCompany, 180);
    if (input.welcomeTemplateKind !== undefined) data.welcomeTemplateKind = normalizeText(input.welcomeTemplateKind, 120);
    if (input.onboardingTemplateKind !== undefined) data.onboardingTemplateKind = normalizeText(input.onboardingTemplateKind, 120);

    if (!existing) {
      await this.prisma.companyEmailSettings.create({ data: { companyId, ...data } });
    } else if (Object.keys(data).length) {
      await this.prisma.companyEmailSettings.update({ where: { companyId }, data });
    }
    return this.getPublicState(companyId);
  }

  private encryptPass(pass: string) {
    try {
      return this.secrets.encryptSecret(pass);
    } catch (error) {
      throw new BadRequestException(
        'Não foi possível guardar a senha SMTP com segurança (INTEGRATION_SECRET_KEY ausente no backend). Avise o suporte.',
      );
    }
  }

  decryptPass(settings: { smtpPassEncrypted?: string | null } | null) {
    if (!settings?.smtpPassEncrypted) return null;
    return this.secrets.decryptSecret(settings.smtpPassEncrypted);
  }

  // ----- anexos por empresa (apresentação PPTX + cartão de visitas) -----

  normalizeAssetKey(value: unknown): CompanyEmailAssetKey {
    const key = String(value || '').trim() as CompanyEmailAssetKey;
    if (!COMPANY_EMAIL_ASSET_KEYS.includes(key)) {
      throw new BadRequestException('Anexo de e-mail inválido.');
    }
    return key;
  }

  async readAssetMeta(companyId: number, key: CompanyEmailAssetKey) {
    const row = await this.prisma.companyEmailAsset.findUnique({
      where: { companyId_key: { companyId, key } },
      select: { originalName: true, mimeType: true, size: true, uploadedAt: true },
    });
    if (!row) return null;
    return {
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      uploadedAt: row.uploadedAt ? row.uploadedAt.toISOString() : null,
    };
  }

  async readAssetContent(companyId: number, key: CompanyEmailAssetKey) {
    const row = await this.prisma.companyEmailAsset.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    if (!row) return null;
    return {
      content: Buffer.from(row.fileData),
      contentType: row.mimeType || 'application/octet-stream',
      meta: { originalName: row.originalName, mimeType: row.mimeType, size: row.size },
    };
  }

  async saveAsset(companyId: number, key: CompanyEmailAssetKey, input: { content: Buffer; originalName: string; mimeType?: string | null }) {
    const data = {
      originalName: input.originalName,
      mimeType: input.mimeType || null,
      size: input.content.length,
      fileData: input.content,
      uploadedAt: new Date(),
    };
    await this.prisma.companyEmailAsset.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, ...data },
      update: data,
    });
    return this.readAssetMeta(companyId, key);
  }

  async deleteAsset(companyId: number, key: CompanyEmailAssetKey) {
    await this.prisma.companyEmailAsset.deleteMany({ where: { companyId, key } });
  }
}

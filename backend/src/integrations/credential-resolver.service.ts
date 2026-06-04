import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CompanySecretProvider } from './company-secret-inventory';
import { IntegrationSecretsService } from './integration-secrets.service';

type CredentialSource = 'integrationConnection' | 'company' | 'none';

type ResolvedCompanyCredential = {
  companyId: number;
  provider: CompanySecretProvider;
  configured: boolean;
  source: CredentialSource;
  secret: string | null;
  secretPreview: string | null;
  connectionId: string | null;
  connectionProvider: string | null;
  companyField: string | null;
};

const PROVIDER_ALIASES: Record<CompanySecretProvider, string[]> = {
  WHATSAPP: ['WHATSAPP', 'WHATSAPP_CLOUD', 'META_WHATSAPP', 'META'],
  MERCADOPAGO: ['MERCADOPAGO', 'MERCADO_PAGO', 'MERCADO PAGO', 'MP'],
};

const COMPANY_SECRET_FIELD: Record<CompanySecretProvider, 'whatsappAccessToken' | 'mercadoPagoAccessToken'> = {
  WHATSAPP: 'whatsappAccessToken',
  MERCADOPAGO: 'mercadoPagoAccessToken',
};

function normalizeText(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeProvider(value: unknown): CompanySecretProvider | null {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'WHATSAPP' || normalized === 'WHATSAPP_CLOUD' || normalized === 'META_WHATSAPP' || normalized === 'META') {
    return 'WHATSAPP';
  }
  if (normalized === 'MERCADOPAGO' || normalized === 'MERCADO_PAGO' || normalized === 'MP') {
    return 'MERCADOPAGO';
  }
  return null;
}

export function maskSecret(value: unknown, suffixLength = 6) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const visible = Math.max(0, Math.trunc(Number(suffixLength) || 0));
  if (!visible || normalized.length <= visible) return '***';
  return `***${normalized.slice(-visible)}`;
}

function readSecretCandidate(value: any) {
  return normalizeText(
    value?.credentials?.token
    ?? value?.token
    ?? value?.accessToken
    ?? value?.access_token
    ?? value?.secret
    ?? value?.value,
  );
}

function extractSecretFromDecrypted(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  try {
    const parsed = JSON.parse(normalized);
    return readSecretCandidate(parsed) || normalized;
  } catch {
    return normalized;
  }
}

@Injectable()
export class CredentialResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationSecrets: IntegrationSecretsService,
  ) {}

  private normalizeCompanyId(companyIdRaw: unknown) {
    const companyId = Math.trunc(Number(companyIdRaw || 0));
    return Number.isFinite(companyId) && companyId > 0 ? companyId : null;
  }

  private emptyCredential(companyId: number, provider: CompanySecretProvider): ResolvedCompanyCredential {
    return {
      companyId,
      provider,
      configured: false,
      source: 'none',
      secret: null,
      secretPreview: null,
      connectionId: null,
      connectionProvider: null,
      companyField: null,
    };
  }

  private async resolveFromIntegrationConnection(companyId: number, provider: CompanySecretProvider) {
    const row = await this.prisma.integrationConnection.findFirst({
      where: {
        companyId,
        provider: { in: PROVIDER_ALIASES[provider] },
        isActive: true,
        secretCiphertext: { not: null },
      },
      orderBy: [{ lastSuccessAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        provider: true,
        secretCiphertext: true,
        secretPreview: true,
      },
    });
    if (!row?.secretCiphertext) return null;

    try {
      const decrypted = this.integrationSecrets.decryptSecret(row.secretCiphertext);
      const secret = extractSecretFromDecrypted(decrypted);
      if (!secret) return null;
      return {
        secret,
        secretPreview: normalizeText(row.secretPreview) || maskSecret(secret),
        connectionId: String(row.id),
        connectionProvider: normalizeText(row.provider),
      };
    } catch {
      return null;
    }
  }

  private async resolveFromCompany(companyId: number, provider: CompanySecretProvider) {
    const field = COMPANY_SECRET_FIELD[provider];
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { [field]: true } as any,
    });
    const secret = normalizeText(company?.[field]);
    if (!secret) return null;
    return {
      secret,
      secretPreview: maskSecret(secret),
      companyField: field,
    };
  }

  async resolveCompanyCredential(companyIdRaw: unknown, providerRaw: unknown): Promise<ResolvedCompanyCredential> {
    const companyId = this.normalizeCompanyId(companyIdRaw);
    const provider = normalizeProvider(providerRaw);
    if (!companyId || !provider) {
      return this.emptyCredential(companyId || 0, provider || 'WHATSAPP');
    }

    const connectionCredential = await this.resolveFromIntegrationConnection(companyId, provider);
    if (connectionCredential) {
      return {
        companyId,
        provider,
        configured: true,
        source: 'integrationConnection',
        secret: connectionCredential.secret,
        secretPreview: connectionCredential.secretPreview,
        connectionId: connectionCredential.connectionId,
        connectionProvider: connectionCredential.connectionProvider,
        companyField: null,
      };
    }

    const companyCredential = await this.resolveFromCompany(companyId, provider);
    if (companyCredential) {
      return {
        companyId,
        provider,
        configured: true,
        source: 'company',
        secret: companyCredential.secret,
        secretPreview: companyCredential.secretPreview,
        connectionId: null,
        connectionProvider: null,
        companyField: companyCredential.companyField,
      };
    }

    return this.emptyCredential(companyId, provider);
  }

  resolveWhatsAppAccessToken(companyId: unknown) {
    return this.resolveCompanyCredential(companyId, 'WHATSAPP');
  }

  resolveMercadoPagoAccessToken(companyId: unknown) {
    return this.resolveCompanyCredential(companyId, 'MERCADOPAGO');
  }
}

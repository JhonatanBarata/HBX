import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type GrantConsentInput = {
  companyId: number;
  phone: unknown;
  source: unknown;
  purpose: unknown;
  metadataJson?: unknown;
  grantedAt?: Date | null;
};

type RevokeConsentInput = {
  companyId: number;
  phone: unknown;
  purpose?: unknown;
  revokedAt?: Date | null;
};

function normalizeText(value: unknown, fallback?: string, max = 180) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return (normalized || fallback || '').slice(0, max) || null;
}

export function normalizeWhatsappConsentPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.slice(-15);
}

function normalizeCompanyId(value: unknown) {
  const companyId = Math.trunc(Number(value || 0));
  return Number.isFinite(companyId) && companyId > 0 ? companyId : null;
}

function normalizeMetadataJson(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 5000);
  try {
    return JSON.stringify(value).slice(0, 5000);
  } catch {
    return null;
  }
}

@Injectable()
export class WhatsappConsentLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCompanyId(value: unknown) {
    const companyId = normalizeCompanyId(value);
    if (!companyId) throw new BadRequestException('Empresa invalida para opt-in de WhatsApp.');
    return companyId;
  }

  private requirePhone(value: unknown) {
    const phoneNormalized = normalizeWhatsappConsentPhone(value);
    if (!phoneNormalized || phoneNormalized.length < 8) {
      throw new BadRequestException('Telefone invalido para opt-in de WhatsApp.');
    }
    return phoneNormalized;
  }

  private requirePurpose(value: unknown) {
    const purpose = normalizeText(value, 'proactive_message', 120);
    if (!purpose) throw new BadRequestException('Finalidade do opt-in de WhatsApp invalida.');
    return purpose;
  }

  async grantConsent(input: GrantConsentInput) {
    const companyId = this.requireCompanyId(input.companyId);
    const phoneNormalized = this.requirePhone(input.phone);
    const purpose = this.requirePurpose(input.purpose);
    const source = normalizeText(input.source, 'manual', 120) || 'manual';
    const grantedAt = input.grantedAt instanceof Date ? input.grantedAt : new Date();

    const row = await this.prisma.whatsappConsentLedger.create({
      data: {
        companyId,
        phoneNormalized,
        source,
        purpose,
        status: 'active',
        grantedAt,
        revokedAt: null,
        metadataJson: normalizeMetadataJson(input.metadataJson),
      },
    });
    return {
      ok: true,
      active: true,
      consent: row,
    };
  }

  async revokeConsent(input: RevokeConsentInput) {
    const companyId = this.requireCompanyId(input.companyId);
    const phoneNormalized = this.requirePhone(input.phone);
    const purpose = input.purpose === undefined ? null : this.requirePurpose(input.purpose);
    const revokedAt = input.revokedAt instanceof Date ? input.revokedAt : new Date();
    const result = await this.prisma.whatsappConsentLedger.updateMany({
      where: {
        companyId,
        phoneNormalized,
        status: 'active',
        revokedAt: null,
        ...(purpose ? { purpose } : {}),
      },
      data: {
        status: 'revoked',
        revokedAt,
      },
    });
    return {
      ok: true,
      active: false,
      revokedCount: Number(result?.count || 0),
      phoneNormalized,
      purpose,
    };
  }

  async hasActiveConsent(companyIdRaw: unknown, phoneRaw: unknown, purposeRaw: unknown) {
    const companyId = this.requireCompanyId(companyIdRaw);
    const phoneNormalized = this.requirePhone(phoneRaw);
    const purpose = this.requirePurpose(purposeRaw);
    const row = await this.prisma.whatsappConsentLedger.findFirst({
      where: {
        companyId,
        phoneNormalized,
        purpose,
        status: 'active',
        revokedAt: null,
      },
      orderBy: [{ grantedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return Boolean(row);
  }

  async assertCanSendProactiveMessage(companyIdRaw: unknown, phoneRaw: unknown, purposeRaw: unknown) {
    const companyId = this.requireCompanyId(companyIdRaw);
    const phoneNormalized = this.requirePhone(phoneRaw);
    const purpose = this.requirePurpose(purposeRaw);
    const active = await this.hasActiveConsent(companyId, phoneNormalized, purpose);
    return {
      ok: active,
      allowed: active,
      companyId,
      phoneNormalized,
      purpose,
      warning: active ? null : 'Sem opt-in ativo registrado para mensagem proativa de WhatsApp.',
    };
  }
}

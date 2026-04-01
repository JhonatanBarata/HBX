import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';

type CustomerProjectionInput = {
  companyId: number;
  sourceConnectionId: string;
  sourceProvider: string;
  externalCustomerId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  status?: string | null;
  notes?: string | null;
};

type DebtProjectionInput = {
  companyId: number;
  sourceConnectionId: string;
  sourceProvider: string;
  customerProfileId: string;
  externalDebtId?: string | null;
  amount?: number | null;
  dueDate?: Date | null;
  paidAt?: Date | null;
  status?: string | null;
  rawPayloadJson?: string | null;
};

function normalizeText(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeMoney(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class IntegrationProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerProfileService: CustomerProfileService,
  ) {}

  private async findExistingCustomerProfile(input: CustomerProjectionInput) {
    const phoneNormalized = this.customerProfileService.normalizePhone(input.phone);
    const document = this.customerProfileService.normalizeDocument(input.document);
    const externalCustomerId = normalizeText(input.externalCustomerId);
    const sourceConnectionId = normalizeText(input.sourceConnectionId);

    const where: Array<any> = [];
    if (sourceConnectionId && externalCustomerId) {
      where.push({ sourceConnectionId, externalCustomerId });
    }
    if (phoneNormalized) {
      where.push({ phoneNormalized });
    }
    if (document) {
      where.push({ document });
    }

    if (!where.length) return null;

    return this.prisma.customerProfile.findFirst({
      where: {
        companyId: Number(input.companyId),
        OR: where,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async upsertCustomerProfile(input: CustomerProjectionInput) {
    const existing = await this.findExistingCustomerProfile(input);
    const row = await this.customerProfileService.upsertProfile({
      companyId: Number(input.companyId),
      sourceConnectionId: normalizeText(input.sourceConnectionId),
      name: normalizeText(input.name),
      phone: normalizeText(input.phone),
      email: normalizeText(input.email),
      document: normalizeText(input.document),
      externalSource: normalizeText(input.sourceProvider)?.toLowerCase() || null,
      externalCustomerId: normalizeText(input.externalCustomerId),
      status: normalizeText(input.status) || 'active',
      notes: normalizeText(input.notes),
    });

    return {
      row,
      action: existing ? 'updated' : 'imported',
    };
  }

  private async findExistingDebtCase(input: DebtProjectionInput) {
    const externalDebtId = normalizeText(input.externalDebtId);
    if (externalDebtId) {
      return this.prisma.debtCase.findFirst({
        where: {
          companyId: Number(input.companyId),
          sourceConnectionId: normalizeText(input.sourceConnectionId),
          externalDebtId,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
    }

    return this.prisma.debtCase.findFirst({
      where: {
        companyId: Number(input.companyId),
        customerProfileId: String(input.customerProfileId),
        sourceConnectionId: normalizeText(input.sourceConnectionId),
        sourceProvider: normalizeText(input.sourceProvider) || 'UNKNOWN',
        status: { in: ['open', 'pending'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async upsertDebtCase(input: DebtProjectionInput) {
    const existing = await this.findExistingDebtCase(input);
    const payload = {
      companyId: Number(input.companyId),
      customerProfileId: String(input.customerProfileId),
      sourceConnectionId: normalizeText(input.sourceConnectionId),
      sourceProvider: normalizeText(input.sourceProvider) || 'UNKNOWN',
      externalDebtId: normalizeText(input.externalDebtId),
      amount: normalizeMoney(input.amount),
      dueDate: normalizeDate(input.dueDate),
      paidAt: normalizeDate(input.paidAt),
      status: normalizeText(input.status)?.toLowerCase() || 'open',
      rawPayloadJson: normalizeText(input.rawPayloadJson),
    };

    const row = existing
      ? await this.prisma.debtCase.update({
          where: { id: existing.id },
          data: payload,
        })
      : await this.prisma.debtCase.create({
          data: payload,
        });

    return {
      row,
      action: existing ? 'updated' : 'imported',
    };
  }
}
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { isMasterOperationalCompanySlug } from '../commercial-plans/seat-billing.util';
import { PrismaService } from '../prisma/prisma.service';
import { buildSellerPartnerContract, SELLER_CONTRACT_VERSION } from './seller-contract-template';

type UpdateDraftInput = {
  partnerType?: unknown;
  legalName?: unknown;
  email?: unknown;
  phone?: unknown;
  cpf?: unknown;
  declaredAddress?: unknown;
  commissionPercent?: unknown;
  commissionRecurring?: unknown;
  commissionDueBusinessDays?: unknown;
  canRegisterHbxSellers?: unknown;
  sellerReferralCommissionPercent?: unknown;
  referredByUserId?: unknown;
  referredByCommissionPercentSnapshot?: unknown;
  archiveEmail?: unknown;
  metadataJson?: unknown;
};

function normalizeText(value: unknown, max = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizePercent(value: unknown, fallback = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
}

function normalizeDueDays(value: unknown, fallback = 3) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(30, Math.max(1, numeric));
}

function sha256Text(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function partnerTypeFor(user: any) {
  if (Number(user?.referredByUserId || 0) > 0) return 'hbx_heir';
  if (Boolean(user?.canRegisterHbxSellers)) return 'hbx_partner_manager';
  return 'hbx_partner';
}

@Injectable()
export class SellerOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateForUser(companyId: number, userId: number, createdByUserId?: number | null) {
    await this.assertHbxSellerNetworkCompany(companyId);
    const { user, company } = await this.requirePartnerUserInCompany(companyId, userId);
    const existing = await this.prisma.sellerOnboarding.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    if (existing) return existing;

    const referredByNameSnapshot = await this.resolveReferredByNameSnapshot(companyId, user.referredByUserId);
    return this.prisma.sellerOnboarding.create({
      data: {
        companyId,
        userId,
        createdByUserId: Number(createdByUserId || 0) || null,
        status: 'draft',
        partnerType: partnerTypeFor(user),
        legalName: user.name || null,
        email: user.email || user.username || null,
        phone: user.phone || null,
        commissionPercent: normalizePercent(user.commissionPercent, 20),
        commissionRecurring: true,
        commissionDueBusinessDays: normalizeDueDays(company.commissionDueBusinessDays, 3),
        canRegisterHbxSellers: Boolean(user.canRegisterHbxSellers),
        sellerReferralCommissionPercent: normalizePercent(user.sellerReferralCommissionPercent, 0),
        referredByUserId: user.referredByUserId || null,
        referredByNameSnapshot,
        referredByCommissionPercentSnapshot: normalizePercent(user.referredByCommissionPercentSnapshot, 0),
        contractVersion: SELLER_CONTRACT_VERSION,
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async updateDraft(companyId: number, userId: number, dto: UpdateDraftInput) {
    await this.assertHbxSellerNetworkCompany(companyId);
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const referrerId = Number(dto.referredByUserId ?? onboarding.referredByUserId ?? 0) || null;
    const referredByNameSnapshot = referrerId
      ? await this.resolveReferredByNameSnapshot(companyId, referrerId)
      : null;
    const canRegisterHbxSellers = typeof dto.canRegisterHbxSellers === 'boolean'
      ? dto.canRegisterHbxSellers
      : onboarding.canRegisterHbxSellers;
    const partnerType = normalizeText(dto.partnerType, 40)
      || (referrerId ? 'hbx_heir' : canRegisterHbxSellers ? 'hbx_partner_manager' : 'hbx_partner');

    return this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        partnerType,
        legalName: normalizeText(dto.legalName, 160) ?? onboarding.legalName,
        email: normalizeText(dto.email, 180) ?? onboarding.email,
        phone: normalizeText(dto.phone, 60) ?? onboarding.phone,
        cpf: normalizeText(dto.cpf, 20) ?? onboarding.cpf,
        declaredAddress: normalizeText(dto.declaredAddress, 500) ?? onboarding.declaredAddress,
        commissionPercent: normalizePercent(dto.commissionPercent, onboarding.commissionPercent),
        commissionRecurring: typeof dto.commissionRecurring === 'boolean' ? dto.commissionRecurring : onboarding.commissionRecurring,
        commissionDueBusinessDays: normalizeDueDays(dto.commissionDueBusinessDays, onboarding.commissionDueBusinessDays),
        canRegisterHbxSellers,
        sellerReferralCommissionPercent: normalizePercent(dto.sellerReferralCommissionPercent, onboarding.sellerReferralCommissionPercent),
        referredByUserId: referrerId,
        referredByNameSnapshot,
        referredByCommissionPercentSnapshot: normalizePercent(dto.referredByCommissionPercentSnapshot, onboarding.referredByCommissionPercentSnapshot),
        archiveEmail: normalizeText(dto.archiveEmail, 180) ?? onboarding.archiveEmail,
        metadataJson: typeof dto.metadataJson === 'string' ? dto.metadataJson.slice(0, 5000) : onboarding.metadataJson,
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async generateContract(companyId: number, userId: number, createdByUserId?: number | null) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, createdByUserId);
    const contractText = buildSellerPartnerContract({
      sellerName: onboarding.legalName || onboarding.email || 'Parceiro HBX',
      sellerCpf: onboarding.cpf || null,
      sellerEmail: onboarding.email || null,
      sellerPhone: onboarding.phone || null,
      sellerAddress: onboarding.declaredAddress || null,
      commissionPercent: onboarding.commissionPercent,
      commissionDueBusinessDays: onboarding.commissionDueBusinessDays,
      contractDate: new Date().toLocaleDateString('pt-BR'),
      canRegisterHbxSellers: onboarding.canRegisterHbxSellers,
      sellerReferralCommissionPercent: onboarding.sellerReferralCommissionPercent,
      referredByName: onboarding.referredByNameSnapshot,
    });

    return this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: 'ready_to_send',
        contractVersion: SELLER_CONTRACT_VERSION,
        contractTextSnapshot: contractText,
        contractSha256: sha256Text(contractText),
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
  }

  private async assertHbxSellerNetworkCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { slug: true },
    });
    if (!company || !isMasterOperationalCompanySlug(company.slug)) {
      throw new BadRequestException('Onboarding de parceiro HBX só existe na operação HBX.');
    }
  }

  private async requirePartnerUserInCompany(companyId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: Number(userId), companyId: Number(companyId) },
      include: { company: { select: { id: true, commissionDueBusinessDays: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado na empresa.');
    if (String(user.role || '').toUpperCase() !== 'USER') {
      throw new BadRequestException('Onboarding de parceiro HBX é apenas para USER da operação HBX.');
    }
    return { user, company: user.company };
  }

  private async resolveReferredByNameSnapshot(companyId: number, referredByUserId?: number | null) {
    const referrerId = Number(referredByUserId || 0);
    if (!referrerId) return null;
    const referrer = await this.prisma.user.findFirst({
      where: { id: referrerId, companyId: Number(companyId) },
      select: { name: true, email: true, username: true },
    });
    return referrer?.name || referrer?.email || referrer?.username || null;
  }
}

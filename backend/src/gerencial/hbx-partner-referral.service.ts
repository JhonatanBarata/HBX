import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { isMasterOperationalCompanySlug } from '../commercial-plans/seat-billing.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HbxPartnerReferralService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePhoneDigits(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits || null;
  }

  private async assertHbxSellerNetwork(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) throw new ForbiddenException('Company context required');
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { slug: true },
    });
    if (!isMasterOperationalCompanySlug(company?.slug)) {
      throw new ForbiddenException('Indicações de parceiros estão disponíveis apenas na operação HBX.');
    }
    return normalizedCompanyId;
  }

  private hbxReferralCandidateInclude() {
    return {
      referrerUser: { select: { id: true, name: true, username: true, email: true, sellerReferralCommissionPercent: true, commissionPercent: true } },
      reviewedByUser: { select: { id: true, name: true, username: true, email: true } },
      convertedUser: { select: { id: true, name: true, username: true, email: true, isActive: true } },
    };
  }

  private async assertCandidateReferrerIsActive(companyId: number, referrerUserId: number) {
    const referrer = await this.prisma.user.findFirst({
      where: {
        id: referrerUserId,
        companyId,
        role: 'USER',
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
      },
      select: { id: true },
    });
    if (!referrer) {
      throw new BadRequestException('Indicador precisa ser parceiro ativo da operação HBX.');
    }
    return referrer;
  }

  async listPendingForMaster(masterUser: Pick<User, 'companyId'>) {
    const companyId = await this.assertHbxSellerNetwork(masterUser?.companyId);
    return this.prisma.hbxPartnerReferralCandidate.findMany({
      where: { companyId, status: { in: ['pending', 'approved'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.hbxReferralCandidateInclude(),
    });
  }

  async findCandidateByPhone(companyId: number, phone?: string | null) {
    const normalizedCompanyId = await this.assertHbxSellerNetwork(companyId);
    const candidatePhoneNormalized = this.normalizePhoneDigits(phone);
    if (!candidatePhoneNormalized) return null;
    return this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: {
        companyId: normalizedCompanyId,
        candidatePhoneNormalized,
        status: { in: ['pending', 'approved'] },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: this.hbxReferralCandidateInclude(),
    });
  }

  async approveCandidate(masterUser: Pick<User, 'id' | 'companyId'>, candidateId: string) {
    const companyId = await this.assertHbxSellerNetwork(masterUser?.companyId);
    const normalizedCandidateId = String(candidateId || '').trim();
    if (!normalizedCandidateId) throw new BadRequestException('Indicação inválida');

    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id: normalizedCandidateId, companyId },
      select: { id: true, status: true, referrerUserId: true },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada');
    if (candidate.status !== 'pending') throw new BadRequestException('Esta indicação já foi revisada.');
    await this.assertCandidateReferrerIsActive(companyId, candidate.referrerUserId);

    return this.prisma.hbxPartnerReferralCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'approved',
        reviewedByUserId: Number(masterUser?.id || 0) || null,
        reviewedAt: new Date(),
      },
      include: this.hbxReferralCandidateInclude(),
    });
  }

  async rejectCandidate(masterUser: Pick<User, 'id' | 'companyId'>, candidateId: string) {
    const companyId = await this.assertHbxSellerNetwork(masterUser?.companyId);
    const normalizedCandidateId = String(candidateId || '').trim();
    if (!normalizedCandidateId) throw new BadRequestException('Indicação inválida');

    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id: normalizedCandidateId, companyId },
      select: { id: true, status: true },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada');
    if (candidate.status !== 'pending') throw new BadRequestException('Esta indicação já foi revisada.');

    return this.prisma.hbxPartnerReferralCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'rejected',
        reviewedByUserId: Number(masterUser?.id || 0) || null,
        reviewedAt: new Date(),
      },
      include: this.hbxReferralCandidateInclude(),
    });
  }
}

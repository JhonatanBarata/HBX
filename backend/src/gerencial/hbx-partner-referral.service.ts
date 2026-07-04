import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { isTenantCompany } from '../common/company-kind';
import { PrismaService } from '../prisma/prisma.service';
import { loadUserTeamPolicyRuntime, resolveTeamPolicyAccessAllowed } from '../team/team-policy-persistence';

type RequesterUser = Pick<User, 'id' | 'companyId' | 'role' | 'isActive' | 'deactivatedAt' | 'isSystemMaster'>;

type CreateCandidateDto = {
  candidateName?: string | null;
  candidatePhone?: string | null;
  note?: string | null;
  preferredSegmentsJson?: string | null;
};

@Injectable()
export class HbxPartnerReferralService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: unknown) {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ');
    return normalized || null;
  }

  // RBAC Sprint 1: gate por politica no service. `false` explicito bloqueia
  // inclusive ADMIN/Gerente; system_master nunca e bloqueado (nao tem politica).
  private async assertTeamPolicyAccess(actingUser: any, accessKey: string, message: string) {
    if (actingUser?.isSystemMaster) return;
    const userId = Math.trunc(Number(actingUser?.id || 0));
    if (!userId) return;
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    if (resolveTeamPolicyAccessAllowed(policy, accessKey) === false) {
      throw new ForbiddenException(message);
    }
  }

  private normalizePhoneDigits(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits || null;
  }

  private candidateInclude() {
    return {
      referrerUser: { select: { id: true, name: true, username: true, email: true, sellerReferralCommissionPercent: true, commissionPercent: true } },
      reviewedByUser: { select: { id: true, name: true, username: true, email: true } },
      convertedUser: { select: { id: true, name: true, username: true, email: true, isActive: true } },
    };
  }

  private async assertHbxOperation(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) throw new ForbiddenException('Company context required');
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { companyKind: true },
    });
    if (!company || !isTenantCompany(company)) {
      throw new ForbiddenException('Indicações de vendedores estão disponíveis apenas para empresas tenant.');
    }
    return normalizedCompanyId;
  }

  private assertActiveHbxPartner(user?: Partial<RequesterUser> | null) {
    if (
      !user ||
      String(user.role || '').toUpperCase() !== 'USER' ||
      !user.isActive ||
      user.deactivatedAt ||
      user.isSystemMaster
    ) {
      throw new ForbiddenException('Seu usuário ainda não está autorizado a indicar vendedores.');
    }
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
      select: {
        id: true,
        companyId: true,
        role: true,
        isActive: true,
        deactivatedAt: true,
        isSystemMaster: true,
        commissionPercent: true,
        sellerReferralCommissionPercent: true,
      },
    });
    if (!referrer) {
      throw new BadRequestException('Indicador precisa ser vendedor ativo da empresa.');
    }
    return referrer;
  }

  async createCandidate(requesterUser: RequesterUser, dto: CreateCandidateDto) {
    const companyId = await this.assertHbxOperation(requesterUser?.companyId);
    this.assertActiveHbxPartner(requesterUser);
    // RBAC Sprint 1: indicar vendedor exige sellerNetwork.recruitSellers.
    await this.assertTeamPolicyAccess(requesterUser, 'sellerNetwork.recruitSellers', 'Indicar vendedores esta bloqueado pela politica da equipe.');

    const candidateName = this.normalizeText(dto?.candidateName);
    const candidatePhone = this.normalizeText(dto?.candidatePhone);
    const candidatePhoneNormalized = this.normalizePhoneDigits(candidatePhone);
    if (!candidateName) throw new BadRequestException('Informe o nome do contato indicado.');
    if (!candidatePhone) throw new BadRequestException('Informe o WhatsApp do contato indicado.');

    const existing = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: {
        companyId,
        ...(candidatePhoneNormalized ? { candidatePhoneNormalized } : { candidatePhone }),
        status: { in: ['pending', 'approved'] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new BadRequestException('Já existe uma indicação pendente ou aprovada com este WhatsApp.');
    }

    return this.prisma.hbxPartnerReferralCandidate.create({
      data: {
        companyId,
        referrerUserId: Number(requesterUser.id),
        candidateName,
        candidatePhone,
        candidatePhoneNormalized,
        note: this.normalizeText(dto?.note),
        preferredSegmentsJson: this.normalizeText(dto?.preferredSegmentsJson),
        status: 'pending',
      },
      include: this.candidateInclude(),
    });
  }

  async listPendingForMaster(masterUser: Pick<User, 'companyId'>) {
    const companyId = await this.assertHbxOperation(masterUser?.companyId);
    return this.prisma.hbxPartnerReferralCandidate.findMany({
      where: { companyId, status: { in: ['pending', 'approved'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.candidateInclude(),
    });
  }

  async approveCandidate(masterUser: Pick<User, 'id' | 'companyId'>, candidateId: string) {
    const companyId = await this.assertHbxOperation(masterUser?.companyId);
    // RBAC Sprint 1: aprovar indicacao exige sellerNetwork.approveReferrals.
    await this.assertTeamPolicyAccess(masterUser, 'sellerNetwork.approveReferrals', 'Aprovar indicacoes esta bloqueado pela politica da equipe.');
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
      include: this.candidateInclude(),
    });
  }

  async rejectCandidate(masterUser: Pick<User, 'id' | 'companyId'>, candidateId: string, _reason?: string | null) {
    const companyId = await this.assertHbxOperation(masterUser?.companyId);
    // RBAC Sprint 1: rejeitar indicacao tambem e sellerNetwork.approveReferrals.
    await this.assertTeamPolicyAccess(masterUser, 'sellerNetwork.approveReferrals', 'Aprovar/rejeitar indicacoes esta bloqueado pela politica da equipe.');
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
      include: this.candidateInclude(),
    });
  }

  async findCandidateByPhone(companyId: number, phone?: string | null) {
    const normalizedCompanyId = await this.assertHbxOperation(companyId);
    const candidatePhoneNormalized = this.normalizePhoneDigits(phone);
    if (!candidatePhoneNormalized) return null;
    return this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: {
        companyId: normalizedCompanyId,
        candidatePhoneNormalized,
        status: { in: ['pending', 'approved'] },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: this.candidateInclude(),
    });
  }

  async getCandidateForConversion(companyId: number, candidateId?: string | null) {
    const normalizedCompanyId = await this.assertHbxOperation(companyId);
    const normalizedCandidateId = String(candidateId || '').trim();
    if (!normalizedCandidateId) return null;
    return this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: {
        id: normalizedCandidateId,
        companyId: normalizedCompanyId,
        status: { in: ['pending', 'approved'] },
      },
      include: {
        referrerUser: {
          select: {
            id: true,
            companyId: true,
            role: true,
            isActive: true,
            deactivatedAt: true,
            isSystemMaster: true,
            canRegisterHbxSellers: true,
            commissionPercent: true,
            sellerReferralCommissionPercent: true,
            name: true,
            username: true,
            email: true,
          },
        },
      },
    });
  }

  async markCandidateConverted(input: {
    companyId: number;
    candidateId: string;
    convertedUserId: number;
    reviewedByUserId?: number | null;
  }) {
    const companyId = await this.assertHbxOperation(input.companyId);
    const candidateId = String(input.candidateId || '').trim();
    const convertedUserId = Math.trunc(Number(input.convertedUserId || 0));
    if (!candidateId || !convertedUserId) throw new BadRequestException('Conversão de indicação inválida');

    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id: candidateId, companyId, status: { in: ['pending', 'approved'] } },
      select: { id: true, reviewedAt: true, reviewedByUserId: true },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada para conversão');

    return this.prisma.hbxPartnerReferralCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'converted',
        convertedUserId,
        reviewedByUserId: candidate.reviewedByUserId || Math.trunc(Number(input.reviewedByUserId || 0)) || null,
        reviewedAt: candidate.reviewedAt || new Date(),
      },
      include: this.candidateInclude(),
    });
  }
}

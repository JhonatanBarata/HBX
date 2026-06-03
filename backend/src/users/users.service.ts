import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';
import { isBillableUserSeatSnapshot, isMasterOperationalCompanySlug } from '../commercial-plans/seat-billing.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async isBillableCompany(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { slug: true },
    });
    return !isMasterOperationalCompanySlug(company?.slug);
  }

  async isHbxSellerNetworkCompany(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { slug: true },
    });
    return isMasterOperationalCompanySlug(company?.slug);
  }

  async getCompanyCommissionDueBusinessDays(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return 3;
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { commissionDueBusinessDays: true },
    });
    const numeric = Math.trunc(Number(company?.commissionDueBusinessDays));
    if (!Number.isFinite(numeric)) return 3;
    return Math.min(30, Math.max(0, numeric));
  }

  async getActiveSellerReferrer(companyId: number, userId?: number | null) {
    const normalizedUserId = Number(userId || 0);
    if (!normalizedUserId) return null;
    return this.prisma.user.findFirst({
      where: {
        id: normalizedUserId,
        companyId: Number(companyId),
        role: 'USER',
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        commissionPercent: true,
        sellerReferralCommissionPercent: true,
      },
    });
  }

  private normalizeCandidateStatus(status?: string | null) {
    const normalized = String(status || '').trim().toLowerCase();
    if (['pending', 'approved', 'rejected', 'converted'].includes(normalized)) return normalized;
    return 'pending';
  }

  private normalizePhoneDigits(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits || null;
  }

  async createHbxPartnerReferralCandidate(input: {
    companyId: number;
    referrerUserId: number;
    name: string;
    phone: string;
    note?: string | null;
    preferredSegmentsJson?: string | null;
  }) {
    const companyId = Math.trunc(Number(input.companyId || 0));
    const referrerUserId = Math.trunc(Number(input.referrerUserId || 0));
    const name = String(input.name || '').trim().replace(/\s+/g, ' ');
    const phone = String(input.phone || '').trim().replace(/\s+/g, ' ');
    const phoneNormalized = this.normalizePhoneDigits(phone);
    if (!companyId || !referrerUserId) throw new BadRequestException('Indicador inválido');
    if (!name) throw new BadRequestException('Informe o nome do contato indicado.');
    if (!phone) throw new BadRequestException('Informe o WhatsApp do contato indicado.');

    const existingPending = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: {
        companyId,
        ...(phoneNormalized ? { phoneNormalized } : { phone }),
        status: { in: ['pending', 'approved'] },
      },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException('Já existe uma indicação pendente ou aprovada com este WhatsApp.');
    }

    return this.prisma.hbxPartnerReferralCandidate.create({
      data: {
        companyId,
        referrerUserId,
        name,
        phone,
        phoneNormalized,
        note: input.note || null,
        preferredSegmentsJson: input.preferredSegmentsJson || null,
        status: 'pending',
      },
      include: {
        referrerUser: { select: { id: true, name: true, username: true, email: true } },
      },
    });
  }

  async listHbxPartnerReferralCandidates(companyId: number, status?: string | null) {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    if (!normalizedCompanyId) return [];
    const normalizedStatus = status && !['all', 'active'].includes(status) ? this.normalizeCandidateStatus(status) : null;
    return this.prisma.hbxPartnerReferralCandidate.findMany({
      where: {
        companyId: normalizedCompanyId,
        ...(status === 'active' ? { status: { in: ['pending', 'approved'] } } : {}),
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        referrerUser: { select: { id: true, name: true, username: true, email: true, sellerReferralCommissionPercent: true, commissionPercent: true } },
        reviewedByUser: { select: { id: true, name: true, username: true, email: true } },
        convertedUser: { select: { id: true, name: true, username: true, email: true, isActive: true } },
      },
    });
  }

  async rejectHbxPartnerReferralCandidate(input: {
    companyId: number;
    candidateId: string;
    reviewedByUserId: number;
  }) {
    const companyId = Math.trunc(Number(input.companyId || 0));
    const candidateId = String(input.candidateId || '').trim();
    if (!companyId || !candidateId) throw new BadRequestException('Indicação inválida');
    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id: candidateId, companyId },
      select: { id: true, status: true },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada');
    if (candidate.status !== 'pending') throw new BadRequestException('Esta indicação já foi revisada.');
    return this.prisma.hbxPartnerReferralCandidate.update({
      where: { id: candidateId },
      data: {
        status: 'rejected',
        reviewedByUserId: Math.trunc(Number(input.reviewedByUserId || 0)) || null,
        reviewedAt: new Date(),
      },
      include: {
        referrerUser: { select: { id: true, name: true, username: true, email: true } },
        reviewedByUser: { select: { id: true, name: true, username: true, email: true } },
        convertedUser: { select: { id: true, name: true, username: true, email: true, isActive: true } },
      },
    });
  }

  async approveHbxPartnerReferralCandidate(input: {
    companyId: number;
    candidateId: string;
    reviewedByUserId: number;
  }) {
    const companyId = Math.trunc(Number(input.companyId || 0));
    const candidateId = String(input.candidateId || '').trim();
    if (!companyId || !candidateId) throw new BadRequestException('Indicação inválida');

    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id: candidateId, companyId },
      include: {
        referrerUser: {
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
        },
      },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada');
    if (candidate.status !== 'pending') throw new BadRequestException('Esta indicação já foi revisada.');

    const referrer = candidate.referrerUser;
    if (
      !referrer ||
      Number(referrer.companyId || 0) !== companyId ||
      String(referrer.role || '').toUpperCase() !== 'USER' ||
      !referrer.isActive ||
      referrer.deactivatedAt ||
      referrer.isSystemMaster
    ) {
      throw new BadRequestException('Indicador precisa ser parceiro ativo da operação HBX.');
    }

    return {
      candidate: await this.prisma.hbxPartnerReferralCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'approved',
          reviewedByUserId: Math.trunc(Number(input.reviewedByUserId || 0)) || null,
          reviewedAt: new Date(),
        },
        include: {
          referrerUser: { select: { id: true, name: true, username: true, email: true, sellerReferralCommissionPercent: true, commissionPercent: true } },
          reviewedByUser: { select: { id: true, name: true, username: true, email: true } },
          convertedUser: { select: { id: true, name: true, username: true, email: true, isActive: true } },
        },
      }),
    };
  }

  async findHbxPartnerReferralCandidateByPhone(companyId: number, phone?: string | null) {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    const phoneNormalized = this.normalizePhoneDigits(phone);
    if (!normalizedCompanyId || !phoneNormalized) return null;
    return this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: {
        companyId: normalizedCompanyId,
        phoneNormalized,
        status: { in: ['pending', 'approved'] },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        referrerUser: { select: { id: true, name: true, username: true, email: true, sellerReferralCommissionPercent: true, commissionPercent: true } },
        reviewedByUser: { select: { id: true, name: true, username: true, email: true } },
        convertedUser: { select: { id: true, name: true, username: true, email: true, isActive: true } },
      },
    });
  }

  async getHbxPartnerReferralCandidateForConversion(companyId: number, candidateId?: string | null) {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    const normalizedCandidateId = String(candidateId || '').trim();
    if (!normalizedCompanyId || !normalizedCandidateId) return null;
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

  async markHbxPartnerReferralCandidateConverted(input: {
    companyId: number;
    candidateId: string;
    convertedUserId: number;
    reviewedByUserId?: number | null;
  }) {
    const companyId = Math.trunc(Number(input.companyId || 0));
    const candidateId = String(input.candidateId || '').trim();
    const convertedUserId = Math.trunc(Number(input.convertedUserId || 0));
    if (!companyId || !candidateId || !convertedUserId) throw new BadRequestException('Conversão de indicação inválida');
    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id: candidateId, companyId, status: { in: ['pending', 'approved'] } },
      select: { id: true, reviewedAt: true, reviewedByUserId: true },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada para conversão');
    return this.prisma.hbxPartnerReferralCandidate.update({
      where: { id: candidateId },
      data: {
        status: 'converted',
        convertedUserId,
        reviewedByUserId: candidate.reviewedByUserId || Math.trunc(Number(input.reviewedByUserId || 0)) || null,
        reviewedAt: candidate.reviewedAt || new Date(),
      },
    });
  }

  private async countBillableUsers(companyId: number) {
    if (!(await this.isBillableCompany(companyId))) return 0;
    return this.prisma.user.count({
      where: {
        companyId,
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
        role: { in: ['USER', 'ADMIN'] },
      },
    });
  }

  private async openBillableSeatUsage(input: {
    companyId?: number | null;
    userId?: number | null;
    role?: string | null;
    source: string;
    startedAt?: Date;
  }) {
    const companyId = Number(input.companyId || 0);
    const userId = Number(input.userId || 0);
    if (!companyId || !userId) return;
    if (!(await this.isBillableCompany(companyId))) return;

    const existing = await this.prisma.companyBillableSeatUsage.findFirst({
      where: { companyId, userId, endedAt: null },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) return;

    await this.prisma.companyBillableSeatUsage.create({
      data: {
        companyId,
        userId,
        role: input.role || null,
        startedAt: input.startedAt || new Date(),
        startSource: input.source,
      },
    });
  }

  private async closeBillableSeatUsage(input: {
    companyId?: number | null;
    userId?: number | null;
    source: string;
    endedAt?: Date;
  }) {
    const companyId = Number(input.companyId || 0);
    const userId = Number(input.userId || 0);
    if (!companyId || !userId) return;
    await this.prisma.companyBillableSeatUsage.updateMany({
      where: { companyId, userId, endedAt: null },
      data: {
        endedAt: input.endedAt || new Date(),
        endSource: input.source,
      },
    });
  }

  private async logBillableUserChange(input: {
    companyId?: number | null;
    userId?: number | null;
    eventType: 'user_billable_added' | 'user_billable_removed' | 'billable_user_count_changed';
    source: string;
  }) {
    const companyId = Number(input.companyId || 0);
    if (!companyId) return;
    if (!(await this.isBillableCompany(companyId))) return;
    const [company, billableUsers] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { selectedPlanKey: true },
      }),
      this.countBillableUsers(companyId),
    ]);
    await this.prisma.companyCommercialUsageLog.create({
      data: {
        companyId,
        userId: Number(input.userId || 0) || null,
        planKey: company?.selectedPlanKey || null,
        eventType: input.eventType,
        source: input.source,
        metadataJson: JSON.stringify({ billableUsers }),
      },
    });
  }

  async create(data: {
    username?: string | null;
    email: string;
    password: string;
    name?: string | null;
    phone?: string | null;
    commissionPercent?: number;
    canRegisterHbxSellers?: boolean;
    sellerReferralCommissionPercent?: number;
    referredByUserId?: number | null;
    referredByCommissionPercentSnapshot?: number;
    mustChangePassword?: boolean;
    companyId?: number | null;
    role?: string;
    isActive?: boolean;
  }): Promise<User> {
    const created = await this.prisma.user.create({ data });
    if (isBillableUserSeatSnapshot(created)) {
      await this.openBillableSeatUsage({
        companyId: created.companyId,
        userId: created.id,
        role: created.role,
        source: 'user_create',
        startedAt: created.createdAt,
      });
      await this.logBillableUserChange({
        companyId: created.companyId,
        userId: created.id,
        eventType: 'user_billable_added',
        source: 'user_create',
      });
      await this.logBillableUserChange({
        companyId: created.companyId,
        userId: created.id,
        eventType: 'billable_user_count_changed',
        source: 'user_create',
      });
    }
    return created;
  }

  async getCompanyTrialSeatUsage(companyId: number) {
    const [company, activeUsers, activeAdmins, activeSellers] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          commissionDueBusinessDays: true,
          onboardingStatus: true,
          paymentStatus: true,
          subscriptionStatus: true,
        },
      }),
      this.prisma.user.count({
        where: {
          companyId,
          isActive: true,
          deactivatedAt: null,
          isSystemMaster: false,
          role: { notIn: ['USERMASTER'] },
        },
      }),
      this.prisma.user.count({
        where: {
          companyId,
          isActive: true,
          deactivatedAt: null,
          isSystemMaster: false,
          role: 'ADMIN',
        },
      }),
      this.prisma.user.count({
        where: {
          companyId,
          isActive: true,
          deactivatedAt: null,
          isSystemMaster: false,
          role: { in: ['USER', 'ADMIN'] },
        },
      }),
    ]);

    const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase();
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const isTrial =
      onboardingStatus === 'pending_email_confirmation' ||
      onboardingStatus === 'active_trial' ||
      paymentStatus === 'TRIAL' ||
      subscriptionStatus === 'trialing';

    return {
      company,
      activeUsers,
      activeAdmins,
      activeSellers,
      isTrial,
      maxAdmins: 1,
      maxSellers: 2,
      maxUsers: 3,
    };
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username },
      include: { company: { include: { plan: { include: { features: true } } } } },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { company: { include: { plan: { include: { features: true } } } } },
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { company: { include: { plan: { include: { features: true } } } } },
    });
  }

  async updateCompany(userId: number, companyId: number): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { companyId } });
  }

  async setPassword(userId: number, hashedPassword: string, options?: { mustChangePassword?: boolean }): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        mustChangePassword: Boolean(options?.mustChangePassword),
      },
    });
  }

  async updateById(userId: number, data: any): Promise<User> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        companyId: true,
        role: true,
        isActive: true,
        isSystemMaster: true,
        deactivatedAt: true,
      },
    });
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: {
        referredByUser: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
      },
    });
    if (before?.companyId || updated.companyId) {
      const beforeCompany = before?.companyId
        ? await this.prisma.company.findUnique({ where: { id: before.companyId }, select: { slug: true } })
        : null;
      const updatedCompany = updated.companyId
        ? await this.prisma.company.findUnique({ where: { id: updated.companyId }, select: { slug: true } })
        : null;
      const wasBillable = isBillableUserSeatSnapshot(before, beforeCompany);
      const isBillable = isBillableUserSeatSnapshot(updated, updatedCompany);
      const companyChanged = Number(before?.companyId || 0) !== Number(updated.companyId || 0);
      if (wasBillable !== isBillable || (wasBillable && isBillable && companyChanged)) {
        if (wasBillable) {
          await this.closeBillableSeatUsage({
            companyId: before.companyId,
            userId,
            source: 'user_update',
          });
        }
        if (isBillable) {
          await this.openBillableSeatUsage({
            companyId: updated.companyId,
            userId,
            role: updated.role,
            source: 'user_update',
          });
        }
        await this.logBillableUserChange({
          companyId: isBillable ? updated.companyId : before.companyId,
          userId,
          eventType: isBillable ? 'user_billable_added' : 'user_billable_removed',
          source: 'user_update',
        });
        if (wasBillable && isBillable && companyChanged) {
          await this.logBillableUserChange({
            companyId: before.companyId,
            userId,
            eventType: 'user_billable_removed',
            source: 'user_update_company_changed',
          });
        }
        await this.logBillableUserChange({
          companyId: isBillable ? updated.companyId : before.companyId,
          userId,
          eventType: 'billable_user_count_changed',
          source: 'user_update',
        });
      }
    }
    return updated;
  }

  async listByCompany(companyId: number): Promise<any[]> {
    return this.prisma.user.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        phone: true,
        commissionPercent: true,
        canRegisterHbxSellers: true,
        sellerReferralCommissionPercent: true,
        referredByUserId: true,
        referredByCommissionPercentSnapshot: true,
        referredByUser: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
        companyId: true,
        role: true,
        isSystemMaster: true,
        isActive: true,
        deactivatedAt: true,
        retentionUntil: true,
        createdAt: true,
      },
    });
  }

  async updateRole(userId: number, role: 'USER' | 'ADMIN'): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async deactivateUser(userId: number, retentionDays = 730): Promise<User> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
    });
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    const endedAt = new Date();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: endedAt,
        retentionUntil,
      },
    });
    const company = before?.companyId
      ? await this.prisma.company.findUnique({ where: { id: before.companyId }, select: { slug: true } })
      : null;
    if (isBillableUserSeatSnapshot(before, company)) {
      await this.closeBillableSeatUsage({
        companyId: before.companyId,
        userId,
        source: 'user_deactivate',
        endedAt,
      });
      await this.logBillableUserChange({
        companyId: before.companyId,
        userId,
        eventType: 'user_billable_removed',
        source: 'user_deactivate',
      });
      await this.logBillableUserChange({
        companyId: before.companyId,
        userId,
        eventType: 'billable_user_count_changed',
        source: 'user_deactivate',
      });
    }
    return updated;
  }

  async reactivateUser(userId: number): Promise<User> {
    const startedAt = new Date();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deactivatedAt: null,
        retentionUntil: null,
      },
    });
    const company = updated.companyId
      ? await this.prisma.company.findUnique({ where: { id: updated.companyId }, select: { slug: true } })
      : null;
    if (isBillableUserSeatSnapshot(updated, company)) {
      await this.openBillableSeatUsage({
        companyId: updated.companyId,
        userId: updated.id,
        role: updated.role,
        source: 'user_reactivate',
        startedAt,
      });
      await this.logBillableUserChange({
        companyId: updated.companyId,
        userId,
        eventType: 'user_billable_added',
        source: 'user_reactivate',
      });
      await this.logBillableUserChange({
        companyId: updated.companyId,
        userId,
        eventType: 'billable_user_count_changed',
        source: 'user_reactivate',
      });
    }
    return updated;
  }

  async hardDeleteUser(userId: number): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
    });
    const hasWebsiteAdminEntryToken = await this.prisma.hasTable('WebsiteAdminEntryToken');
    const hasMasterBillingLedgerEntry = await this.prisma.hasTable('MasterBillingLedgerEntry');

    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();

      await tx.user.updateMany({
        where: { referredByUserId: userId },
        data: {
          referredByUserId: null,
          referredByCommissionPercentSnapshot: 0,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { currentSessionId: null },
      });

      await tx.authSession.deleteMany({ where: { userId } });
      await tx.userModuleAccess.deleteMany({ where: { userId } });
      await tx.passwordReset.deleteMany({ where: { userId } });
      await tx.masterNoticeAck.deleteMany({ where: { userId } });

      await tx.productVersion.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });

      await tx.deletionRecord.updateMany({
        where: { deletedByUserId: userId },
        data: { deletedByUserId: null },
      });

      await tx.masterAssumedContextSession.updateMany({
        where: { endedByUserId: userId },
        data: { endedByUserId: null },
      });

      await tx.masterSupportAuditLog.deleteMany({ where: { masterUserId: userId } });
      await tx.masterAssumedContextSession.deleteMany({ where: { masterUserId: userId } });
      await tx.masterNotice.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });

      await tx.techAssistantInteraction.deleteMany({ where: { userId } });
      await tx.webscrapingSearchHistory.deleteMany({ where: { userId } });
      await tx.webscrapingSearchRun.deleteMany({ where: { userId } });
      await tx.webscrapingCampaign.deleteMany({ where: { userId } });
      await tx.webscrapingUsageLog.deleteMany({ where: { userId } });
      await tx.nightFactoryRewardClaim.deleteMany({ where: { userId } });
      await tx.salesProfile.deleteMany({ where: { userId } });
      await tx.radarDistributionDailyUsage.deleteMany({ where: { userId } });

      await tx.vendasCardComplaint.updateMany({
        where: { userId },
        data: { userId: null },
      });
      await tx.vendasCardComplaint.updateMany({
        where: { resolvedByUserId: userId },
        data: { resolvedByUserId: null },
      });

      await tx.hbxRecoveryPayment.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });

      await tx.financeiroCharge.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });

      await tx.integrationSyncRun.updateMany({
        where: { triggeredByUserId: userId },
        data: { triggeredByUserId: null },
      });

      await tx.radarLeadEvent.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });

      await tx.radarLeadCompanyState.updateMany({
        where: { assignedUserId: userId },
        data: { assignedUserId: null },
      });
      await tx.radarLeadCompanyState.updateMany({
        where: { assignedByUserId: userId },
        data: { assignedByUserId: null },
      });

      await tx.radarAutoDistributionRule.updateMany({
        where: { adminUserId: userId },
        data: { adminUserId: null },
      });
      await tx.radarAutoDistributionRule.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });
      await tx.radarAutoDistributionRule.updateMany({
        where: { updatedByUserId: userId },
        data: { updatedByUserId: null },
      });
      const distributionRules = await tx.radarAutoDistributionRule.findMany({
        where: { targetUserIdsJson: { contains: String(userId) } },
        select: { id: true, targetUserIdsJson: true },
      });
      for (const rule of distributionRules) {
        try {
          const targetUserIds = JSON.parse(rule.targetUserIdsJson || '[]');
          if (!Array.isArray(targetUserIds)) continue;
          const nextTargetUserIds = targetUserIds.filter((value) => Number(value) !== userId);
          if (nextTargetUserIds.length === targetUserIds.length) continue;
          await tx.radarAutoDistributionRule.update({
            where: { id: rule.id },
            data: { targetUserIdsJson: JSON.stringify(nextTargetUserIds) },
          });
        } catch {
          await tx.radarAutoDistributionRule.update({
            where: { id: rule.id },
            data: { targetUserIdsJson: '[]' },
          });
        }
      }

      await tx.vendasLead.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });
      await tx.vendasLead.updateMany({
        where: { assignedUserId: userId },
        data: {
          assignedUserId: null,
          assignedAt: null,
          commissionPercentSnapshot: 0,
        },
      });
      await tx.vendasLead.updateMany({
        where: { assignedByUserId: userId },
        data: { assignedByUserId: null },
      });

      await tx.vendasLeadTimelineEvent.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });

      await tx.vendasCommissionPayout.updateMany({
        where: { sellerUserId: userId },
        data: { sellerUserId: null },
      });
      await tx.vendasCommissionPayout.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });
      await tx.vendasCommissionReceivable.updateMany({
        where: { sellerUserId: userId },
        data: { sellerUserId: null },
      });
      await tx.vendasCommissionReceivable.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });
      await tx.vendasAutomationCampaign.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });

      if (hasWebsiteAdminEntryToken) {
        await tx.$executeRawUnsafe(
          `DELETE FROM "WebsiteAdminEntryToken" WHERE "userId" = ${Number(userId)}`
        );
      }

      if (hasMasterBillingLedgerEntry) {
        await tx.$executeRawUnsafe(
          `UPDATE "MasterBillingLedgerEntry" SET "createdByUserId" = NULL WHERE "createdByUserId" = ${Number(userId)}`
        );
      }

      await tx.companyBillableSeatUsage.updateMany({
        where: { userId },
        data: {
          userId: null,
          endedAt: deletedAt,
          endSource: 'user_delete',
        },
      });

      await tx.user.delete({ where: { id: userId } });
    });
    const company = target?.companyId
      ? await this.prisma.company.findUnique({ where: { id: target.companyId }, select: { slug: true } })
      : null;
    if (isBillableUserSeatSnapshot(target, company)) {
      await this.logBillableUserChange({
        companyId: target.companyId,
        userId: null,
        eventType: 'user_billable_removed',
        source: 'user_delete',
      });
      await this.logBillableUserChange({
        companyId: target.companyId,
        userId: null,
        eventType: 'billable_user_count_changed',
        source: 'user_delete',
      });
    }
  }
}

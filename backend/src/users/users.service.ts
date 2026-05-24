import { Injectable } from '@nestjs/common';
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
        canRegisterHbxSellers: true,
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

  private async countBillableUsers(companyId: number) {
    if (!(await this.isBillableCompany(companyId))) return 0;
    return this.prisma.user.count({
      where: {
        companyId,
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
        role: 'USER',
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
    companyId?: number | null;
    role?: string;
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
          role: 'USER',
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

  async setPassword(userId: number, hashedPassword: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
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
      await tx.userModuleAccess.deleteMany({ where: { userId } });
      await tx.passwordReset.deleteMany({ where: { userId } });

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

      await tx.techAssistantInteraction.deleteMany({ where: { userId } });
      await tx.webscrapingSearchHistory.deleteMany({ where: { userId } });
      await tx.webscrapingUsageLog.deleteMany({ where: { userId } });

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

      await tx.vendasLead.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      });

      await tx.vendasLeadTimelineEvent.updateMany({
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
        where: { userId, endedAt: null },
        data: {
          endedAt: new Date(),
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
        userId,
        eventType: 'user_billable_removed',
        source: 'user_delete',
      });
      await this.logBillableUserChange({
        companyId: target.companyId,
        userId,
        eventType: 'billable_user_count_changed',
        source: 'user_delete',
      });
    }
  }
}

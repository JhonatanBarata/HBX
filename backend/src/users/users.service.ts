import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async countBillableUsers(companyId: number) {
    return this.prisma.user.count({
      where: {
        companyId,
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
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
    companyId?: number | null;
    role?: string;
  }): Promise<User> {
    const created = await this.prisma.user.create({ data });
    if (created.companyId && created.isActive && !created.isSystemMaster) {
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
    const [company, activeUsers] = await Promise.all([
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
      isTrial,
      maxUsers: 2,
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
      select: { id: true, companyId: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
    });
    const updated = await this.prisma.user.update({ where: { id: userId }, data });
    if (before?.companyId && !before.isSystemMaster && typeof data?.isActive === 'boolean') {
      const wasBillable = Boolean(before.isActive) && !before.deactivatedAt;
      const isBillable = Boolean(updated.isActive) && !updated.deactivatedAt;
      if (wasBillable !== isBillable) {
        await this.logBillableUserChange({
          companyId: before.companyId,
          userId,
          eventType: isBillable ? 'user_billable_added' : 'user_billable_removed',
          source: 'user_update',
        });
        await this.logBillableUserChange({
          companyId: before.companyId,
          userId,
          eventType: 'billable_user_count_changed',
          source: 'user_update',
        });
      }
    }
    return updated;
  }

  async listByCompany(companyId: number): Promise<Array<Pick<User, 'id' | 'username' | 'email' | 'name' | 'phone' | 'commissionPercent' | 'companyId' | 'role' | 'isActive' | 'deactivatedAt' | 'retentionUntil' | 'createdAt'>>> {
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
        companyId: true,
        role: true,
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
      select: { companyId: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
    });
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        retentionUntil,
      },
    });
    if (before?.companyId && before.isActive && !before.deactivatedAt && !before.isSystemMaster) {
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
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deactivatedAt: null,
        retentionUntil: null,
      },
    });
    if (updated.companyId && updated.isActive && !updated.isSystemMaster) {
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
      select: { companyId: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
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

      await tx.user.delete({ where: { id: userId } });
    });
    if (target?.companyId && target.isActive && !target.deactivatedAt && !target.isSystemMaster) {
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

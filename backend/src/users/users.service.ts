import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { username?: string | null; email: string; password: string; name?: string; companyId?: number | null; role?: string }): Promise<User> {
    return this.prisma.user.create({ data });
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
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async listByCompany(companyId: number): Promise<Array<Pick<User, 'id' | 'username' | 'email' | 'name' | 'companyId' | 'role' | 'isActive' | 'deactivatedAt' | 'retentionUntil' | 'createdAt'>>> {
    return this.prisma.user.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
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
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        retentionUntil,
      },
    });
  }

  async reactivateUser(userId: number): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deactivatedAt: null,
        retentionUntil: null,
      },
    });
  }

  async hardDeleteUser(userId: number): Promise<void> {
    const hasWebsiteAdminEntryToken = await this.prisma.hasTable('WebsiteAdminEntryToken');
    const hasMasterBillingLedgerEntry = await this.prisma.hasTable('MasterBillingLedgerEntry');

    await this.prisma.$transaction(async (tx) => {
      await tx.userModuleAccess.deleteMany({ where: { userId } });
      await tx.passwordReset.deleteMany({ where: { userId } });

      await tx.productVersion.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });

      await tx.importacao.updateMany({
        where: {
          OR: [
            { createdBy: userId },
            { finalizedBy: userId },
            { reabertoPor: userId },
          ],
        },
        data: {
          createdBy: null,
          finalizedBy: null,
          reabertoPor: null,
        },
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
  }
}

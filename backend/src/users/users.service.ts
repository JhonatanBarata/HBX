import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import type { User } from '@prisma/client';
import {
  isBillableUserSeatSnapshot,
} from '../commercial-plans/seat-billing.util';
import {
  getCommercialPlanTitle,
  normalizeCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { isTenantCompany } from '../common/company-kind';
import { ensureUserTeamPolicyForUser } from '../team/team-policy-persistence';
import { assertEffectiveTeamAccess } from '../team/team-access-runtime';
import {
  buildPreferredSegmentsJsonValue,
  parsePreferredSegments,
  type PreferredSegments,
} from './preferred-segments.util';
import {
  CATEGORY_MANAGED_MODULE_KEYS,
  moduleKeysForCategories,
  normalizeModuleCategories,
  type ModuleCategoryKey,
} from '../modules/module-categories';

export const SELF_ACCESS_REMOVAL_MESSAGE = 'Você não pode remover seu próprio acesso.';
export const LAST_TENANT_ADMIN_MESSAGE = 'A empresa precisa manter pelo menos um administrador ativo.';

type UserMutationGuardAction = 'delete' | 'deactivate' | 'role_update' | 'profile_update';

type UserMutationGuardOptions = {
  actorUserId?: number | null;
  action?: UserMutationGuardAction;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
  ) {}

  private readonly logger = new Logger(UsersService.name);

  // RBAC Sprint 1: gate de gestao de usuarios da empresa (team.users.*). Fica
  // no service (reutilizavel/testavel) e e chamado pelos endpoints de empresa
  // ANTES do primitivo (create/updateById/deactivate/hardDelete) — os primitivos
  // seguem intocados para os caminhos master/sistema (sem user). Semantica:
  // `false` explicito na politica bloqueia INCLUSIVE ADMIN/Gerente; system_master
  // nunca e bloqueado (assertEffectiveTeamAccess so cai no bloqueio quando a
  // politica persistida resolve false, e o master nao tem politica).
  async assertCompanyUserManagementAccess(actingUser: any, accessKey: string, message: string) {
    if (actingUser?.isSystemMaster) return;
    await assertEffectiveTeamAccess(this.prisma, actingUser, accessKey, message);
  }

  private normalizeTeamRole(role?: string | null) {
    const normalized = String(role || '').trim().toUpperCase();
    return normalized === 'ADMIN' ? 'ADMIN' : normalized === 'USERMASTER' ? 'USERMASTER' : 'USER';
  }

  private isActiveTenantAdminSnapshot(user?: any) {
    return Boolean(
      user &&
      Number(user.companyId || 0) > 0 &&
      this.normalizeTeamRole(user.role) === 'ADMIN' &&
      user.isActive === true &&
      user.isSystemMaster === false,
    );
  }

  private async isTenantCompanyId(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { companyKind: true },
    });
    return Boolean(company && isTenantCompany(company));
  }

  private async countOtherActiveTenantAdmins(companyId: number, userId: number) {
    return this.prisma.user.count({
      where: {
        companyId,
        id: { not: userId },
        role: 'ADMIN',
        isActive: true,
        isSystemMaster: false,
      },
    });
  }

  private assertSelfMutationAllowed(userId: number, before: any, next: any, options?: UserMutationGuardOptions) {
    const actorUserId = Number(options?.actorUserId || 0);
    if (!actorUserId || actorUserId !== Number(userId || 0)) return;

    const action = options?.action;
    if (action === 'delete' || action === 'deactivate') {
      throw new BadRequestException(SELF_ACCESS_REMOVAL_MESSAGE);
    }

    const beforeRole = this.normalizeTeamRole(before?.role);
    const nextRole = this.normalizeTeamRole(next?.role);
    if (beforeRole === 'ADMIN' && nextRole === 'USER') {
      throw new BadRequestException(SELF_ACCESS_REMOVAL_MESSAGE);
    }

    if (before?.isActive === true && next?.isActive === false) {
      throw new BadRequestException(SELF_ACCESS_REMOVAL_MESSAGE);
    }
  }

  private async assertTenantKeepsActiveAdmin(userId: number, before: any, next: any, options?: UserMutationGuardOptions) {
    this.assertSelfMutationAllowed(userId, before, next, options);

    if (!this.isActiveTenantAdminSnapshot(before) || this.isActiveTenantAdminSnapshot(next)) return;

    const companyId = Number(before?.companyId || 0);
    if (!companyId || !(await this.isTenantCompanyId(companyId))) return;

    const otherActiveAdmins = await this.countOtherActiveTenantAdmins(companyId, Number(userId));
    if (otherActiveAdmins <= 0) {
      throw new BadRequestException(LAST_TENANT_ADMIN_MESSAGE);
    }
  }

  private updateTouchesRoleOrStatus(data: any) {
    return Boolean(
      data &&
      (
        Object.prototype.hasOwnProperty.call(data, 'role') ||
        Object.prototype.hasOwnProperty.call(data, 'isActive')
      ),
    );
  }

  private async isBillableCompany(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { companyKind: true },
    });
    return Boolean(company && isTenantCompany(company));
  }

  async isSellerNetworkCompany(companyId?: number | null) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { companyKind: true },
    });
    return Boolean(company && isTenantCompany(company));
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

  private async collectSellerOnboardingCleanup(userId: number) {
    const onboardings = await this.prisma.sellerOnboarding.findMany({
      where: { userId },
      select: {
        id: true,
        attachments: {
          select: {
            storagePath: true,
          },
        },
      },
    });
    const onboardingIds = onboardings.map((item) => item.id);
    const attachmentPaths = Array.from(new Set(
      onboardings
        .flatMap((item) => item.attachments || [])
        .map((attachment) => String(attachment.storagePath || '').trim())
        .filter(Boolean),
    ));
    return { onboardingIds, attachmentPaths };
  }

  private async deleteSellerOnboardingFiles(paths: string[]) {
    const failures: string[] = [];
    for (const storagePath of paths) {
      try {
        await unlink(storagePath);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') failures.push(storagePath);
      }
    }
    if (failures.length) {
      throw new BadRequestException('Não foi possível excluir todos os documentos do vendedor. Feche arquivos abertos e tente novamente.');
    }
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
        ...(phoneNormalized ? { candidatePhoneNormalized: phoneNormalized } : { candidatePhone: phone }),
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
        candidateName: name,
        candidatePhone: phone,
        candidatePhoneNormalized: phoneNormalized,
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
      throw new BadRequestException('Indicador precisa ser vendedor ativo da empresa.');
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
        candidatePhoneNormalized: phoneNormalized,
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
        status: 'approved',
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
      where: { id: candidateId, companyId, status: 'approved' },
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
    email?: string | null;
    password: string;
    name?: string | null;
    phone?: string | null;
    commissionPercent?: number;
    commissionMonthlyCap?: number;
    setupCommissionCap?: number;
    canRegisterHbxSellers?: boolean;
    sellerReferralCommissionPercent?: number;
    referredByUserId?: number | null;
    referredByCommissionPercentSnapshot?: number;
    mustChangePassword?: boolean;
    companyId?: number | null;
    role?: string;
    isActive?: boolean;
    canViewBilling?: boolean;
  }): Promise<User> {
    const created = await this.prisma.user.create({ data });
    await ensureUserTeamPolicyForUser(this.prisma, created.id, { source: 'user_create' });
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

  // Convite de definir senha (PR-002 C.1c/C.3): token unico hasheado na
  // tabela passwordReset; quem recebe o link define a propria senha e o
  // reset marca o e-mail como confirmado (prova de caixa).
  async createSetPasswordInviteToken(userId: number, ttlMs = 7 * 24 * 60 * 60 * 1000) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.passwordReset.updateMany({
      where: { userId: Number(userId), used: false },
      data: { used: true },
    });
    await this.prisma.passwordReset.create({
      data: { token: tokenHash, userId: Number(userId), expiresAt },
    });
    return { rawToken, expiresAt };
  }

  // R4 (FASE 2 — REMOÇÃO, definitivo): assento GRÁTIS — não existe mais aviso
  // de custo antes do convite (D5). Endpoint mantido (front ainda pode chamar)
  // devolvendo headcount informativo com preço sempre zero; seatCap sobrevive
  // só como teto OPERACIONAL do master (não é cobrança).
  async getCompanySeatBilling(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { id: true, selectedPlanKey: true, companyKind: true, seatCap: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    const planKey = normalizeCommercialPlanKey(company.selectedPlanKey);
    const seatCap = Number((company as any)?.seatCap || 0) > 0 ? Math.trunc(Number((company as any).seatCap)) : null;
    const activeUsers = await this.prisma.user.count({
      where: { companyId: Number(companyId), isActive: true, deactivatedAt: null, isSystemMaster: false, role: { in: ['USER', 'ADMIN'] } },
    }).catch(() => 0);
    return {
      planKey,
      planTitle: getCommercialPlanTitle(planKey),
      activeUsers,
      includedUsers: activeUsers,
      extraActiveUsers: 0,
      extraUserMonthlyPrice: 0,
      nextUserIsExtra: false,
      seatCap,
      capReached: seatCap != null && activeUsers >= seatCap,
    };
  }

  async getCompanyTrialSeatUsage(companyId: number) {
    const [company, activeUsers, activeAdmins, activeSellers] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          commissionDueBusinessDays: true,
          companyKind: true,
          accountType: true,
          status: true,
          isActive: true,
          selectedPlanKey: true,
          trialEndsAt: true,
          billingGraceEndsAt: true,
          courtesyEndsAt: true,
          courtesyReason: true,
          seatCap: true,
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

    // Projecao do estado unico (PR-002 C.3): trial e quem o canonico diz.
    const accessState = resolveCompanyAccessState(company);
    const isTrial = accessState.state === 'trial' || accessState.state === 'trial_ending';

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
      include: { company: true },
    });
  }

  // Login: o identificador (username/e-mail) é caixa-insensível — ordem do
  // dono em 13/06/2026: a caixa do identificador não é segredo; a SENHA
  // continua estrita. Ordem de resolução: match exato → username sem caixa →
  // e-mail sem caixa. Ambiguidade (contas legadas diferindo só por caixa)
  // devolve null: nunca autenticar na conta errada.
  async findByLoginIdentifier(identifier: string): Promise<User | null> {
    const normalized = String(identifier || '').trim();
    if (!normalized) return null;
    const include = { company: true };

    const exact = await this.prisma.user.findUnique({ where: { username: normalized }, include });
    if (exact) return exact;

    const byUsername = await this.prisma.user.findMany({
      where: { username: { equals: normalized, mode: 'insensitive' } },
      include,
      take: 2,
    });
    if (byUsername.length === 1) return byUsername[0];
    if (byUsername.length > 1) return null;

    const byEmail = await this.prisma.user.findMany({
      where: { email: { equals: normalized, mode: 'insensitive' } },
      include,
      take: 2,
    });
    return byEmail.length === 1 ? byEmail[0] : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { company: true },
    });
  }

  async updateCompany(userId: number, companyId: number): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { companyId } });
  }

  // Confirma o e-mail do usuário na mão (ação de suporte do Master). No localhost o
  // envio de e-mail é OFF → sem isto o cadastro não loga. Idempotente.
  async markEmailConfirmed(userId: number): Promise<{ alreadyConfirmed: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailConfirmedAt: true } });
    if (user?.emailConfirmedAt) return { alreadyConfirmed: true };
    await this.prisma.user.update({ where: { id: userId }, data: { emailConfirmedAt: new Date() } });
    return { alreadyConfirmed: false };
  }

  async setPassword(userId: number, hashedPassword: string, options?: { mustChangePassword?: boolean }): Promise<User> {
    const mustChangePassword = Boolean(options?.mustChangePassword);
    if (mustChangePassword) {
      return this.prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: {
            revokedAt: now,
            revokedReason: 'temporary_password_reset',
          },
        });
        return tx.user.update({
          where: { id: userId },
          data: {
            password: hashedPassword,
            mustChangePassword,
            // Primeiro acesso (boas-vindas): liberar acesso / resetar senha re-arma
            // o tutorial junto da troca obrigatória de senha. [[tutorial-onboarding]]
            tutorialCompletedAt: null,
            currentSessionId: null,
            sessionVersion: { increment: 1 },
          },
        });
      });
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        mustChangePassword,
      },
    });
  }

  // Boas-vindas (primeiro acesso): marca o tutorial como resolvido — "Começar a
  // usar" OU "Não exibir mais" no portão chamam isto (POST /profile/tutorial-done).
  async markTutorialCompleted(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tutorialCompletedAt: new Date() },
    });
  }

  // Ativação / onboarding (28/06, Camada 1): lê os carimbos dos marcos do usuário.
  // Tolerante a JSON quebrado/legado → sempre devolve um mapa { event: ISO }.
  getOnboardingEvents(user: { onboardingStateJson?: string | null } | null): Record<string, string> {
    try {
      const parsed = JSON.parse(String(user?.onboardingStateJson || '{}'));
      const ev = parsed && typeof parsed === 'object' ? parsed.events : null;
      if (!ev || typeof ev !== 'object') return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(ev)) {
        if (typeof v === 'string' && v) out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  // Carimba um marco de onboarding (idempotente — o primeiro a chegar fica). Devolve
  // firstTime=true só quando ESTE evento ainda não existia → o front dispara a
  // conquista uma única vez. Nunca sobrescreve um carimbo já posto.
  async stampOnboardingEvent(
    userId: number,
    event: string,
    at: Date = new Date(),
  ): Promise<{ firstTime: boolean; events: Record<string, string> }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingStateJson: true } as any,
    });
    const events = this.getOnboardingEvents(user as any);
    if (events[event]) return { firstTime: false, events };
    const next = { ...events, [event]: at.toISOString() };
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingStateJson: JSON.stringify({ events: next }) } as any,
    });
    return { firstTime: true, events: next };
  }

  // Ramo-alvo da empresa (primeiro acesso do dono, 14/06/2026): segmentos que a
  // empresa quer prospectar. Vira filtro padrão do Radar/Leads e desempata o que
  // cada empresa vê primeiro (a lagoa é compartilhada; o dedup é por empresa).
  // Estado/cidade (OOBE 08/07): coletados na MESMA tela. `location` OMITIDO
  // (undefined) preserva o que já estava salvo — o editor de nicho de
  // Configurações só manda segments e não pode apagar estado/cidade à toa.
  async saveCompanyProspectingSegments(
    companyId: number,
    segments: string[],
    location?: { estado?: string | null; cidade?: string | null },
  ): Promise<string[]> {
    const clean = Array.from(new Set(
      (Array.isArray(segments) ? segments : [])
        .map((s) => String(s || '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .map((s) => s.slice(0, 80)),
    )).slice(0, 12);
    const data: any = { prospectingSegmentsJson: clean.length ? JSON.stringify(clean) : null };
    if (location) {
      const estado = String(location.estado || '').trim().toUpperCase().slice(0, 2);
      const cidade = String(location.cidade || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      data.prospectingEstado = estado || null;
      data.prospectingCidade = cidade || null;
    }
    await this.prisma.company.update({
      where: { id: companyId },
      data,
    });
    return clean;
  }

  // OOBE POR CATEGORIA (PR10072026/02, 10/07): grava as categorias de módulo que o
  // DONO escolheu no primeiro acesso e materializa a escolha em post-its de
  // CompanyModule — enabled=true pros módulos das categorias escolhidas,
  // enabled=false pros das NÃO escolhidas. SÓ encosta nos módulos governados pelo
  // mapa (CATEGORY_MANAGED_MODULE_KEYS); cadastros básicos (empresas/contatos/
  // produtos/config/dash) e financeiro/gerencial ficam intocados. O guard
  // @ModuleAccess e o GET /modules/me já respeitam o post-it (fail-closed).
  async saveCompanyModuleCategories(
    companyId: number,
    categories: unknown,
  ): Promise<ModuleCategoryKey[]> {
    const clean = normalizeModuleCategories(categories);
    if (!clean.length) {
      throw new BadRequestException('Escolha pelo menos uma categoria.');
    }
    const enabledKeys = moduleKeysForCategories(clean);
    const managedModules = await this.prisma.systemModule.findMany({
      where: { key: { in: CATEGORY_MANAGED_MODULE_KEYS }, companyAssignable: true },
      select: { id: true, key: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: { moduleCategoriesJson: clean } as any,
      });
      for (const moduleRow of managedModules) {
        const enabled = enabledKeys.has(String(moduleRow.key || '').trim().toLowerCase());
        await tx.companyModule.upsert({
          where: { companyId_moduleId: { companyId, moduleId: moduleRow.id } },
          update: { enabled },
          create: { companyId, moduleId: moduleRow.id, enabled },
        });
      }
    });
    return clean;
  }

  // Preferência de segmento/região do PRÓPRIO vendedor (self-service 14/06):
  // grava User.preferredSegmentsJson no shape canônico { segments, cityRegion }.
  // Lista vazia + sem cidade ⇒ limpa (volta a cair no ramo da empresa).
  async saveUserPreferredSegments(
    userId: number,
    segments: string[],
    cityRegion?: string | null,
  ): Promise<PreferredSegments> {
    const json = buildPreferredSegmentsJsonValue(segments, cityRegion);
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferredSegmentsJson: json } as any,
    });
    return parsePreferredSegments(json);
  }

  async updateById(userId: number, data: any, options?: UserMutationGuardOptions): Promise<User> {
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
    if (this.updateTouchesRoleOrStatus(data)) {
      await this.assertTenantKeepsActiveAdmin(
        userId,
        before,
        { ...before, ...data },
        options || { action: 'profile_update' },
      );
    }
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
    await ensureUserTeamPolicyForUser(this.prisma, updated.id, { source: 'user_update' });
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
        // Teto de comissão (PR13062026007) — só sai aqui (lista admin @Admin()); nunca em tela de vendedor.
        commissionMonthlyCap: true,
        setupCommissionCap: true,
        canRegisterHbxSellers: true,
        sellerReferralCommissionPercent: true,
        referredByUserId: true,
        referredByCommissionPercentSnapshot: true,
        // Reaproveitar dados no Gerenciar (P4): o modal pré-preenche o limite/dia
        // a partir daqui em vez de cair no default genérico.
        sellerDistributionDailyLimitOverride: true,
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

  async updateRole(userId: number, role: 'USER' | 'ADMIN', options?: UserMutationGuardOptions): Promise<User> {
    return this.updateById(userId, { role }, { ...options, action: options?.action || 'role_update' });
  }

  async deactivateUser(userId: number, retentionDays = 730, options?: UserMutationGuardOptions): Promise<User> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
    });
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    const endedAt = new Date();
    await this.assertTenantKeepsActiveAdmin(
      userId,
      before,
      { ...before, isActive: false, deactivatedAt: endedAt, retentionUntil },
      { ...options, action: options?.action || 'deactivate' },
    );
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
    await ensureUserTeamPolicyForUser(this.prisma, updated.id, { source: 'user_deactivate' });
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
    await ensureUserTeamPolicyForUser(this.prisma, updated.id, { source: 'user_reactivate' });
    return updated;
  }

  async hardDeleteUser(userId: number, options?: UserMutationGuardOptions): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
    });
    await this.assertTenantKeepsActiveAdmin(
      userId,
      target,
      { ...target, isActive: false },
      { ...options, action: options?.action || 'delete' },
    );
    const sellerOnboardingCleanup = await this.collectSellerOnboardingCleanup(userId);
    await this.deleteSellerOnboardingFiles(sellerOnboardingCleanup.attachmentPaths);

    // Chip do vendedor (caso Gabrielo, 07/07): captura as instâncias WhatsApp do usuário
    // ANTES do delete — a FK da sessão é SET NULL e deixaria "chip de ninguém" ativo no
    // painel, e a instância do motor viraria fantasma imortal (mesma família da company-26).
    const whatsappTenantKeys = new Set<string>();
    if (target?.companyId) {
      whatsappTenantKeys.add(`company-${Number(target.companyId)}-user-${Number(userId)}`);
    }
    try {
      const activeWhatsappSessions = await this.prisma.whatsAppConnectionSession.findMany({
        where: { userId, status: 'active' },
        select: { tenantKey: true },
      });
      for (const session of activeWhatsappSessions || []) {
        const key = String(session?.tenantKey || '').trim();
        if (key) whatsappTenantKeys.add(key);
      }
    } catch {
      /* best-effort: o fallback determinístico acima já cobre o tenantKey do usuário */
    }
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
      // Fecha a sessão WhatsApp do usuário no backend ANTES do delete — sem isto a FK
      // SET NULL deixa a sessão 'active' sem dono e o painel Equipe mostra chip órfão.
      await tx.whatsAppConnectionSession.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'disconnected', disconnectedAt: deletedAt, wipedAt: deletedAt, motorState: 'close' },
      });
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
      if (sellerOnboardingCleanup.onboardingIds.length) {
        await tx.sellerOnboardingAttachment.deleteMany({
          where: { onboardingId: { in: sellerOnboardingCleanup.onboardingIds } },
        });
        await tx.sellerOnboarding.deleteMany({
          where: { id: { in: sellerOnboardingCleanup.onboardingIds } },
        });
      }

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

    // Derruba as instâncias do usuário no MOTOR (best-effort, pós-commit — só derruba chip
    // de usuário que realmente morreu). Sem isto a instância continua open com creds e o
    // auto-connect a ressuscita a cada restart (fantasma-vendedor, família da company-26).
    for (const tenantKey of whatsappTenantKeys) {
      try {
        const wipe = await this.webwhatsBridge.wipeMotorInstanceByTenantKey(tenantKey);
        this.logger.warn(`hard-delete user=${userId}: motor wipe ${tenantKey} logout=${wipe.loggedOut} delete=${wipe.deleted}`);
      } catch (error) {
        this.logger.error(
          `hard-delete user=${userId}: falha ao derrubar ${tenantKey} no MOTOR — risco de instancia fantasma (limpar via DELETE /instance/logout+delete). ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

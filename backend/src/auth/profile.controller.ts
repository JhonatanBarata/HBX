import { BadRequestException, Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { assertPasswordPolicy } from './password-policy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MasterContextService } from '../master-context/master-context.service';
import { ThemePreferencesService } from './theme-preferences.service';
import { resolveCompanyKind, isPlatformInfraCompany, isTenantCompany } from '../common/company-kind';
import { resolveCompanyAccessState } from '../modules/company-access-state';

class ChangePasswordDto {
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}

class UpdateDisplayNameDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export function sanitizeUser(user: any, masterContext?: any) {
  if (!user) return null;
  const role = String(user.role || '').trim().toUpperCase();
  const isReferralSeller = false;
  const userKind = user.isSystemMaster
    ? 'system_master'
    : role === 'ADMIN'
        ? 'admin'
        : role === 'USER'
          ? 'seller'
          : 'user';
  const trialEndsAt = user.company?.trialEndsAt instanceof Date ? user.company.trialEndsAt : null;
  const trialRemainingDays = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  const companyAccess = user.company ? resolveCompanyAccessState(user.company) : null;
  // Cobranca e assunto do contratante (PR-002 D.4): vendedor recebe apenas
  // accessReleased (liberado ou nao). Status de pagamento, graca, plano,
  // preco e datas de trial NAO saem do backend para role USER.
  const billingAudience = Boolean(user.isSystemMaster) || role === 'ADMIN';
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    userKind,
    isSystemMaster: Boolean(user.isSystemMaster),
    mustChangePassword: Boolean(user.mustChangePassword),
    sellerProfile: {
      isReferralSeller,
      isCommonSeller: role === 'USER' && !isReferralSeller && !user.isSystemMaster,
      isAdmin: role === 'ADMIN' && !user.isSystemMaster,
      canRecruitSellers: Boolean(user.canRegisterHbxSellers),
      sellerReferralCommissionPercent: Number(user.sellerReferralCommissionPercent || 0) || 0,
      referredByUserId: user.referredByUserId ?? null,
    },
    createdAt: user.createdAt,
    company: user.company
      ? {
          id: user.company.id,
          name: user.company.name,
          slug: user.company.slug ?? null,
          companyKind: resolveCompanyKind(user.company),
          isTenant: isTenantCompany(user.company),
          isPlatformInfra: isPlatformInfraCompany(user.company),
          accessReleased: companyAccess ? companyAccess.canUse : null,
          accessState: billingAudience && companyAccess ? companyAccess.state : null,
          accessStateLabel: billingAudience && companyAccess ? companyAccess.statusLabel : null,
          selectedPlanKey: billingAudience ? user.company.selectedPlanKey ?? null : null,
          contactPhone: user.company.contactPhone ?? null,
          trialStartsAt: billingAudience ? user.company.trialStartsAt ?? null : null,
          trialEndsAt: billingAudience ? user.company.trialEndsAt ?? null : null,
          trialRemainingDays: billingAudience ? trialRemainingDays : null,
          billingGraceStartedAt: billingAudience ? user.company.billingGraceStartedAt ?? null : null,
          billingGraceEndsAt: billingAudience ? user.company.billingGraceEndsAt ?? null : null,
          billingGraceReason: billingAudience ? user.company.billingGraceReason ?? null : null,
          billingGraceEmailStage: billingAudience ? user.company.billingGraceEmailStage ?? null : null,
          subscriptionCurrentPeriodStart: billingAudience ? user.company.subscriptionCurrentPeriodStart ?? null : null,
          subscriptionCurrentPeriodEnd: billingAudience ? user.company.subscriptionCurrentPeriodEnd ?? null : null,
          trialModuleSelection: user.company.trialModuleSelection ?? null,
          whatsappConnectionMode: user.company.whatsappConnectionMode ?? null,
          whatsappTemporaryStatus: user.company.whatsappTemporaryStatus ?? null,
          whatsappMigrationInterestAt: user.company.whatsappMigrationInterestAt ?? null,
          plan: billingAudience && user.company.plan
            ? {
                id: user.company.plan.id,
                name: user.company.plan.name,
                price: user.company.plan.price,
                features: Array.isArray(user.company.plan.features)
                  ? user.company.plan.features.map((feature: any) => ({
                      id: feature.id,
                      key: feature.key,
                      description: feature.description ?? null,
                    }))
                  : [],
              }
            : null,
        }
      : null,
    masterContext: masterContext || {
      active: false,
      mode: 'master_puro',
      sessionId: null,
      companyId: null,
      companyName: null,
      reason: null,
      startedAt: null,
      expiresAt: null,
    },
  };
}

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly usersService: UsersService,
    private readonly masterContextService: MasterContextService,
    private readonly themePreferencesService: ThemePreferencesService,
  ) {}

  private async resolveMasterContext(req: any, user: any) {
    if (!user?.isSystemMaster) {
      return {
        active: false,
        mode: 'master_puro',
        sessionId: null,
        companyId: null,
        companyName: null,
        reason: null,
        startedAt: null,
        expiresAt: null,
      };
    }

    if (req?.user?.masterContext) {
      return req.user.masterContext;
    }

    return this.masterContextService.getCurrentContext(Number(user.id));
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async profile(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    const masterContext = await this.resolveMasterContext(req, user);
    const userWithRuntimeCompany: any = user;
    const runtimeUser = userWithRuntimeCompany && !userWithRuntimeCompany.company && req.user?.company
      ? { ...user, company: req.user.company }
      : user;
    return sanitizeUser(runtimeUser, masterContext);
  }

  @Get('current-user')
  @UseGuards(JwtAuthGuard)
  async currentUser(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    const masterContext = await this.resolveMasterContext(req, user);
    const userWithRuntimeCompany: any = user;
    const runtimeUser = userWithRuntimeCompany && !userWithRuntimeCompany.company && req.user?.company
      ? { ...user, company: req.user.company }
      : user;
    return sanitizeUser(runtimeUser, masterContext);
  }

  @Get('theme-preferences')
  @UseGuards(JwtAuthGuard)
  async getThemePreferences(@Req() req: any) {
    return this.themePreferencesService.getThemePreferencesForUser(Number(req.user?.id));
  }

  @Patch('theme-preferences')
  @UseGuards(JwtAuthGuard)
  async updateThemePreferences(
    @Req() req: any,
    @Body() body: { scope?: string; config?: any; reset?: boolean },
  ) {
    return this.themePreferencesService.updateThemePreferencesForUser(Number(req.user?.id), body || {});
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new BadRequestException('Usuario invalido');

    const currentPassword = String(dto.currentPassword || '');
    const nextPassword = String(dto.newPassword || '');
    assertPasswordPolicy(nextPassword);

    if (!user.mustChangePassword) {
      if (!currentPassword) throw new BadRequestException('Informe a senha atual');
      const matches = await bcrypt.compare(currentPassword, user.password || '');
      if (!matches) throw new BadRequestException('Senha atual incorreta');
    }

    const hashed = await bcrypt.hash(nextPassword, 10);
    await this.usersService.setPassword(user.id, hashed);
    return { ok: true };
  }

  @Patch('display-name')
  @UseGuards(JwtAuthGuard)
  async updateDisplayName(@Req() req: any, @Body() dto: UpdateDisplayNameDto) {
    const name = String(dto?.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) throw new BadRequestException('Informe o nome do atendente/vendedor.');
    await this.usersService.updateById(Number(req.user.id), { name });
    const updated = await this.usersService.findById(Number(req.user.id));
    const masterContext = await this.resolveMasterContext(req, updated);
    const updatedWithRuntimeCompany: any = updated;
    const runtimeUser = updatedWithRuntimeCompany && !updatedWithRuntimeCompany.company && req.user?.company
      ? { ...updated, company: req.user.company }
      : updated;
    return sanitizeUser(runtimeUser, masterContext);
  }
}

import { BadRequestException, Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { assertPasswordPolicy } from './password-policy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MasterContextService } from '../master-context/master-context.service';
import { ThemePreferencesService } from './theme-preferences.service';

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}

function sanitizeUser(user: any, masterContext?: any) {
  if (!user) return null;
  const trialEndsAt = user.company?.trialEndsAt instanceof Date ? user.company.trialEndsAt : null;
  const trialRemainingDays = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    isSystemMaster: Boolean(user.isSystemMaster),
    createdAt: user.createdAt,
    company: user.company
      ? {
          id: user.company.id,
          name: user.company.name,
          slug: user.company.slug ?? null,
          onboardingStatus: user.company.onboardingStatus ?? null,
          paymentStatus: user.company.paymentStatus ?? null,
          subscriptionStatus: user.company.subscriptionStatus ?? null,
          premiumAccess: Boolean(user.company.premiumAccess),
          trialStartsAt: user.company.trialStartsAt ?? null,
          trialEndsAt: user.company.trialEndsAt ?? null,
          trialRemainingDays,
          subscriptionCurrentPeriodStart: user.company.subscriptionCurrentPeriodStart ?? null,
          subscriptionCurrentPeriodEnd: user.company.subscriptionCurrentPeriodEnd ?? null,
          trialModuleSelection: user.company.trialModuleSelection ?? null,
          selectedPlanKey: user.company.selectedPlanKey ?? null,
          whatsappConnectionMode: user.company.whatsappConnectionMode ?? null,
          whatsappTemporaryStatus: user.company.whatsappTemporaryStatus ?? null,
          whatsappMigrationInterestAt: user.company.whatsappMigrationInterestAt ?? null,
          plan: user.company.plan
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
    return sanitizeUser(user, masterContext);
  }

  @Get('current-user')
  @UseGuards(JwtAuthGuard)
  async currentUser(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    const masterContext = await this.resolveMasterContext(req, user);
    return sanitizeUser(user, masterContext);
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

    const matches = await bcrypt.compare(currentPassword, user.password || '');
    if (!matches) throw new BadRequestException('Senha atual incorreta');

    const hashed = await bcrypt.hash(nextPassword, 10);
    await this.usersService.setPassword(user.id, hashed);
    return { ok: true };
  }
}

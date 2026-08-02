import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CompanyInviteService } from '../users/company-invite.service';
import { ConfirmEmailDto, GoogleOAuthDto, LoginDto, OnboardingResumeDto, PhoneVerificationStartDto, RecoverPasswordDto, ResendConfirmationDto, ResetPasswordDto, SignupDto, WhatsappConfirmCodeDto, WhatsappConfirmStartDto } from './dto/auth.dto';
import { ImpersonateUserDto } from './dto/impersonate-user.dto';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MasterGuard } from './guards/master.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly companyInvites: CompanyInviteService,
  ) {}

  // ── MODO PUXAR (02/08): convite único de equipe ────────────────────────────
  // Página pública do link /convite/<token> (quem tem o link já recebeu esses
  // dados no próprio convite — não vaza nada além dele).
  @Get('invites/public/:token')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  publicInvite(@Param('token') token: string) {
    return this.companyInvites.getPublicInvite(token);
  }

  // Convites pendentes do usuário logado (por e-mail) — alimenta o banner.
  @Get('invites/pending')
  @UseGuards(JwtAuthGuard)
  pendingInvites(@Req() req: any) {
    return this.companyInvites.listPendingForUser(Number(req?.user?.id));
  }

  // Aceite logado: move o usuário e devolve sessão NOVA já na empresa.
  @Post('invites/:id/accept')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60 } })
  acceptInvite(@Param('id') id: string, @Req() req: any) {
    return this.authService.acceptCompanyInvite(Number(req?.user?.id), id, {
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }

  @Post('invites/:id/decline')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60 } })
  declineInvite(@Param('id') id: string, @Req() req: any) {
    return this.companyInvites.declineInvite(Number(req?.user?.id), id);
  }

  // MASTER "ENTRAR COMO": emite um token do usuário-alvo (o master VIRA o usuário).
  // Duplo portão — JwtAuthGuard (sessão válida) + MasterGuard (só system master).
  // O front guarda o token do master e usa o banner "Sair" pra voltar ao /master.
  @Post('impersonate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  @Throttle({ default: { limit: 30, ttl: 60 } })
  impersonate(@Body() dto: ImpersonateUserDto, @Req() req: any) {
    return this.authService.impersonateUser(Number(req?.user?.id), Number(dto.userId), {
      route: String(req?.headers?.['x-master-route'] || ''),
    });
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  signup(@Body() dto: SignupDto, @Req() req: any) {
    return this.authService.signup(dto, {
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }

  @Post('confirm-email')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  confirmEmail(@Body() dto: ConfirmEmailDto, @Req() req: any) {
    return this.authService.confirmEmail(dto.token, {
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }

  @Post('resend-confirmation')
  @Throttle({ default: { limit: 3, ttl: 60 } })
  resendConfirmation(@Body() dto: ResendConfirmationDto) {
    return this.authService.resendEmailConfirmation(dto.email);
  }

  // F4 (19/06): retomada do funil — devolve em que passo a pessoa parou
  // (awaiting_email | awaiting_payment | done) pra renderizar aquele passo.
  @Post('onboarding/resume')
  @Throttle({ default: { limit: 20, ttl: 60 } })
  resumeOnboarding(@Body() dto: OnboardingResumeDto) {
    return this.authService.resolveOnboardingResume(dto.pollToken);
  }

  // F6 (19/06): confirmação de identidade por WhatsApp (mock-first; envio live
  // gated). start gera/dispara o código; confirm valida e confirma a identidade.
  @Post('onboarding/whatsapp/start')
  @Throttle({ default: { limit: 3, ttl: 60 } })
  startWhatsappConfirmation(@Body() dto: WhatsappConfirmStartDto) {
    return this.authService.startWhatsappConfirmation(dto.pollToken, dto.phone);
  }

  @Post('onboarding/whatsapp/confirm')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  confirmWhatsappCode(@Body() dto: WhatsappConfirmCodeDto, @Req() req: any) {
    return this.authService.confirmWhatsappCode(dto.challengeToken, dto.code, {
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }

  // F3 (CONFIRMACAO-TELEFONE): verificação do telefone do usuário JÁ LOGADO (banner
  // pós-Google). Roda sob o JWT da sessão — o start gera/dispara o código (mesmos
  // guardrails), o confirm carimba contactPhoneVerifiedAt e tenta o brinde. NÃO
  // refaz login. Só destrava o brinde, nunca o app.
  @Post('whatsapp/verify/start')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60 } })
  startPhoneVerification(@Body() dto: PhoneVerificationStartDto, @Req() req: any) {
    return this.authService.startPhoneVerificationForUser(Number(req?.user?.id), dto.phone);
  }

  @Post('whatsapp/verify/confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60 } })
  confirmPhoneVerification(@Body() dto: WhatsappConfirmCodeDto, @Req() req: any) {
    return this.authService.confirmPhoneVerificationForUser(Number(req?.user?.id), dto.challengeToken, dto.code);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.loginWithUsername(dto.username, dto.password, {
      forceSession: Boolean(dto.forceSession),
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }

  // W1 (PR19072026): login de MÁQUINA — token com claim `ops:true`, NÃO cria AuthSession.
  // Cabo de guerra de sessão do /master (HBX Owner + Ops Control derrubavam o dono do
  // painel a cada poll via /auth/login comum); ver jwt.strategy.ts:89-99 pra faixa que
  // aceita o claim SEM entrar na trava de sessão-única.
  @Post('service-login')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async serviceLogin(@Body() dto: LoginDto) {
    return this.authService.serviceLogin(dto.username, dto.password);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any) {
    return this.authService.logoutCurrentSession(req.user);
  }

  @Post('recover-password')
  @Throttle({ default: { limit: 3, ttl: 60 } })
  async recoverPassword(@Body() dto: RecoverPasswordDto) {
    return this.authService.requestPasswordResetLinkByEmail(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordWithToken(dto.token, dto.password);
  }

  @Post('google')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async googleOAuth(@Body() dto: GoogleOAuthDto, @Req() req: any) {
    // P0.2 (PR10072026 W1): dto.selectedPlanKey é aceito-e-IGNORADO (compat com
    // clients velhos em cache) — plano morreu na porta de entrada.
    return this.authService.googleLoginOrSignup(dto.idToken, {
      companyName: dto.companyName,
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }
}

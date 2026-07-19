import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfirmEmailDto, GoogleOAuthDto, LoginDto, OnboardingResumeDto, PhoneVerificationStartDto, RecoverPasswordDto, ResendConfirmationDto, ResetPasswordDto, SignupDto, WhatsappConfirmCodeDto, WhatsappConfirmStartDto } from './dto/auth.dto';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

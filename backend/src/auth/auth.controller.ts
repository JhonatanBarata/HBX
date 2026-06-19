import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfirmEmailDto, EmailConfirmationStatusDto, GoogleOAuthDto, LoginDto, OnboardingResumeDto, RecoverPasswordDto, ResendConfirmationDto, ResetPasswordDto, SignupDto, WhatsappConfirmCodeDto, WhatsappConfirmStartDto } from './dto/auth.dto';
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

  @Post('email-confirmation-status')
  @Throttle({ default: { limit: 20, ttl: 60 } })
  emailConfirmationStatus(@Body() dto: EmailConfirmationStatusDto) {
    return this.authService.emailConfirmationStatus(dto.pollToken);
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

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.loginWithUsername(dto.username, dto.password, {
      forceSession: Boolean(dto.forceSession),
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
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
    return this.authService.googleLoginOrSignup(dto.idToken, {
      selectedPlanKey: dto.selectedPlanKey,
      companyName: dto.companyName,
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  }
}

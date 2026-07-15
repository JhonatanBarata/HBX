import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { ProfileController, OnboardingController } from './profile.controller';
import { RolesGuard } from './roles.guard';
import { InternalController } from './internal.controller';
import { MailModule } from '../mail/mail.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { ThemePreferencesService } from './theme-preferences.service';
import { CommissionsModule } from '../commissions/commissions.module';
import { CreditsModule } from '../credits/credits.module';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { SESSION_IDLE_TTL_DAYS } from './session-ttl';
import { MobileDeviceController } from './mobile-device.controller';
import { MobileDeviceService } from './mobile-device.service';
import { MobileDevicePresenceController } from './mobile-device-presence.controller';
import { MobileDevicePresenceService } from './mobile-device-presence.service';
import { MobileActionController } from './mobile-action.controller';
import { MobileActionService } from './mobile-action.service';
import { MobilePushService } from './mobile-push.service';
import { GoogleIdTokenVerifierService } from './google-id-token-verifier.service';

const jwtSecret = String(process.env.JWT_SECRET || '').trim();

// CRÉDITOS A3 (docs/PLANEJAMENTOS/CREDITOS/A3-RESULTADO.md) — AuthModule importa CreditsModule
// pra conceder o lote grátis de boas-vindas no nascimento da empresa self-service.
// CreditsModule só depende de PrismaModule (@Global) — sem ciclo.
//
// F1 (CONFIRMACAO-TELEFONE): WebwhatsBridgeService (envio LIVE do OTP pelo chip do
// Master) só depende de Prisma (@Global) — provemos como instância PRÓPRIA aqui, igual
// ao MasterAlertModule, pra NÃO importar o MessagingModule inteiro e NÃO criar ciclo.
@Module({
  // expiresIn segue a janela única de sessão (session-ttl.ts) — teto absoluto do
  // access_token; tokens de propósito (poll de e-mail, WhatsApp) têm validade própria.
  imports: [UsersModule, MailModule, MasterContextModule, CommissionsModule, CreditsModule, JwtModule.register({ secret: jwtSecret, signOptions: { expiresIn: `${SESSION_IDLE_TTL_DAYS}d` } })],
  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    ThemePreferencesService,
    WebwhatsBridgeService,
    MobileDeviceService,
    MobileDevicePresenceService,
    MobileActionService,
    MobilePushService,
    GoogleIdTokenVerifierService,
  ],
  controllers: [
    AuthController,
    ProfileController,
    InternalController,
    OnboardingController,
    MobileDeviceController,
    MobileDevicePresenceController,
    MobileActionController,
  ],
  exports: [AuthService, MobileDevicePresenceService],
})
export class AuthModule {}

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

const jwtSecret = String(process.env.JWT_SECRET || '').trim();

// CRÉDITOS A3 (docs/PLANEJAMENTOS/CREDITOS/A3-RESULTADO.md) — AuthModule importa CreditsModule
// pra conceder o lote grátis de boas-vindas no nascimento da empresa self-service.
// CreditsModule só depende de PrismaModule (@Global) — sem ciclo.
@Module({
  imports: [UsersModule, MailModule, MasterContextModule, CommissionsModule, CreditsModule, JwtModule.register({ secret: jwtSecret, signOptions: { expiresIn: '1d' } })],
  providers: [AuthService, JwtStrategy, RolesGuard, ThemePreferencesService],
  controllers: [AuthController, ProfileController, InternalController, OnboardingController],
  exports: [AuthService],
})
export class AuthModule {}

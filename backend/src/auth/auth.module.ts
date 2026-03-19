import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { ProfileController } from './profile.controller';
import { RolesGuard } from './roles.guard';
import { InternalController } from './internal.controller';
import { MailModule } from '../mail/mail.module';
import { MasterContextModule } from '../master-context/master-context.module';

@Module({
  imports: [UsersModule, MailModule, MasterContextModule, JwtModule.register({ secret: process.env.JWT_SECRET || 'secretKey', signOptions: { expiresIn: '1d' } })],
  providers: [AuthService, JwtStrategy, RolesGuard],
  controllers: [AuthController, ProfileController, InternalController],
  exports: [AuthService],
})
export class AuthModule {}

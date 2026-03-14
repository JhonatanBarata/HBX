import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RecoverPasswordDto, ResetPasswordDto, SignupDto } from './dto/auth.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.loginWithUsername(dto.username, dto.password);
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
}

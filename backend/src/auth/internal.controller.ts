import { Body, Controller, Headers, Param, Post, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { assertPasswordPolicy } from './password-policy';

class ResetPasswordDto {
  password: string;
}

@Controller('internal')
export class InternalController {
  constructor(private readonly usersService: UsersService) {}

  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
    @Headers('x-internal-secret') secret?: string,
  ) {
    const expected = process.env.INTERNAL_SECRET;
    if (!expected) throw new BadRequestException('INTERNAL_SECRET not configured');
    if (!secret || secret !== expected) throw new ForbiddenException('invalid internal secret');

    const userId = Number(id);
    if (!userId) throw new BadRequestException('invalid user id');
    if (!body || typeof body.password !== 'string' || body.password.trim().length === 0) {
      throw new BadRequestException('password required');
    }

    assertPasswordPolicy(body.password);

    const hashed = await bcrypt.hash(body.password, 12);
    const user = await this.usersService.setPassword(userId, hashed);
    return { ok: true, id: user.id, email: user.email };
  }
}

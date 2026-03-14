import { BadRequestException, Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { assertPasswordPolicy } from './password-policy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  newPassword: string;
}

function sanitizeUser(user: any) {
  if (!user) return null;
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
  };
}

@Controller('profile')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async profile(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    return sanitizeUser(user);
  }

  @Get('current-user')
  @UseGuards(JwtAuthGuard)
  async currentUser(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    return sanitizeUser(user);
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

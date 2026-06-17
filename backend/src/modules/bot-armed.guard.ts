import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { BOT_ARMED_KEY } from './bot-armed.decorator';
import { resolveBotActivation } from './bot-activation-state';

@Injectable()
export class BotArmedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(BOT_ARMED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;

    // Master do sistema: nunca bloqueado por gate de bot
    if (user.isSystemMaster) return true;

    const companyId = Number(
      user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0,
    );
    if (!companyId) return false;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { botArmedAt: true, botArmChannel: true },
    });

    const activation = resolveBotActivation(company);
    if (!activation.armed) {
      throw new HttpException(
        {
          code: 'BOT_NOT_ARMED',
          message: 'Acione o suporte para ativar o bot.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Admin sempre pode usar quando a empresa está armada.
    // Vendedor (USER) precisa de botAccessEnabled explícito (Admin propaga).
    const role = String(user?.role || '').toUpperCase();
    if (role === 'ADMIN') return true;
    if (role === 'USER') {
      const userRecord = await this.prisma.user.findUnique({
        where: { id: Number(user.id) },
        select: { botAccessEnabled: true },
      });
      if (!userRecord?.botAccessEnabled) {
        throw new HttpException(
          {
            code: 'BOT_ACCESS_NOT_GRANTED',
            message: 'Acesso ao bot não foi liberado para este usuário. Solicite ao administrador.',
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return true;
  }
}

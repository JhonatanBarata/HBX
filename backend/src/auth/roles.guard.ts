import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user || !user.role) return false;
    const role = String(user.role || '').trim().toUpperCase();
    const normalizedRequiredRoles = requiredRoles.map((item) => String(item).trim().toUpperCase());
    if (Boolean(user.isSystemMaster) && (normalizedRequiredRoles.includes('ADMIN') || normalizedRequiredRoles.includes('USERMASTER'))) {
      return true;
    }
    // USERMASTER (dono do tenant) e SUPERSET de ADMIN: passa em TODA rota que
    // exige ADMIN (@Admin()) alem das que exigem USERMASTER. Sem isto o dono
    // ficava BARRADO das rotas admin (gerencial/users/modules/team/etc).
    if (role === 'USERMASTER') {
      return normalizedRequiredRoles.includes('USERMASTER') || normalizedRequiredRoles.includes('ADMIN');
    }
    return normalizedRequiredRoles.includes(role);
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');
    const role = String(user.role || '').trim().toUpperCase();
    // USERMASTER (dono do tenant) = admin (superset), igual a ADMIN.
    if (!Boolean(user.isSystemMaster) && role !== 'ADMIN' && role !== 'USERMASTER') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}

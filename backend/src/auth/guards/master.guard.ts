import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class MasterGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user) throw new ForbiddenException('User not authenticated');
    if (!user.isSystemMaster) throw new ForbiddenException('Acesso exclusivo do MASTER');
    return true;
  }
}

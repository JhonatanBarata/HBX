import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_ACCESS_KEY, type ModuleAccessMetadata } from './module-feature.decorator';
import { ModulesService } from './modules.service';

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly modulesService: ModulesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleMetadata = this.reflector.getAllAndOverride<ModuleAccessMetadata>(MODULE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleMetadata) return true;

    const requiredModules = (Array.isArray(moduleMetadata) ? moduleMetadata : [moduleMetadata])
      .map((key) => String(key || '').trim().toLowerCase())
      .filter(Boolean);
    if (!requiredModules.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('User not authenticated');

    for (const moduleKey of requiredModules) {
      const allowed = await this.modulesService.canUserAccessModule(user.id, moduleKey);
      if (allowed) return true;
    }

    throw new ForbiddenException(`Modulos ${requiredModules.join(', ')} indisponiveis para este usuario`);
  }
}

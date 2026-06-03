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
    if (!user) {
      throw new ForbiddenException({
        code: 'MODULE_AUTH_REQUIRED',
        message: 'Sessão não identificada. Faça login novamente para acessar este módulo.',
        retryable: false,
      });
    }

    const mobileRoute = this.isMobileRouteRequest(req);
    for (const moduleKey of requiredModules) {
      const allowed = await this.modulesService.canUserAccessModule(user.id, moduleKey, { mobileRoute });
      if (allowed) return true;
    }

    throw new ForbiddenException({
      code: 'MODULE_ACCESS_DENIED',
      message: 'Módulo indisponível para este usuário ou empresa.',
      modules: requiredModules,
      retryable: false,
    });
  }

  private isMobileRouteRequest(req: any) {
    const surface = String(req?.headers?.['x-hbx-client-surface'] || '').trim().toLowerCase();
    const mobileRoute = String(req?.headers?.['x-hbx-mobile-route'] || '').trim().toLowerCase();
    return surface === 'mobile' || mobileRoute === 'true' || mobileRoute === '1';
  }
}

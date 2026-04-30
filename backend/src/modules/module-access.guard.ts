import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
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

    const onboardingStatus = String(user?.company?.onboardingStatus || '').trim().toLowerCase();
    const subscriptionStatus = String(user?.company?.subscriptionStatus || '').trim().toLowerCase();
    const paymentStatus = String(user?.company?.paymentStatus || '').trim().toUpperCase();
    const billingGraceEndsAt = user?.company?.billingGraceEndsAt instanceof Date
      ? user.company.billingGraceEndsAt
      : user?.company?.billingGraceEndsAt
        ? new Date(String(user.company.billingGraceEndsAt))
        : null;
    const graceAccess = Boolean(
      subscriptionStatus === 'grace' &&
      billingGraceEndsAt &&
      !Number.isNaN(billingGraceEndsAt.getTime()) &&
      billingGraceEndsAt.getTime() >= Date.now(),
    );
    const authorizedAccess =
      subscriptionStatus === 'authorized' ||
      subscriptionStatus === 'active' ||
      paymentStatus === 'PAID' ||
      graceAccess;
    const pendingCheckout =
      !authorizedAccess &&
      (
        onboardingStatus === 'pending_checkout' ||
        subscriptionStatus === 'pending_checkout' ||
        paymentStatus === 'PENDING'
      );

    if (pendingCheckout) {
      const role = String(user?.role || '').trim().toUpperCase();
      if (role === 'ADMIN' || Boolean(user?.isSystemMaster)) {
        throw new HttpException(
          {
            code: 'PENDING_CHECKOUT',
            message: 'Finalize o pagamento para liberar este recurso.',
            redirectTo: '/dashboard/financeiro?focus=payment&reason=pending_checkout',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      throw new ForbiddenException({
        code: 'COMPANY_PENDING_CHECKOUT_USER_BLOCKED',
        message: 'A contratação da empresa ainda não foi finalizada. Contate seu ADMIN ou o suporte da empresa.',
      });
    }

    throw new ForbiddenException(`Modulos ${requiredModules.join(', ')} indisponiveis para este usuario`);
  }
}

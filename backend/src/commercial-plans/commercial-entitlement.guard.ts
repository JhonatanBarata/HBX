import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  COMMERCIAL_ENTITLEMENT_KEY,
} from './commercial-entitlement.decorator';
import {
  type CommercialEntitlementKey,
} from './commercial-plan-catalog';
import { CommercialPlansService } from './commercial-plans.service';

@Injectable()
export class CommercialEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly commercialPlansService: CommercialPlansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<CommercialEntitlementKey[]>(
      COMMERCIAL_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    for (const entitlement of required) {
      await this.commercialPlansService.assertEntitlementForUser(user, entitlement);
    }

    return true;
  }
}

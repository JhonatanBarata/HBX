import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from './feature.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.get<string>(FEATURE_KEY, context.getHandler());
    if (!feature) return true; // no feature required

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('User not authenticated');

    // Resolve companyId strictly from authenticated user context
    const companyId = user.companyId ?? null;
    if (!companyId) throw new ForbiddenException('Company context required');

    const company = await this.prisma.company.findUnique({ where: { id: Number(companyId) }, include: { plan: { include: { features: true } } } });
    if (!company || !company.plan) throw new ForbiddenException('Company has no plan');
    // special syntax: if feature starts with `plan:` check plan name equality
    if (feature.startsWith('plan:')) {
      const expected = feature.split(':')[1];
      if (!expected) throw new ForbiddenException('Invalid plan feature key');
      if ((company.plan.name ?? '').toLowerCase() !== expected.toLowerCase()) {
        throw new ForbiddenException(`Action allowed only for plan ${expected}`);
      }
      return true;
    }

    const has = company.plan.features.some((f) => f.key === feature);
    if (!has) throw new ForbiddenException(`Feature ${feature} not available for this company`);
    return true;
  }
}

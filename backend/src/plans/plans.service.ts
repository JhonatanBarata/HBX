import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateFeatureDto } from './dto/create-feature.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async createPlan(dto: CreatePlanDto) {
    return this.prisma.plan.create({ data: { name: dto.name, price: dto.price ?? 0 } });
  }

  async listPlans() {
    return this.prisma.plan.findMany({ include: { features: true } });
  }

  async addFeature(planId: number, dto: CreateFeatureDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    // If feature exists, just connect it to the plan; otherwise create then connect
    let feature = await this.prisma.feature.findUnique({ where: { key: dto.key } });
    if (!feature) {
      feature = await this.prisma.feature.create({ data: { key: dto.key, description: dto.description } });
    }
    await this.prisma.plan.update({ where: { id: planId }, data: { features: { connect: { id: feature.id } } } });
    return feature;
  }

  async removeFeature(key: string) {
    const feat = await this.prisma.feature.findUnique({ where: { key } });
    if (!feat) throw new NotFoundException('Feature not found');
    await this.prisma.feature.delete({ where: { key } });
    return { success: true };
  }

  async updateFeature(featureId: number, data: { key?: string; description?: string }) {
    const feat = await this.prisma.feature.findUnique({ where: { id: featureId } as any });
    if (!feat) throw new NotFoundException('Feature not found');
    return this.prisma.feature.update({ where: { id: featureId } as any, data });
  }

  async disconnectFeature(planId: number, featureId: number) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const feat = await this.prisma.feature.findUnique({ where: { id: featureId } as any });
    if (!feat) throw new NotFoundException('Feature not found');
    // disconnect
    await this.prisma.plan.update({ where: { id: planId }, data: { features: { disconnect: { id: featureId } } } });
    return { success: true };
  }

  async deleteFeatureById(featureId: number) {
    const feat = await this.prisma.feature.findUnique({ where: { id: featureId } as any });
    if (!feat) throw new NotFoundException('Feature not found');
    await this.prisma.feature.delete({ where: { id: featureId } as any });
    return { success: true };
  }

  async createDefaultPlans() {
    const plans = [
      { name: 'prata', price: 0, features: ['product_create'] },
      { name: 'ouro', price: 29.9, features: ['product_create', 'advanced_reports', 'product_edit'] },
      { name: 'diamante', price: 69.9, features: ['product_create', 'advanced_reports', 'priority_support', 'company_update'] },
      { name: 'diamante_plus', price: 199.9, features: ['product_create', 'advanced_reports', 'priority_support', 'beta_features', 'company_update', 'company_delete'] },
      // admin plan used for administrative/testing purposes; has product_edit by default
      { name: 'admin', price: 0, features: ['product_edit', 'product_create', 'company_update', 'company_delete'] },
    ];

    for (const p of plans) {
      let plan = await this.prisma.plan.findFirst({ where: { name: p.name } });
      if (!plan) plan = await this.prisma.plan.create({ data: { name: p.name, price: p.price } });
      for (const key of p.features) {
        let existing = await this.prisma.feature.findUnique({ where: { key } });
        if (!existing) {
          existing = await this.prisma.feature.create({ data: { key, description: key } });
        }
        // connect feature to plan (if not already connected)
        await this.prisma.plan.update({ where: { id: plan.id }, data: { features: { connect: { id: existing.id } } } });
      }
    }
    return { success: true };
  }

  async createFullSeed(input: { adminEmail: string; adminPassword: string; adminName?: string; companyName?: string; planName?: string }) {
    // create default plans/features first
    await this.createDefaultPlans();

    const planName = input.planName || 'diamante_plus';
    let plan = await this.prisma.plan.findFirst({ where: { name: planName } });
    if (!plan) plan = await this.prisma.plan.findFirst({});

    // create company
    const company = await this.prisma.company.create({ data: { name: input.companyName || 'Admin Company', planId: plan?.id } });

    // create admin user
    const hashed = await (await import('bcryptjs')).hash(input.adminPassword, 10);
    const user = await this.prisma.user.create({ data: { email: input.adminEmail, password: hashed, name: input.adminName || 'Admin', companyId: company.id, role: 'ADMIN' } });

    return { user: { id: user.id, email: user.email, name: user.name }, company: { id: company.id, name: company.name }, plan: { id: plan?.id, name: plan?.name } };
  }

  async featuresByPlan(planId: number) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, include: { features: true } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan.features;
  }

  async allPlansWithFeatures() {
    const plans = await this.prisma.plan.findMany({ include: { features: true } });
    return plans.map((p) => ({ id: p.id, name: p.name, features: p.features.map((f) => ({ key: f.key, description: f.description })) }));
  }

  // helper for controller UI listing: return full feature objects
  async allPlansWithFullFeatures() {
    return this.prisma.plan.findMany({ include: { features: true } });
  }
}

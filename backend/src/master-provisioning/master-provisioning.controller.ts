import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import {
  MasterProvisioningBackfillProductsInput,
  MasterProvisioningInput,
  MasterProvisioningSeedHbxProductsInput,
  MasterProvisioningService,
} from './master-provisioning.service';

@Controller('master/provisioning')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterProvisioningController {
  constructor(private readonly masterProvisioningService: MasterProvisioningService) {}

  @Post('tenants')
  async provisionTenant(@Body() body: MasterProvisioningInput) {
    return this.masterProvisioningService.provisionTenant(body || ({} as MasterProvisioningInput));
  }

  @Post('products/backfill')
  async backfillTenantProducts(@Body() body: MasterProvisioningBackfillProductsInput) {
    return this.masterProvisioningService.backfillTenantProducts(body || {});
  }

  @Post('products/seed-hbx-tenant')
  async seedHbxTenantProducts(@Body() body: MasterProvisioningSeedHbxProductsInput) {
    return this.masterProvisioningService.seedHbxTenantProducts(body || {});
  }
}

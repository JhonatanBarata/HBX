import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { MasterProvisioningInput, MasterProvisioningService } from './master-provisioning.service';

@Controller('master/provisioning')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterProvisioningController {
  constructor(private readonly masterProvisioningService: MasterProvisioningService) {}

  @Post('tenants')
  async provisionTenant(@Body() body: MasterProvisioningInput) {
    return this.masterProvisioningService.provisionTenant(body || ({} as MasterProvisioningInput));
  }
}

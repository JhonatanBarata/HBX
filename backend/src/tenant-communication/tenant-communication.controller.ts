import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantCommunicationService } from './tenant-communication.service';

@Controller('tenant-communication')
@UseGuards(JwtAuthGuard)
export class TenantCommunicationController {
  constructor(private readonly tenantCommunication: TenantCommunicationService) {}

  @Get('settings')
  getSettings(@Req() req: any) {
    return this.tenantCommunication.getSettingsForUser(req.user);
  }

}

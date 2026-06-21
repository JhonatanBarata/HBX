import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyEmailSettingsService } from './company-email-settings.service';

@Controller('company-email')
@UseGuards(JwtAuthGuard)
export class CompanyEmailStatusController {
  constructor(private readonly emailSettings: CompanyEmailSettingsService) {}

  @Get('status')
  async getStatus(@Req() req: { user?: { companyId?: number } }) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return { enabled: false, ready: false };
    }
    const state = await this.emailSettings.getPublicState(companyId);
    return {
      enabled: Boolean(state.enabled),
      ready: Boolean(state.sender?.ready),
    };
  }
}

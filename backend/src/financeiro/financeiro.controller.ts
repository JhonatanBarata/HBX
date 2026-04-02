import { Body, Controller, Delete, Get, Param, Post, Put, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { FinanceiroService } from './financeiro.service';
import {
  CreateFinanceiroCheckoutDto,
  SaveFinanceiroCardDto,
  UpdateFinanceiroPreferencesDto,
} from './dto/financeiro.dto';

@Controller('financeiro')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('financeiro')
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    return this.financeiroService.getOverviewForUser(req.user);
  }

  @Patch('preferences')
  updatePreferences(@Req() req: any, @Body() dto: UpdateFinanceiroPreferencesDto) {
    return this.financeiroService.updatePreferencesForUser(req.user, dto || {});
  }

  @Put('card')
  saveCard(@Req() req: any, @Body() dto: SaveFinanceiroCardDto) {
    return this.financeiroService.saveCardForUser(req.user, dto);
  }

  @Delete('card')
  removeCard(@Req() req: any) {
    return this.financeiroService.removeCardForUser(req.user);
  }

  @Post('checkout')
  createCheckout(@Req() req: any, @Body() dto: CreateFinanceiroCheckoutDto) {
    return this.financeiroService.createCheckoutForUser(req.user, dto);
  }

  @Post('charges/:chargeId/refresh')
  refreshCharge(@Req() req: any, @Param('chargeId') chargeId: string, @Body() dto?: { paymentId?: string }) {
    return this.financeiroService.refreshChargeForUser(req.user, chargeId, dto?.paymentId);
  }
}

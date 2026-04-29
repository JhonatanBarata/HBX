import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommercialPlansService } from './commercial-plans.service';
import { SelectCommercialPlanDto } from './dto/select-commercial-plan.dto';

@Controller('commercial-plans')
@UseGuards(JwtAuthGuard)
export class CommercialPlansController {
  constructor(private readonly commercialPlansService: CommercialPlansService) {}

  @Get('catalog')
  getCatalog(@Req() req: any) {
    return this.commercialPlansService.getCatalogForUser(req.user);
  }

  @Get('me')
  getMe(@Req() req: any) {
    return this.commercialPlansService.getCatalogForUser(req.user);
  }

  @Post('select')
  selectPlan(@Req() req: any, @Body() dto: SelectCommercialPlanDto) {
    return this.commercialPlansService.selectPlanForUser(req.user, dto);
  }
}

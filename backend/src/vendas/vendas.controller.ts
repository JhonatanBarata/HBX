import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateAtendimentoBotConfigDto } from '../inbox/dto/update-atendimento-bot-config.dto';
import { CommercialEntitlement } from '../commercial-plans/commercial-entitlement.decorator';
import { CommercialEntitlementGuard } from '../commercial-plans/commercial-entitlement.guard';
import { COMMERCIAL_ENTITLEMENT_KEYS } from '../commercial-plans/commercial-plan-catalog';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import {
  CreateManualVendasLeadDto,
  ImportWebscrapingLeadsDto,
  UpdateVendasLeadDto,
} from './dto/vendas.dto';
import { VendasService } from './vendas.service';

@Controller('vendas')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('vendas')
export class VendasController {
  constructor(private readonly vendasService: VendasService) {}

  @Get('automation/bot-config')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  getAutomationBotConfig(@Req() req: any) {
    return this.vendasService.getAutomationBotConfigForUser(req.user);
  }

  @Patch('automation/bot-config')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  updateAutomationBotConfig(@Req() req: any, @Body() dto: UpdateAtendimentoBotConfigDto) {
    return this.vendasService.updateAutomationBotConfigForUser(req.user, dto);
  }

  @Get('automation/agenda')
  getAutomationAgenda(@Req() req: any) {
    return this.vendasService.getAutomationAgendaForUser(req.user);
  }

  @Get('board')
  getBoard(@Req() req: any) {
    return this.vendasService.getBoardForUser(req.user);
  }

  @Post('manual')
  createManualLead(@Req() req: any, @Body() dto: CreateManualVendasLeadDto) {
    return this.vendasService.createManualLeadForUser(req.user, dto);
  }

  @Post('import/webscraping')
  importWebscrapingLeads(@Req() req: any, @Body() dto: ImportWebscrapingLeadsDto) {
    return this.vendasService.importWebscrapingLeadsForUser(req.user, dto);
  }

  @Post('import/webscraping/preview')
  previewWebscrapingImport(@Req() req: any, @Body() dto: ImportWebscrapingLeadsDto) {
    return this.vendasService.previewWebscrapingImportForUser(req.user, dto);
  }

  @Patch('lead/:leadId')
  updateLead(@Req() req: any, @Param('leadId') leadId: string, @Body() dto: UpdateVendasLeadDto) {
    return this.vendasService.updateLeadForUser(req.user, leadId, dto);
  }

  @Post('agenda/whatsapp/sync-today')
  syncTodayAgenda(@Req() req: any, @Body() body?: { leadIds?: string[] }) {
    return this.vendasService.syncTodayAgendaForUser(req.user, body || undefined);
  }

  @Post('lead/:leadId/attempt')
  registerAttempt(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: any) {
    return this.vendasService.registerAttemptForUser(req.user, leadId, body || undefined);
  }
}

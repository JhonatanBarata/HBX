import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateAtendimentoBotConfigDto } from '../inbox/dto/update-atendimento-bot-config.dto';
import { CommercialEntitlement } from '../commercial-plans/commercial-entitlement.decorator';
import { CommercialEntitlementGuard } from '../commercial-plans/commercial-entitlement.guard';
import { COMMERCIAL_ENTITLEMENT_KEYS } from '../commercial-plans/commercial-plan-catalog';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import {
  BulkDeleteVendasLeadsDto,
  CreateManualVendasLeadDto,
  ImportWebscrapingLeadsDto,
  StartVendasProspectingDto,
  UpdateVendasProspectingConfigDto,
  UpdateVendasLeadDto,
} from './dto/vendas.dto';
import { VendasAutomationService } from './vendas-automation.service';
import { VendasService } from './vendas.service';

@Controller('vendas')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('vendas')
export class VendasController {
  constructor(
    private readonly vendasService: VendasService,
    private readonly vendasAutomationService: VendasAutomationService,
  ) {}

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

  @Get('automation/live-status')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  getAutomationLiveStatus(@Req() req: any) {
    return this.vendasAutomationService.getLiveStatusForUser(req.user);
  }

  @Post('automation/prospecting/start')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  startProspecting(@Req() req: any, @Body() dto: StartVendasProspectingDto) {
    return this.vendasAutomationService.startProspectingForUser(req.user, dto || {});
  }

  @Post('automation/prospecting/pause')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  pauseProspecting(@Req() req: any) {
    return this.vendasAutomationService.pauseProspectingForUser(req.user);
  }

  @Post('automation/prospecting/resume')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  resumeProspecting(@Req() req: any) {
    return this.vendasAutomationService.resumeProspectingForUser(req.user);
  }

  @Post('automation/prospecting/cancel')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  cancelProspecting(@Req() req: any) {
    return this.vendasAutomationService.cancelProspectingForUser(req.user);
  }

  @Patch('automation/prospecting/config')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA)
  updateProspectingConfig(@Req() req: any, @Body() dto: UpdateVendasProspectingConfigDto) {
    return this.vendasAutomationService.patchProspectingConfigForUser(req.user, dto || {});
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

  @Post('leads/delete-bulk')
  deleteLeadsBulk(@Req() req: any, @Body() dto: BulkDeleteVendasLeadsDto) {
    return this.vendasService.deleteLeadsBulkForUser(req.user, dto || {});
  }

  @Post('agenda/whatsapp/sync-today')
  async syncTodayAgenda(@Req() req: any, @Body() body?: { leadIds?: string[] }) {
    const syncResult = await this.vendasService.syncTodayAgendaForUser(req.user, body || undefined);
    const mirroredLeadIds = syncResult?.leadConversationIds ? Object.keys(syncResult.leadConversationIds) : [];
    const automationQueue = await this.vendasAutomationService.enqueueLeadsForActiveCampaignForUser(req.user, mirroredLeadIds);
    const queuedCount = Number(automationQueue?.queuedCount || 0);
    return {
      ...syncResult,
      automationQueue,
      message: queuedCount
        ? `${syncResult.message || 'Cards preparados na Prospecção.'} ${queuedCount} card(s) entraram na fila automática.`
        : syncResult.message,
    };
  }

  @Post('lead/:leadId/attempt')
  registerAttempt(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: any) {
    return this.vendasService.registerAttemptForUser(req.user, leadId, body || undefined);
  }
}

import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateAtendimentoBotConfigDto } from '../inbox/dto/update-atendimento-bot-config.dto';
import { BotArmed } from '../modules/bot-armed.decorator';
import { BotArmedGuard } from '../modules/bot-armed.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import {
  BulkDeleteVendasLeadsDto,
  CancelCommissionPayoutDto,
  CreateCommissionPayoutDto,
  ResolveCancellationCaseDto,
  CreateHbxAssistedSignupDto,
  CreateHbxSalesHandoffDto,
  CreateMasterNoticeDto,
  CreateManualVendasLeadDto,
  ImportWebscrapingLeadsDto,
  ReportVendasLeadDto,
  SimulateProspectingDto,
  StartVendasProspectingDto,
  UpdateSalesProfileDto,
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
  getAutomationBotConfig(@Req() req: any) {
    return this.vendasService.getAutomationBotConfigForUser(req.user);
  }

  @Patch('automation/bot-config')
  @UseGuards(BotArmedGuard)
  @BotArmed()
  updateAutomationBotConfig(@Req() req: any, @Body() dto: UpdateAtendimentoBotConfigDto) {
    return this.vendasService.updateAutomationBotConfigForUser(req.user, dto);
  }

  @Get('automation/agenda')
  getAutomationAgenda(@Req() req: any) {
    return this.vendasService.getAutomationAgendaForUser(req.user);
  }

  @Get('bot-status')
  getBotStatus(@Req() req: any) {
    return this.vendasService.getBotStatusForUser(req.user);
  }

  // % e tetos de comissao do proprio vendedor — alimenta a estimativa ao vivo do
  // passo-a-passo de fechamento ("voce vai ganhar ~ R$X").
  @Get('me/commission-profile')
  getMyCommissionProfile(@Req() req: any) {
    return this.vendasService.getMyCommissionProfileForUser(req.user);
  }

  @Post('notify-bot-config-missing')
  notifyBotConfigMissing(@Req() req: any) {
    return this.vendasService.notifyBotConfigMissingForUser(req.user);
  }

  @Get('automation/live-status')
  @UseGuards(BotArmedGuard)
  @BotArmed()
  getAutomationLiveStatus(@Req() req: any) {
    return this.vendasAutomationService.getLiveStatusForUser(req.user);
  }

  @Post('automation/prospecting/start')
  @UseGuards(BotArmedGuard)
  @BotArmed()
  startProspecting(@Req() req: any, @Body() dto: StartVendasProspectingDto) {
    return this.vendasAutomationService.startProspectingForUser(req.user, dto || {});
  }

  @Post('automation/prospecting/pause')
  @UseGuards(BotArmedGuard)
  @BotArmed()
  pauseProspecting(@Req() req: any) {
    return this.vendasAutomationService.pauseProspectingForUser(req.user);
  }

  @Post('automation/prospecting/resume')
  @UseGuards(BotArmedGuard)
  @BotArmed()
  resumeProspecting(@Req() req: any) {
    return this.vendasAutomationService.resumeProspectingForUser(req.user);
  }

  @Post('automation/prospecting/cancel')
  @UseGuards(BotArmedGuard)
  @BotArmed()
  cancelProspecting(@Req() req: any) {
    return this.vendasAutomationService.cancelProspectingForUser(req.user);
  }

  @Patch('automation/prospecting/config')
  updateProspectingConfig(@Req() req: any, @Body() dto: UpdateVendasProspectingConfigDto) {
    return this.vendasAutomationService.patchProspectingConfigForUser(req.user, dto || {});
  }

  // Teste de conversa (preview interativo). Sem efeito colateral: roda o mesmo
  // classificador do motor sobre um texto de teste e devolve o que o bot mandaria.
  @Post('automation/prospecting/simulate')
  simulateProspecting(@Req() req: any, @Body() dto: SimulateProspectingDto) {
    return this.vendasAutomationService.simulateProspectingForUser(req.user, dto || {});
  }

  @Get('board')
  getBoard(@Req() req: any, @Query('sellerId') sellerId?: string) {
    return this.vendasService.getBoardForUser(req.user, sellerId);
  }

  @Get('usage')
  getUsage(@Req() req: any) {
    return this.vendasService.getUsageSnapshotForUser(req.user);
  }

  @Get('pending-summary')
  getPendingSummary(@Req() req: any) {
    return this.vendasService.getPendingSummaryForUser(req.user);
  }

  @Get('sales-profile')
  getSalesProfile(@Req() req: any) {
    return this.vendasService.getSalesProfileForUser(req.user);
  }

  @Patch('sales-profile')
  async updateSalesProfile(
    @Req() req: any,
    @Body() dto: UpdateSalesProfileDto,
    @Headers('x-hbx-onboarding') onboardingSource?: string,
  ) {
    try {
      return await this.vendasService.updateSalesProfileForUser(req.user, dto || {});
    } catch (error: any) {
      if (/Informe o que voce vende/i.test(String(error?.message || ''))) throw error;
      if (String(onboardingSource || '').trim().toLowerCase() !== 'mobile') throw error;

      return {
        ok: false,
        persisted: false,
        source: 'onboarding_fallback',
        message: String(error?.message || 'Perfil salvo localmente. A persistencia remota sera aplicada quando o perfil estiver disponivel.'),
        effectiveProfile: {
          whatDoYouSell: dto?.whatDoYouSell || null,
          offerCategory: dto?.offerCategory || null,
          targetAudience: Array.isArray(dto?.targetAudience?.labels) ? dto.targetAudience.labels : [],
          targetSegments: Array.isArray(dto?.targetSegments?.labels) ? dto.targetSegments.labels : [],
          avoidSegments: Array.isArray(dto?.avoidSegments?.labels) ? dto.avoidSegments.labels : [],
          preferredCities: Array.isArray(dto?.preferredCities) ? dto.preferredCities : [],
          preferredStates: Array.isArray(dto?.preferredStates) ? dto.preferredStates : [],
          preferredChannels: Array.isArray(dto?.preferredChannels) ? dto.preferredChannels : [],
          weeklyAutoUpdateEnabled: Boolean(dto?.weeklyAutoUpdateEnabled),
        },
      };
    }
  }

  @Post('sales-profile/suggest-weekly')
  suggestSalesProfile(@Req() req: any) {
    return this.vendasService.suggestWeeklySalesProfileForUser(req.user);
  }

  @Post('sales-profile/apply-suggestion')
  applySalesProfileSuggestion(@Req() req: any) {
    return this.vendasService.applySalesProfileSuggestionForUser(req.user);
  }

  @Get('report')
  getConversionReport(@Req() req: any, @Query('period') period?: string) {
    return this.vendasService.getConversionReportForUser(req.user, period);
  }

  @Get('seller-audit')
  getSellerAudit(@Req() req: any, @Query('period') period?: string) {
    return this.vendasService.getSellerAuditForUser(req.user, period);
  }

  @Patch('seller-audit/:sellerId/governance')
  updateSellerGovernance(@Req() req: any, @Param('sellerId') sellerId: string, @Body() body: any) {
    return this.vendasService.updateSellerGovernanceForUser(req.user, Number(sellerId), body || {});
  }

  @Get('hbx-closing-pipeline')
  getHbxClosingPipeline(@Req() req: any) {
    return this.vendasService.getHbxClosingPipelineForUser(req.user);
  }

  @Get('crm-integrity')
  getCrmIntegrity(@Req() req: any) {
    return this.vendasService.getCrmIntegrityForUser(req.user);
  }

  @Get('commission/summary')
  getCommissionSummary(@Req() req: any) {
    return this.vendasService.getCommissionSummaryForUser(req.user);
  }

  // E5 (PLAN12062026001): casos de cancelamento - triagem e decisao do master
  @Get('cancellation-cases')
  listCancellationCases(@Req() req: any) {
    return this.vendasService.listCancellationCasesForUser(req.user);
  }

  @Patch('lead/:leadId/cancellation-case')
  resolveCancellationCase(@Req() req: any, @Param('leadId') leadId: string, @Body() dto: ResolveCancellationCaseDto) {
    return this.vendasService.resolveCancellationCaseForUser(req.user, leadId, dto || ({} as ResolveCancellationCaseDto));
  }

  // FINANCEIRO-UNIVERSAL (Fase 1): venda fechada vira conta-a-receber no financeiro
  // central. Admin/Master-only (gate no service). Idempotente por lead.
  @Post('lead/:leadId/gerar-cobranca')
  gerarCobrancaFromLead(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: { dueDate?: string | null }) {
    return this.vendasService.gerarCobrancaFromLead(req.user, leadId, body || {});
  }

  @Post('commission/payout')
  createCommissionPayout(@Req() req: any, @Body() dto: CreateCommissionPayoutDto) {
    return this.vendasService.createCommissionPayoutForUser(req.user, dto || {});
  }

  @Post('commission/payout/:payoutId/cancel')
  cancelCommissionPayout(@Req() req: any, @Param('payoutId') payoutId: string, @Body() dto: CancelCommissionPayoutDto) {
    return this.vendasService.cancelCommissionPayoutForUser(req.user, payoutId, dto || {});
  }

  @Get('commission/payout/:payoutId')
  getCommissionPayoutDetail(@Req() req: any, @Param('payoutId') payoutId: string) {
    return this.vendasService.getCommissionPayoutDetailForUser(req.user, payoutId);
  }

  @Get('master-notices')
  listMasterNotices(@Req() req: any, @Query('audience') audience?: string) {
    return this.vendasService.listMasterNoticesForUser(req.user, audience);
  }

  @Post('master-notices')
  createMasterNotice(@Req() req: any, @Body() dto: CreateMasterNoticeDto) {
    return this.vendasService.createMasterNoticeForUser(req.user, dto || ({} as CreateMasterNoticeDto));
  }

  @Post('master-notices/:noticeId/ack')
  acknowledgeMasterNotice(@Req() req: any, @Param('noticeId') noticeId: string) {
    return this.vendasService.acknowledgeMasterNoticeForUser(req.user, noticeId);
  }

  @Get('report/export.pdf')
  async exportConversionReportPdf(@Req() req: any, @Query('period') period: string | undefined, @Res() res: any) {
    const pdf = await this.vendasService.exportConversionReportPdfForUser(req.user, period);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.buffer);
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

  @Post('lead/:leadId/hbx-handoff')
  createHbxSalesHandoff(@Req() req: any, @Param('leadId') leadId: string, @Body() dto: CreateHbxSalesHandoffDto) {
    return this.vendasService.createHbxSalesHandoffForUser(req.user, leadId, dto || {});
  }

  // Fechamento direto do Atendimento (conversa do WhatsApp). Garante o card e roda
  // o mesmo handoff — comissao amarrada a quem fecha.
  @Post('conversation/:conversationId/hbx-handoff')
  createHbxSalesHandoffFromConversation(@Req() req: any, @Param('conversationId') conversationId: string, @Body() dto: CreateHbxSalesHandoffDto) {
    return this.vendasService.createHbxSalesHandoffFromConversationForUser(req.user, conversationId, dto || {});
  }

  @Post('lead/:leadId/hbx-assisted-signup')
  createHbxAssistedSignup(@Req() req: any, @Param('leadId') leadId: string, @Body() dto: CreateHbxAssistedSignupDto) {
    return this.vendasService.createHbxAssistedSignupForUser(req.user, leadId, dto || ({} as CreateHbxAssistedSignupDto));
  }

  @Post('lead/:leadId/enrichment')
  enrichLead(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: { templateOffset?: number }) {
    return this.vendasService.enrichLeadForUser(req.user, leadId, {
      templateOffset: Number(body?.templateOffset || 0),
    });
  }

  @Get('lead/:leadId/conversation-snapshot')
  getLeadConversationSnapshot(@Req() req: any, @Param('leadId') leadId: string, @Query('eventId') eventId?: string) {
    return this.vendasService.getLeadConversationSnapshotForUser(req.user, leadId, eventId || null);
  }

  // LEAD-COCKPIT (11/07): ficha RFB rica da empresa do lead pro modal "cockpit" do Vendas.
  // Só lê a base local (zero chamada externa, zero débito); CNPJ derivado server-side.
  @Get('lead/:leadId/cockpit')
  getLeadCockpit(@Req() req: any, @Param('leadId') leadId: string) {
    return this.vendasService.getLeadCockpitForUser(req.user, leadId);
  }

  @Post('lead/:leadId/presentation-draft')
  buildPresentationDraft(@Req() req: any, @Param('leadId') leadId: string) {
    return this.vendasService.buildPresentationEmailDraftForUser(req.user, leadId);
  }

  @Post('leads/:leadId/email/presentation/preview')
  previewPresentationEmail(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: any) {
    return this.vendasService.previewPresentationEmailForUser(req.user, leadId, body || {});
  }

  @Post('leads/:leadId/email/presentation/send')
  sendPresentationEmail(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: any) {
    return this.vendasService.sendPresentationEmailForUser(req.user, leadId, body || {});
  }

  @Post('leads/delete-bulk')
  deleteLeadsBulk(@Req() req: any, @Body() dto: BulkDeleteVendasLeadsDto) {
    return this.vendasService.deleteLeadsBulkForUser(req.user, dto || {});
  }

  @Post('leads/:leadId/delete')
  deleteLead(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: { reason?: string }) {
    return this.vendasService.deleteLeadForUser(req.user, leadId, body?.reason);
  }

  // Negativar com MOTIVO (dono 14/06): leve volta pra lagoa, dura some pra todos.
  @Post('lead/:leadId/negativar')
  negativarLead(@Req() req: any, @Param('leadId') leadId: string, @Body() body?: { status?: string; note?: string }) {
    return this.vendasService.negativarLeadForUser(req.user, leadId, body || {});
  }

  @Post('leads/:leadId/report-error')
  reportLeadError(@Req() req: any, @Param('leadId') leadId: string, @Body() dto: ReportVendasLeadDto) {
    return this.vendasService.reportLeadErrorForUser(req.user, leadId, dto || {});
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

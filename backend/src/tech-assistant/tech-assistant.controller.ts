import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { AnalyzeTechAssistantDto } from './dto/analyze-tech-assistant.dto';
import { ConfirmTechAssistantOperationDto } from './dto/confirm-operation.dto';
import { TechAssistantService } from './tech-assistant.service';

@Controller('tech-assistant')
@UseGuards(JwtAuthGuard, MasterGuard)
export class TechAssistantController {
  constructor(private readonly techAssistantService: TechAssistantService) {}

  @Get('history')
  listHistory(
    @Req() req: any,
    @Query('companyId') companyId?: string,
    @Query('module') moduleKey?: string,
    @Query('route') route?: string,
    @Query('analysisType') analysisType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.techAssistantService.listHistory(req.user, {
      companyId: Number(companyId || 0) || undefined,
      module: moduleKey,
      route,
      analysisType,
      from,
      to,
    });
  }

  @Get('examples')
  getExamples() {
    return this.techAssistantService.getExamples();
  }

  @Get('tools/conversations')
  listCompanyConversations(@Req() req: any) {
    return this.techAssistantService.listCompanyConversations(req.user);
  }

  @Get('tools/conversations/:id/messages')
  listConversationMessages(@Req() req: any, @Param('id') id: string) {
    return this.techAssistantService.listConversationMessages(req.user, Number(id));
  }

  @Get('tools/webhooks')
  listRecentWebhooks(@Req() req: any) {
    return this.techAssistantService.listRecentWebhooks(req.user);
  }

  @Get('tools/integration-status')
  getIntegrationStatus(@Req() req: any) {
    return this.techAssistantService.getIntegrationStatus(req.user);
  }

  @Get('tools/failures')
  listRecentFailures(@Req() req: any) {
    return this.techAssistantService.listRecentFailures(req.user);
  }

  @Post('analyze')
  analyze(@Req() req: any, @Body() dto: AnalyzeTechAssistantDto) {
    return this.techAssistantService.analyze(req.user, dto);
  }

  @Post('operation/confirm-action')
  confirmSensitiveAction(@Req() req: any, @Body() dto: ConfirmTechAssistantOperationDto) {
    return this.techAssistantService.confirmSensitiveOperation(req.user, dto);
  }

  @Delete('history')
  clearHistory(@Req() req: any) {
    return this.techAssistantService.clearHistory(req.user);
  }

  @Delete('history/:id')
  deleteHistoryItem(@Req() req: any, @Param('id') id: string) {
    return this.techAssistantService.deleteHistoryItem(req.user, id);
  }
}
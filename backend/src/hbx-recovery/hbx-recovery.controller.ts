import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { Admin } from '../auth/admin.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HbxRecoveryService } from './hbx-recovery.service';
import { CreateRecoveryCustomerDto } from './dto/create-recovery-customer.dto';
import { MarkRecoveryCustomerPaidDto } from './dto/mark-paid.dto';
import { CreateRecoveryFlowStageDto } from './dto/create-recovery-flow-stage.dto';
import { UpdateRecoveryFlowStageDto } from './dto/update-recovery-flow-stage.dto';
import { SendRecoveryPaymentLinkDto } from './dto/send-payment-link.dto';
import { ListRecoveryPaymentsDto } from './dto/list-payments.dto';
import { RefundRecoveryPaymentDto } from './dto/refund-payment.dto';
import { UpdateRecoveryBotConfigDto } from './dto/update-recovery-bot-config.dto';
import { ImportRecoveryCustomersDto } from './dto/import-recovery-customers.dto';
import {
  UpdateRecoveryCustomerAutomationDto,
  UpdateRecoveryCustomersAutomationBatchDto,
} from './dto/update-recovery-customer-automation.dto';
import {
  AddInteractionNoteDto,
  AssignHumanAgentDto,
  CloseInteractionDto,
  GenerateInteractionLinkDto,
  MarkInteractionPaidDto,
  SendInteractionMessageDto,
} from './dto/interaction-actions.dto';
import {
  CreateMetaTemplateDto,
  DeleteMetaTemplateDto,
  ListMetaTemplatesQueryDto,
  SetMetaTemplateActivationDto,
} from './dto/meta-templates.dto';

@Controller('hbx-recovery')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('hbx_recovery')
export class HbxRecoveryController {
  constructor(private readonly recoveryService: HbxRecoveryService) {}

  @Get('customers')
  listCustomers(@Req() req: any) {
    return this.recoveryService.listCustomers(req.user);
  }

  @Get('flows')
  listFlowStages(@Req() req: any) {
    return this.recoveryService.listFlowStages(req.user);
  }

  @Get('bot-config')
  getBotConfig(@Req() req: any) {
    return this.recoveryService.getBotConfig(req.user);
  }

  @Get('meta-templates')
  listMetaTemplates(@Req() req: any, @Query() query: ListMetaTemplatesQueryDto) {
    return this.recoveryService.listMetaTemplates(req.user, query?.refresh);
  }

  @Post('meta-templates/sync')
  syncMetaTemplates(@Req() req: any) {
    return this.recoveryService.syncMetaTemplates(req.user);
  }

  @Patch('meta-templates/activation')
  setMetaTemplateActivation(@Req() req: any, @Body() dto: SetMetaTemplateActivationDto) {
    return this.recoveryService.setMetaTemplateActivation(req.user, dto);
  }

  @Post('meta-templates/create')
  createMetaTemplate(@Req() req: any, @Body() dto: CreateMetaTemplateDto) {
    return this.recoveryService.createMetaTemplate(req.user, dto);
  }

  @Delete('meta-templates')
  deleteMetaTemplate(@Req() req: any, @Body() dto: DeleteMetaTemplateDto) {
    return this.recoveryService.deleteMetaTemplate(req.user, dto);
  }

  @Post('meta-templates/upload-header-media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadMetaTemplateHeaderMedia(
    @Req() req: any,
    @UploadedFile() file?: any,
    @Body() body?: { templateName?: string; language?: string },
  ) {
    return this.recoveryService.uploadMetaTemplateHeaderMedia(req.user, file, body);
  }

  @Patch('bot-config')
  updateBotConfig(@Req() req: any, @Body() dto: UpdateRecoveryBotConfigDto) {
    return this.recoveryService.updateBotConfig(req.user, dto);
  }

  @Post('flows')
  createFlowStage(@Req() req: any, @Body() dto: CreateRecoveryFlowStageDto) {
    return this.recoveryService.createFlowStage(req.user, dto);
  }

  @Patch('flows/:id')
  updateFlowStage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRecoveryFlowStageDto,
  ) {
    return this.recoveryService.updateFlowStage(req.user, id, dto);
  }

  @Delete('flows/:id')
  deleteFlowStage(@Req() req: any, @Param('id') id: string) {
    return this.recoveryService.deleteFlowStage(req.user, id);
  }

  @Post('customers')
  createCustomer(@Req() req: any, @Body() dto: CreateRecoveryCustomerDto) {
    return this.recoveryService.createCustomer(req.user, dto);
  }

  @Post('customers/import')
  importCustomers(@Req() req: any, @Body() dto: ImportRecoveryCustomersDto) {
    return this.recoveryService.importCustomers(req.user, dto?.rows);
  }

  @Patch('customers/automation/batch')
  updateCustomersAutomationBatch(
    @Req() req: any,
    @Body() dto: UpdateRecoveryCustomersAutomationBatchDto,
  ) {
    return this.recoveryService.updateCustomersAutomationBatch(
      req.user,
      dto?.customerIds,
      dto?.enabled,
    );
  }

  @Patch('customers/:id/automation')
  updateCustomerAutomation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRecoveryCustomerAutomationDto,
  ) {
    return this.recoveryService.updateCustomerAutomation(req.user, id, dto?.enabled);
  }

  @Patch('customers/:id/mark-paid')
  markPaid(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: MarkRecoveryCustomerPaidDto,
  ) {
    return this.recoveryService.markPaid(req.user, id, dto?.amount);
  }

  @Post('customers/:id/send-payment-link')
  sendPaymentLink(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SendRecoveryPaymentLinkDto,
  ) {
    return this.recoveryService.sendPaymentLink(req.user, id, dto?.amount);
  }

  @Post('customers/:id/start-template')
  startTemplateFlow(@Req() req: any, @Param('id') id: string) {
    return this.recoveryService.startTemplateFlow(req.user, id);
  }

  @Get('payments')
  listPayments(@Req() req: any, @Query() query: ListRecoveryPaymentsDto) {
    return this.recoveryService.listPayments(req.user, query);
  }

  @Get('interactions')
  listInteractions(@Req() req: any, @Query('queue') queue?: string) {
    return this.recoveryService.listInteractions(req.user, queue);
  }

  @Get('interactions/:conversationId/messages')
  listInteractionMessages(@Req() req: any, @Param('conversationId') conversationId: string) {
    return this.recoveryService.listInteractionMessages(req.user, Number(conversationId));
  }

  @Get('interactions/:conversationId/state')
  getInteractionState(@Req() req: any, @Param('conversationId') conversationId: string) {
    return this.recoveryService.getInteractionState(req.user, Number(conversationId));
  }

  @Patch('interactions/:conversationId/assign-human')
  assignHuman(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: AssignHumanAgentDto,
  ) {
    return this.recoveryService.assignHumanAgent(req.user, Number(conversationId), dto?.assignedUserId);
  }

  @Patch('interactions/:conversationId/pause-bot')
  pauseBot(@Req() req: any, @Param('conversationId') conversationId: string) {
    return this.recoveryService.pauseBotFlow(req.user, Number(conversationId));
  }

  @Patch('interactions/:conversationId/resume-bot')
  resumeBot(@Req() req: any, @Param('conversationId') conversationId: string) {
    return this.recoveryService.resumeBotFlow(req.user, Number(conversationId));
  }

  @Post('interactions/:conversationId/generate-link')
  generateLink(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: GenerateInteractionLinkDto,
  ) {
    return this.recoveryService.generateInteractionLink(req.user, Number(conversationId), dto);
  }

  @Post('interactions/:conversationId/resend-link')
  resendLink(@Req() req: any, @Param('conversationId') conversationId: string) {
    return this.recoveryService.resendLastInteractionLink(req.user, Number(conversationId));
  }

  @Post('interactions/:conversationId/request-proof')
  requestProof(@Req() req: any, @Param('conversationId') conversationId: string) {
    return this.recoveryService.requestPaymentProof(req.user, Number(conversationId));
  }

  @Post('interactions/:conversationId/internal-note')
  addInternalNote(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: AddInteractionNoteDto,
  ) {
    return this.recoveryService.addInternalNote(req.user, Number(conversationId), dto?.note);
  }

  @Post('interactions/:conversationId/send-message')
  sendInteractionMessage(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendInteractionMessageDto,
  ) {
    return this.recoveryService.sendInteractionHumanMessage(
      req.user,
      Number(conversationId),
      dto?.body,
    );
  }

  @Patch('interactions/:conversationId/mark-paid')
  markInteractionPaid(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: MarkInteractionPaidDto,
  ) {
    return this.recoveryService.markInteractionPaid(req.user, Number(conversationId), dto?.amount);
  }

  @Patch('interactions/:conversationId/close')
  closeInteraction(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: CloseInteractionDto,
  ) {
    return this.recoveryService.closeInteraction(req.user, Number(conversationId), dto?.result);
  }

  @Post('payments/:id/refund')
  refundPayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RefundRecoveryPaymentDto,
  ) {
    return this.recoveryService.refundPayment(req.user, id, dto?.amount);
  }

  @Delete('customers')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
  @Admin()
  clearCustomers(@Req() req: any) {
    return this.recoveryService.clearCompanyCustomers(req.user);
  }

  @Post('customers/reset-seed')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
  @Admin()
  resetSeed(@Req() req: any) {
    return this.recoveryService.resetAndSeedCompanyCustomers(req.user);
  }
}

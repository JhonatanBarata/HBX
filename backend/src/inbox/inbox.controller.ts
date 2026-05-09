import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InboxService } from './inbox.service';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { SendConversationMessageDto } from './dto/send-conversation-message.dto';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { UpdateAtendimentoBotConfigDto } from './dto/update-atendimento-bot-config.dto';
import { BulkSetBotDto } from './dto/bulk-set-bot.dto';
import { UpdateAtendimentoAgendaDto } from './dto/update-atendimento-agenda.dto';
import { SimulateAtendimentoAgendaDto } from './dto/simulate-atendimento-agenda.dto';
import { BlockConversationDto } from './dto/block-conversation.dto';
import { CreateAtendimentoCustomerDto } from './dto/create-atendimento-customer.dto';
import { UpdateAtendimentoCustomerDto } from './dto/update-atendimento-customer.dto';
import { PromoteToRecoveryDto } from './dto/promote-to-recovery.dto';

@Controller('inbox')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('atendimento')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get('events')
  streamEvents(@Req() req: any, @Res() res: Response) {
    return this.inboxService.openRealtimeStream(req.user, req, res);
  }

  @Get('bootstrap')
  getBootstrap(
    @Req() req: any,
    @Query('take') take?: string,
    @Query('includePreviousSessions') includePreviousSessions?: string,
  ) {
    return this.inboxService.getBootstrap(req.user, take, { includePreviousSessions: includePreviousSessions === 'true' });
  }

  @Post('bootstrap/full')
  bootstrapFull(@Req() req: any, @Query('take') take?: string) {
    return this.inboxService.bootstrapFullMirror(req.user, take);
  }

  @Post('bootstrap/full/background')
  bootstrapFullBackground(@Req() req: any, @Query('take') take?: string) {
    return this.inboxService.bootstrapFullMirrorBackground(req.user, take);
  }

  @Get('bot-config')
  getBotConfig(@Req() req: any) {
    return this.inboxService.getBotConfig(req.user);
  }

  @Post('whatsapp-sessions/:id/archive')
  archiveWhatsappSession(@Req() req: any, @Param('id') id: string) {
    return this.inboxService.archiveWhatsappSession(req.user, id);
  }

  @Post('whatsapp-sessions/:id/migrate-current')
  migrateWhatsappSessionToCurrent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { confirmation?: string | null },
  ) {
    return this.inboxService.migrateWhatsappSessionToCurrent(req.user, id, dto || {});
  }

  @Patch('bot-config')
  updateBotConfig(@Req() req: any, @Body() dto: UpdateAtendimentoBotConfigDto) {
    return this.inboxService.updateBotConfig(req.user, dto);
  }

  @Get('agenda')
  getAgenda(@Req() req: any) {
    return this.inboxService.getAgendaConfig(req.user);
  }

  @Patch('agenda')
  updateAgenda(@Req() req: any, @Body() dto: UpdateAtendimentoAgendaDto) {
    return this.inboxService.updateAgendaConfig(req.user, dto);
  }

  @Post('agenda/simulate')
  simulateAgenda(@Req() req: any, @Body() dto: SimulateAtendimentoAgendaDto) {
    return this.inboxService.simulateAgendaFlow(req.user, dto);
  }

  @Get('conversations')
  listConversations(
    @Req() req: any,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('queue') queue?: string,
    @Query('includePreviousSessions') includePreviousSessions?: string,
  ) {
    return this.inboxService.listConversations(req.user, { take, skip, queue, includePreviousSessions });
  }

  @Get('conversations/:id/messages')
  listConversationMessages(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('includePreviousSessions') includePreviousSessions?: string,
  ) {
    return this.inboxService.listConversationMessages(req.user, id, { limit, before, includePreviousSessions });
  }

  @Get('conversations/:id')
  getConversation(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('includePreviousSessions') includePreviousSessions?: string,
  ) {
    return this.inboxService.getConversationById(req.user, id, { includePreviousSessions });
  }

  @Get('conversations/:id/status-card')
  getStatusCard(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.inboxService.getConversationStatusCard(req.user, id);
  }

  @Patch('conversations/:id/status-card')
  updateStatusCard(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { doNotCall?: boolean; returnAt?: string | null; observations?: string | null },
  ) {
    return this.inboxService.updateConversationStatusCard(req.user, id, dto || {});
  }

  @Patch('conversations/:id/status')
  updateStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    return this.inboxService.updateConversationStatus(req.user, id, dto.status);
  }

  @Patch('conversations/:id/queue')
  updateQueue(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { queue?: string },
  ) {
    return this.inboxService.updateConversationQueue(req.user, id, dto?.queue);
  }

  @Patch('conversations/:id/personal')
  updatePersonalContact(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { personal?: boolean },
  ) {
    return this.inboxService.updateConversationPersonalContact(req.user, id, dto?.personal === true);
  }

  @Patch('conversations/:id/block')
  blockConversation(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BlockConversationDto,
  ) {
    return this.inboxService.blockConversation(req.user, id, dto?.reason);
  }

  @Patch('conversations/:id/unblock')
  unblockConversation(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.inboxService.unblockConversation(req.user, id);
  }

  @Delete('conversations/:id/purge')
  purgeConversationFromTrash(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.inboxService.purgeConversationFromTrash(req.user, id);
  }

  @Delete('conversations/:id')
  deleteConversation(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.inboxService.deleteConversation(req.user, id);
  }

  @Post('conversations/empty-trash')
  emptyTrash(@Req() req: any) {
    return this.inboxService.emptyTrash(req.user);
  }

  @Post('conversations/empty-trash/meticulous/dry-run')
  dryRunMeticulousEmptyTrash(
    @Req() req: any,
    @Body() dto: { olderThanHours?: number | string | null; delayMs?: number | string | null; limit?: number | string | null },
  ) {
    return this.inboxService.dryRunMeticulousTrashPurge(req.user, dto || {});
  }

  @Post('conversations/empty-trash/meticulous/start')
  startMeticulousEmptyTrash(
    @Req() req: any,
    @Body() dto: { dryRun?: boolean; olderThanHours?: number | string | null; delayMs?: number | string | null; limit?: number | string | null },
  ) {
    return this.inboxService.startMeticulousTrashPurge(req.user, {
      ...(dto || {}),
      mode: 'real',
      dryRun: false,
    });
  }

  @Get('conversations/empty-trash/meticulous/:jobId/status')
  getMeticulousEmptyTrashStatus(@Req() req: any, @Param('jobId') jobId: string) {
    return this.inboxService.getMeticulousTrashPurgeStatus(req.user, jobId);
  }

  @Post('conversations/empty-trash/meticulous/:jobId/pause')
  pauseMeticulousEmptyTrash(@Req() req: any, @Param('jobId') jobId: string) {
    return this.inboxService.pauseMeticulousTrashPurge(req.user, jobId);
  }

  @Post('conversations/empty-trash/meticulous/:jobId/resume')
  resumeMeticulousEmptyTrash(@Req() req: any, @Param('jobId') jobId: string) {
    return this.inboxService.resumeMeticulousTrashPurge(req.user, jobId);
  }

  @Post('conversations/empty-trash/meticulous/:jobId/cancel')
  cancelMeticulousEmptyTrash(@Req() req: any, @Param('jobId') jobId: string) {
    return this.inboxService.cancelMeticulousTrashPurge(req.user, jobId);
  }

  @Patch('conversations/:id/read')
  markConversationAsRead(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.inboxService.markConversationAsRead(req.user, id);
  }

  @Patch('conversations/bulk-bot')
  bulkSetBot(@Req() req: any, @Body() dto: BulkSetBotDto) {
    return this.inboxService.bulkSetBotActive(req.user, dto);
  }

  @Post('conversations/:id/message')
  sendMessage(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendConversationMessageDto,
  ) {
    return this.inboxService.sendMessage(req.user, id, dto.content, {
      quotedMessageId: dto.quotedMessageId,
      quotedContent: dto.quotedContent,
      attachment:
        dto.attachmentUrl || dto.attachmentKind
          ? {
              kind: dto.attachmentKind,
              url: dto.attachmentUrl,
              previewUrl: dto.attachmentPreviewUrl,
              mimeType: dto.attachmentMimeType,
              fileName: dto.attachmentFileName,
              fileSize: dto.attachmentFileSize,
              durationSeconds: dto.attachmentDurationSeconds,
            }
          : undefined,
    });
  }

  @Post('conversations/:id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
    }),
  )
  uploadMedia(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
  ) {
    return this.inboxService.uploadConversationMedia(req.user, id, file);
  }

  @Post('conversations/:conversationId/messages/:messageId/reaction')
  reactToMessage(
    @Req() req: any,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() dto: { reaction?: string | null },
  ) {
    return this.inboxService.reactToConversationMessage(
      req.user,
      conversationId,
      messageId,
      String(dto?.reaction || ''),
    );
  }

  @Delete('conversations/:conversationId/messages/:messageId')
  deleteMessageForEveryone(
    @Req() req: any,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
  ) {
    return this.inboxService.deleteConversationMessageForEveryone(
      req.user,
      conversationId,
      messageId,
    );
  }

  @Delete('conversations/:conversationId/messages/:messageId/local')
  deleteMessageLocally(
    @Req() req: any,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
  ) {
    return this.inboxService.deleteConversationMessageLocally(
      req.user,
      conversationId,
      messageId,
    );
  }

  // ---------------------------------------------------------------------------
  // Customers (Tabela de clientes)
  // ---------------------------------------------------------------------------

  @Get('customers')
  listCustomers(@Req() req: any, @Query('phone') phone?: string) {
    return this.inboxService.listAtendimentoCustomers(req.user, phone);
  }

  @Get('customers/by-phone')
  getCustomerByPhone(@Req() req: any, @Query('phone') phone: string) {
    return this.inboxService.getAtendimentoCustomerByPhone(req.user, phone);
  }

  @Post('customers')
  createCustomer(@Req() req: any, @Body() dto: CreateAtendimentoCustomerDto) {
    return this.inboxService.createAtendimentoCustomer(req.user, dto);
  }

  @Patch('customers/:id')
  updateCustomer(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAtendimentoCustomerDto,
  ) {
    return this.inboxService.updateAtendimentoCustomer(req.user, id, dto);
  }

  @Post('customers/:id/promote-to-recovery')
  promoteToRecovery(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: PromoteToRecoveryDto,
  ) {
    return this.inboxService.promoteToRecovery(req.user, id, dto);
  }
}

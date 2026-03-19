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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InboxService } from './inbox.service';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { SendConversationMessageDto } from './dto/send-conversation-message.dto';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { HbxRecoveryService } from '../hbx-recovery/hbx-recovery.service';
import {
  CreateMetaTemplateDto,
  DeleteMetaTemplateDto,
  ListMetaTemplatesQueryDto,
  SetMetaTemplateActivationDto,
} from '../hbx-recovery/dto/meta-templates.dto';
import { UpdateAtendimentoBotConfigDto } from './dto/update-atendimento-bot-config.dto';
import { UpdateAtendimentoAgendaDto } from './dto/update-atendimento-agenda.dto';
import { BlockConversationDto } from './dto/block-conversation.dto';

@Controller('inbox')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('atendimento')
export class InboxController {
  constructor(
    private readonly inboxService: InboxService,
    private readonly recoveryService: HbxRecoveryService,
  ) {}

  @Get('bot-config')
  getBotConfig(@Req() req: any) {
    return this.inboxService.getBotConfig(req.user);
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

  @Get('conversations')
  listConversations(@Req() req: any) {
    return this.inboxService.listConversations(req.user);
  }

  @Get('conversations/:id')
  getConversation(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.inboxService.getConversationById(req.user, id);
  }

  @Patch('conversations/:id/status')
  updateStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    return this.inboxService.updateConversationStatus(req.user, id, dto.status);
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

  @Post('conversations/:id/message')
  sendMessage(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendConversationMessageDto,
  ) {
    return this.inboxService.sendMessage(req.user, id, dto.content);
  }

  @Get('meta-templates')
  listMetaTemplates(@Req() req: any, @Query() query: ListMetaTemplatesQueryDto) {
    return this.recoveryService.listMetaTemplates(req.user, query?.refresh, {
      moduleKey: 'atendimento',
    });
  }

  @Post('meta-templates/sync')
  syncMetaTemplates(@Req() req: any) {
    return this.recoveryService.syncMetaTemplates(req.user, { moduleKey: 'atendimento' });
  }

  @Patch('meta-templates/activation')
  setMetaTemplateActivation(@Req() req: any, @Body() dto: SetMetaTemplateActivationDto) {
    return this.recoveryService.setMetaTemplateActivation(req.user, dto, {
      moduleKey: 'atendimento',
    });
  }

  @Post('meta-templates/create')
  createMetaTemplate(@Req() req: any, @Body() dto: CreateMetaTemplateDto) {
    return this.recoveryService.createMetaTemplate(req.user, dto, {
      moduleKey: 'atendimento',
    });
  }

  @Delete('meta-templates')
  deleteMetaTemplate(@Req() req: any, @Body() dto: DeleteMetaTemplateDto) {
    return this.recoveryService.deleteMetaTemplate(req.user, dto, {
      moduleKey: 'atendimento',
    });
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
    return this.recoveryService.uploadMetaTemplateHeaderMedia(req.user, file, body, {
      moduleKey: 'atendimento',
    });
  }
}

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
import { UpdateAtendimentoBotConfigDto } from './dto/update-atendimento-bot-config.dto';
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

  @Post('agenda/simulate')
  simulateAgenda(@Req() req: any, @Body() dto: SimulateAtendimentoAgendaDto) {
    return this.inboxService.simulateAgendaFlow(req.user, dto);
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

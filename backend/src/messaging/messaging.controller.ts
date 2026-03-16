import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingService } from './messaging.service';
import { EnqueueMessageDto } from './dto/enqueue-message.dto';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { CreateAutoReplyRuleDto, UpdateAutoReplyRuleDto } from './dto/auto-reply.dto';
import type { Response } from 'express';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';

@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  // Manual enqueue (useful for testing the sender)
  @Post('messages')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  enqueue(@Req() req: any, @Body() dto: EnqueueMessageDto) {
    return this.messaging.enqueueMessage(req.user, {
      to: dto.to,
      body: dto.body,
      messageType: dto.messageType,
      templateName: dto.templateName,
      templateLanguage: dto.templateLanguage,
      templateComponents: dto.templateComponents,
    });
  }

  @Get('messages/outbound')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  listOutbound(@Req() req: any, @Query('take') take?: string) {
    const parsed = take ? Number(take) : undefined;
    return this.messaging.listOutboundMessages(req.user, { take: Number.isFinite(parsed) ? parsed : undefined });
  }

  @Get('messages/outbound/:id')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  getOutbound(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.messaging.getOutboundMessage(req.user, id);
  }

  // Webhook/event handler (custom/proxy)
  @Post('webhooks/whatsapp/inbound')
  inbound(@Body() dto: InboundMessageDto) {
    return this.messaging.handleInboundProxyMessage({
      whatsappPhoneNumberId: dto.whatsappPhoneNumberId,
      from: dto.from,
      text: dto.text,
      receivedAt: dto.receivedAt,
      inboundType: dto.inboundType,
      rawPayload: dto.rawPayload,
    });
  }

  // WhatsApp Cloud API webhook verification (Meta subscription)
  @Get('webhooks/whatsapp')
  webhookVerify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
    @Res() res?: Response,
  ) {
    const expected = this.messaging.getWebhookVerifyToken();
    if (!expected) throw new BadRequestException('WHATSAPP_VERIFY_TOKEN not set');
    if (mode === 'subscribe' && token === expected) {
      return res?.status(200).send(challenge ?? '') ?? challenge;
    }
    return res?.status(403).send('Forbidden') ?? 'Forbidden';
  }

  // WhatsApp Cloud API webhook events (messages + statuses)
  @Post('webhooks/whatsapp')
  webhookEvent(
    @Req() req: any,
    @Body() body: any,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    // rawBody is provided by NestFactory.create(..., { rawBody: true })
    const rawBody: Buffer | undefined = req?.rawBody;
    return this.messaging.handleWhatsAppWebhook(body, { rawBody, signature });
  }

  // Auto-reply rules CRUD (company scoped by JWT user.companyId)
  @Post('auto-replies/rules')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  createRule(@Req() req: any, @Body() dto: CreateAutoReplyRuleDto) {
    return this.messaging.createRule(req.user, dto);
  }

  @Get('auto-replies/rules')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  listRules(@Req() req: any) {
    return this.messaging.listRules(req.user);
  }

  @Patch('auto-replies/rules/:id')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  updateRule(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAutoReplyRuleDto) {
    return this.messaging.updateRule(req.user, id, dto);
  }

  @Delete('auto-replies/rules/:id')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  deleteRule(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.messaging.deleteRule(req.user, id);
  }
}

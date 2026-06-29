import { BadRequestException, Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingService } from './messaging.service';
import { InboundMessageDto } from './dto/inbound-message.dto';
import type { Response } from 'express';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';

@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

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
    @Req() req: any,
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
    @Res() res?: Response,
  ) {
    const query = req?.query || {};
    const resolvedMode = String(mode ?? query['hub.mode'] ?? query.hub_mode ?? '').trim();
    const resolvedToken = String(token ?? query['hub.verify_token'] ?? query.hub_verify_token ?? '').trim();
    const resolvedChallenge = String(challenge ?? query['hub.challenge'] ?? query.hub_challenge ?? '').trim();
    const expected = this.messaging.getWebhookVerifyToken();
    if (!expected) throw new BadRequestException('WHATSAPP_VERIFY_TOKEN not set');
    if (resolvedMode === 'subscribe' && resolvedToken === expected) {
      return res?.status(200).send(resolvedChallenge) ?? resolvedChallenge;
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

  // QR/WebWhats motor webhook events (messages, statuses, reactions, deletes).
  @Post('webhooks/webwhats/events')
  webwhatsEvent(
    @Req() req: any,
    @Body() body: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.messaging.handleWebwhatsWebhookEvent(body, {
      rawBody: req?.rawBody,
      headers,
      query,
    });
  }

  @Get('auto-replies/rules')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  listRules(@Req() req: any) {
    return this.messaging.listRules(req.user);
  }
}

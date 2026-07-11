import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ConciergeService } from './concierge.service';

// CONCIERGE IA (Missão F) — mesma superfície do assistente: JWT + gate de
// módulo próprio 'concierge' (teto masterEnabled×enabled, ligável por empresa
// no /master). Flag global HBX_AI_CONCIERGE_ENABLED (default OFF) é checada no
// service — OFF responde { ok:false, code:'feature_disabled' }.
// NENHUM endpoint dispara WhatsApp; a única execução possível é a busca do
// Radar EXISTENTE, atrás de confirmação humana com token single-use.
@Controller('concierge')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('concierge')
export class ConciergeController {
  constructor(private readonly concierge: ConciergeService) {}

  // Reidratação: draft ativo (ou executado recente) + chips de sugestão.
  @Get()
  bootstrap(@Req() req: any) {
    return this.concierge.bootstrap(req.user);
  }

  // Turno de conversa — a IA só preenche slots; o código decide tudo.
  @Post('message')
  message(@Req() req: any, @Body() dto: { draftId?: string; message?: string }) {
    return this.concierge.message(req.user, dto || {});
  }

  // Clique em chip — determinístico, NÃO passa pela IA.
  @Post('slot')
  setSlot(@Req() req: any, @Body() dto: { draftId?: string; field?: string; value?: unknown }) {
    return this.concierge.setSlot(req.user, dto || {});
  }

  // Confirmação HUMANA (clique) — token single-use amarrado ao hash dos slots.
  @Post('confirm')
  confirm(@Req() req: any, @Body() dto: { draftId?: string; confirmToken?: string }) {
    return this.concierge.confirm(req.user, dto || {});
  }

  // Poll do resultado da busca disparada.
  @Get('draft/:id/status')
  runStatus(@Req() req: any, @Param('id') id: string) {
    return this.concierge.runStatus(req.user, id);
  }

  // Abandona o rascunho ativo e recomeça.
  @Post('reset')
  reset(@Req() req: any) {
    return this.concierge.reset(req.user);
  }
}

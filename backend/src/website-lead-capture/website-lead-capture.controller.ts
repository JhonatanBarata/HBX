import { BadRequestException, Body, Controller, HttpCode, Ip, NotFoundException, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebsiteLeadCaptureService } from './website-lead-capture.service';

// Endpoint público do formulário do site do cliente (sem JwtAuthGuard, igual ao webhook do
// Meta) — segurança vem do siteToken opaco na URL (nunca companyId cru), não de sessão.
// CORS: os sites de cliente são Firebase Hosting; `isAllowedFirebaseOrigin` em main.ts já libera
// essas origens (mesma trilha usada pelo restante do backend), não precisou de regra nova aqui.
// Rate-limit: @Throttle sobrepõe o teto global (120/60s) com um teto apertado por rota — mesmo
// padrão usado em auth.controller.ts/gerencial.controller.ts (ThrottlerGuard já é APP_GUARD
// global em app.module.ts). O Throttler do Nest já chaveia por IP por padrão.
//
// Respostas por caso (igual ao molde do Meta):
//   - honeypot preenchido / dedup / sucesso -> 200 "ok" (nunca revela qual dos três foi)
//   - token inválido/sem empresa            -> 404 genérico
//   - sem phone e sem email                 -> 400 "nada para contatar"
@Controller('public/lead-capture')
export class WebsiteLeadCaptureController {
  constructor(private readonly captureService: WebsiteLeadCaptureService) {}

  @Post(':siteToken')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async capture(@Param('siteToken') siteToken: string, @Body() body: any, @Ip() ip?: string) {
    const result = await this.captureService.captureLead(
      {
        siteToken,
        name: body?.name,
        phone: body?.phone,
        email: body?.email,
        message: body?.message,
        _hp: body?._hp,
      },
      ip || null,
    );

    if (result.ok) return { ok: true };

    if (result.reason === 'not_found') {
      throw new NotFoundException('Não encontrado.');
    }
    if (result.reason === 'nothing_to_contact') {
      throw new BadRequestException('Informe telefone ou e-mail para contato.');
    }
    // rate_limited / no_assignee / qualquer outra recusa best-effort: nunca dá pista pro
    // cliente do form, mas também não finge sucesso (evita o usuário achar que o lead entrou).
    return { ok: true };
  }
}

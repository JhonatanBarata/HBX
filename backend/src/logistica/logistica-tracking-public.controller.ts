import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LogisticaTrackingPublicService } from './logistica-tracking-public.service';

// F3 FULL-POLIDO (27/07, PR27072026-ROTA-3-NIVEIS) — "acompanhe sua entrega":
// endpoint PÚBLICO (sem JwtAuthGuard) do link /acompanhar/<token>. Molde EXATO
// do logistica-pedido-publico.controller.ts: a segurança vem do token ASSINADO
// na URL (ver logistica-tracking-public.util.ts — HMAC, sem estado, sem
// migration), nunca de sessão. Registrado em logistica.module.ts (NÃO em
// app.module.ts).
//
// Token inválido / adulterado / entrega sumida / segredo não configurado →
// 404 GENÉRICO em todos os casos, sem pista de qual foi (mesmo padrão do
// pedido-publico — não dá pra um bot descobrir por tentativa qual caso caiu).
//
// Rate-limit: 30/min (é o load de uma página pública — igual ao GET do
// catálogo do pedido-publico; POST não existe aqui, é leitura pura).
@Controller('public/tracking')
export class LogisticaTrackingPublicController {
  constructor(private readonly trackingPublic: LogisticaTrackingPublicService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async status(@Param('token') token: string) {
    const res = await this.trackingPublic.getStatusByToken(token);
    if (!res) throw new NotFoundException('Não encontrado.');
    return res;
  }
}

import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { VendasService } from './vendas.service';

// Rotas PUBLICAS do Vendas (sem JwtAuthGuard — o guard de auth e por-controller no
// VendasController; o guard global e so o ThrottlerGuard). Usado pelo link de
// contratacao: /register?...&hbxLead=<leadId> busca o prefill do checkout aqui.
// leadId (cuid) e o token — nao expoe nada alem do necessario pro cadastro do
// proprio cliente, e so responde se o lead tem handoff gerado.
@Controller('vendas')
export class VendasPublicController {
  constructor(private readonly vendasService: VendasService) {}

  @Get('handoff/:leadId/prefill')
  // Rota publica sem login: teto dedicado (10/60s por IP) em vez de herdar o
  // global frouxo (120/60s), pra estreitar varredura por leadId.
  @Throttle({ default: { limit: 10, ttl: 60 } })
  getHbxHandoffPrefill(@Param('leadId') leadId: string) {
    return this.vendasService.getHbxHandoffPrefill(leadId);
  }
}

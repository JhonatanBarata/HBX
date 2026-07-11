import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CopilotoService } from './copiloto.service';
import type {
  CopilotoRascunhoDto,
  CopilotoResumoDto,
  CopilotoSugestaoDto,
} from './dto/assistente.dto';

// LEADS-FINAL/05 — COPILOTO NO LEAD. Superficie da IA local ja em prod, exposta
// na pagina do lead. NENHUM endpoint aqui dispara WhatsApp: todos so GERAM texto
// (rascunho/resumo/sugestao) e devolvem JSON. Persistir (nota/atividade) é outro
// caminho, no front, reusando endpoints existentes e freados.
//
// Gate: apenas usuario autenticado do tenant (JwtAuthGuard) — o Copiloto é
// acessorio da tela do lead (Radar/Vendas), nao do modulo 'bot'. A flag
// HBX_COPILOTO_ENABLED (checada no service) liga/desliga o recurso.
@Controller('assistente/copiloto')
@UseGuards(JwtAuthGuard)
export class CopilotoController {
  constructor(private readonly copiloto: CopilotoService) {}

  // Estado da flag — o front usa pra mostrar/esconder o painel (fail-closed).
  @Get()
  status() {
    return this.copiloto.status();
  }

  @Post('rascunho')
  rascunho(@Req() req: any, @Body() dto: CopilotoRascunhoDto) {
    return this.copiloto.rascunho(req.user, dto || {});
  }

  @Post('resumo')
  resumo(@Req() req: any, @Body() dto: CopilotoResumoDto) {
    return this.copiloto.resumo(req.user, dto || {});
  }

  @Post('sugestao')
  sugestao(@Req() req: any, @Body() dto: CopilotoSugestaoDto) {
    return this.copiloto.sugestao(req.user, dto || {});
  }
}

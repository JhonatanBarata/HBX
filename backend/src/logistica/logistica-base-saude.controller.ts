import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { LogisticaBaseSaudeService } from './logistica-base-saude.service';
import { LogisticaConferenciaService } from './logistica-conferencia.service';
import { LogisticaBaseLimpezaService } from './logistica-base-limpeza.service';

/**
 * S7 (25/07, PR25072026-ROTA-CONFERIDA) — `/logistica/base-saude`, painel de
 * diagnóstico read-only pro dono/admin (não é rota do motorista, por isso
 * `@Admin()` — mesmo gate das telas gerenciais de `logistica-agenda.controller.ts`).
 * Ver LogisticaBaseSaudeService pro cérebro (reusa `conferirParadas` da S3).
 */
@Controller('logistica/base-saude')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@ModuleAccess('logistica')
@Admin()
export class LogisticaBaseSaudeController {
  constructor(
    private readonly baseSaude: LogisticaBaseSaudeService,
    private readonly conferencia: LogisticaConferenciaService,
    private readonly limpeza: LogisticaBaseLimpezaService,
  ) {}

  private companyId(req: any): number {
    const companyId = Math.trunc(Number(req?.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Empresa não identificada.');
    return companyId;
  }

  @Get()
  get(@Req() req: any) {
    return this.baseSaude.getBaseSaude(this.companyId(req));
  }

  /**
   * 🔴 "Resolver endereços" (06/08, ordem do dono) — o botão que troca o ponto do CEP
   * pelo ponto da PORTA usando a base CNEFE, na base inteira.
   *
   * POST porque ESCREVE (pino/CEP de cadastro, pela mesma porta canônica da cura da
   * rota) — o GET acima segue read-only absoluto. Roda em lote e devolve `restantes`:
   * a tela chama de novo até zerar, igual ao sanitizador do APK.
   */
  @Post('resolver')
  resolver(@Req() req: any) {
    return this.conferencia.resolverEnderecosDaBase(this.companyId(req));
  }

  /**
   * 🔴 FAXINA (06/08, regras 1 e 2 do dono) — cadastro duplicado na mesma porta e
   * cadastro sem endereço fechado saem da base, DESDE QUE não tenham movimento
   * nenhum (entrega, rota ativa, cobrança). Ver LogisticaBaseLimpezaService pro
   * porquê do critério ser mais largo que "pagamento".
   *
   * `executar` ausente/false = PRÉVIA (não escreve nada, devolve a lista). Só com
   * `executar:true` os cadastros são arquivados — e ainda assim por soft-delete com
   * snapshot restaurável.
   */
  @Post('limpar')
  limpar(@Req() req: any, @Body() body: { executar?: boolean }) {
    return this.limpeza.limpar(this.companyId(req), {
      executar: body?.executar === true,
      deletedByUserId: Math.trunc(Number(req?.user?.id || 0)) || null,
    });
  }
}

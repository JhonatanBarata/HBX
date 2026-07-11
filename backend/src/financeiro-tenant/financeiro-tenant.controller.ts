import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FinanceiroTenantService } from './financeiro-tenant.service';

/**
 * FINANCEIRO-UNIVERSAL (Fase 1) — financeiro do TENANT na casca central, NÃO
 * preso à logística. Visão do responsável: quem me deve + extrato + baixa manual,
 * lendo cobranças de QUALQUER módulo (logística + vendas).
 *
 * Guard: JwtAuthGuard + RolesGuard + @Admin na classe inteira (LEI DO VENDEDOR —
 * só o Admin/USERMASTER vê valores). company-scoped: companyId vem SEMPRE do JWT.
 *
 * SEM @ModuleAccess('logistica'): de propósito — tenant de vendas SEM logística
 * também precisa do financeiro. Quem NÃO tem cobrança nenhuma vê estado vazio.
 * A distinção plataforma×tenant é por sourceModule (catálogo do serviço).
 */
@Controller('financeiro-tenant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Admin()
export class FinanceiroTenantController {
  constructor(private readonly service: FinanceiroTenantService) {}

  private companyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  /** Carteira de devedores (cobrança pending em aberto por cliente, todas as origens). */
  @Get('saldos')
  saldos(@Req() req: any) {
    const companyId = this.companyIdFromUser(req.user);
    return this.service.saldos(companyId);
  }

  /** Extrato de UM cliente (todas as cobranças do tenant). company-scoped. */
  @Get('clientes/:id/extrato')
  async extrato(@Req() req: any, @Param('id') id: string) {
    const companyId = this.companyIdFromUser(req.user);
    const res = await this.service.extratoCliente(companyId, id);
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  /**
   * Baixa manual de uma cobrança (marcar pago). Idempotente. Origem logística é
   * delegada ao módulo logística (para a cadência recovery de quem pagou).
   * Charge de outra empresa/origem fora do catálogo → 404.
   */
  @Post('charges/:id/quitar')
  async quitar(@Req() req: any, @Param('id') id: string) {
    const companyId = this.companyIdFromUser(req.user);
    const res = await this.service.quitarCharge(companyId, id, {
      userId: Number(req.user?.id) || null,
    });
    if (!res) throw new NotFoundException('Cobrança não encontrada');
    return res;
  }
}

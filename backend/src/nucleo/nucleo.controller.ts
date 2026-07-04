import { Controller, ForbiddenException, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NucleoCadastroService } from './nucleo-cadastro.service';

/**
 * NÚCLEO-CRM N3 (04/07) — controller da janela "Empresas" (contas PJ).
 *
 * READ-ONLY nesta fase. Só expõe leitura da espinha (CustomerProfile.tipo='pj'
 * + Contatos), company-scoped: o companyId vem SEMPRE do usuário logado (JWT),
 * nunca do cliente. Mesmo padrão de guard/scoping dos controllers vizinhos
 * (ex.: CadastrosController) — apenas JwtAuthGuard.
 *
 * Kill-switch (direção CRÉDITOS: módulo NÃO é paywall): a aba nasce VISÍVEL por
 * default pro tenant. O módulo 'empresas' está no catálogo (SystemModule,
 * defaultEnabled=true) só como interruptor do master; NÃO gate por plano aqui —
 * por isso o controller não usa @ModuleAccess (que exigiria a chave num tier de
 * plano e viraria paywall). O master, quando quiser cortar, usa o kill-switch.
 */
@Controller('nucleo')
@UseGuards(JwtAuthGuard)
export class NucleoController {
  constructor(private readonly service: NucleoCadastroService) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  @Get('empresas')
  listEmpresas(
    @Req() req: any,
    @Query('query') query?: string,
    @Query('uf') uf?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.listEmpresas(companyId, {
      query,
      uf,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('empresas/:id')
  async getEmpresa(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const empresa = await this.service.getEmpresa(companyId, id);
    // Isolamento por-tenant: id inexistente OU de outra empresa → 404, nunca vaza.
    if (!empresa) throw new ForbiddenException('Empresa não encontrada');
    return empresa;
  }
}

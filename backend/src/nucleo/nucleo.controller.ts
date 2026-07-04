import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { NucleoCadastroService } from './nucleo-cadastro.service';
import {
  CreateContaDto,
  CreateContatoDto,
  MergeContaDto,
  SoftDeleteDto,
  UpdateContaDto,
  UpdateContatoDto,
} from './dto/nucleo.dto';

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

  // ── NÚCLEO-CRM N4 — janela "Contatos" (pessoas) + "Clientes" (papel) ─────

  /** Lista as pessoas (Contatos) da empresa, com a conta a que pertencem. */
  @Get('contatos')
  listContatos(
    @Req() req: any,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.listContatos(companyId, {
      query,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /**
   * View "Clientes" = a MESMA base filtrada por papel (isCliente=true), PF ou PJ.
   * Reusa a serialização de empresas — não é cadastro novo.
   */
  @Get('clientes')
  listClientes(
    @Req() req: any,
    @Query('query') query?: string,
    @Query('uf') uf?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.listClientes(companyId, {
      query,
      uf,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /**
   * Cria uma CONTA manual + o contato principal (o vendedor cadastrando cliente).
   * GRÁTIS (não é lead da base 28M → não debita crédito). Idempotente por
   * documento/cnpj/telefone dentro da empresa.
   */
  @Post('contas')
  createConta(@Req() req: any, @Body() dto: CreateContaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.createConta(companyId, dto);
  }

  /** Edita uma conta (papéis/endereço/dados). Company-scoped. */
  @Patch('contas/:id')
  async updateConta(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateContaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.updateConta(companyId, id, dto);
    if (!res) throw new NotFoundException('Conta não encontrada');
    return res;
  }

  /** Adiciona um contato (pessoa) a uma conta existente. */
  @Post('contatos')
  async addContato(@Req() req: any, @Body() dto: CreateContatoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.addContato(companyId, dto);
    // conta inexistente OU de outro tenant → 404 (isolamento).
    if (!res) throw new NotFoundException('Conta não encontrada');
    return res;
  }

  /** Edita um contato (pessoa). Company-scoped. */
  @Patch('contatos/:id')
  async updateContato(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateContatoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.updateContato(companyId, id, dto);
    if (!res) throw new NotFoundException('Contato não encontrado');
    return res;
  }

  // ── NÚCLEO-CRM R3 — integridade: merge de contas + soft-delete ─────────────

  /**
   * Funde a conta `:id` na `into` (mesma empresa). ADMIN-only (RolesGuard + @Admin):
   * fundir contas é destrutivo pra base. O vencedor (base) é quem tem mais dado; refs
   * migram; a perdedora vira DeletionRecord. Idempotente (fundir consigo mesma = no-op).
   */
  @Post('contas/:id/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async mergeConta(@Req() req: any, @Param('id') id: string, @Body() dto: MergeContaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.mergeContas(companyId, id, dto.into, {
      deletedByUserId: Number(req.user?.id) || null,
      motivo: dto.motivo ?? null,
    });
    // conta (source OU into) inexistente / de outro tenant → 404 (isolamento).
    if (!res) throw new NotFoundException('Conta não encontrada');
    return res;
  }

  /** Soft-delete de uma CONTA (snapshot em DeletionRecord + esconde). Company-scoped. */
  @Delete('contas/:id')
  async deleteConta(@Req() req: any, @Param('id') id: string, @Body() dto?: SoftDeleteDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.softDeleteConta(companyId, id, {
      deletedByUserId: Number(req.user?.id) || null,
      motivo: dto?.motivo ?? null,
    });
    if (!res) throw new NotFoundException('Conta não encontrada');
    return res;
  }

  /** Soft-delete de um CONTATO (snapshot + remove). Company-scoped. */
  @Delete('contatos/:id')
  async deleteContato(@Req() req: any, @Param('id') id: string, @Body() dto?: SoftDeleteDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.softDeleteContato(companyId, id, {
      deletedByUserId: Number(req.user?.id) || null,
      motivo: dto?.motivo ?? null,
    });
    if (!res) throw new NotFoundException('Contato não encontrado');
    return res;
  }
}

import {
  Body,
  Controller,
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
import { LogisticaService } from './logistica.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConfigService } from './logistica-config.service';
import {
  CancelarEntregaDto,
  ConfirmarEntregaDto,
  CreateClienteProdutoDto,
  CreateEntregaDto,
  GerarDiaDto,
  IniciarRotaDto,
  PlanejarRotaDto,
  SetAvisarClienteDto,
  UpdateClienteProdutoDto,
  UpdateLogisticaConfigDto,
} from './dto/logistica.dto';

/**
 * NÚCLEO-CRM N6 (05/07) — controller do módulo LOGÍSTICA (app de entrega).
 *
 * Company-scoped: o companyId vem SEMPRE do usuário logado (JWT), nunca do
 * cliente. Mesmo padrão de guard/scoping dos controllers vizinhos (NucleoController):
 * apenas JwtAuthGuard. Kill-switch (não paywall): a aba nasce visível por default;
 * o SystemModule 'logistica' (defaultEnabled=true) é o interruptor do master.
 *
 * Os EFEITOS de confirmar entrega (WhatsApp + cobrança) vivem no serviço, atrás da
 * flag HBX_LOGISTICA_ENABLED (default OFF). Enquanto OFF, confirmar só muda status/GPS.
 */
@Controller('logistica')
@UseGuards(JwtAuthGuard)
export class LogisticaController {
  constructor(
    private readonly service: LogisticaService,
    private readonly recorrencia: LogisticaRecorrenciaService,
    private readonly rota: LogisticaRotaService,
    private readonly config: LogisticaConfigService,
  ) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  /** Rota de hoje (ou de ?date=YYYY-MM-DD): entregas do dia da empresa. */
  @Get('rota')
  listRota(@Req() req: any, @Query('date') date?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.listRota(companyId, date);
  }

  /** Agenda uma nova entrega (cliente + produto? + contato?). */
  @Post('entregas')
  createEntrega(@Req() req: any, @Body() dto: CreateEntregaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.createEntrega(companyId, dto);
  }

  /**
   * Confirma a entrega com o GPS capturado no celular. Marca 'entregue' + grava
   * lat/lng. SÓ com HBX_LOGISTICA_ENABLED ON dispara WhatsApp + cobrança.
   */
  @Post('entregas/:id/confirmar')
  async confirmar(@Req() req: any, @Param('id') id: string, @Body() dto: ConfirmarEntregaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.confirmarEntrega(companyId, id, {
      lat: dto?.lat,
      lng: dto?.lng,
      receiptMethod: dto?.receiptMethod,
      itens: dto?.itens,
    });
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }

  /** Cancela uma entrega ainda não concluída. */
  @Post('entregas/:id/cancelar')
  async cancelar(@Req() req: any, @Param('id') id: string, @Body() dto: CancelarEntregaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.cancelarEntrega(companyId, id, dto?.motivo);
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }

  // ── LOGÍSTICA-MOBILE M2 — produtos do cliente (recorrência) ────────────────

  /** Catálogo de produtos da empresa (seletor da UI "Produtos do cliente"). */
  @Get('produtos')
  listProdutos(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recorrencia.listProdutos(companyId);
  }

  /** Vínculos produto×cliente de um cliente. */
  @Get('cliente-produtos')
  listClienteProdutos(@Req() req: any, @Query('customerProfileId') customerProfileId: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recorrencia.listByCliente(companyId, customerProfileId);
  }

  /** Cria um vínculo produto×cliente (qtd padrão, preço acordado, frequência). */
  @Post('cliente-produtos')
  createClienteProduto(@Req() req: any, @Body() dto: CreateClienteProdutoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recorrencia.create(companyId, dto);
  }

  /** Edita um vínculo (qtd/preço/frequência/ativo). Company-scoped. */
  @Patch('cliente-produtos/:id')
  async updateClienteProduto(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateClienteProdutoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.recorrencia.update(companyId, id, dto);
    if (!res) throw new NotFoundException('Vínculo não encontrado');
    return res;
  }

  /**
   * Gera as entregas do dia a partir dos vínculos recorrentes vencidos.
   * IDEMPOTENTE por [cliente, dia]: rodar 2× no mesmo dia = 1 entrega/cliente.
   * Não dispara WhatsApp/cobrança (isso é só no confirmar, N6, atrás de flag).
   */
  @Post('gerar-dia')
  gerarDia(@Req() req: any, @Body() dto: GerarDiaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recorrencia.gerarDia(companyId, dto?.date);
  }

  // ── LOGÍSTICA-MOBILE M3 — motor de rota + ETA ───────────────────────────────

  /**
   * Planeja a rota do dia: ordena as entregas abertas (NN+2-opt Haversine),
   * grava rotaOrdem/etaAt e devolve a rota ordenada + término previsto + quantas
   * paradas sem coordenada. origemLat/Lng = GPS do entregador (ponto de partida).
   * 100% local — sem API paga. Não dispara WhatsApp/cobrança.
   */
  @Post('rota/planejar')
  planejarRota(@Req() req: any, @Body() dto: PlanejarRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.rota.planejarRota(companyId, {
      date: dto?.date,
      origemLat: dto?.origemLat,
      origemLng: dto?.origemLng,
    });
  }

  /**
   * Inicia a rota: re-planeja com a origem atual e marca a 1ª parada em rota
   * (status 'em_rota' + startedAt). Devolve a rota ordenada + término previsto.
   */
  @Post('rota/iniciar')
  iniciarRota(@Req() req: any, @Body() dto: IniciarRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.rota.iniciarRota(companyId, {
      date: dto?.date,
      origemLat: dto?.origemLat,
      origemLng: dto?.origemLng,
    });
  }

  // ── LOGÍSTICA-MOBILE M5 — regras do admin (LogisticaConfig) ─────────────────

  /**
   * Config da empresa (template do aviso + toggles + params de rota). GET fica só
   * com JwtAuthGuard (o app do entregador também lê a config); cria o default se
   * ainda não existir. company-scoped.
   */
  @Get('config')
  getConfig(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.config.getConfig(companyId);
  }

  /**
   * Grava a config (PATCH parcial). ADMIN-only (regras do admin): RolesGuard +
   * @Admin() — vendedor não edita as regras. company-scoped. Não dispara nada.
   */
  @Patch('config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  updateConfig(@Req() req: any, @Body() dto: UpdateLogisticaConfigDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.config.updateConfig(companyId, dto);
  }

  /** Lê o toggle "avisar entrega" de UM cliente (p/ a ficha). company-scoped. */
  @Get('cliente/:id/aviso')
  async getAvisarCliente(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.config.getAvisarEntregaCliente(companyId, id);
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  /**
   * Liga/desliga o aviso de entrega de UM cliente (2º nível, soma com o global).
   * ADMIN-only. company-scoped: o cliente TEM de ser desta empresa.
   */
  @Patch('cliente/:id/aviso')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async setAvisarCliente(@Req() req: any, @Param('id') id: string, @Body() dto: SetAvisarClienteDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.config.setAvisarEntregaCliente(companyId, id, dto?.avisar);
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }
}

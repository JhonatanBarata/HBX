import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
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
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { LogisticaService } from './logistica.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaRecoveryService } from './logistica-recovery.service';
import {
  CancelarEntregaDto,
  ConfirmarEntregaDto,
  CreateClienteProdutoDto,
  CreateEntregaDto,
  FecharMesDto,
  GerarDiaDto,
  IniciarRotaDto,
  PlanejarRotaDto,
  SetAvisarClienteDto,
  UpdateClienteProdutoDto,
  UpdateFinanceiroClienteDto,
  UpdateLogisticaConfigDto,
  VarrerRecoveryDto,
} from './dto/logistica.dto';

/**
 * NÚCLEO-CRM N6 (05/07) — controller do módulo LOGÍSTICA (app de entrega).
 *
 * Company-scoped: o companyId vem SEMPRE do usuário logado (JWT), nunca do
 * cliente. Mesmo padrão de guard/scoping dos controllers vizinhos (NucleoController).
 *
 * PR10072026 W1 — kill-switch DE VERDADE: @ModuleAccess('logistica') +
 * ModuleAccessGuard na classe inteira. 'logistica' é COMPANY_LEVEL_MODULE_KEY
 * (module-access-policy.ts): o gate checa SÓ a camada empresa (teto do master ×
 * enabled da empresa), sem molho de cargo/per-usuário — o entregador USER não
 * quebra. Master bypassa (PR-002 A.6); empresa com módulo OFF → 403.
 *
 * Os EFEITOS de confirmar entrega (WhatsApp + cobrança) vivem no serviço, atrás da
 * flag HBX_LOGISTICA_ENABLED (default OFF). Enquanto OFF, confirmar só muda status/GPS.
 */
@Controller('logistica')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaController {
  private readonly logger = new Logger(LogisticaController.name);

  constructor(
    private readonly service: LogisticaService,
    private readonly recorrencia: LogisticaRecorrenciaService,
    private readonly rota: LogisticaRotaService,
    private readonly config: LogisticaConfigService,
    private readonly recovery: LogisticaRecoveryService,
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
      accuracy: dto?.accuracy,
      receiptMethod: dto?.receiptMethod,
      itens: dto?.itens,
      novosItens: dto?.novosItens,
      idempotencyKey: dto?.idempotencyKey,
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

  /**
   * AVISO-CHEGANDO — dispara o "tô chegando" (~500m) pelo caminho BLINDADO
   * (queueOutboundForCompany). Trava tripla (flag + config + opt-out do cliente)
   * + idempotência por claim (avisoChegandoAt). SEMPRE { ok: true }: não vaza se
   * pulou/enviou (o app não precisa saber) nem erro interno (best-effort, o app
   * não reenvia — evita qualquer retry/loop no cliente). Company-scoped, MESMO
   * padrão de guard de confirmar/cancelar (sem Admin — é o app do entregador).
   */
  @Post('entregas/:id/chegando')
  async avisarChegando(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    try {
      await this.service.avisarChegando(companyId, id);
    } catch (e: any) {
      this.logger.warn(`[logistica] POST chegando entrega=${id} falhou: ${String(e?.message || e)}`);
    }
    return { ok: true };
  }

  /**
   * R4 — reenvia o aviso "entregue" de UMA entrega pelo caminho BLINDADO. TETO
   * DURO: 1 reenvio manual por entrega (2º clique = 400). ZERO loop/retry. ADMIN-only.
   * company-scoped. Só reenvia entrega já 'entregue'.
   */
  @Post('entregas/:id/reenviar-aviso')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async reenviarAviso(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.reenviarAviso(companyId, id);
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }

  /**
   * R3 — soft-delete de uma entrega: snapshot em DeletionRecord + esconde (marca
   * 'cancelada'). Company-scoped. Idempotente. NÃO dispara nada externo.
   */
  @Delete('entregas/:id')
  async deleteEntrega(@Req() req: any, @Param('id') id: string, @Body() dto?: CancelarEntregaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.softDeleteEntrega(companyId, id, {
      deletedByUserId: Number(req.user?.id) || null,
      motivo: dto?.motivo ?? null,
    });
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }

  // ── NÚCLEO-CRM R2 — financeiro de verdade (fechar-mês + extrato) ────────────

  /**
   * Fecha a fatura mensal: agrupa as entregas 'aguardando_fechamento' por cliente
   * ('mensal') no diaFechamento e cria 1 FinanceiroCharge linkado por cliente.
   * ADMIN-only (RolesGuard + @Admin). IDEMPOTENTE (rodar 2× no mesmo mês não
   * duplica). paymentMethod='MANUAL'/'pending' — NÃO dispara MercadoPago.
   */
  @Post('fechar-mes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  fecharMes(@Req() req: any, @Body() dto: FecharMesDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.fecharMes(companyId, { clienteId: dto?.clienteId, mesRef: dto?.mesRef });
  }

  /**
   * Extrato financeiro de UM cliente: lista os FinanceiroCharge linkados a ele.
   * Read-only, company-scoped (o cliente TEM de ser desta empresa).
   */
  @Get('clientes/:id/extrato')
  async extrato(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.extratoCliente(companyId, id);
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  // ── PR10072026 W2 — Financeiro do cliente (fase 1) ───────────────────────────

  /**
   * W2 (contrato nº4) — HISTÓRICO de entregas de UM cliente: data/hora, itens,
   * valor, desfecho do WhatsApp e da cobrança. Read-only, company-scoped, cursor
   * (?limit=&cursor=; default 30, máx 100). Cliente de outra empresa → 404.
   *
   * ADMIN-only (RolesGuard + @Admin) — é a visão gerencial do dono (LEI DO
   * VENDEDOR: só Admin vê valores; 'logistica' é company-level, então sem este
   * gate o vendedor USER da empresa puxaria o histórico com dinheiro). O gate de
   * moduloFinanceiroAtivo (regra M4) vive no serviço: OFF → sem campos de valor.
   */
  @Get('clientes/:id/entregas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async historicoEntregas(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.historicoEntregasCliente(companyId, id, {
      limit: limit != null && String(limit).trim() !== '' ? Number(limit) : undefined,
      cursor,
    });
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  /**
   * W2 (contrato nº5) — BAIXA MANUAL do fiado: marca a charge 'pending' da
   * logística como paga (approved/paid/paidAt=now). ADMIN-only (RolesGuard +
   * @Admin, mesmo padrão do fechar-mes; USERMASTER passa por superset).
   * Idempotente (já paga → 200 com o estado atual). Charge de outra empresa OU
   * de origem fora de logistica_* → 404 (não vaza existência). NÃO toca MP.
   */
  @Post('charges/:id/quitar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async quitarCharge(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.quitarCharge(companyId, id, {
      userId: Number(req.user?.id) || null,
    });
    if (!res) throw new NotFoundException('Cobrança não encontrada');
    return res;
  }

  /**
   * W2 (contrato nº6) — SALDOS em aberto por cliente ("quem me deve"): só quem
   * tem saldoAberto>0 || aguardandoFechamento>0, com nome. ADMIN-only (RolesGuard
   * + @Admin) — carteira de devedores é visão do dono (LEI DO VENDEDOR: só Admin
   * vê valores; sem este gate o vendedor USER da empresa puxaria a carteira, já
   * que 'logistica' é company-level e não filtra por cargo).
   * + moduloFinanceiroAtivo FAIL-CLOSED (OFF → lista vazia, dinheiro não aparece).
   */
  @Get('financeiro/saldos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  saldosFinanceiro(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.saldosFinanceiro(companyId);
  }

  // ── LOGÍSTICA-MOBILE M6 — financeiro na tela ────────────────────────────────

  /**
   * Resumo financeiro do dia (card do admin na tela de Logística): quantas
   * entregas concluídas, quanto RECEBIDO (charges quitados no dia) e quanto A
   * RECEBER (pending com vencimento no dia). Read-only, company-scoped. Não toca
   * dinheiro nem dispara nada. Só charges da logística (não a assinatura HBX).
   */
  @Get('resumo-dia')
  resumoDia(@Req() req: any, @Query('date') date?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.resumoDia(companyId, date);
  }

  /**
   * Edita os DOIS eixos do contrato de cobrança de UM cliente (M6): forma de
   * pagamento (aberto|mensal|na_hora|pendura) + método padrão (pix|dinheiro, p/
   * na_hora) + contabilizar + dia de fechamento. PATCH parcial. ADMIN-only
   * (RolesGuard + @Admin). company-scoped. Não dispara nada, não toca cobrança
   * existente — só o contrato daqui pra frente.
   */
  @Patch('clientes/:id/financeiro')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async updateFinanceiroCliente(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateFinanceiroClienteDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.updateFinanceiroCliente(companyId, id, {
      formaPagamento: dto?.formaPagamento,
      metodoPadrao: dto?.metodoPadrao,
      contabilizar: dto?.contabilizar,
      diaFechamento: dto?.diaFechamento,
      limiteFiado: dto?.limiteFiado,
    });
    if (!res) throw new NotFoundException('Cliente não encontrado');
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
   * TASK 9 — REMOVE o vínculo produto×cliente de vez (o "-" da UI), diferente do
   * PATCH ativo=false (que só pausa). company-scoped. Não toca entregas já
   * geradas — só impede recorrências futuras.
   */
  @Delete('cliente-produtos/:id')
  async deleteClienteProduto(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const ok = await this.recorrencia.remove(companyId, id);
    if (!ok) throw new NotFoundException('Vínculo não encontrado');
    return { success: true };
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

  /**
   * TASK 7 — preview READ-ONLY do dia (pop-up "Gerar entregas"): os vínculos
   * vencidos agrupados por cliente, com nomes resolvidos, ANTES de materializar
   * nada. Não cria Entrega nem avança proximaData — só o `gerar-dia`/"Começar
   * Rota" faz isso. company-scoped.
   */
  @Get('dia-preview')
  diaPreview(@Req() req: any, @Query('date') date?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recorrencia.getDiaPreview(companyId, date);
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

  // ── LOGÍSTICA-MOBILE M7 — recovery opt-in ────────────────────────────────────

  /**
   * Varre as cobranças VENCIDAS (pending, dueDate < corte, sourceModule=logistica_*)
   * da empresa e injeta cada CLIENTE com dívida no funil hbx-recovery EXISTENTE
   * (cria HbxRecoveryCustomer + DebtCase; a cadência/envio é do próprio Recovery).
   *
   * OPT-IN DURO: só faz algo se LogisticaConfig.moduloRecoveryAtivo=true (default
   * OFF) → empresa que não ligou recebe no-op. IDEMPOTENTE: 1 caso por cliente
   * (2ª varredura não duplica). ADMIN-only. NÃO cria caminho de envio novo, NÃO toca MP.
   */
  @Post('recovery/varrer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  varrerRecovery(@Req() req: any, @Body() dto: VarrerRecoveryDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recovery.varrer(companyId, dto?.date);
  }
}

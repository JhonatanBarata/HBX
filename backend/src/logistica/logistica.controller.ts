import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { isBillingOwnerActor } from '../access/actor-kind';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { LogisticaService } from './logistica.service';
import { isScoreFiadoEnabled } from './logistica-score.flags';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConferenciaService } from './logistica-conferencia.service';
import { LogisticaCustoPreviewService } from './logistica-custo-preview.service';
import { LogisticaRotaModeloService } from './logistica-rota-modelo.service';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaNivelPlanoService } from './logistica-nivel-plano.service';
import { canonicalRouteDate } from './logistica-route-billing.service';
import { LogisticaRecoveryService } from './logistica-recovery.service';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { LogisticaTrackingService } from './logistica-tracking.service';
import { LogisticaTrackingBonusService } from './logistica-tracking-bonus.service';
import { LogisticaOccurrenceService } from './logistica-occurrence.service';
import { LogisticaLeituraService } from './logistica-leitura.service';
import { LogisticaGeoService } from './logistica-geo.service';
import { LogisticaAgendaService } from './logistica-agenda.service';
import {
  FinalizarLeituraDto,
  IniciarLeituraDto,
  RegistrarLeituraParadaDto,
  RegistrarTrilhaDto,
  UpdateLeituraParadaDto,
} from './dto/logistica-leitura.dto';
import {
  AtribuirEntregaDto,
  CancelarEntregaDto,
  ConferirRotaDto,
  SanitizarRotaDto,
  ChecarEnderecosDto,
  TirarDoDiaDto,
  ConfirmarEntregaDto,
  CreateClienteProdutoDto,
  CreateEntregaDto,
  CreateProdutoDto,
  CreateRotaModeloDto,
  EncerrarRotaDto,
  FecharMesDto,
  GerarDiaDto,
  GerarRotaModeloDto,
  IniciarRotaDto,
  LimparDiaDto,
  PlanejarRotaDto,
  SetAvisarClienteDto,
  SetLogisticaNivelDto,
  UpdateClienteProdutoDto,
  UpdateDiasClienteDto,
  UpdateFinanceiroClienteDto,
  UpdateLogisticaConfigDto,
  UpdateLogisticaRouteModeDto,
  UpdateProdutoDto,
  UpdateRotaModeloDto,
  TipoComprovanteDto,
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
    // Default preserva testes legados que instanciam o controller diretamente;
    // no módulo Nest o provider é sempre injetado.
    private readonly operacao: LogisticaOperacaoService = null as any,
    private readonly tracking: LogisticaTrackingService = null as any,
    private readonly trackingBonus: LogisticaTrackingBonusService = null as any,
    private readonly occurrences: LogisticaOccurrenceService = null as any,
    // PR18072026 W1 — CRUD de rota-modelo. Default preserva testes legados que
    // instanciam o controller diretamente com poucos argumentos; no módulo
    // Nest o provider é sempre injetado.
    private readonly rotaModelo: LogisticaRotaModeloService = null as any,
    // PR20072026 W1 — sessão de "Leitura de Rota". Mesmo padrão de default acima.
    private readonly leitura: LogisticaLeituraService = null as any,
    // PR20072026-ROTA-SALVA F3.2 — geocode reverso (GPS → endereço). Mesmo padrão de default acima.
    private readonly geo: LogisticaGeoService = null as any,
    // AGENDA-SEMANAL — mantém os construtores diretos dos testes legados.
    private readonly agenda: LogisticaAgendaService = null as any,
    // S3 (25/07, PR25072026-ROTA-CONFERIDA) — "conferir" (dry-run do motor de rota).
    // Mesmo padrão de default acima: preserva testes legados que instanciam o
    // controller direto com poucos argumentos.
    private readonly conferencia: LogisticaConferenciaService = null as any,
    // S6 (25/07, PR25072026-ROTA-CONFERIDA) — preview de créditos (100% leitura).
    // Mesmo padrão de default acima.
    private readonly custoPreviewService: LogisticaCustoPreviewService = null as any,
    // PR28072026 HÍBRIDO (28/07) — preço + franquia do nível. Mesmo padrão de
    // default acima (testes legados instanciam o controller direto).
    private readonly nivelPlano: LogisticaNivelPlanoService = null as any,
  ) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  private ensureUserId(user: any): number {
    const userId = Number(user?.id);
    if (!userId) throw new ForbiddenException('Usuário não identificado');
    return userId;
  }

  private ensureBillingOwner(user: any): void {
    if (!isBillingOwnerActor(user)) {
      throw new ForbiddenException('Acesso não autorizado');
    }
  }

  /** Rota de hoje (ou de ?date=YYYY-MM-DD): entregas do dia da empresa. */
  @Get('rota')
  listRota(@Req() req: any, @Query('date') date?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.listRota(companyId, date, req.user);
  }

  /** Refresh manual: mesmo payload rico da rota, com delta opcional por updatedAt. */
  @Get('entregas')
  listEntregas(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('updatedSince') updatedSince?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.service.listRota(companyId, date, req.user, updatedSince);
  }

  /** Agenda uma nova entrega (cliente + produto? + contato?). */
  @Post('entregas')
  async createEntrega(@Req() req: any, @Body() dto: CreateEntregaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    await this.operacao.assertCapacidade(req.user, 'SELLER');
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
      // Botão [Pago] da chegada (22/07): quita o saldo em aberto junto.
      quitarAberto: dto?.quitarAberto,
      idempotencyKey: dto?.idempotencyKey,
      comprovanteFotoId: dto?.comprovanteFotoId,
      comprovanteAssinaturaId: dto?.comprovanteAssinaturaId,
      comprovanteCodigo: dto?.comprovanteCodigo,
    }, req.user);
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }

  /** Cancela uma entrega ainda não concluída. */
  @Post('entregas/:id/cancelar')
  async cancelar(@Req() req: any, @Param('id') id: string, @Body() dto: CancelarEntregaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.cancelarEntrega(companyId, id, dto?.motivo, req.user);
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }

  /** Reabre uma entrega concluída para corrigir quantidade ou incluir itens. */
  @Post('entregas/:id/reabrir')
  async reabrir(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.reabrirEntrega(companyId, id, req.user);
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
      await this.service.avisarChegando(companyId, id, req.user);
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
      actor: req.user,
    });
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }

  // ── Atribuição e comprovantes ──────────────────────────────────────────────

  @Get('entregadores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  listarEntregadores(@Req() req: any) {
    return this.operacao.listarEntregadores(this.ensureCompanyIdFromUser(req.user));
  }

  @Patch('entregas/:id/atribuir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async atribuirEntrega(@Req() req: any, @Param('id') id: string, @Body() dto: AtribuirEntregaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const entregadorId = dto?.entregadorId == null ? null : Number(dto.entregadorId);
    const result = await this.operacao.atribuirEntrega(companyId, id, entregadorId, req.user);
    if (!result) throw new NotFoundException('Entrega não encontrada');
    return result;
  }

  @Post('entregas/:id/comprovante-codigo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async gerarCodigoComprovante(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const result = await this.operacao.gerarCodigo(companyId, id, req.user);
    if (!result) throw new NotFoundException('Entrega não encontrada');
    return result;
  }

  @Post('entregas/:id/comprovantes')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadComprovante(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: TipoComprovanteDto,
    @UploadedFile() file: any,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.operacao.uploadComprovante(companyId, id, dto.tipo, file, req.user, dto.clientKey);
  }

  @Get('comprovantes/:id/arquivo')
  async arquivoComprovante(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const file = await this.operacao.getArquivo(companyId, id, req.user);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.byteSize));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
    res.end(file.content);
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
    this.ensureBillingOwner(req.user);
    return this.service.fecharMes(companyId, { clienteId: dto?.clienteId, mesRef: dto?.mesRef });
  }

  /**
   * Extrato financeiro de UM cliente: lista os FinanceiroCharge linkados a ele.
   * Read-only, company-scoped (o cliente TEM de ser desta empresa).
   *
   * ADMIN-only (RolesGuard + @Admin) — extrato = VALORES (LEI DO VENDEDOR: só
   * Admin vê dinheiro; 'logistica' é company-level, então sem este gate o
   * vendedor USER da empresa puxaria as cobranças com valor). Mesmo padrão do
   * historicoEntregas/fecharMes/quitarCharge. O gate de moduloFinanceiroAtivo
   * (regra M4) vive no serviço: OFF → sem valores.
   */
  @Get('clientes/:id/extrato')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async extrato(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    const res = await this.service.extratoCliente(companyId, id);
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  // ── S4 SCORE-DE-FIADO (11/07) — DORMENTE atrás de HBX_SCORE_FIADO_ENABLED ───

  /**
   * Score de pontualidade de UM cliente ("esse cliente merece fiado?"), computado
   * on-the-fly de FinanceiroCharge (dueDate × paidAt/status) — SEM persistência.
   *
   * FLAG GLOBAL (default OFF): sem HBX_SCORE_FIADO_ENABLED o endpoint responde
   * 404 ANTES de tocar o serviço (mesmo padrão dos endpoints de crédito com a
   * feature OFF) — deploy inerte, zero query nova.
   *
   * ADMIN-only (RolesGuard + @Admin) — score é leitura de VALORES/comportamento
   * de pagamento (LEI DO VENDEDOR: só Admin vê; 'logistica' é company-level,
   * sem este gate o entregador USER puxaria o histórico de fiado). O gate de
   * moduloFinanceiroAtivo (regra M4) vive no serviço, FAIL-CLOSED: OFF → score
   * null sem consultar charge. Read-only, company-scoped; cliente de outra
   * empresa → 404. v1 é INFORMATIVO: não bloqueia nada (o teto continua sendo
   * o limiteFiado manual).
   */
  @Get('clientes/:id/score')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async scoreCliente(@Req() req: any, @Param('id') id: string) {
    if (!isScoreFiadoEnabled()) throw new NotFoundException('Recurso indisponível');
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    const res = await this.service.scoreFiadoCliente(companyId, id);
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
    this.ensureBillingOwner(req.user);
    const res = await this.service.historicoEntregasCliente(companyId, id, {
      limit: limit != null && String(limit).trim() !== '' ? Number(limit) : undefined,
      cursor,
    });
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  // ── HISTÓRICO DO CLIENTE (22/07) — a ficha que o entregador abre na porta ────

  /**
   * Log de VISITA de um cliente (entregue / pago / sem atendimento), alimentado
   * pelo desfecho da chegada. Não confundir com `clientes/:id/entregas`, que é a
   * visão gerencial ADMIN-only: este aqui é a resposta pro cliente na porta, então
   * usa o MESMO gate do `GET rota` (sessão + escopo de empresa), sem @Admin — quem
   * dirige a rota é justamente quem precisa responder "quando eu vim e o que pagou".
   * Valores respeitam a regra M4 (financeiro do tenant OFF = sem dinheiro na tela).
   * Cliente de outra empresa → 404.
   */
  @Get('clientes/:id/historico')
  async historicoCliente(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.historicoCliente(companyId, id, {
      limit: limit != null && String(limit).trim() !== '' ? Number(limit) : undefined,
      cursor,
    });
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  /**
   * F0 (27/07, pedido explícito do dono) — EXTRATO DE EVENTOS DA AGENDA: "dia e
   * hora EXATOS de tudo" (dia trocado, ocorrência gerada/adiantada, cursor
   * avançado, devolução, fechamento de dia passado). MESMO gate do `historico`
   * logo acima (sessão + escopo de empresa, sem @Admin — quem dirige a rota
   * também precisa entender por que um dia sumiu/mudou). Cliente de outra
   * empresa → 404. A tela em si (frontend/APK) vem na integração — este é só o
   * endpoint de leitura.
   */
  @Get('clientes/:id/agenda-eventos')
  async agendaEventosCliente(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.agendaEventosCliente(companyId, id, {
      limit: limit != null && String(limit).trim() !== '' ? Number(limit) : undefined,
      cursor,
    });
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  /**
   * Apaga UMA linha do histórico (gesto de segurar pressionado no app). Apaga só o
   * REGISTRO DA VISITA: a entrega e a cobrança continuam no financeiro — foi por
   * isso que o histórico nasceu em tabela própria. Linha inexistente → 404.
   */
  @Delete('clientes/:id/historico/:historicoId')
  async apagarHistorico(@Req() req: any, @Param('id') id: string, @Param('historicoId') historicoId: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.apagarHistorico(companyId, id, historicoId);
    if (!res) throw new NotFoundException('Registro não encontrado');
    return res;
  }

  /** Limpa o histórico inteiro de um cliente. Mesma regra: não toca em dinheiro. */
  @Delete('clientes/:id/historico')
  async limparHistorico(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.service.limparHistorico(companyId, id);
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
    this.ensureBillingOwner(req.user);
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
    this.ensureBillingOwner(req.user);
    return this.service.saldosFinanceiro(companyId);
  }

  // ── LOGÍSTICA-MOBILE M6 — financeiro na tela ────────────────────────────────

  /**
   * Resumo financeiro do dia (card do admin na tela de Logística): quantas
   * entregas concluídas, quanto RECEBIDO (charges quitados no dia) e quanto A
   * RECEBER (pending com vencimento no dia). Read-only, company-scoped. Não toca
   * dinheiro nem dispara nada. Só charges da logística (não a assinatura HBX).
   *
   * ADMIN-only (RolesGuard + @Admin) — recebido/a-receber são VALORES (LEI DO
   * VENDEDOR: só Admin vê dinheiro). Sem este gate o entregador USER da empresa
   * lia o caixa do dia, já que 'logistica' é company-level e não filtra por cargo.
   * Mesmo padrão dos vizinhos (saldos/extrato/fechar-mes). O card do frontend já é
   * admin-only; este gate alinha o backend.
   */
  @Get('resumo-dia')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  resumoDia(@Req() req: any, @Query('date') date?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
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
    this.ensureBillingOwner(req.user);
    const res = await this.service.updateFinanceiroCliente(companyId, id, {
      formaPagamento: dto?.formaPagamento,
      metodoPadrao: dto?.metodoPadrao,
      contabilizar: dto?.contabilizar,
      diaFechamento: dto?.diaFechamento,
      limiteFiado: dto?.limiteFiado,
      // S2 COBRANÇA-WHATS — opt-out por cliente do aviso de cobrança (pass-through).
      avisarCobranca: dto?.avisarCobranca,
    });
    if (!res) throw new NotFoundException('Cliente não encontrado');
    return res;
  }

  /**
   * 🔴 DIAS DE ENTREGA DO CLIENTE (27/07, ordem do dono) — o ÚNICO lugar do
   * sistema que escreve dia da semana. Vale pra VISITA: todos os vínculos ativos
   * do cliente passam a valer nesses dias de uma vez (nunca mais produto A na
   * terça e produto B na quinta), e cada um é espelhado no plano da Agenda — que
   * é o que o gerar-dia lê. `dias: []` = sem dia fixo.
   */
  @Patch('clientes/:id/dias')
  async updateDiasCliente(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDiasClienteDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    // Snapshots ANTES da mutação: o espelho precisa do dia/local antigos de cada
    // vínculo pra MOVER a visita (em vez de duplicar) — mesmo contrato do PATCH
    // de vínculo logo abaixo.
    const anteriores = this.agenda
      ? await Promise.all(
          (await this.recorrencia.listByCliente(companyId, id, req.user))
            .filter((v: any) => v && v.ativo !== false)
            .map((v: any) => this.recorrencia.vinculoEspelhoSnapshot(companyId, v.id)),
        )
      : [];
    const res = await this.recorrencia.definirDiasDoCliente(companyId, id, dto?.dias ?? []);
    const avisos: string[] = [];
    if (this.agenda) {
      for (const vinculoId of res.vinculoIds) {
        const anterior = anteriores.find((s: any) => s && String(s.id) === String(vinculoId)) ?? null;
        const espelho = await this.agenda.espelharVinculoCadastro(companyId, vinculoId, anterior);
        avisos.push(...espelho.avisos);
      }
    }
    return {
      success: true,
      dias: res.diasSemana ? res.diasSemana.split(',').map((d) => Number(d)) : [],
      vinculos: res.vinculoIds.length,
      ...(avisos.length ? { agendaAvisos: [...new Set(avisos)] } : {}),
    };
  }

  // ── LOGÍSTICA-MOBILE M2 — produtos do cliente (recorrência) ────────────────

  /** Catálogo de produtos da empresa (seletor da UI "Produtos do cliente"). */
  @Get('produtos')
  listProdutos(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recorrencia.listProdutos(companyId, req.user);
  }

  /** Vínculos produto×cliente de um cliente. */
  @Get('cliente-produtos')
  listClienteProdutos(@Req() req: any, @Query('customerProfileId') customerProfileId: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.recorrencia.listByCliente(companyId, customerProfileId, req.user);
  }

  /**
   * Cria um vínculo produto×cliente (qtd padrão, preço acordado, frequência).
   * PONTE CADASTRO→AGENDA (26/07): com a Agenda V2 ativa o dia é do CLIENTE/
   * visita (LogisticaPlanoEntrega) — o vínculo com dia é espelhado nos planos,
   * senão o cliente novo nunca entra no generateDay. `agendaAvisos` (aditivo)
   * só aparece quando algo não pôde ser espelhado (fail-closed, nunca chuta).
   */
  @Post('cliente-produtos')
  async createClienteProduto(@Req() req: any, @Body() dto: CreateClienteProdutoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    const res = await this.recorrencia.create(companyId, dto);
    // Guard `this.agenda` = mesmo padrão do gerar-dia (testes legados instanciam
    // o controller sem os providers novos).
    const espelho = this.agenda
      ? await this.agenda.espelharVinculoCadastro(companyId, res.id, null)
      : { avisos: [] as string[] };
    return espelho.avisos.length ? { ...res, agendaAvisos: espelho.avisos } : res;
  }

  /** Edita um vínculo (qtd/preço/frequência/ativo). Company-scoped. */
  @Patch('cliente-produtos/:id')
  async updateClienteProduto(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateClienteProdutoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    // Snapshot ANTES da mutação — o espelho da Agenda precisa do dia/local antigos.
    const anterior = this.agenda ? await this.recorrencia.vinculoEspelhoSnapshot(companyId, id) : null;
    const res = await this.recorrencia.update(companyId, id, dto);
    if (!res) throw new NotFoundException('Vínculo não encontrado');
    const espelho = this.agenda
      ? await this.agenda.espelharVinculoCadastro(companyId, res.id, anterior)
      : { avisos: [] as string[] };
    return espelho.avisos.length ? { ...res, agendaAvisos: espelho.avisos } : res;
  }

  /**
   * TASK 9 — REMOVE o vínculo produto×cliente de vez (o "-" da UI), diferente do
   * PATCH ativo=false (que só pausa). company-scoped. Não toca entregas já
   * geradas — só impede recorrências futuras.
   */
  @Delete('cliente-produtos/:id')
  async deleteClienteProduto(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    // PONTE CADASTRO→AGENDA (26/07) — snapshot antes do hard delete: o item sai
    // dos planos dos dias que o vínculo cobria (visita esvaziada = pausada).
    const anterior = this.agenda ? await this.recorrencia.vinculoEspelhoSnapshot(companyId, id) : null;
    const ok = await this.recorrencia.remove(companyId, id);
    if (!ok) throw new NotFoundException('Vínculo não encontrado');
    const espelho = this.agenda
      ? await this.agenda.espelharVinculoCadastro(companyId, null, anterior)
      : { avisos: [] as string[] };
    return espelho.avisos.length ? { success: true, agendaAvisos: espelho.avisos } : { success: true };
  }

  /**
   * Gera as entregas do dia a partir dos vínculos recorrentes vencidos.
   * IDEMPOTENTE por [cliente, dia]: rodar 2× no mesmo dia = 1 entrega/cliente.
   * Não dispara WhatsApp/cobrança (isso é só no confirmar, N6, atrás de flag).
   */
  @Post('gerar-dia')
  async gerarDia(@Req() req: any, @Body() dto: GerarDiaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    if (this.agenda && await this.agenda.isAgendaV2Active(companyId)) {
      return this.agenda.generateDay(companyId, dto?.date);
    }
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
    return this.recorrencia.getDiaPreview(companyId, date, req.user);
  }

  // ── LOGÍSTICA-MOBILE M3 — motor de rota + ETA ───────────────────────────────

  /**
   * Planeja a rota do dia: ordena as entregas abertas (NN+2-opt Haversine),
   * grava rotaOrdem/etaAt e devolve a rota ordenada + término previsto + quantas
   * paradas sem coordenada. origemLat/Lng = GPS do entregador (ponto de partida).
   * 100% local — sem API paga. Não dispara WhatsApp/cobrança.
   */
  @Post('rota/planejar')
  async planejarRota(@Req() req: any, @Body() dto: PlanejarRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    return this.rota.planejarRota(companyId, {
      date: dto?.date,
      origemLat: dto?.origemLat,
      origemLng: dto?.origemLng,
      deliveryIds: dto?.deliveryIds,
      ordemManual: dto?.ordemManual,
    }, entregadorId, Number(req.user?.id) || null);
  }

  /**
   * S3 (25/07, PR25072026-ROTA-CONFERIDA) — "conferir": DRY-RUN ABSOLUTO. Roda o
   * MESMO motor de rota (planRouteByRoads) em memória e devolve o semáforo de
   * confiança por parada (pino_compartilhado/fora_do_casulo/geocode_nao_provado_em_
   * campo/etc — ver logistica-conferencia.util.ts). NUNCA grava rotaOrdem/etaAt,
   * NUNCA chama prepareRoute/billing, NUNCA dispara WhatsApp (Lei nº3 da frente).
   * Mesmo escopo por ator do planejar (actorWhere.entregadorId) — motorista só
   * confere a própria rota; vermelho é aviso, nunca bloqueia a saída (Lei nº7).
   * S5 — `ordemManual` (opcional) audita a ordem QUE O ENTREGADOR VAI RODAR (a
   * ativa no app), não a que o motor escolheria hoje; ver ConferirRotaDto.
   */
  @Post('rota/conferir')
  async conferirRota(@Req() req: any, @Body() dto: ConferirRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    return this.conferencia.conferir(companyId, {
      date: dto?.date,
      origemLat: dto?.origemLat,
      origemLng: dto?.origemLng,
      deliveryIds: dto?.deliveryIds,
      ordemManual: dto?.ordemManual,
    }, entregadorId);
  }

  /** SANITIZADOR (27/07) — correção em massa do pop-up do Gerenciador. `executar`
   *  ausente = só placar; `executar:true` cura um LOTE (o app repete até `restantes`
   *  zerar). Só escreve PINO de cadastro (geoFonte 'cnefe'); rota/crédito intocados. */
  @Post('rota/sanitizar')
  async sanitizarRota(@Req() req: any, @Body() dto: SanitizarRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    return this.conferencia.sanitizar(companyId, { date: dto?.date, executar: dto?.executar === true, pular: dto?.pular }, entregadorId);
  }

  /**
   * ITEM 1 (28/07, ordem do dono) — "PRIMEIRO verificar se todos os enderecos estao
   * certos". Roda ANTES de montar: le o roster do(s) dia(s) pela agenda, deixa a cura
   * automatica resolver o que da, e devolve SO quem ficou com problema, com o CAMPO
   * quebrado marcado. Nao materializa entrega, nao planeja rota, nao debita credito.
   */
  @Post('rota/checar-enderecos')
  async checarEnderecosRota(@Req() req: any, @Body() dto: ChecarEnderecosDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.conferencia.checarEnderecos(companyId, { dias: dto?.dias, dates: dto?.dates });
  }

  /**
   * ITEM 1 (28/07, ordem do dono) — "a opcao remover todos os clientes e o dia salvo
   * deles. Assim nao volta na rota". Tira os dias informados dos clientes escolhidos
   * pela MESMA porta canonica de escrita de dia (definirDiasDoCliente + espelho da
   * agenda) — nunca escrevendo plano na mao.
   */
  @Post('rota/tirar-do-dia')
  async tirarDoDia(@Req() req: any, @Body() dto: TirarDoDiaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    const dias = [...new Set((dto?.dias ?? []).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))];
    const ids = [...new Set((dto?.customerProfileIds ?? []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 300);
    if (!dias.length) throw new BadRequestException('Informe o dia.');
    if (!ids.length) throw new BadRequestException('Informe os clientes.');
    let removidos = 0;
    const falhas: string[] = [];
    for (const id of ids) {
      try {
        const atuais = await this.recorrencia.listByCliente(companyId, id, req.user);
        const ativos = (atuais || []).filter((v: any) => v && v.ativo !== false);
        const diasAtuais = [
          ...new Set(
            ativos.flatMap((v: any) =>
              String(v?.diasSemana || '')
                .split(',')
                .map((d: string) => Number(d))
                .filter((d: number) => Number.isInteger(d) && d >= 1 && d <= 7),
            ),
          ),
        ];
        const restantes = diasAtuais.filter((d) => !dias.includes(d));
        const anteriores = this.agenda
          ? await Promise.all(ativos.map((v: any) => this.recorrencia.vinculoEspelhoSnapshot(companyId, v.id)))
          : [];
        const res = await this.recorrencia.definirDiasDoCliente(companyId, id, restantes);
        if (this.agenda) {
          for (const vinculoId of res.vinculoIds) {
            const anterior = anteriores.find((sn: any) => sn && String(sn.id) === String(vinculoId)) ?? null;
            await this.agenda.espelharVinculoCadastro(companyId, vinculoId, anterior);
          }
        }
        removidos += 1;
      } catch (e) {
        falhas.push(id);
        this.logger?.warn?.(`[logistica] tirar-do-dia falhou para ${id}: ${String((e as any)?.message || e)}`);
      }
    }
    return { success: true, removidos, falhas: falhas.length };
  }

  /**
   * ITEM 1 (28/07, ordem do dono) — "PRIMEIRO verificar se todos os enderecos estao
   * certos". Roda ANTES de montar: le o roster do(s) dia(s) pela agenda, deixa a cura
   * automatica resolver o que da, e devolve SO quem ficou com problema, com o CAMPO
   * quebrado marcado. Nao materializa entrega, nao planeja rota, nao debita credito.
   */
  @Post('rota/checar-enderecos')
  async checarEnderecosRota(@Req() req: any, @Body() dto: ChecarEnderecosDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.conferencia.checarEnderecos(companyId, { dias: dto?.dias, dates: dto?.dates });
  }

  /**
   * ITEM 1 (28/07, ordem do dono) — "a opcao remover todos os clientes e o dia salvo
   * deles. Assim nao volta na rota". Tira os dias informados dos clientes escolhidos
   * pela MESMA porta canonica de escrita de dia (definirDiasDoCliente + espelho da
   * agenda) — nunca escrevendo plano na mao.
   */
  @Post('rota/tirar-do-dia')
  async tirarDoDia(@Req() req: any, @Body() dto: TirarDoDiaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    const dias = [...new Set((dto?.dias ?? []).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))];
    const ids = [...new Set((dto?.customerProfileIds ?? []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 300);
    if (!dias.length) throw new BadRequestException('Informe o dia.');
    if (!ids.length) throw new BadRequestException('Informe os clientes.');
    let removidos = 0;
    const falhas: string[] = [];
    for (const id of ids) {
      try {
        const atuais = await this.recorrencia.listByCliente(companyId, id, req.user);
        const ativos = (atuais || []).filter((v: any) => v && v.ativo !== false);
        const diasAtuais = [
          ...new Set(
            ativos.flatMap((v: any) =>
              String(v?.diasSemana || '')
                .split(',')
                .map((d: string) => Number(d))
                .filter((d: number) => Number.isInteger(d) && d >= 1 && d <= 7),
            ),
          ),
        ];
        const restantes = diasAtuais.filter((d) => !dias.includes(d));
        const anteriores = this.agenda
          ? await Promise.all(ativos.map((v: any) => this.recorrencia.vinculoEspelhoSnapshot(companyId, v.id)))
          : [];
        const res = await this.recorrencia.definirDiasDoCliente(companyId, id, restantes);
        if (this.agenda) {
          for (const vinculoId of res.vinculoIds) {
            const anterior = anteriores.find((sn: any) => sn && String(sn.id) === String(vinculoId)) ?? null;
            await this.agenda.espelharVinculoCadastro(companyId, vinculoId, anterior);
          }
        }
        removidos += 1;
      } catch (e) {
        falhas.push(id);
        this.logger?.warn?.(`[logistica] tirar-do-dia falhou para ${id}: ${String((e as any)?.message || e)}`);
      }
    }
    return { success: true, removidos, falhas: falhas.length };
  }

  /**
   * S6 (25/07, PR25072026-ROTA-CONFERIDA) — preview de créditos: quanto o
   * Iniciar VAI debitar se rodar agora, ANTES do operador apertar o botão.
   * GET (não POST) porque é puramente consultivo — 100% leitura, NENHUM
   * wallet.debit/prepareRoute (Lei nº3 da frente). Mesmo escopo por ator do
   * conferir (actorWhere.entregadorId): motorista só vê o próprio preview;
   * admin sem motorista único no dia recebe 400 (mesma exigência do Iniciar
   * de verdade). `deliveryIds` opcional, CSV (mesmo formato de query-string
   * de listas já usado em outros controllers do backend).
   */
  @Get('rota/custo-preview')
  async custoPreview(@Req() req: any, @Query('date') date?: string, @Query('deliveryIds') deliveryIdsRaw?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    const deliveryIds = deliveryIdsRaw
      ? deliveryIdsRaw.split(',').map((id) => id.trim()).filter(Boolean)
      : undefined;
    return this.custoPreviewService.previewCusto(companyId, { date, deliveryIds }, entregadorId);
  }

  /**
   * Inicia a rota: re-planeja com a origem atual e marca a 1ª parada em rota
   * (status 'em_rota' + startedAt). Devolve a rota ordenada + término previsto.
   */
  @Post('rota/iniciar')
  async iniciarRota(@Req() req: any, @Body() dto: IniciarRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    return this.rota.iniciarRota(companyId, {
      date: dto?.date,
      origemLat: dto?.origemLat,
      origemLng: dto?.origemLng,
      deliveryIds: dto?.deliveryIds,
      ordemManual: dto?.ordemManual,
    }, entregadorId, Number(req.user?.id) || null, isBillingOwnerActor(req.user));
  }

  /**
   * PR17072026 Onda 1 — encerra a rota do dia de forma TRANSACIONAL (tudo-ou-
   * -nada): abertas (agendada/em_rota) voltam para PENDÊNCIA (nunca
   * cancelamento); entregues e canceladas ficam intocadas. Substitui o loop
   * antigo `POST /logistica/entregas/:id/cancelar` por parada do app (gerava
   * cancelamento parcial se a rede caísse no meio). Mesmo guard/escopo do
   * rota/iniciar — NÃO admin-only (o entregador também encerra a própria
   * rota); actorWhere aplica o mesmo recorte por motorista.
   */
  @Post('rota/encerrar')
  async encerrarRota(@Req() req: any, @Body() dto: EncerrarRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    return this.rota.encerrarRota(companyId, { date: dto?.date, motivo: dto?.motivo }, entregadorId);
  }

  /**
   * 🔴 27/07 — DESFAZER A MONTAGEM DE QUEM NÃO ACEITOU. Fechar o Gerenciador de
   * Rota sem "Aceitar" chamava `rota/encerrar`, que devolve as abertas pra
   * pendência mas DEIXA DE PÉ o avanço que a materialização fez na Agenda: o
   * toque num chip de dia empurra a `proximaData` do plano pra semana seguinte.
   * Medido em prod: um toque exploratório em TERÇA numa segunda esvaziou a terça
   * seguinte (7 visitas pularam pra semana que vem) sem debitar 1 crédito.
   *
   * Aqui a ocorrência VOLTA (entrega materializada e intocada é cancelada, chave
   * solta, `proximaData` de volta na data de origem) e o que era da pessoa —
   * avulsa, manual, já iniciada — só perde a ordem, igual ao encerrar. Mesmo
   * guard/escopo do `rota/encerrar`, NÃO admin-only.
   */
  @Post('rota/descartar-montagem')
  async descartarMontagem(@Req() req: any, @Body() dto: EncerrarRotaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    return this.rota.descartarMontagem(companyId, { date: dto?.date, motivo: dto?.motivo }, entregadorId);
  }

  /**
   * PR18072026 Onda 1 — "Limpar dia": CANCELA (não pausa) as entregas ABERTAS
   * do dia, transacional/tudo-ou-nada. Decisão do dono (18/07): diferente de
   * encerrar (que devolve pra pendência), limpar dia é pra descartar o dia
   * mesmo. Entregues/canceladas/FinanceiroCharge/comprovantes INTOCADOS. Mesmo
   * guard/escopo do rota/encerrar — NÃO admin-only.
   */
  @Post('rota/limpar-dia')
  async limparDia(@Req() req: any, @Body() dto: LimparDiaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const actorWhere = await this.operacao.whereForActor(req.user);
    const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
    return this.rota.limparDia(companyId, { date: dto?.date, motivo: dto?.motivo }, entregadorId);
  }

  // ── PR18072026 W1 — rota-modelo (roteiro salvo, aplicado client-side) ──────
  // Mesma guarda do gerar-dia (só JwtAuthGuard+ModuleAccessGuard de classe —
  // não Admin-only: o próprio entregador também monta/reaplica um roteiro).

  @Get('rota-modelos')
  listRotaModelos(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.rotaModelo.list(companyId);
  }

  @Post('rota-modelos')
  createRotaModelo(@Req() req: any, @Body() dto: CreateRotaModeloDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.rotaModelo.create(companyId, { nome: dto.nome, diaSemana: dto.diaSemana, paradas: dto.paradas });
  }

  @Patch('rota-modelos/:id')
  async updateRotaModelo(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRotaModeloDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const res = await this.rotaModelo.update(companyId, id, {
      nome: dto.nome,
      diaSemana: dto.diaSemana,
      paradas: dto.paradas,
    });
    if (!res) throw new NotFoundException('Modelo de rota não encontrado');
    return res;
  }

  @Delete('rota-modelos/:id')
  async deleteRotaModelo(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const ok = await this.rotaModelo.remove(companyId, id);
    if (!ok) throw new NotFoundException('Modelo de rota não encontrado');
    return { success: true };
  }

  /**
   * PR20072026-ROTA-SALVA F2 — materializa a lista EXATA do modelo salvo (não
   * é a prévia do dia da recorrência). Mesma guarda das demais rota-modelos
   * acima (driver comum PODE aplicar sua própria rota salva).
   */
  @Post('rota-modelos/:id/gerar')
  gerarRotaModelo(@Req() req: any, @Param('id') id: string, @Body() dto: GerarRotaModeloDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.rotaModelo.gerar(companyId, id, dto?.date, userId);
  }

  // ── PR20072026 W1 — "Leitura de Rota" (docs/PLANEJAMENTOS/PR20072026/
  // SPEC-LEITURA-DE-ROTA.md + 00-ORQUESTRACAO.md, contrato = LEI). Mesma
  // guarda das rotas acima (driver comum PODE usar, sem @Admin) — sessão é
  // escopada por (companyId, userId) dentro do serviço.

  @Post('leitura/iniciar')
  iniciarLeitura(@Req() req: any, @Body() dto: IniciarLeituraDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.leitura.iniciar(companyId, userId, dto?.modo);
  }

  @Get('leitura/atual')
  leituraAtual(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.leitura.atual(companyId, userId);
  }

  @Post('leitura/:id/parada')
  registrarLeituraParada(@Req() req: any, @Param('id') id: string, @Body() dto: RegistrarLeituraParadaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.leitura.registrarParada(companyId, userId, id, dto);
  }

  @Get('leitura/:id/resumo')
  leituraResumo(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.leitura.resumo(companyId, userId, id);
  }

  @Patch('leitura/:id/parada/:paradaId')
  updateLeituraParada(
    @Req() req: any,
    @Param('id') id: string,
    @Param('paradaId') paradaId: string,
    @Body() dto: UpdateLeituraParadaDto,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.leitura.updateParada(companyId, userId, id, paradaId, dto);
  }

  @Delete('leitura/:id/parada/:paradaId')
  async removeLeituraParada(@Req() req: any, @Param('id') id: string, @Param('paradaId') paradaId: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    await this.leitura.removeParada(companyId, userId, id, paradaId);
    return { success: true };
  }

  @Post('leitura/:id/finalizar')
  finalizarLeitura(@Req() req: any, @Param('id') id: string, @Body() dto: FinalizarLeituraDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.leitura.finalizar(companyId, userId, id, dto);
  }

  @Post('leitura/:id/cancelar')
  async cancelarLeitura(@Req() req: any, @Param('id') id: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    await this.leitura.cancelar(companyId, userId, id);
    return { success: true };
  }

  /**
   * S2 (PR21072026-MONTAR-ROTA-PLAY) — trilha (breadcrumb GPS) gravada pelo
   * RotaService nativo durante a Leitura. Ver S2-CONTRATO-PONTE.md.
   */
  @Post('leitura/:id/trilha')
  registrarLeituraTrilha(@Req() req: any, @Param('id') id: string, @Body() dto: RegistrarTrilhaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const userId = this.ensureUserId(req.user);
    return this.leitura.registrarTrilha(companyId, userId, id, dto.pontos);
  }

  /**
   * PR20072026-ROTA-SALVA F3.2 — geocode reverso (GPS → endereço), sugestão
   * EDITÁVEL pro passo "Sequência" da Leitura de Rota. 200 SEMPRE (nunca 500):
   * flag `HBX_GEO_SERVER_ENABLED` OFF (default) ou sem match → `fonte:'nenhum'`
   * com campos vazios. lat/lng fora do intervalo válido → 400 (erro de input).
   */
  @Get('geo/reverse')
  geoReverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.geo.reverse(lat, lng);
  }

  /**
   * R2/R9 (27/07, frente APK-rota) — CEP + número → pino. Base CNEFE local primeiro
   * (porta/rua do Censo, sem rede externa), Nominatim com freio de reserva; 'nenhum'
   * ainda devolve o endereço do ViaCEP pro app pré-preencher. 200 sempre; CEP/número
   * inválidos → 400 (erro de input do chamador).
   */
  @Get('geo/cep')
  geoCep(@Query('cep') cep: string, @Query('numero') numero: string, @Query('uf') uf?: string) {
    return this.geo.cepNumero(cep, numero, uf);
  }

  // ── PR18072026 W1 — façade de produtos sob /logistica (allowlist do APK) ───
  // O app do entregador só fala com endpoints `logistica/*`; PATCH/POST aqui
  // evitam sair do prefixo permitido. ADMIN-only (mesmo padrão de
  // cliente-produtos: ensureBillingOwner, não RolesGuard/@Admin).

  @Post('produtos')
  createProduto(@Req() req: any, @Body() dto: CreateProdutoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    return this.recorrencia.createProduto(companyId, dto);
  }

  @Patch('produtos/:id')
  async updateProduto(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateProdutoDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    this.ensureBillingOwner(req.user);
    const res = await this.recorrencia.updateProduto(companyId, id, dto);
    if (!res) throw new NotFoundException('Produto não encontrado');
    return res;
  }

  // ── ROTA RASTREADA PR2 — cockpit administrativo ao vivo ───────────────────

  @Get('tracking/live')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  trackingLive(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.tracking.getLive(companyId);
  }

  @Get('tracking/sessions/:sessionId/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  trackingHistory(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Query('limit') limitInput?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const parsed = Number(limitInput || 500);
    return this.tracking.getHistory(companyId, sessionId, Number.isFinite(parsed) ? parsed : 500);
  }

  @Get('creditos/extrato')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  trackingCreditStatement(@Req() req: any, @Query('month') month?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.trackingBonus.getAdminStatement(companyId, month);
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
    return this.config.getConfig(companyId, req.user);
  }

  /**
   * PR28072026 HÍBRIDO (28/07) — O PLANO DA EMPRESA: nível, mensalidade e a
   * franquia de paradas DESTE mês (usadas × inclusas).
   *
   * ADMIN-only por causa da LEI DO VENDEDOR: carrega VALOR (a mensalidade).
   * Endpoint próprio em vez de engordar o GET /config, que o app do entregador
   * chama a cada boot — a franquia custa 2 counts e quem olha isso é o dono no
   * PC, não o motorista na rua.
   *
   * O mês é o da rota de HOJE no fuso da operação (canonicalRouteDate), nunca o
   * relógio UTC do container.
   */
  @Get('plano')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  plano(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.nivelPlano.franquiaDoMesEmParadas(companyId, canonicalRouteDate(undefined));
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
    return this.config.updateConfig(companyId, dto, req.user);
  }

  /**
   * 26/07 — MODO DAS NOVAS ROTAS (Simples × Rastreada), em endereço PRÓPRIO.
   * A escolha comercial saiu do PATCH genérico acima porque o APK VELHO em campo
   * ainda mandava `trackingAtivo`/`modoRotaPadrao` por lá e passava quando o
   * logado era o dono da conta. Agora o payload antigo morre no ValidationPipe
   * (400, forbidNonWhitelisted) e esta rota só existe no painel do PC
   * (/logistica/config) — nenhum bundle do celular a conhece, e o gate não
   * depende de User-Agent (forjável). ADMIN-only + billing owner no serviço.
   */
  @Patch('config/modo-rota')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  updateRouteMode(@Req() req: any, @Body() dto: UpdateLogisticaRouteModeDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.config.updateRouteMode(companyId, dto, req.user);
  }

  /**
   * PR27072026 F1 — NÍVEL DO PLANO (Basic/Advanced/Full), endereço PRÓPRIO
   * fora do PATCH genérico (mesmo motivo do modo-rota acima: fechar a porta
   * por CONTRATO). `companyId` vem do PARÂMETRO da URL (não do JWT) — o Master
   * não é escopado a uma empresa, ele escolhe QUAL empresa na ficha. Guard de
   * classe (JwtAuthGuard + ModuleAccessGuard) some pro Master
   * (isSystemMaster bypassa); MasterGuard aqui barra qualquer não-master.
   */
  @Get('master/company/:companyId/nivel')
  @UseGuards(MasterGuard)
  getNivel(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.config.getNivel(companyId);
  }

  /** PUT do nível: aplica o preset da matriz do plano num gesto só. Ver SetLogisticaNivelDto. */
  @Put('master/company/:companyId/nivel')
  @UseGuards(MasterGuard)
  setNivel(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetLogisticaNivelDto,
  ) {
    return this.config.setNivel(companyId, dto.nivel, req.user);
  }

  // ── S6 PORTAL-PEDIDO — link público de pedido (token opaco) ─────────────────

  /**
   * Garante o token do link público /pedido/<token> (IDEMPOTENTE: emite na 1ª
   * vez, depois devolve sempre o mesmo). ADMIN-only (o link é decisão do dono,
   * mesmo gate do card na UI). NÃO liga o toggle pedidoPublicoAtivo — gerar o
   * link e abrir a torneira são ações separadas. Molde: getOrCreateCaptureToken
   * do website (website.service.ts).
   */
  @Post('pedido-publico/link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async pedidoPublicoLink(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const token = await this.config.ensurePedidoPublicoToken(companyId);
    return { token, path: `/pedido/${token}` };
  }

  /**
   * Rotaciona o token (o link antigo MORRE na hora — 404 público). ADMIN-only.
   * Uso: link vazou/foi compartilhado errado → "gerar novo link" na UI.
   */
  @Post('pedido-publico/rotacionar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  async pedidoPublicoRotacionar(@Req() req: any) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    const token = await this.config.rotatePedidoPublicoToken(companyId);
    return { token, path: `/pedido/${token}` };
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

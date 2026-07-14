import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { CreditMeterService } from '../credits/credit-meter.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConfigService, renderTemplateAviso } from './logistica-config.service';
import { LogisticaRecoveryService } from './logistica-recovery.service';
import { LogisticaCobrancaAvisoService } from './logistica-cobranca-aviso.service';
import { emitMasterEvent } from '../common/master-event';
import { resolvePrincipalContato, resolvePrincipalContatoId } from './logistica-contato.util';
import { normalizeBrPhoneE164 } from '../messaging/whatsapp-channel';
import { LogisticaActor, LogisticaOperacaoService, isLogisticaAdmin } from './logistica-operacao.service';
import { isBillingOwnerActor } from '../access/actor-kind';
import { canonicalRouteDate, LogisticaRouteBillingService } from './logistica-route-billing.service';
import {
  LogisticaTrackingService,
  type OperationalRouteMetadata,
} from './logistica-tracking.service';
import {
  LogisticaTrackedBillingService,
  type PreparedTrackedDeliveryCharge,
} from './logistica-tracked-billing.service';

/**
 * NÚCLEO-CRM N6 (05/07) — módulo LOGÍSTICA (o app de entrega, cliente água).
 *
 * Fluxo do entregador: "Rota de hoje" → toca no cliente → Navegar (deep-link
 * Waze/Maps, custo R$0) → chega → "Confirmar entrega" (GPS via geolocation) →
 * status vira 'entregue' + (se a flag ligar) dispara WhatsApp "entregue" e lança
 * a cobrança conforme o contrato do cliente.
 *
 * ── FLAG DE SEGURANÇA (HBX_LOGISTICA_ENABLED, default OFF) ───────────────────
 * Enquanto OFF, confirmar entrega SÓ muda status/GPS. Os DOIS efeitos com risco
 * (WhatsApp e cobrança) ficam INERTES: nenhuma mensagem sai, nenhuma cobrança é
 * lançada. Isto é explícito e testável (ver logistica.service.test.ts).
 *
 * ── WHATSAPP (regra dura de chip) ────────────────────────────────────────────
 * O disparo é SOMENTE via ConversationsService.queueOutboundForCompany — o MESMO
 * caminho blindado da cadência (disjuntor, 1-número=1-conexão, outbox com retry,
 * gate de conexão viva). PROIBIDO aqui: API crua da Evolution, socket novo,
 * QUALQUER lógica de reconexão/retry próprio, loop. Uma mensagem, on-success,
 * acabou (loop de reconexão = chip banido).
 *
 * ── COBRANÇA (frente financeira) ─────────────────────────────────────────────
 * Lança um FinanceiroCharge conforme modeloCobranca do cliente. Não cria caminho
 * de cobrança paralelo (usa o MESMO model FinanceiroCharge do resto do sistema),
 * marcado paymentMethod='MANUAL', status='pending' — nada dispara MP.
 */
@Injectable()
export class LogisticaService {
  private readonly logger = new Logger(LogisticaService.name);

  private static readonly FLAG = 'HBX_LOGISTICA_ENABLED';

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly rota: LogisticaRotaService,
    private readonly config: LogisticaConfigService,
    // Slot legado mantido apenas para compatibilidade de DI/instanciações diretas.
    // A medição `logistica_delivery` foi desativada: os novos modos têm cobrança própria.
    @Optional() private readonly _legacyCreditMeter?: CreditMeterService,
    // QUITAR → RECOVERY: baixa manual de fiado PARA a cadência hbx-recovery do
    // cliente se ele zerou a dívida vencida. @Optional() (ausente nos testes/DI sem
    // funil = simplesmente não fecha a cadência). Sem ciclo: LogisticaRecoveryService
    // não injeta LogisticaService.
    @Optional() private readonly recovery?: LogisticaRecoveryService,
    // S2 COBRANÇA-WHATS (11/07): aviso ao cliente quando o charge nasce 'pending'
    // (lancarCobranca/fecharMes). @Optional() (ausente nos testes = no-op). DORMENTE:
    // todos os gates (env global OFF, toggle do tenant, opt-out, idempotência) vivem
    // DENTRO do serviço de aviso. Sem ciclo: o aviso não injeta LogisticaService.
    @Optional() private readonly cobrancaAviso?: LogisticaCobrancaAvisoService,
    // Operação por usuário/atribuição + comprovantes. Optional só preserva os
    // testes legados que instanciam o serviço diretamente; rotas HTTP sempre DI.
    @Optional() private readonly operacao?: LogisticaOperacaoService,
    // Gate comercial dos modos de rota. Optional preserva testes unitários
    // legados; no módulo HTTP o provider é obrigatório e sempre injetado.
    @Optional() private readonly routeBilling?: LogisticaRouteBillingService,
    // Metadados operacionais seguros da rota/sessão (sem preço/saldo). Optional
    // apenas para preservar instanciações diretas de testes legados.
    @Optional() private readonly tracking?: LogisticaTrackingService,
    // Cobrança fail-closed da Rota Rastreada. Optional só mantém os testes
    // legados com `new LogisticaService(...)`; no módulo HTTP sempre existe.
    @Optional() private readonly trackedBilling?: LogisticaTrackedBillingService,
  ) {}

  /**
   * S2 — dispara o aviso de cobrança "ao lançar" em fire-and-forget: o aviso
   * NUNCA altera (nem atrasa, nem derruba) o desfecho do lançamento do charge.
   * Best-effort puro; falha vira log. Com HBX_COBRANCA_WHATS_ENABLED ausente o
   * serviço retorna no-op imediato (deploy inerte).
   */
  private avisarCobrancaLancamento(companyId: number, chargeId: string | null | undefined): void {
    const svc = this.cobrancaAviso;
    const id = String(chargeId || '').trim();
    if (!svc || !id) return;
    void svc.avisarLancamento(companyId, id).catch((e: any) => {
      this.logger.warn(`[logistica] aviso de cobrança falhou charge=${id}: ${String(e?.message || e)}`);
    });
  }

  /**
   * M3 — re-ETA aditivo: após confirmar/cancelar, recalcula o etaAt das paradas
   * RESTANTES do dia (sem reordenar o que já foi feito). Best-effort: qualquer
   * erro é engolido (log) — NÃO afeta o desfecho do confirmar/cancelar (N6).
   */
  private async recalcularEtaSilencioso(companyId: number, actor?: LogisticaActor | null): Promise<void> {
    try {
      const actorWhere = actor && this.operacao ? await this.operacao.whereForActor(actor) : {};
      const entregadorId = typeof actorWhere.entregadorId === 'number' ? actorWhere.entregadorId : undefined;
      await this.rota.recalcularEtaRestantes(companyId, undefined, entregadorId);
    } catch (e: any) {
      this.logger.warn(`[logistica] re-ETA pós-ação falhou company=${companyId}: ${String(e?.message || e)}`);
    }
  }

  /**
   * Único interruptor dos EFEITOS (WhatsApp + cobrança). Default OFF: sem a flag,
   * confirmar entrega é 100% inerte de efeito colateral externo (só status/GPS).
   */
  private get effectsEnabled(): boolean {
    const raw = String(process.env[LogisticaService.FLAG] || '').trim().toLowerCase();
    return raw === '1' || raw === 'true';
  }

  // ── ROTA DO DIA ────────────────────────────────────────────────────────────
  /**
   * Entregas de um dia (default: hoje) da empresa. Company-scoped (companyId
   * sempre do JWT). Ordena por status (o que falta primeiro) e horário.
   */
  async listRota(
    companyId: number,
    dateInput?: string,
    actor?: LogisticaActor | null,
    updatedSinceInput?: string,
  ): Promise<RotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(dateInput);
    const billingAudience = isBillingOwnerActor(actor);
    const actorWhere = actor ? await this.requireOperacao().whereForActor(actor) : {};
    const updatedSince = parseUpdatedSince(updatedSinceInput);
    const comprovanteActorWhere =
      actor && !isLogisticaAdmin(actor) ? { enviadoPorUserId: actorIdOrNull(actor) } : {};

    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        ...actorWhere,
        ...(updatedSince ? { updatedAt: { gt: updatedSince } } : {}),
        // Entregas AGENDADAS pro dia + as que ficaram sem data mas ainda abertas.
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { scheduledAt: null, status: { in: ['agendada', 'em_rota'] } },
        ],
      },
      // FIX rota (07/07): ordena pela rotaOrdem do planejador (NN+2-opt) primeiro —
      // é a ordem que o entregador tem de seguir. Sem isso a lista voltava em ordem
      // de INSERÇÃO (bagunçada no mapa) e os cards ficavam todos "Parada 1" (o app
      // ordena/numera por rotaOrdem, que nunca chegava). NULLs por último (Postgres).
      orderBy: [{ rotaOrdem: 'asc' }, { status: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: {
        id: true,
        status: true,
        quantidade: true,
        ...(billingAudience ? { valor: true as const } : {}),
        scheduledAt: true,
        deliveredAt: true,
        deliveredLat: true,
        deliveredLng: true,
        ...(billingAudience ? { cobrancaStatus: true as const } : {}),
        notes: true,
        updatedAt: true,
        entregador: { select: { id: true, name: true, email: true, username: true } },
        comprovanteCodigoHash: true,
        comprovanteConfirmadoAt: true,
        comprovantes: {
          where: { status: { not: 'removido' }, ...comprovanteActorWhere },
          orderBy: { createdAt: 'desc' },
          select: { id: true, tipo: true, status: true, enviadoPorUserId: true },
        },
        // FIX rota (07/07): a ordem/ETA planejados PRECISAM voltar pro app — sem
        // eles o carrossel numera tudo "Parada 1" e ignora o 2-opt (bagunça).
        rotaOrdem: true,
        etaAt: true,
        // MULTILOCAL (10/07) — o LOCAL desta entrega (endereço/geo próprios). Quando
        // presente, a rota usa o endereço/geo do local; o cliente (id/nome/saldo)
        // segue do perfil (a cobrança é da CONTA — inalterada).
        localId: true,
        local: {
          select: {
            apelido: true,
            endereco: true,
            cidade: true,
            uf: true,
            lat: true,
            lng: true,
          },
        },
        customerProfile: {
          select: {
            id: true,
            name: true,
            endereco: true,
            cidade: true,
            uf: true,
            lat: true,
            lng: true,
            phone: true,
            ...(billingAudience
              ? {
                  // Dados comerciais são exclusivos de dono/master. A omissão no
                  // select impede vazamento mesmo antes da serialização HTTP.
                  formaPagamento: true as const,
                  metodoPadrao: true as const,
                  limiteFiado: true as const,
                }
              : {}),
          },
        },
        contato: { select: { id: true, nome: true, whatsapp: true, phone: true } },
        product: { select: { id: true, name: true, unidade: true } },
        // M4 — itens previstos por entrega (multi-produto do M2). O stepper da folha
        // de chegada vem pré-preenchido com qtdPrevista de cada item.
        itens: {
          select: {
            id: true,
            qtdPrevista: true,
            qtdEntregue: true,
            ...(billingAudience ? { valorUnit: true as const } : {}),
            product: { select: { id: true, name: true, unidade: true } },
          },
        },
      },
    });

    // M4 — a regra dos chips depende do módulo financeiro do tenant (opt-in).
    // OFF → NENHUM chip de pagamento, nunca (só qtd + Entregue). Best-effort: se a
    // config não existir ainda, o default do schema (false) é o comportamento seguro.
    // F1 — a MESMA leitura traz o Pix do tenant (chave/nome/cidade do BR Code).
    let moduloFinanceiroAtivo = false;
    let pix: RotaPix | null = null;
    // AVISO-CHEGANDO — o app só arma o 2º anel (~500m) quando avisoChegandoAtivo
    // é true (effectsEnabled global E o toggle da empresa) — evita POST inútil
    // com o recurso OFF. Defaults seguros (false/500) se a leitura falhar.
    let avisoChegandoAtivo = false;
    let avisoChegandoDistanciaM = 500;
    let comprovante: RotaRequisitosComprovante = {
      fotoObrigatoria: false,
      assinaturaObrigatoria: false,
      codigoObrigatorio: false,
    };
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: {
          ...(billingAudience
            ? {
                moduloFinanceiroAtivo: true as const,
                pixChave: true as const,
                pixNome: true as const,
                pixCidade: true as const,
              }
            : {}),
          avisoChegandoEnabled: true,
          avisoChegandoDistanciaM: true,
          comprovanteFotoObrigatoria: true,
          comprovanteAssinaturaObrigatoria: true,
          comprovanteCodigoObrigatorio: true,
        },
      });
      moduloFinanceiroAtivo = billingAudience && (cfg?.moduloFinanceiroAtivo ?? false);
      // O QR só existe com o módulo ON e a chave configurada (regra do M4 preservada:
      // financeiro OFF = nenhum pagamento aparece na entrega, nunca).
      if (moduloFinanceiroAtivo && cfg?.pixChave) {
        pix = { chave: cfg.pixChave, nome: cfg.pixNome ?? null, cidade: cfg.pixCidade ?? null };
      }
      avisoChegandoAtivo = this.effectsEnabled && !!cfg?.avisoChegandoEnabled;
      if (typeof cfg?.avisoChegandoDistanciaM === 'number' && cfg.avisoChegandoDistanciaM > 0) {
        avisoChegandoDistanciaM = cfg.avisoChegandoDistanciaM;
      }
      comprovante = this.operacao?.requisitosFromConfig(cfg) ?? comprovante;
    } catch (e: any) {
      this.logger.warn(`[logistica] listRota loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }

    // F1 — saldo em aberto POR CLIENTE ("quanto me deve"), fonte única
    // (saldoAbertoPorClientes). SÓ com o módulo financeiro ON — OFF significa que
    // dinheiro não aparece (nem roda) em lugar nenhum da entrega. Best-effort:
    // falha aqui NUNCA derruba a rota — o app só fica sem o badge.
    let saldoPorCliente = new Map<string, { pendente: number; aguardando: number }>();
    if (billingAudience && moduloFinanceiroAtivo) {
      try {
        saldoPorCliente = await this.saldoAbertoPorClientes(
          companyId,
          Array.from(new Set(rows.map((r) => r.customerProfile.id))),
        );
      } catch (e: any) {
        this.logger.warn(`[logistica] listRota saldoAberto company=${companyId} falhou: ${String(e?.message || e)}`);
      }
    }

    const driverIds = new Set<number>();
    const actorDriverId = Number((actorWhere as any)?.entregadorId);
    if (Number.isInteger(actorDriverId) && actorDriverId > 0) driverIds.add(actorDriverId);
    for (const row of rows) {
      const id = Number(row.entregador?.id);
      if (Number.isInteger(id) && id > 0) driverIds.add(id);
    }
    let routeMetadata: OperationalRouteMetadata = {
      routeId: null as string | null,
      trackingRequired: false,
      routeMode: null as 'ESSENTIAL' | 'TRACKED' | null,
      routeStatus: null as string | null,
      trackingSessionId: null as string | null,
      trackingStatus: null as string | null,
    };
    if (this.tracking && driverIds.size === 1) {
      try {
        routeMetadata = await this.tracking.getOperationalRouteMetadata(
          companyId,
          [...driverIds][0],
          canonicalRouteDate(dateInput),
          billingAudience,
        );
      } catch (error: any) {
        this.logger.warn(`[logistica] metadados da rota company=${companyId} falharam: ${String(error?.message || error)}`);
      }
    }

    const { routeMode, ...operationalRouteMetadata } = routeMetadata;
    return {
      date: dayISO,
      total: rows.length,
      refreshedAt: new Date().toISOString(),
      ...operationalRouteMetadata,
      ...(billingAudience ? { routeMode: routeMode ?? null } : {}),
      effectsEnabled: this.effectsEnabled,
      ...(billingAudience ? { moduloFinanceiroAtivo, pix } : {}),
      avisoChegandoAtivo,
      avisoChegandoDistanciaM,
      comprovante,
      items: rows.map((r) => {
        const foto = r.comprovantes.find((item) => item.tipo === 'foto') ?? null;
        const assinatura = r.comprovantes.find((item) => item.tipo === 'assinatura') ?? null;
        return {
          id: r.id,
        status: r.status,
        quantidade: r.quantidade,
        ...(billingAudience ? { valor: r.valor } : {}),
        scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        deliveredLat: r.deliveredLat ?? null,
        deliveredLng: r.deliveredLng ?? null,
        ...(billingAudience ? { cobrancaStatus: r.cobrancaStatus } : {}),
        notes: r.notes ?? null,
        updatedAt: r.updatedAt.toISOString(),
        entregador: r.entregador
          ? {
              id: r.entregador.id,
              nome: r.entregador.name || r.entregador.username || r.entregador.email,
              email: r.entregador.email ?? null,
            }
          : null,
        comprovante: {
          fotoId: foto?.id ?? null,
          assinaturaId: assinatura?.id ?? null,
          fotoEnviada: !!foto,
          assinaturaEnviada: !!assinatura,
          codigoGerado: !!r.comprovanteCodigoHash,
          confirmadoAt: r.comprovanteConfirmadoAt?.toISOString() ?? null,
        },
        // FIX rota (07/07): devolve a ordem/ETA planejados (o app ordena o carrossel
        // e numera "Parada N" por rotaOrdem; o término lê etaAt da última parada).
        rotaOrdem: r.rotaOrdem ?? null,
        etaAt: r.etaAt ? r.etaAt.toISOString() : null,
        // MULTILOCAL (10/07) — apelido do local ("Casa"|"Loja"…) pro card da rota;
        // null quando a entrega não tem local (usa o perfil).
        localApelido: r.local?.apelido ?? null,
        cliente: {
          id: r.customerProfile.id,
          nome: r.customerProfile.name ?? null,
          // MULTILOCAL — endereço/geo vêm do LOCAL da entrega quando presente (cada
          // porta tem sua coordenada); sem local = perfil (legado). id/nome/saldoAberto
          // SEGUEM do perfil (a cobrança é da CONTA — NÃO muda).
          endereco: r.local ? (r.local.endereco ?? null) : (r.customerProfile.endereco ?? null),
          cidade: r.local ? (r.local.cidade ?? null) : (r.customerProfile.cidade ?? null),
          uf: r.local ? (r.local.uf ?? null) : (r.customerProfile.uf ?? null),
          lat: r.local ? (r.local.lat ?? null) : (r.customerProfile.lat ?? null),
          lng: r.local ? (r.local.lng ?? null) : (r.customerProfile.lng ?? null),
          phone: r.customerProfile.phone ?? null,
          ...(billingAudience
            ? {
                formaPagamento: r.customerProfile.formaPagamento ?? 'aberto',
                metodoPadrao: r.customerProfile.metodoPadrao ?? null,
                saldoAberto: somaSaldo(saldoPorCliente.get(r.customerProfile.id)),
                limiteFiado: r.customerProfile.limiteFiado ?? null,
              }
            : {}),
        },
        contato: r.contato
          ? { id: r.contato.id, nome: r.contato.nome, whatsapp: r.contato.whatsapp ?? null, phone: r.contato.phone ?? null }
          : null,
        produto: r.product ? { id: r.product.id, nome: r.product.name, unidade: r.product.unidade ?? null } : null,
        // M4 — itens previstos (multi-produto). Fallback p/ o produto/qtd legado da
        // Entrega quando ainda não há EntregaItem (entregas antigas do N6).
        itens:
          r.itens.length > 0
            ? r.itens.map((it) => ({
                id: it.id,
                qtdPrevista: it.qtdPrevista,
                qtdEntregue: it.qtdEntregue ?? null,
                ...(billingAudience ? { valorUnit: it.valorUnit ?? 0 } : {}),
                produto: it.product
                  ? { id: it.product.id, nome: it.product.name, unidade: it.product.unidade ?? null }
                  : null,
              }))
            : r.product
              ? [
                  {
                    id: r.id,
                    qtdPrevista: r.quantidade,
                    qtdEntregue: null,
                    ...(billingAudience ? { valorUnit: 0 } : {}),
                    produto: { id: r.product.id, nome: r.product.name, unidade: r.product.unidade ?? null },
                  },
                ]
              : [],
        };
      }),
    };
  }

  private requireOperacao(): LogisticaOperacaoService {
    if (!this.operacao) throw new BadRequestException('Operação de entregas indisponível.');
    return this.operacao;
  }

  // ── CRIAR (agendar entrega) ─────────────────────────────────────────────────
  async createEntrega(companyId: number, input: CreateEntregaInput): Promise<{ id: string }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const customerProfileId = String(input.customerProfileId || '').trim();
    if (!customerProfileId) throw new BadRequestException('Cliente é obrigatório.');

    // A conta precisa ser DESTA empresa (isolamento por-tenant duro).
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: customerProfileId, companyId },
      select: { id: true, precoPadrao: true },
    });
    if (!conta) throw new NotFoundException('Cliente não encontrado');

    // Contato: se informado, tem de ser da MESMA conta+empresa; senão, resolve o
    // PRINCIPAL da conta (BUG 1, 09/07) — sem isso a Entrega nascia com contatoId
    // null e o aviso "entregue" caía no telefone (possivelmente desatualizado) da
    // conta em vez do WhatsApp do contato que o dono realmente mantém certo.
    let contatoId: string | null = null;
    if (input.contatoId) {
      const contato = await this.prisma.contato.findFirst({
        where: { id: String(input.contatoId).trim(), companyId, customerProfileId },
        select: { id: true },
      });
      contatoId = contato?.id ?? null;
    } else {
      try {
        contatoId = await resolvePrincipalContatoId(this.prisma as any, companyId, customerProfileId);
      } catch (e: any) {
        this.logger.warn(`[logistica] createEntrega resolvePrincipalContato cliente=${customerProfileId} falhou: ${String(e?.message || e)}`);
      }
    }

    // Produto: se informado, tem de ser da MESMA empresa; puxa o preço de fallback.
    let productId: number | null = null;
    let productPrice: number | null = null;
    if (input.productId != null) {
      const product = await this.prisma.product.findFirst({
        where: { id: Number(input.productId), companyId },
        select: { id: true, price: true, priceCents: true },
      });
      if (product) {
        productId = product.id;
        productPrice =
          typeof product.priceCents === 'number' ? product.priceCents / 100 : typeof product.price === 'number' ? product.price : null;
      }
    }

    // MULTILOCAL (10/07) — local opcional: valida que é do MESMO cliente+empresa
    // (isolamento duro). Inválido/de outro cliente → null (cai no endereço do
    // perfil) — mesmo padrão leniente do contato/produto acima.
    let localId: string | null = null;
    if (input.localId) {
      const local = await this.prisma.localEntrega.findFirst({
        where: { id: String(input.localId).trim(), companyId, customerProfileId: conta.id },
        select: { id: true },
      });
      localId = local?.id ?? null;
    }

    const quantidade = Math.max(1, Math.trunc(Number(input.quantidade) || 1));
    // Valor: explícito > preço do produto > preço padrão do cliente > 0.
    const valorBase =
      input.valor != null && Number.isFinite(Number(input.valor))
        ? Number(input.valor)
        : productPrice ?? conta.precoPadrao ?? 0;
    const valor = Math.max(0, valorBase) * (input.valor != null ? 1 : quantidade);

    const scheduledAt = parseDateOrNull(input.scheduledAt) ?? new Date();

    const created = await this.prisma.entrega.create({
      data: {
        companyId,
        customerProfileId: conta.id,
        contatoId,
        // MULTILOCAL — ONDE entrega (null = perfil/legado), já validado do cliente.
        localId,
        productId,
        quantidade,
        valor,
        status: 'agendada',
        scheduledAt,
        cobrancaStatus: 'pendente',
        notes: input.notes?.trim() || null,
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  // ── CONFIRMAR (entregue + GPS + efeitos atrás de flag) ──────────────────────
  /**
   * Marca a entrega como 'entregue' com o GPS capturado no celular. Só DEPOIS
   * de gravar o status/GPS é que os efeitos rodam — e SÓ se a flag estiver ON.
   */
  async confirmarEntrega(
    companyId: number,
    id: string,
    gps: ConfirmarGps,
    actor?: LogisticaActor | null,
  ): Promise<ConfirmarResult | null> {
    if (!companyId || !id) return null;
    const actorWhere = actor ? await this.requireOperacao().whereForActor(actor) : {};
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId, ...actorWhere },
      select: {
        id: true, status: true, customerProfileId: true, contatoId: true, valor: true,
        // MULTILOCAL (10/07) — o local da entrega decide ONDE o GPS de ouro converge.
        localId: true,
        cobrancaStatus: true, idempotencyKey: true, whatsappStatus: true, cobrancaOutcome: true,
        comprovanteCodigoHash: true, comprovanteCodigoSalt: true,
      },
    });
    if (!entrega) return null;

    // M8 (offline-first) — REPLAY idempotente por key: se esta entrega JÁ tem a MESMA
    // idempotencyKey gravada, esta é uma reentrega da fila offline (drenou depois de
    // reconectar). NÃO re-executa NADA (nem status, nem WhatsApp, nem charge) — devolve
    // o desfecho da confirmação original. É a idempotência DURA pedida no M8, casada
    // com a idempotência por status (jaEntregue) que já existia.
    const key = normalizeIdempotencyKey(gps.idempotencyKey);
    if (key && entrega.idempotencyKey && entrega.idempotencyKey === key) {
      // A key só é gravada DEPOIS que o status virou 'entregue' (transação do Passo 1),
      // então uma key casada = a entrega FOI confirmada — reporta 'entregue' sempre.
      return {
        id: entrega.id,
        status: 'entregue',
        effectsEnabled: this.effectsEnabled,
        whatsappSent: entrega.whatsappStatus === 'enviado',
        cobrancaLancada: entrega.cobrancaOutcome === 'lancada',
        replayed: true,
      };
    }

    if (entrega.status === 'cancelada') {
      throw new BadRequestException('Entrega cancelada não pode ser confirmada.');
    }
    if (entrega.status === 'entregue') {
      return {
        id: entrega.id,
        status: 'entregue',
        effectsEnabled: this.effectsEnabled,
        whatsappSent: entrega.whatsappStatus === 'enviado',
        cobrancaLancada: entrega.cobrancaOutcome === 'lancada',
        replayed: true,
      };
    }

    // Antes de qualquer transação/efeito, garante que a entrega está coberta
    // pelo bloco Essencial pago. Fecha o caso de uma 6ª parada sincronizada no
    // snapshot cujo novo bloco não pôde ser debitado.
    if (this.routeBilling) {
      await this.routeBilling.assertEssentialDeliveryCovered(companyId, entrega.id);
    }

    const lat = typeof gps.lat === 'number' && Number.isFinite(gps.lat) ? gps.lat : null;
    const lng = typeof gps.lng === 'number' && Number.isFinite(gps.lng) ? gps.lng : null;

    // M4 — desfecho do pagamento: só um dos métodos aceitos é gravado (o resto é
    // ignorado). Vem da folha de chegada SOMENTE quando o cliente é 'aberto' + módulo
    // financeiro ON; costumeiro/OFF nunca manda. A CRIAÇÃO do charge é M6 — aqui só
    // registra o método e marca recebidoNaHora quando pago no ato.
    let receiptMethod = normalizeReceipt(gps.receiptMethod);
    // FIX (M6, 11/07) — BUG real em prod: cliente 'na_hora' tem método FIXO
    // (CustomerProfile.metodoPadrao), e o front por design NUNCA manda receiptMethod
    // pra ele (chips de recebimento só aparecem pro 'aberto' — costumeiro ganha a
    // folha de chegada mais simples, ver comentário do schema em CustomerProfile).
    // Sem isto, receiptMethod ficava NULL e o M6 (lancarCobranca, abaixo) nunca
    // quitava o charge — dinheiro recebido em mãos virava "dívida" no financeiro do
    // cliente. O front SEMPRE ganha quando manda (cliente 'aberto'); isto só cobre a
    // AUSÊNCIA, derivando o método da CONTA quando é na_hora + metodoPadrao fixo.
    // 'pendura'/'mensal'/'aberto' sem escolha do motorista ficam INALTERADOS (null
    // segue null — nada de quitar sem método imediato).
    if (!receiptMethod) {
      const contaPagamento = await this.prisma.customerProfile.findFirst({
        where: { id: entrega.customerProfileId, companyId },
        select: { formaPagamento: true, metodoPadrao: true },
      });
      const metodoPadrao = normalizeReceipt(contaPagamento?.metodoPadrao);
      if (contaPagamento?.formaPagamento === 'na_hora' && (metodoPadrao === 'pix' || metodoPadrao === 'dinheiro')) {
        receiptMethod = metodoPadrao;
      }
    }
    const recebidoNaHora = receiptMethod === 'pix' || receiptMethod === 'dinheiro' ? true : undefined;

    // Passo 1 (SEMPRE): grava status/GPS + as quantidades por item numa MESMA TRANSAÇÃO.
    // R3 — atomicidade do NÚCLEO do confirmar: ou o status 'entregue'/GPS E as qtd dos
    // itens caem juntos, ou nada cai (rollback). Assim o desfecho fica CONSISTENTE — não
    // existe "entregue com itens pela metade". A transação envolve APENAS escrita local
    // (Entrega + EntregaItem desta entrega); os efeitos externos (WhatsApp blindado +
    // cobrança) ficam FORA da tx, como antes — nada de I/O externo dentro de transação.
    // Idempotente: reconfirmar não duplica efeito (jaEntregue barra o Passo 2).
    const jaEntregue = entrega.status === 'entregue';
    const itensValidos = Array.isArray(gps.itens)
      ? gps.itens
          .map((it) => ({ id: String(it?.id || '').trim(), qtd: Number(it?.qtdEntregue) }))
          .filter((it) => it.id && Number.isFinite(it.qtd))
      : [];
    // F2 — produtos NOVOS a criar (qtd<=0 é no-op: nada a adicionar). productId
    // precisa ser um inteiro positivo; o resto (existência/empresa) é resolvido
    // DENTRO da tx (company-scoped — regra de ouro do preço vem junto).
    const novosItensValidos = Array.isArray(gps.novosItens)
      ? gps.novosItens
          .map((it) => ({ productId: Math.trunc(Number(it?.productId)), qtd: Number(it?.qtdEntregue) }))
          .filter((it) => Number.isInteger(it.productId) && it.productId > 0 && Number.isFinite(it.qtd) && it.qtd > 0)
      : [];
    // M8 — grava a idempotencyKey (unique) JUNTO com o status/GPS. Só grava se ainda
    // não houver key nesta entrega (a 1ª confirmação vence). Se o INSERT bater no
    // unique (P2002 — outra reentrega da MESMA key ganhou a corrida), tratamos como
    // REPLAY: nada foi re-executado por nós, devolvemos o desfecho já gravado.
    const gravarKey = key && !entrega.idempotencyKey ? key : undefined;
    // F1 — valor que a cobrança vai usar (recalculado na tx quando o stepper mudou).
    let valorCobranca = entrega.valor;
    // Rota Rastreada: reserva e debita antes do efeito. A claim só é concluída
    // dentro da MESMA transação do status da Entrega; qualquer rollback abaixo
    // aciona estorno idempotente no catch.
    let trackedCharge: PreparedTrackedDeliveryCharge | null = null;
    if (this.trackedBilling) {
      trackedCharge = await this.trackedBilling.prepareDeliveryCompletion(
        companyId,
        entrega.id,
        actorIdOrNull(actor),
      );
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const validacao = this.operacao
          ? await this.operacao.validarParaConfirmacao(tx, companyId, entrega, gps, actor)
          : { ids: [] as string[], exigiuComprovante: false };
        const confirmadoAt = new Date();
        if (trackedCharge && this.trackedBilling) {
          await this.trackedBilling.completeWithinTransaction(tx, trackedCharge, confirmadoAt);
        }
        await tx.entrega.update({
          where: { id: entrega.id },
          data: {
            status: 'entregue',
            deliveredAt: confirmadoAt,
            deliveredLat: lat,
            deliveredLng: lng,
            startedAt: undefined,
            receiptMethod: receiptMethod ?? undefined,
            recebidoNaHora,
            idempotencyKey: gravarKey,
            confirmadoPorUserId: actorIdOrNull(actor),
            comprovanteConfirmadoAt: validacao.exigiuComprovante ? confirmadoAt : undefined,
          },
        });
        if (validacao.ids.length > 0) {
          await (tx as any).entregaComprovante.updateMany({
            where: { id: { in: validacao.ids }, companyId, entregaId: entrega.id, status: 'pendente' },
            data: { status: 'confirmado', confirmadoAt },
          });
        }
        // M4 — quantidades do stepper por item. Só toca EntregaItem DESTA entrega (isolado
        // por entregaId). Dentro da tx: se algo aqui falhar, o status também não muda.
        for (const it of itensValidos) {
          await tx.entregaItem.updateMany({
            where: { id: it.id, entregaId: entrega.id },
            data: { qtdEntregue: Math.max(0, Math.trunc(it.qtd)) },
          });
        }
        // F2 — produtos NOVOS incluídos/trocados NA folha de chegada. SÓ roda na 1ª
        // confirmação (jaEntregue barra — reconfirmar não recria); o replay pela
        // MESMA idempotencyKey nem chega aqui (retorna ANTES da tx, lá em cima).
        // Preço SEMPRE do servidor (regra de ouro): resolve o Product COMPANY-SCOPED
        // (produto de outro tenant/inexistente = ignora, best-effort). Usa o preço
        // de CATÁLOGO — o MESMO que o front mostra no QR Pix do ato — pra a cobrança
        // registrada ser IDÊNTICA ao que o cliente paga no QR (o precoAcordado do
        // ClienteProduto vale p/ o item PLANEJADO/recorrente, que já vem com seu
        // valorUnit gravado; um add avulso na chegada é preço de tabela). O payload
        // do cliente NUNCA carrega preço (DTO nem aceita o campo).
        let itensNovosCriados = 0;
        if (!jaEntregue) {
          for (const novo of novosItensValidos) {
            const product = await tx.product.findFirst({
              where: { id: novo.productId, companyId },
              select: { id: true, price: true, priceCents: true },
            });
            if (!product) {
              this.logger.warn(
                `[logistica] F2 novoItem produto=${novo.productId} fora da empresa/inexistente — ignorado (entrega=${entrega.id}).`,
              );
              continue;
            }
            const precoCatalogo =
              typeof product.priceCents === 'number' ? product.priceCents / 100 : typeof product.price === 'number' ? product.price : 0;
            await tx.entregaItem.create({
              data: {
                entregaId: entrega.id,
                productId: product.id,
                qtdPrevista: novo.qtd,
                qtdEntregue: novo.qtd,
                valorUnit: Math.max(0, precoCatalogo),
              },
            });
            itensNovosCriados += 1;
          }
        }

        // F1/F2 — o stepper mudou a quantidade OU um produto novo entrou → o VALOR
        // da entrega acompanha (Σ qtdEntregue×valorUnit de TODOS os itens, existentes
        // + novos). Sem isso a cobrança nasce do valor PREVISTO (entregou 3, cobrava 2)
        // ou ignora o produto que acabou de entrar. Só recalcula quando o payload
        // TROUXE itens/novoItem e há item com preço; entrega legada intocada (sem
        // EntregaItem/sem valorUnit) mantém o valor escalar de sempre.
        if (!jaEntregue && (itensValidos.length > 0 || itensNovosCriados > 0)) {
          // F2 — só importa quando um item NOVO entrou (é a única situação em que a
          // contagem de ANTES difere de AGORA): decide se a soma dos itens SUBSTITUI
          // o valor (já havia EntregaItem — comportamento F1 clássico) ou se SOMA ao
          // valor escalar legado (entrega sem EntregaItem nenhum antes desta chamada
          // — ex.: agendada avulsa — ganhando seu 1º item agora: aditivo, não apaga
          // o valor que já existia).
          const haviaItensAntes =
            itensNovosCriados === 0 || (await tx.entregaItem.count({ where: { entregaId: entrega.id } })) > itensNovosCriados;
          const itensRows = await tx.entregaItem.findMany({
            where: { entregaId: entrega.id },
            select: { qtdPrevista: true, qtdEntregue: true, valorUnit: true },
          });
          if (itensRows.length > 0 && itensRows.some((it) => (Number(it.valorUnit) || 0) > 0)) {
            const somaItens = round2(
              itensRows.reduce(
                (sum, it) => sum + Math.max(0, it.qtdEntregue ?? it.qtdPrevista ?? 0) * Math.max(0, Number(it.valorUnit) || 0),
                0,
              ),
            );
            const novo = haviaItensAntes ? somaItens : round2(entrega.valor + somaItens);
            if (novo !== entrega.valor) {
              await tx.entrega.update({ where: { id: entrega.id }, data: { valor: novo } });
              valorCobranca = novo;
            }
          }
        }
      });
    } catch (e: any) {
      if (trackedCharge && this.trackedBilling) {
        await this.trackedBilling.refundFailedCompletion(
          trackedCharge,
          e,
          actorIdOrNull(actor),
        );
      }
      // Corrida de reentregas com a MESMA key: a unique barrou. Não re-executa efeito —
      // relê o desfecho já persistido e devolve como replay (idempotência dura do M8).
      if (isUniqueViolation(e)) {
        const atual = await this.prisma.entrega.findFirst({
          where: { id: entrega.id, companyId },
          select: { id: true, whatsappStatus: true, cobrancaOutcome: true },
        });
        return {
          id: entrega.id,
          status: 'entregue',
          effectsEnabled: this.effectsEnabled,
          whatsappSent: atual?.whatsappStatus === 'enviado',
          cobrancaLancada: atual?.cobrancaOutcome === 'lancada',
          replayed: true,
        };
      }
      throw e;
    }

    // B1 — realimenta a coordenada da porta real com o GPS de ouro (best-effort,
    // FORA da tx do confirmar — mesmo padrão do persistirDesfecho). MULTILOCAL
    // (10/07): quando a entrega tem um LOCAL, o pino que converge é o do LOCAL (cada
    // porta tem sua coordenada própria); sem local = o do perfil (legado).
    if (entrega.localId) {
      await this.realimentarCoordenadaLocal(companyId, entrega.localId, { lat, lng, accuracy: gps.accuracy });
    } else {
      await this.realimentarCoordenadaCliente(companyId, entrega.customerProfileId, { lat, lng, accuracy: gps.accuracy });
    }

    // Passo 2 (SÓ com a flag ON e SÓ na primeira confirmação): os efeitos externos.
    // Enquanto HBX_LOGISTICA_ENABLED OFF → nenhum WhatsApp, nenhuma cobrança.
    //
    // R4 — FALHA VISÍVEL: o desfecho dos DOIS efeitos é PERSISTIDO na Entrega
    // (whatsappStatus/whatsappMotivo + cobrancaOutcome), não só logado. Se algum
    // efeito FALHA, emite UM MasterEvent (trilha do cockpit master). Best-effort:
    // gravar o desfecho/emitir o evento NUNCA pode derrubar o confirmar.
    let whatsappSent = false;
    let cobrancaLancada = false;
    if (this.effectsEnabled && !jaEntregue) {
      const wa = await this.dispararWhatsappEntregue(companyId, entrega).catch((e) => {
        this.logger.warn(`[logistica] whatsapp entregue falhou entrega=${entrega.id}: ${String(e?.message || e)}`);
        return { status: 'falhou' as WhatsappStatus, motivo: 'erro' };
      });
      whatsappSent = wa.status === 'enviado';

      const cob = await this.lancarCobranca(companyId, { ...entrega, valor: valorCobranca }, receiptMethod).catch((e) => {
        this.logger.warn(`[logistica] cobrança falhou entrega=${entrega.id}: ${String(e?.message || e)}`);
        return { lancada: false, outcome: 'falhou' as CobrancaOutcome };
      });
      cobrancaLancada = cob.lancada;

      // Persiste o desfecho (aditivo, best-effort — não muda o retorno se falhar).
      await this.persistirDesfecho(entrega.id, wa, cob.outcome);

      // Um efeito que falhou VIRA evento no cockpit master (dedup por entrega+tipo).
      if (wa.status === 'falhou' || cob.outcome === 'falhou') {
        await this.emitirFalhaEfeito(companyId, entrega.id, wa, cob.outcome);
      }
    }

    // M3 — re-ETA das paradas restantes (aditivo, best-effort, não muda o retorno).
    await this.recalcularEtaSilencioso(companyId, actor);

    return { id: entrega.id, status: 'entregue', effectsEnabled: this.effectsEnabled, whatsappSent, cobrancaLancada };
  }

  // ── R4 — persistir o desfecho dos efeitos (não só logar) ────────────────────
  /**
   * Grava na Entrega o desfecho dos efeitos do confirmar: whatsappStatus/whatsappMotivo
   * (enviado|falhou|pulado + razão curta) e cobrancaOutcome (espelha o desfecho do
   * lancarCobranca). Best-effort: se a escrita falhar, só loga — o confirmar já
   * gravou o status 'entregue' antes; um erro AQUI não pode reverter a entrega.
   */
  private async persistirDesfecho(
    entregaId: string,
    wa: WhatsappResult,
    cobrancaOutcome: CobrancaOutcome,
  ): Promise<void> {
    try {
      await this.prisma.entrega.update({
        where: { id: entregaId },
        data: {
          whatsappStatus: wa.status,
          whatsappMotivo: wa.motivo ?? null,
          cobrancaOutcome,
        },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] persistirDesfecho entrega=${entregaId} falhou: ${String(e?.message || e)}`);
    }
  }

  // ── B1 — GPS de ouro jogado fora: realimenta o cadastro do cliente ──────────
  /**
   * B1 (07/07) — o pino do cadastro nasce de geocode (CEP→Nominatim), impreciso
   * no BR (número de casa raro no OSM) → o geofence quase nunca dispara certo.
   * Ao confirmar com GPS PRECISO (accuracy<=60m), atualiza CustomerProfile.lat/lng
   * + geoFonte='gps_entrega' — a porta CONVERGE a cada entrega (última vence).
   * NUNCA sobrescreve uma coordenada marcada 'gps_cadastro' (o dono usou "Usar
   * este local" no cadastro — decisão humana explícita, intocável). Best-effort
   * FORA da transação do confirmar: falha aqui NUNCA reverte a entrega (mesmo
   * padrão do persistirDesfecho).
   */
  private async realimentarCoordenadaCliente(
    companyId: number,
    customerProfileId: string,
    gps: { lat: number | null; lng: number | null; accuracy?: number },
  ): Promise<void> {
    if (typeof gps.lat !== 'number' || typeof gps.lng !== 'number') return;
    if (typeof gps.accuracy !== 'number' || !Number.isFinite(gps.accuracy) || gps.accuracy > 60) return;
    try {
      const conta = await this.prisma.customerProfile.findFirst({
        where: { id: customerProfileId, companyId },
        select: { geoFonte: true },
      });
      if (!conta || conta.geoFonte === 'gps_cadastro') return; // decisão humana intocável.
      await this.prisma.customerProfile.update({
        where: { id: customerProfileId },
        data: { lat: gps.lat, lng: gps.lng, geoFonte: 'gps_entrega' },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] realimentarCoordenada cliente=${customerProfileId} falhou: ${String(e?.message || e)}`);
    }
  }

  // ── B1 + MULTILOCAL — realimenta o GPS de ouro no LOCAL da entrega ──────────
  /**
   * MULTILOCAL (10/07) — espelho de realimentarCoordenadaCliente para quando a
   * entrega tem um LOCAL: o GPS PRECISO (accuracy<=60m) da porta real atualiza
   * LocalEntrega.lat/lng + geoFonte='gps_entrega' (cada endereço do cliente
   * converge sozinho). NUNCA sobrescreve 'gps_cadastro' (decisão humana intocável,
   * mesma regra do perfil). company-scoped; best-effort FORA da tx do confirmar:
   * falha aqui NUNCA reverte a entrega.
   */
  private async realimentarCoordenadaLocal(
    companyId: number,
    localId: string,
    gps: { lat: number | null; lng: number | null; accuracy?: number },
  ): Promise<void> {
    if (typeof gps.lat !== 'number' || typeof gps.lng !== 'number') return;
    if (typeof gps.accuracy !== 'number' || !Number.isFinite(gps.accuracy) || gps.accuracy > 60) return;
    try {
      const local = await this.prisma.localEntrega.findFirst({
        where: { id: localId, companyId },
        select: { geoFonte: true },
      });
      if (!local || local.geoFonte === 'gps_cadastro') return; // decisão humana intocável.
      await this.prisma.localEntrega.update({
        where: { id: localId },
        data: { lat: gps.lat, lng: gps.lng, geoFonte: 'gps_entrega' },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] realimentarCoordenadaLocal local=${localId} falhou: ${String(e?.message || e)}`);
    }
  }

  /**
   * R4 — um efeito que FALHOU vira UM MasterEvent na trilha do cockpit master
   * (reusa emitMasterEvent — best-effort por contrato, nunca lança). Dedup por
   * entrega: 1 fato de falha por entrega não metralha a trilha. Cockpit-UI é
   * frontend (adiado); aqui só emitimos o evento.
   */
  private async emitirFalhaEfeito(
    companyId: number,
    entregaId: string,
    wa: WhatsappResult,
    cobrancaOutcome: CobrancaOutcome,
  ): Promise<void> {
    const whatsappFalhou = wa.status === 'falhou';
    const cobrancaFalhou = cobrancaOutcome === 'falhou';
    await emitMasterEvent(this.prisma, {
      type: 'logistica.efeito_falhou',
      severity: 'attention',
      companyId,
      dedupKey: `logistica.efeito_falhou:${entregaId}`,
      payload: {
        entregaId,
        state: `wa=${wa.status}${whatsappFalhou ? `(${wa.motivo ?? 'erro'})` : ''};cob=${cobrancaOutcome}`,
        whatsappFalhou,
        whatsappMotivo: whatsappFalhou ? wa.motivo ?? 'erro' : null,
        cobrancaFalhou,
      },
    });
  }

  // ── R4 — REENVIAR aviso (ADMIN, teto DURO de 1, caminho blindado) ───────────
  /**
   * Reenvia o aviso "entregue" de UMA entrega — SOMENTE pelo caminho blindado
   * (dispararWhatsappEntregue → queueOutboundForCompany). TETO DURO: 1 reenvio
   * manual por entrega (guarda avisoReenviado). ZERO loop/retry automático — o
   * segundo clique é BARRADO (loop de reconexão = chip banido). Atualiza o
   * whatsappStatus persistido com o desfecho. Company-scoped. Só reenvia entrega
   * JÁ 'entregue' (não faz sentido avisar entrega não concluída).
   */
  async reenviarAviso(companyId: number, id: string): Promise<ReenviarAvisoResult | null> {
    if (!companyId || !id) return null;
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true, status: true, customerProfileId: true, contatoId: true, avisoReenviado: true },
    });
    if (!entrega) return null;
    if (entrega.status !== 'entregue') {
      throw new BadRequestException('Só é possível reenviar o aviso de uma entrega já concluída.');
    }
    // TETO DURO: 1 reenvio manual por entrega. Segundo clique = barrado (sem loop).
    if (entrega.avisoReenviado) {
      throw new BadRequestException('O aviso desta entrega já foi reenviado (limite de 1 reenvio).');
    }

    // Marca o teto ANTES de disparar (idempotência dura: mesmo sob 2 cliques
    // simultâneos, só o primeiro passa a flag de false→true e segue; o outro
    // pega o registro já reenviado). updateMany com guarda no WHERE = atômico.
    const claim = await this.prisma.entrega.updateMany({
      where: { id: entrega.id, companyId, avisoReenviado: false },
      data: { avisoReenviado: true },
    });
    if (!claim.count) {
      // Corrida perdida: outra chamada já reenviou. NÃO dispara de novo.
      throw new BadRequestException('O aviso desta entrega já foi reenviado (limite de 1 reenvio).');
    }

    // Dispara SÓ pelo caminho blindado (mesma rotina do confirmar). Uma mensagem.
    const wa = await this.dispararWhatsappEntregue(companyId, {
      id: entrega.id,
      customerProfileId: entrega.customerProfileId,
      contatoId: entrega.contatoId,
    }).catch((e) => {
      this.logger.warn(`[logistica] reenviar aviso entrega=${entrega.id} falhou: ${String(e?.message || e)}`);
      return { status: 'falhou' as WhatsappStatus, motivo: 'erro' };
    });

    // Atualiza o desfecho persistido do WhatsApp (a cobrança NÃO é tocada no reenvio).
    try {
      await this.prisma.entrega.update({
        where: { id: entrega.id },
        data: { whatsappStatus: wa.status, whatsappMotivo: wa.motivo ?? null },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] reenviar aviso persist entrega=${entrega.id} falhou: ${String(e?.message || e)}`);
    }

    if (wa.status === 'falhou') {
      await this.emitirFalhaEfeito(companyId, entrega.id, wa, 'nao_avaliada');
    }

    return { id: entrega.id, whatsappStatus: wa.status, motivo: wa.motivo ?? null, reenviado: true };
  }

  // ── CANCELAR ────────────────────────────────────────────────────────────────
  async cancelarEntrega(
    companyId: number,
    id: string,
    motivo?: string,
    actor?: LogisticaActor | null,
  ): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const actorWhere = actor ? await this.requireOperacao().whereForActor(actor) : {};
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId, ...actorWhere },
      select: { id: true, status: true, notes: true },
    });
    if (!entrega) return null;
    if (entrega.status === 'entregue') {
      throw new BadRequestException('Entrega já concluída não pode ser cancelada.');
    }
    const notes = motivo?.trim()
      ? `${entrega.notes ? entrega.notes + ' | ' : ''}Cancelada: ${motivo.trim()}`.slice(0, 500)
      : entrega.notes;
    await this.prisma.entrega.update({
      where: { id: entrega.id },
      data: { status: 'cancelada', notes },
    });
    // M3 — re-ETA das paradas restantes (aditivo, best-effort, não muda o retorno).
    await this.recalcularEtaSilencioso(companyId, actor);
    return { id: entrega.id };
  }

  // ── SOFT-DELETE (R3 — padrão DeletionRecord do repo) ────────────────────────
  /**
   * R3 (05/07) — soft-delete de uma ENTREGA: snapshot em DeletionRecord + esconde
   * marcando 'cancelada' (a Entrega tem coluna de status; não some do banco, sai da
   * rota). ATÔMICO ($transaction: snapshot + esconde caem juntos). Company-scoped
   * (isolamento duro). Idempotente (já cancelada = no-op). NÃO dispara nada externo.
   */
  async softDeleteEntrega(
    companyId: number,
    id: string,
    opts: { deletedByUserId?: number | null; motivo?: string | null; actor?: LogisticaActor | null } = {},
  ): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const actorWhere = opts.actor ? await this.requireOperacao().whereForActor(opts.actor) : {};
    const row = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId, ...actorWhere },
      select: {
        id: true, companyId: true, customerProfileId: true, contatoId: true, productId: true,
        quantidade: true, valor: true, status: true, scheduledAt: true, deliveredAt: true,
        cobrancaStatus: true, notes: true,
      },
    });
    if (!row) return null;
    if (row.status === 'cancelada') return { id: row.id }; // idempotente

    await this.prisma.$transaction(async (tx) => {
      await tx.deletionRecord.create({
        data: {
          moduleKey: 'logistica',
          entityType: 'Entrega',
          entityId: row.id,
          companyId,
          motivo: opts.motivo ?? null,
          snapshot: JSON.stringify(row),
          deletedByUserId: opts.deletedByUserId ?? null,
        },
      });
      await tx.entrega.update({
        where: { id: row.id },
        data: {
          status: 'cancelada',
          notes: `${row.notes ? row.notes + ' | ' : ''}Excluída (soft-delete)`.slice(0, 500),
        },
      });
    });
    return { id: row.id };
  }

  // ── EFEITO 1: WhatsApp "entregue" (caminho blindado, sem loop/socket/API-crua) ─
  /**
   * SOMENTE via queueOutboundForCompany (disjuntor/1-número=1-conexão/outbox).
   * Uma mensagem, on-success, acabou. Sem telefone = no-op silencioso.
   *
   * R4 — devolve um resultado RICO ({status, motivo}) em vez de bool, para o
   * caller PERSISTIR o desfecho na Entrega e emitir MasterEvent na falha:
   *   'enviado'         → enfileirado no caminho blindado.
   *   'pulado' + motivo → 'aviso_off' (global/cliente) ou 'sem_telefone'.
   *   'falhou' + motivo → exceção do caminho blindado (caller trata no catch).
   */
  private async dispararWhatsappEntregue(
    companyId: number,
    entrega: { id: string; customerProfileId: string; contatoId: string | null },
  ): Promise<WhatsappResult> {
    // M5 — a CONTA manda: o telefone, o nome do cliente e o toggle avisarEntrega.
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: entrega.customerProfileId, companyId },
      select: { name: true, phone: true, phoneNormalized: true, avisarEntrega: true },
    });

    // M5 — 2 níveis de aviso: global (LogisticaConfig.avisoWhatsEnabled) + por
    // cliente (avisarEntrega). Se qualquer um estiver OFF, NÃO dispara (no-op).
    const aviso = await this.config.resolverAviso(companyId, conta?.avisarEntrega);
    if (!aviso.habilitado) {
      this.logger.log(`[logistica] entrega=${entrega.id} aviso desligado (global/cliente) — WhatsApp pulado (no-op).`);
      return { status: 'pulado', motivo: 'aviso_off' };
    }

    // Destinatário: o contato da entrega (whatsapp/phone) ou o telefone da conta.
    //
    // BUG 1b (09/07, defense-in-depth) — se a Entrega chegou aqui SEM contatoId
    // (dado legado, ou uma entrega criada antes do fix de gerarDia/createEntrega),
    // NÃO cai direto no telefone da conta: primeiro tenta o contato PRINCIPAL da
    // conta (a mesma resolução usada na criação). Só cai no CustomerProfile.phone
    // se a conta REALMENTE não tiver nenhum contato cadastrado.
    let contact = '';
    let nome = String(conta?.name || '').trim();
    let contato: { nome: string | null; whatsapp: string | null; phone: string | null } | null = null;
    if (entrega.contatoId) {
      contato = await this.prisma.contato.findFirst({
        where: { id: entrega.contatoId, companyId },
        select: { nome: true, whatsapp: true, phone: true },
      });
    } else {
      try {
        contato = await resolvePrincipalContato(this.prisma as any, companyId, entrega.customerProfileId);
      } catch (e: any) {
        this.logger.warn(`[logistica] entrega=${entrega.id} resolvePrincipalContato falhou: ${String(e?.message || e)}`);
      }
    }
    if (contato) {
      contact = String(contato.whatsapp || contato.phone || '').trim();
      if (contato.nome) nome = String(contato.nome).trim();
    }
    if (!contact) {
      contact = String(conta?.phoneNormalized || conta?.phone || '').trim();
    }
    if (!contact) {
      this.logger.log(`[logistica] entrega=${entrega.id} sem telefone — WhatsApp pulado (no-op).`);
      return { status: 'pulado', motivo: 'sem_telefone' };
    }

    // BUG 2 (09/07) — normaliza pro E.164 BR ANTES de enfileirar. O caminho do
    // atendimento nunca precisa disso porque `conversation.contact` nasce do JID
    // inbound (que já vem com o DDI). Aqui a mensagem PARTE de um telefone cru
    // (Contato.whatsapp/phone ou CustomerProfile.phone, gravados como dígitos sem
    // país) — sem normalizar, o Webwhats recebe "+19996015804" (sem o 55) e recusa
    // (Bad Request). Mesmo algoritmo do vendas-automation/self-alert (55 só entra
    // se ainda não estiver lá — não duplica).
    contact = normalizeBrPhoneE164(contact) || contact;

    // M5 — variáveis do template a partir dos itens efetivamente entregues (M2/M4).
    const vars = await this.montarVarsAviso(companyId, entrega.id, nome);

    // Template do admin (M5) OU a mensagem fixa de fallback (comportamento antigo).
    const body = aviso.template
      ? renderTemplateAviso(aviso.template, vars)
      : `${nome ? `Olá, ${nome}! ` : 'Olá! '}Sua entrega foi concluída. Obrigado pela preferência!`;

    // Guard defensivo: template que renderiza vazio não vira mensagem em branco.
    const finalBody = body.trim() || 'Sua entrega foi concluída. Obrigado pela preferência!';

    // MESMO caminho da cadência (queueOutboundForCompany) — disjuntor, 1-número=1-conexão,
    // gate de conexão viva, warmup e outbox com retry. NUNCA API crua, NUNCA socket novo.
    await this.conversations.queueOutboundForCompany(companyId, {
      to: contact,
      contactId: contact,
      body: finalBody,
      messageType: 'text',
      sourceModule: 'logistica_entrega',
      senderType: 'system',
      variables: { module: 'logistica', event: 'entregue', entregaId: entrega.id },
      flowState: { botActive: false, humanAssigned: false, flowResult: null },
    });
    return { status: 'enviado', motivo: null };
  }

  /**
   * M5 — monta as variáveis do template a partir dos EntregaItem (entregues, com
   * fallback pra qtdPrevista) + o legado escalar da Entrega. Best-effort: se algo
   * falhar, devolve vars mínimas (só o cliente) — a mensagem ainda sai.
   *   {itens}   = "2× Galão 20L, 1× Água com gás"
   *   {qtd}     = soma das quantidades
   *   {quantidade} = soma das quantidades
   *   {produto} = nome do produto principal (o primeiro item / o produto legado)
   *   {empresa} = nome da empresa
   */
  private async montarVarsAviso(
    companyId: number,
    entregaId: string,
    cliente: string,
  ): Promise<{ cliente: string; itens: string; qtd: number; quantidade: number; produto: string; empresa: string }> {
    const vars = { cliente, itens: '', qtd: 0, quantidade: 0, produto: '', empresa: '' };
    try {
      const entrega = await this.prisma.entrega.findFirst({
        where: { id: entregaId, companyId },
        select: {
          quantidade: true,
          company: { select: { name: true } },
          product: { select: { name: true, unidade: true } },
          itens: {
            select: {
              qtdPrevista: true,
              qtdEntregue: true,
              product: { select: { name: true, unidade: true } },
            },
          },
        },
      });
      if (!entrega) return vars;
      vars.empresa = String(entrega.company?.name || '').trim();

      const linhas: string[] = [];
      let total = 0;
      if (Array.isArray(entrega.itens) && entrega.itens.length > 0) {
        for (const it of entrega.itens) {
          const q = it.qtdEntregue ?? it.qtdPrevista ?? 0;
          const nomeProd = String(it.product?.name || '').trim();
          if (nomeProd) linhas.push(`${q}× ${nomeProd}`);
          total += Number(q) || 0;
          if (!vars.produto && nomeProd) vars.produto = nomeProd;
        }
      } else if (entrega.product) {
        const q = entrega.quantidade ?? 0;
        const nomeProd = String(entrega.product.name || '').trim();
        if (nomeProd) linhas.push(`${q}× ${nomeProd}`);
        total += Number(q) || 0;
        vars.produto = nomeProd;
      }
      vars.itens = linhas.join(', ');
      vars.qtd = total;
      vars.quantidade = total;
    } catch (e: any) {
      this.logger.warn(`[logistica] montarVarsAviso entrega=${entregaId} falhou: ${String(e?.message || e)}`);
    }
    return vars;
  }

  // ── EFEITO 1b: WhatsApp "chegando" (~500m) — MESMO caminho blindado ──────────
  /**
   * AVISO-CHEGANDO (11/07) — ESPELHO de dispararWhatsappEntregue (MESMO
   * queueOutboundForCompany, MESMA normalização E.164, MESMA montarVarsAviso),
   * com 2 diferenças:
   *
   *   TRAVA TRIPLA — effectsEnabled (a MESMA flag HBX_LOGISTICA_ENABLED) E
   *   config.avisoChegandoEnabled E consentimento por cliente (avisarEntrega — o
   *   MESMO opt-out do aviso "entregue": quem não quer um, não quer o outro).
   *   Qualquer um OFF → no-op silencioso (log + 'pulado'). INDEPENDENTE do aviso
   *   "entregue" (avisoWhatsEnabled): a empresa pode ligar só um dos dois.
   *
   *   IDEMPOTÊNCIA RACE-SAFE — CLAIM-antes-de-enviar via updateMany(WHERE
   *   avisoChegandoAt IS NULL). Só quem "ganha" o claim (count===1) segue pro
   *   envio; 2 chamadas simultâneas do app (bug de re-render, rede lenta) NUNCA
   *   disparam 2 WhatsApp. Se o enqueue falhar DEPOIS do claim, o motivo devolvido
   *   é 'falhou' e a entrega FICA marcada como avisada — de propósito (melhor
   *   perder 1 aviso do que arriscar reenvio em loop).
   *
   * Chamado por `avisarChegando` (público), que já resolveu a Entrega (id +
   * customerProfileId + contatoId) — MESMO shape de parâmetro do entregue.
   */
  private async dispararWhatsappChegando(
    companyId: number,
    entrega: { id: string; customerProfileId: string; contatoId: string | null },
  ): Promise<WhatsappResult> {
    // Trava 1 — kill switch global (a MESMA flag do confirmar/entregue). Barato
    // (sem I/O): checa ANTES de tocar o banco.
    if (!this.effectsEnabled) {
      this.logger.log(`[logistica] entrega=${entrega.id} aviso chegando pulado — ${LogisticaService.FLAG} off.`);
      return { status: 'pulado', motivo: 'flag_off' };
    }

    // A CONTA manda: telefone, nome e o opt-out (avisarEntrega — o MESMO campo
    // do aviso "entregue"; 1 preferência do cliente cobre os dois).
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: entrega.customerProfileId, companyId },
      select: { name: true, phone: true, phoneNormalized: true, avisarEntrega: true },
    });

    // Trava 2+3 — config.avisoChegandoEnabled (global, INDEPENDENTE do
    // avisoWhatsEnabled do entregue) + avisarEntrega (cliente).
    const aviso = await this.config.resolverAvisoChegando(companyId, conta?.avisarEntrega);
    if (!aviso.habilitado) {
      this.logger.log(`[logistica] entrega=${entrega.id} aviso chegando desligado (global/cliente) — pulado (no-op).`);
      return { status: 'pulado', motivo: 'aviso_off' };
    }

    // Idempotência RACE-SAFE — CLAIM antes de enviar: só quem vira null→now
    // segue pro envio. status precisa seguir aberta (agendada/em_rota) — uma
    // entrega já entregue/cancelada não recebe "tô chegando" fora de hora.
    const claim = await this.prisma.entrega.updateMany({
      where: { id: entrega.id, companyId, avisoChegandoAt: null, status: { in: ['agendada', 'em_rota'] } },
      data: { avisoChegandoAt: new Date() },
    });
    if (claim.count === 0) {
      this.logger.log(`[logistica] entrega=${entrega.id} aviso chegando já enviado (ou entrega fechada) — pulado (no-op).`);
      return { status: 'pulado', motivo: 'ja_avisado' };
    }

    // Destinatário: MESMA resolução do entregue (contato da entrega → principal
    // da conta → telefone da conta).
    let contact = '';
    let nome = String(conta?.name || '').trim();
    let contato: { nome: string | null; whatsapp: string | null; phone: string | null } | null = null;
    if (entrega.contatoId) {
      contato = await this.prisma.contato.findFirst({
        where: { id: entrega.contatoId, companyId },
        select: { nome: true, whatsapp: true, phone: true },
      });
    } else {
      try {
        contato = await resolvePrincipalContato(this.prisma as any, companyId, entrega.customerProfileId);
      } catch (e: any) {
        this.logger.warn(`[logistica] entrega=${entrega.id} chegando resolvePrincipalContato falhou: ${String(e?.message || e)}`);
      }
    }
    if (contato) {
      contact = String(contato.whatsapp || contato.phone || '').trim();
      if (contato.nome) nome = String(contato.nome).trim();
    }
    if (!contact) {
      contact = String(conta?.phoneNormalized || conta?.phone || '').trim();
    }
    if (!contact) {
      this.logger.log(`[logistica] entrega=${entrega.id} chegando sem telefone — pulado (no-op).`);
      return { status: 'pulado', motivo: 'sem_telefone' };
    }

    // MESMA normalização E.164 BR do entregue (o telefone cru não tem DDI).
    contact = normalizeBrPhoneE164(contact) || contact;

    // MESMAS variáveis (itens/qtd/produto/empresa) do aviso "entregue" — o texto
    // do "chegando" pode citar o que está vindo.
    const vars = await this.montarVarsAviso(companyId, entrega.id, nome);

    // Template do admin (avisoChegandoTemplate) OU o fallback fixo.
    const body = aviso.template
      ? renderTemplateAviso(aviso.template, vars)
      : `${nome ? `Olá, ${nome}! ` : 'Olá! '}Estou a caminho com a sua entrega. Já estou chegando!`;

    // Guard defensivo: template que renderiza vazio não vira mensagem em branco.
    const finalBody = body.trim() || 'Estou a caminho com a sua entrega. Já estou chegando!';

    // MESMO caminho blindado (queueOutboundForCompany) — disjuntor, 1-número=1-
    // conexão, gate de conexão viva, warmup e outbox com retry. NUNCA API crua,
    // NUNCA socket novo. sourceModule/variables.event diferenciam de 'entregue'.
    await this.conversations.queueOutboundForCompany(companyId, {
      to: contact,
      contactId: contact,
      body: finalBody,
      messageType: 'text',
      sourceModule: 'logistica_chegando',
      senderType: 'system',
      variables: { module: 'logistica', event: 'chegando', entregaId: entrega.id },
      flowState: { botActive: false, humanAssigned: false, flowResult: null },
    });
    return { status: 'enviado', motivo: null };
  }

  /**
   * AVISO-CHEGANDO — entrada PÚBLICA (chamada pelo controller). Resolve a
   * Entrega (company-scoped) e delega pro caminho blindado acima. Best-effort:
   * qualquer exceção do disparo vira 'falhou' (nunca propaga) — o endpoint
   * sempre responde { ok: true }, o app não reenvia.
   */
  async avisarChegando(companyId: number, id: string, actor?: LogisticaActor | null): Promise<WhatsappResult> {
    if (!companyId || !id) return { status: 'pulado', motivo: 'invalido' };
    const actorWhere = actor ? await this.requireOperacao().whereForActor(actor) : {};
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId, ...actorWhere },
      select: { id: true, customerProfileId: true, contatoId: true },
    });
    if (!entrega) return { status: 'pulado', motivo: 'nao_encontrada' };
    return this.dispararWhatsappChegando(companyId, entrega).catch((e: any) => {
      this.logger.warn(`[logistica] whatsapp chegando falhou entrega=${entrega.id}: ${String(e?.message || e)}`);
      return { status: 'falhou' as WhatsappStatus, motivo: 'erro' };
    });
  }

  // ── EFEITO 2: cobrança conforme o CONTRATO do cliente (R2 — financeiro de verdade) ─
  /**
   * R2 (05/07) — lê os DOIS eixos do cliente (M4): `formaPagamento` (COMO/QUANDO
   * paga) e `contabilizar` (entra na contabilidade?). Decide o desfecho da entrega:
   *
   *   contabilizar=false → NÃO cria charge; entrega vira 'nao_contabilizado'. Sai.
   *   mensal             → NÃO lança por entrega; entrega vira 'aguardando_fechamento'.
   *                        O charge (1 só) nasce no fechar-mês, agrupado por diaFechamento.
   *   avulso/na_hora     → 1 FinanceiroCharge LINKADO, dueDate = hoje. Entrega 'lancada'.
   *   pendura (fiado)    → 1 FinanceiroCharge LINKADO, dueDate = regra do cliente
   *                        (diaFechamento, senão hoje). Entrega 'lancada'.
   *
   * M6 (05/07) — PAGO NA HORA: quando a forma é 'aberto'/'na_hora' E o entregador
   * marcou um método imediato ('pix'|'dinheiro') na folha de chegada, o charge nasce
   * JÁ QUITADO (status='approved', lifecycle='paid', paidAt=agora) em vez de 'pending'.
   * É a mesma linha do FinanceiroCharge — só o desfecho muda. 'pendura'/sem método →
   * 'pending' com dueDate (fiado). NADA dispara MercadoPago: paymentMethod='MANUAL',
   * a baixa é MANUAL/local (não há webhook nem preferência MP).
   *
   * O charge é o MESMO model do resto do sistema (não é caminho paralelo), marcado
   * paymentMethod='MANUAL' — NADA dispara MercadoPago.
   *
   * IDEMPOTENTE em 2 camadas: (1) guarda por cobrancaStatus já-resolvido; (2) guarda
   * por entregaId — se já existe um charge desta entrega, NÃO duplica (não paga 2×).
   */
  private async lancarCobranca(
    companyId: number,
    entrega: { id: string; customerProfileId: string; valor: number; cobrancaStatus: string },
    receiptMethod?: 'pix' | 'dinheiro' | 'fiado' | null,
  ): Promise<CobrancaResult> {
    // Camada 1: status já-resolvido (lançada/isenta/aguardando/nao_contabilizado) = no-op.
    // R4 — espelha o desfecho JÁ resolvido (mapeia p/ o vocabulário do outcome).
    if (isCobrancaResolvida(entrega.cobrancaStatus)) {
      return { lancada: false, outcome: outcomeDoStatus(entrega.cobrancaStatus) };
    }

    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: entrega.customerProfileId, companyId },
      select: { id: true, name: true, formaPagamento: true, contabilizar: true, diaFechamento: true },
    });

    // contabilizar=false → invisível à contabilidade por design (M4/M6): sem charge.
    if (conta?.contabilizar === false) {
      await this.prisma.entrega.update({
        where: { id: entrega.id },
        data: { cobrancaStatus: 'nao_contabilizado' },
      });
      return { lancada: false, outcome: 'nao_contabilizado' };
    }

    const forma = String(conta?.formaPagamento || 'aberto').trim().toLowerCase();

    // 'mensal' = fatura fecha no diaFechamento: NÃO lança por entrega. O charge (1 só,
    // agrupando N entregas) nasce no fechar-mês. A entrega fica aguardando.
    if (forma === 'mensal') {
      await this.prisma.entrega.update({
        where: { id: entrega.id },
        data: { cobrancaStatus: 'aguardando_fechamento' },
      });
      return { lancada: false, outcome: 'aguardando_fechamento' };
    }

    // Valor zero = nada a cobrar: marca isenta e sai (sem charge).
    const amount = round2(Math.max(0, Number(entrega.valor) || 0));
    if (amount <= 0) {
      await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'isenta' } });
      return { lancada: false, outcome: 'isenta' };
    }

    // Camada 2 (idempotência dura): se já existe charge DESTA entrega, não duplica.
    const jaExiste = await this.prisma.financeiroCharge.findFirst({
      where: { companyId, entregaId: entrega.id },
      select: { id: true },
    });
    if (jaExiste) {
      await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'lancada' } });
      return { lancada: false, outcome: 'lancada' };
    }

    // dueDate: avulso/na_hora = hoje; pendura (fiado) = regra do cliente (diaFechamento,
    // senão hoje). Só 'aberto'/'avulso'/'na_hora'/'pendura' chegam aqui.
    const dueDate = forma === 'pendura' ? proximoDiaFechamento(conta?.diaFechamento) : new Date();

    // M6 — PAGO NA HORA: 'aberto'/'na_hora' + método imediato ('pix'|'dinheiro') →
    // o charge nasce QUITADO. 'pendura' é fiado por definição (nunca pago na hora).
    // 'fiado' como receiptMethod também NÃO quita (é a marcação de "deixou pendurado").
    const pagoNaHora =
      forma !== 'pendura' && (receiptMethod === 'pix' || receiptMethod === 'dinheiro');
    const now = new Date();

    const nome = String(conta?.name || 'cliente').trim();
    // R3 — a criação do charge por entrega é ATÔMICA no banco: o índice UNIQUE PARCIAL
    // "FinanceiroCharge_entregaId_key" (WHERE entregaId IS NOT NULL) garante 1 charge
    // por entrega mesmo sob 2 confirmarEntrega simultâneos. Se o INSERT bater no unique
    // (P2002), a corrida foi perdida: OUTRA chamada já criou o charge desta entrega →
    // trata como "já existe" (idempotente), marca 'lancada' e NÃO propaga o erro.
    try {
      const charge = await this.prisma.financeiroCharge.create({
        data: {
          companyId,
          amount,
          currency: 'BRL',
          description: `Entrega — ${nome}`.slice(0, 180),
          // billingCycle: cobrança da entrega é PONTUAL (não recorrente) → ONCE.
          billingCycle: 'ONCE',
          paymentMethod: 'MANUAL',
          // M6 — pago na hora: charge nasce QUITADO (approved/paid/paidAt). Senão,
          // 'pending'/'in_progress' (o desfecho segue no fechar-mês ou no recovery).
          status: pagoNaHora ? 'approved' : 'pending',
          lifecycle: pagoNaHora ? 'paid' : 'in_progress',
          paidAt: pagoNaHora ? now : null,
          // R2 — LINK: cliente + entrega + origem + vencimento (mata dívidas 2/3/4).
          customerProfileId: entrega.customerProfileId,
          entregaId: entrega.id,
          sourceModule: 'logistica_entrega',
          dueDate,
          providerPayload: JSON.stringify({
            source: 'logistica_entrega',
            entregaId: entrega.id,
            forma,
            // M6 — audita como o pago-na-hora foi decidido (método imediato do ato).
            pagoNaHora,
            receiptMethod: receiptMethod ?? null,
          }),
        },
      });
      // S2 COBRANÇA-WHATS — charge que nasceu 'pending' avisa o cliente final
      // (valor + referência + Pix copia-e-cola). Pago na hora não avisa (nasceu
      // quitado). Fire-and-forget: gates todos dentro do serviço de aviso;
      // aviso perdido (ex.: sem chip) vira lembrete no vencimento.
      if (!pagoNaHora) this.avisarCobrancaLancamento(companyId, charge?.id);
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        // Corrida perdida: o charge desta entrega já foi criado por outra chamada.
        await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'lancada' } });
        return { lancada: false, outcome: 'lancada' };
      }
      throw e;
    }
    await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'lancada' } });
    return { lancada: true, outcome: 'lancada' };
  }

  // ── FECHAR-MÊS (modelo mensal): agrupa as entregas 'aguardando_fechamento' ─────
  /**
   * R2 (05/07) — fecha a fatura mensal: para cada cliente 'mensal' cujo diaFechamento
   * bate (ou p/ o clienteId informado), soma as entregas 'aguardando_fechamento' e
   * cria UM único FinanceiroCharge linkado (dueDate = diaFechamento do mês de ref),
   * marcando as entregas somadas como 'faturada'.
   *
   * ADMIN-only (controller). paymentMethod='MANUAL'/'pending' — NADA dispara MP.
   *
   * IDEMPOTENTE: só varre entregas 'aguardando_fechamento' e, ao faturar, muda p/
   * 'faturada' na MESMA transação em que cria o charge. Rodar 2× no mesmo mês não
   * acha mais nada aberto → 0 charges novos. Sem entregas abertas = no-op p/ o cliente.
   */
  async fecharMes(
    companyId: number,
    input: { clienteId?: string; mesRef?: string } = {},
  ): Promise<FecharMesResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    const ref = parseMesRef(input.mesRef);
    const clienteId = String(input.clienteId || '').trim() || null;

    // Alvo: clientes 'mensal' desta empresa. Se clienteId veio, só ele; senão, os
    // que fecham HOJE (diaFechamento === dia do mesRef). company-scoped duro.
    const clientes = await this.prisma.customerProfile.findMany({
      where: {
        companyId,
        formaPagamento: 'mensal',
        contabilizar: true,
        ...(clienteId ? { id: clienteId } : { diaFechamento: ref.dia }),
      },
      select: { id: true, name: true, diaFechamento: true },
    });

    const faturas: FecharMesFatura[] = [];
    let totalCharges = 0;

    for (const cliente of clientes) {
      // Entregas deste cliente aguardando o fechamento (idempotência: só as abertas).
      const entregas = await this.prisma.entrega.findMany({
        where: { companyId, customerProfileId: cliente.id, cobrancaStatus: 'aguardando_fechamento' },
        select: { id: true, valor: true },
      });
      if (entregas.length === 0) continue;

      const amount = round2(entregas.reduce((sum, e) => sum + Math.max(0, Number(e.valor) || 0), 0));
      const entregaIds = entregas.map((e) => e.id);
      const dueDate = fechamentoDoMes(ref, cliente.diaFechamento);
      const nome = String(cliente.name || 'cliente').trim();

      // Atômico: cria O charge + marca TODAS as entregas 'faturada' numa transação.
      // Se algo falhar, nada é gravado (nem charge órfão, nem entrega meio-faturada).
      // S2 COBRANÇA-WHATS — captura o id do charge criado pra avisar DEPOIS do
      // commit (o serviço de aviso relê o charge do banco; dentro da tx ele ainda
      // não existe pra quem olha de fora).
      let chargeIdCriado: string | null = null;
      await this.prisma.$transaction(async (tx) => {
        if (amount > 0) {
          const charge = await tx.financeiroCharge.create({
            data: {
              companyId,
              amount,
              currency: 'BRL',
              description: `Fatura mensal — ${nome} (${ref.label})`.slice(0, 180),
              billingCycle: 'MONTHLY',
              paymentMethod: 'MANUAL',
              status: 'pending',
              lifecycle: 'in_progress',
              customerProfileId: cliente.id,
              sourceModule: 'logistica_fechamento',
              dueDate,
              providerPayload: JSON.stringify({
                source: 'logistica_fechamento',
                mesRef: ref.label,
                entregaIds,
              }),
            },
          });
          chargeIdCriado = charge?.id ?? null;
        }
        // Marca as entregas somadas como faturadas (idempotência: só as que estavam
        // 'aguardando_fechamento' passam a 'faturada' — a 2ª rodada não acha nenhuma).
        await tx.entrega.updateMany({
          where: { companyId, id: { in: entregaIds }, cobrancaStatus: 'aguardando_fechamento' },
          data: { cobrancaStatus: 'faturada' },
        });
      });

      // S2 COBRANÇA-WHATS — fatura mensal recém-nascida 'pending' avisa o cliente
      // (fire-and-forget, DEPOIS do commit; gates dentro do serviço de aviso).
      if (chargeIdCriado) this.avisarCobrancaLancamento(companyId, chargeIdCriado);

      if (amount > 0) totalCharges += 1;
      faturas.push({ clienteId: cliente.id, nome, amount, entregas: entregaIds.length, dueDate: dueDate.toISOString() });
    }

    return { companyId, mesRef: ref.label, faturas, chargesCriados: totalCharges };
  }

  // ── EXTRATO por cliente (read-only, company-scoped) ──────────────────────────
  /**
   * R2 (05/07) — lista os FinanceiroCharge de UM cliente (as cobranças linkadas
   * via customerProfileId). Read-only, company-scoped: o cliente TEM de ser desta
   * empresa. Não toca dinheiro nem dispara nada.
   */
  async extratoCliente(companyId: number, clienteId: string): Promise<ExtratoResult | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true, name: true },
    });
    if (!cliente) return null;

    // Regra M4 (a mesma do listRota/saldos/histórico): financeiro do tenant OFF =
    // dinheiro não aparece em lugar NENHUM. FAIL-CLOSED por simetria com saldos:
    // devolve a MESMA forma, mas sem valores (charges vazio, saldos null e o flag
    // moduloFinanceiroAtivo:false). Best-effort: config ausente = default seguro (false).
    let moduloFinanceiroAtivo = false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true },
      });
      moduloFinanceiroAtivo = cfg?.moduloFinanceiroAtivo ?? false;
    } catch (e: any) {
      this.logger.warn(`[logistica] extrato loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }

    if (!moduloFinanceiroAtivo) {
      return {
        clienteId: cliente.id,
        nome: String(cliente.name || '').trim() || null,
        moduloFinanceiroAtivo: false,
        total: 0,
        saldoAberto: null,
        aguardandoFechamento: null,
        charges: [],
      };
    }

    const charges = await this.prisma.financeiroCharge.findMany({
      where: { companyId, customerProfileId: cliente.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        amount: true,
        currency: true,
        description: true,
        status: true,
        lifecycle: true,
        dueDate: true,
        sourceModule: true,
        entregaId: true,
        createdAt: true,
        paidAt: true,
      },
    });

    // F1 — o "quanto me deve" da ficha, pela MESMA fonte única da rota
    // (saldoAbertoPorClientes). Best-effort: falha não derruba o extrato.
    let saldo: { pendente: number; aguardando: number } | undefined;
    try {
      saldo = (await this.saldoAbertoPorClientes(companyId, [cliente.id])).get(cliente.id);
    } catch (e: any) {
      this.logger.warn(`[logistica] extrato saldo cliente=${cliente.id} falhou: ${String(e?.message || e)}`);
    }

    return {
      clienteId: cliente.id,
      nome: String(cliente.name || '').trim() || null,
      moduloFinanceiroAtivo: true,
      total: charges.length,
      saldoAberto: somaSaldo(saldo),
      aguardandoFechamento: round2(saldo?.aguardando ?? 0),
      charges: charges.map((c) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        description: c.description,
        status: c.status,
        lifecycle: c.lifecycle,
        dueDate: c.dueDate ? c.dueDate.toISOString() : null,
        sourceModule: c.sourceModule ?? null,
        entregaId: c.entregaId ?? null,
        createdAt: c.createdAt ? c.createdAt.toISOString() : null,
        paidAt: c.paidAt ? c.paidAt.toISOString() : null,
      })),
    };
  }

  // ── F1 — fonte ÚNICA do "quanto me deve" ─────────────────────────────────────
  /**
   * Saldo em aberto por cliente: charges 'pending' da logística (entrega +
   * fechamento) + entregas 'entregue' aguardando o fechamento mensal. Usada pela
   * ROTA (badge da chegada) e pelo EXTRATO (ficha) — a regra vive SÓ aqui pra os
   * dois nunca divergirem. Read-only, company-scoped.
   */
  private async saldoAbertoPorClientes(
    companyId: number,
    clienteIds: string[],
  ): Promise<Map<string, { pendente: number; aguardando: number }>> {
    const mapa = new Map<string, { pendente: number; aguardando: number }>();
    const ids = Array.from(new Set(clienteIds.filter(Boolean)));
    if (!companyId || ids.length === 0) return mapa;

    const entry = (id: string) => {
      let e = mapa.get(id);
      if (!e) {
        e = { pendente: 0, aguardando: 0 };
        mapa.set(id, e);
      }
      return e;
    };

    const [pendentes, aguardando] = await Promise.all([
      this.prisma.financeiroCharge.groupBy({
        by: ['customerProfileId'],
        where: {
          companyId,
          customerProfileId: { in: ids },
          status: 'pending',
          sourceModule: { in: ['logistica_entrega', 'logistica_fechamento'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.entrega.groupBy({
        by: ['customerProfileId'],
        where: { companyId, customerProfileId: { in: ids }, status: 'entregue', cobrancaStatus: 'aguardando_fechamento' },
        _sum: { valor: true },
      }),
    ]);

    for (const p of pendentes) {
      if (p.customerProfileId) entry(p.customerProfileId).pendente = round2(Math.max(0, Number(p._sum.amount) || 0));
    }
    for (const a of aguardando) {
      entry(a.customerProfileId).aguardando = round2(Math.max(0, Number(a._sum.valor) || 0));
    }
    return mapa;
  }

  // ── M6 — RESUMO DO DIA (read-only, company-scoped) ──────────────────────────
  /**
   * M6 (05/07) — o card do admin na tela de Logística: quantas entregas foram
   * concluídas HOJE, quanto FOI RECEBIDO (charges quitados no dia) e quanto está
   * A RECEBER (charges pendentes com dueDate no dia). Read-only, company-scoped —
   * não toca dinheiro nem dispara nada.
   *
   *   entregues     = entregas 'entregue' com deliveredAt no dia.
   *   recebidoHoje  = Σ amount dos charges pagos (paidAt no dia) da logística.
   *   aReceber      = Σ amount dos charges 'pending' com dueDate no dia da logística.
   *
   * Os charges são filtrados por sourceModule 'logistica_*' (entrega/fechamento) —
   * a receita da assinatura HBX (sem sourceModule) NÃO entra neste resumo.
   */
  async resumoDia(companyId: number, dateInput?: string): Promise<ResumoDiaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(dateInput);
    const logisticaSources = ['logistica_entrega', 'logistica_fechamento'];

    const [entregues, pagos, aReceberRows] = await Promise.all([
      // Entregas concluídas no dia (status 'entregue' + deliveredAt no range).
      this.prisma.entrega.count({
        where: { companyId, status: 'entregue', deliveredAt: { gte: start, lte: end } },
      }),
      // Recebido: charges da logística quitados no dia (paidAt no range).
      this.prisma.financeiroCharge.findMany({
        where: {
          companyId,
          sourceModule: { in: logisticaSources },
          paidAt: { gte: start, lte: end },
        },
        select: { amount: true },
      }),
      // A receber: charges da logística ainda 'pending' com vencimento no dia.
      this.prisma.financeiroCharge.findMany({
        where: {
          companyId,
          sourceModule: { in: logisticaSources },
          status: 'pending',
          dueDate: { gte: start, lte: end },
        },
        select: { amount: true },
      }),
    ]);

    const recebidoHoje = round2(pagos.reduce((sum, c) => sum + Math.max(0, Number(c.amount) || 0), 0));
    const aReceber = round2(aReceberRows.reduce((sum, c) => sum + Math.max(0, Number(c.amount) || 0), 0));

    return { date: dayISO, entregues, recebidoHoje, aReceber };
  }

  // ── M6 — EDITAR a forma de pagamento do cliente (ADMIN, na ficha) ───────────
  /**
   * M6 (05/07) — grava os DOIS eixos do contrato do cliente (o coração do M6):
   * `formaPagamento` (aberto|mensal|na_hora|pendura), `metodoPadrao` (pix|dinheiro,
   * só p/ na_hora), `contabilizar` (entra na contabilidade?) e `diaFechamento` (dia
   * do mês p/ o modelo mensal). PATCH parcial: só os campos enviados mudam.
   *
   * Reconcilia com o `modeloCobranca` do N6: 'mensal'→'mensal', o resto→'avulso'
   * (mantém a coluna legada coerente, sem quebrar quem lê modeloCobranca).
   *
   * company-scoped (o cliente TEM de ser desta empresa). NÃO dispara nada, NÃO
   * toca cobrança existente — só o CONTRATO daqui pra frente. ADMIN-only (controller).
   */
  async updateFinanceiroCliente(
    companyId: number,
    clienteId: string,
    input: UpdateFinanceiroClienteInput,
  ): Promise<FinanceiroClienteDTO | null> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(clienteId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');

    const found = await this.prisma.customerProfile.findFirst({
      where: { id: cid, companyId },
      select: { id: true },
    });
    if (!found) return null;

    const data: Record<string, unknown> = {};

    if (input.formaPagamento !== undefined) {
      const forma = normalizeForma(input.formaPagamento);
      if (!forma) throw new BadRequestException('Forma de pagamento inválida.');
      data.formaPagamento = forma;
      // Mantém o modeloCobranca legado (N6) coerente: mensal↔mensal, resto=avulso.
      data.modeloCobranca = forma === 'mensal' ? 'mensal' : 'avulso';
      // na_hora exige método fixo; se saiu de na_hora, o metodoPadrao perde sentido
      // (só é limpo se o cliente NÃO mandou um método novo neste PATCH).
      if (forma !== 'na_hora' && input.metodoPadrao === undefined) data.metodoPadrao = null;
    }

    if (input.metodoPadrao !== undefined) {
      const metodo = normalizeMetodoPadrao(input.metodoPadrao);
      // string vazia/null limpa; 'pix'|'dinheiro' grava; qualquer outro = 400.
      if (input.metodoPadrao && !metodo) throw new BadRequestException('Método padrão inválido.');
      data.metodoPadrao = metodo;
    }

    if (input.contabilizar !== undefined) data.contabilizar = !!input.contabilizar;

    if (input.diaFechamento !== undefined) {
      data.diaFechamento = input.diaFechamento == null ? null : clampDiaFechamento(input.diaFechamento);
    }

    // F1 — teto de fiado: null limpa (sem limite); número entra clampado ≥ 0.
    if (input.limiteFiado !== undefined) {
      if (input.limiteFiado == null) {
        data.limiteFiado = null;
      } else {
        const teto = Number(input.limiteFiado);
        if (!Number.isFinite(teto) || teto < 0) throw new BadRequestException('Limite de fiado inválido.');
        data.limiteFiado = round2(Math.min(teto, 1_000_000));
      }
    }

    // S2 COBRANÇA-WHATS — opt-out por cliente do aviso de cobrança no zap (só o
    // toggle; não dispara nada — quem lê é o serviço de aviso, atrás de 2 flags).
    if (input.avisarCobranca !== undefined) data.avisarCobranca = !!input.avisarCobranca;

    const updated = await this.prisma.customerProfile.update({
      where: { id: found.id },
      data,
      select: {
        id: true,
        formaPagamento: true,
        metodoPadrao: true,
        contabilizar: true,
        diaFechamento: true,
        limiteFiado: true,
        avisarCobranca: true,
      },
    });

    return {
      id: updated.id,
      formaPagamento: updated.formaPagamento ?? 'aberto',
      metodoPadrao: updated.metodoPadrao ?? null,
      contabilizar: updated.contabilizar,
      diaFechamento: updated.diaFechamento ?? null,
      limiteFiado: updated.limiteFiado ?? null,
      avisarCobranca: updated.avisarCobranca !== false,
    };
  }

  // ══ PR10072026 W2 — Financeiro do cliente (fase 1) ══════════════════════════

  // ── W2 (contrato nº4) — HISTÓRICO de entregas de UM cliente ─────────────────
  /**
   * Extrato de ENTREGAS (não de charges — isso é o extratoCliente) de um cliente:
   * data/hora, itens (nome/qtd/valor unit), valor, desfecho do WhatsApp e da
   * cobrança. Read-only, company-scoped (cliente TEM de ser desta empresa — fora
   * dela devolve null → 404 no controller, sem vazar existência).
   *
   * Paginação por CURSOR (id da última linha da página; `limit` default 30, máx
   * 100). Keyset no banco por [scheduledAt desc, id desc] — usa o índice
   * [companyId, customerProfileId, scheduledAt] existente. A APRESENTAÇÃO da
   * página segue o contrato (desc por deliveredAt ?? scheduledAt): como a entrega
   * é confirmada no dia da rota, as duas ordens são a mesma na prática — a
   * reordenação é só um ajuste fino dentro da página.
   *
   * Entrega LEGADA (single-produto do N6, sem EntregaItem): monta 1 item
   * SINTÉTICO de productId/quantidade/valor (mesmo fallback do listRota).
   * Soft-delete: o padrão do módulo marca status='cancelada' (não some do banco)
   * e listRota/extratoCliente NÃO filtram — aqui segue igual (o status aparece).
   */
  async historicoEntregasCliente(
    companyId: number,
    clienteId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<HistoricoEntregasResult | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true, name: true },
    });
    if (!cliente) return null;

    // Regra M4 (a mesma do listRota/saldos): financeiro do tenant OFF = dinheiro
    // não aparece em lugar NENHUM. O histórico "o que/quando/hora/msg" segue vivo,
    // mas valor/valorUnit/cobrancaStatus são omitidos. Best-effort: config ausente
    // = default seguro (false).
    let moduloFinanceiroAtivo = false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true },
      });
      moduloFinanceiroAtivo = cfg?.moduloFinanceiroAtivo ?? false;
    } catch (e: any) {
      this.logger.warn(`[logistica] histórico loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }

    const take = clampLimit(opts.limit, 30, 100);
    const cursor = String(opts.cursor || '').trim() || null;

    const rows = await this.prisma.entrega.findMany({
      where: { companyId, customerProfileId: cliente.id },
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        quantidade: true,
        valor: true,
        scheduledAt: true,
        deliveredAt: true,
        receiptMethod: true,
        cobrancaStatus: true,
        whatsappStatus: true,
        whatsappMotivo: true,
        createdAt: true,
        product: { select: { name: true } },
        itens: {
          select: {
            qtdPrevista: true,
            qtdEntregue: true,
            valorUnit: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    // nextCursor SEMPRE pela ordem do banco (keyset) — a reordenação de exibição
    // abaixo não muda a âncora da próxima página.
    const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;

    // Contrato: desc por deliveredAt ?? scheduledAt (fallback createdAt p/ linha
    // legada sem data nenhuma — chave total, nada fica "flutuando").
    const sortKey = (r: (typeof rows)[number]) =>
      (r.deliveredAt ?? r.scheduledAt ?? r.createdAt)?.getTime() ?? 0;
    const ordered = [...rows].sort((a, b) => sortKey(b) - sortKey(a));

    return {
      clienteId: cliente.id,
      nome: String(cliente.name || '').trim() || null,
      items: ordered.map((r) => ({
        id: r.id,
        scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        status: r.status,
        // M4: financeiro OFF → dinheiro some (valor/cobrança null), resto fica.
        valor: moduloFinanceiroAtivo ? r.valor : null,
        receiptMethod: r.receiptMethod ?? null,
        cobrancaStatus: moduloFinanceiroAtivo ? r.cobrancaStatus : null,
        whatsappStatus: r.whatsappStatus ?? null,
        whatsappMotivo: r.whatsappMotivo ?? null,
        itens:
          r.itens.length > 0
            ? r.itens.map((it) => ({
                produtoNome: it.product?.name ?? null,
                qtd: it.qtdEntregue ?? it.qtdPrevista,
                valorUnit: moduloFinanceiroAtivo ? (it.valorUnit ?? 0) : null,
              }))
            : r.product
              ? [
                  {
                    // Item SINTÉTICO da entrega legada (single-produto, sem EntregaItem):
                    // valorUnit derivado do valor/quantidade da própria entrega.
                    produtoNome: r.product.name,
                    qtd: r.quantidade,
                    valorUnit: !moduloFinanceiroAtivo
                      ? null
                      : r.quantidade > 0
                        ? round2((Number(r.valor) || 0) / r.quantidade)
                        : round2(Number(r.valor) || 0),
                  },
                ]
              : [],
      })),
      nextCursor,
    };
  }

  // ── W2 (contrato nº5) — BAIXA MANUAL do fiado (quitar charge) ────────────────
  /**
   * Marca um FinanceiroCharge 'pending' da LOGÍSTICA como pago (baixa manual do
   * fiado): status='approved', lifecycle='paid', paidAt=now — EXATAMENTE o shape
   * do "pago na hora" do lancarCobranca (M6). paymentMethod não muda (MANUAL);
   * NADA dispara MercadoPago.
   *
   * Escopo DURO: só charge da MESMA empresa E sourceModule iniciando com
   * 'logistica' — qualquer outra origem/empresa devolve null (controller → 404,
   * sem vazar existência; a assinatura HBX é INTOCÁVEL por aqui).
   *
   * IDEMPOTENTE: já paga → devolve o estado atual (200), sem tocar nada. A
   * transição pending→paga é um claim ATÔMICO (updateMany com o status no WHERE,
   * mesmo padrão do teto do reenviarAviso) — 2 cliques simultâneos = 1 baixa.
   * Charge não-quitável (cancelled/failed/…) → devolve o estado atual sem mutar.
   *
   * Auditoria: FinanceiroCharge não tem campo de notes/auditoria no schema →
   * log ESTRUTURADO com ator/valor (padrão do módulo p/ trilha sem coluna).
   */
  async quitarCharge(
    companyId: number,
    chargeId: string,
    opts: { userId?: number | null } = {},
  ): Promise<QuitarChargeResult | null> {
    if (!companyId || !chargeId) return null;
    const charge = await this.prisma.financeiroCharge.findFirst({
      where: { id: String(chargeId).trim(), companyId, sourceModule: { startsWith: 'logistica' } },
      select: { id: true, status: true, lifecycle: true, amount: true, paidAt: true, customerProfileId: true },
    });
    if (!charge) return null;

    // Idempotente: já paga (por aqui, pelo pago-na-hora do M6 ou por corrida) →
    // devolve o estado atual, sem re-quitar nem mexer no paidAt original.
    if (charge.paidAt || charge.status === 'approved' || charge.lifecycle === 'paid') {
      return {
        id: charge.id,
        status: charge.status,
        paidAt: charge.paidAt ? charge.paidAt.toISOString() : null,
        alreadyPaid: true,
      };
    }

    // Não-quitável (cancelled/failed/refunded/…): devolve o estado atual SEM mutar
    // (a baixa manual só existe pra 'pending'; nada destrutivo aqui).
    if (String(charge.status).trim().toLowerCase() !== 'pending') {
      return { id: charge.id, status: charge.status, paidAt: null, alreadyPaid: false };
    }

    // Claim atômico pending→paga (guarda no WHERE): 2 baixas simultâneas = 1 update.
    const now = new Date();
    const claim = await this.prisma.financeiroCharge.updateMany({
      where: { id: charge.id, companyId, status: 'pending' },
      data: { status: 'approved', lifecycle: 'paid', paidAt: now },
    });
    if (!claim.count) {
      // Corrida perdida: outra chamada resolveu o charge primeiro → relê e devolve.
      const atual = await this.prisma.financeiroCharge.findFirst({
        where: { id: charge.id, companyId },
        select: { id: true, status: true, paidAt: true },
      });
      if (!atual) return null;
      return {
        id: atual.id,
        status: atual.status,
        paidAt: atual.paidAt ? atual.paidAt.toISOString() : null,
        alreadyPaid: Boolean(atual.paidAt) || atual.status === 'approved',
      };
    }

    // Trilha de auditoria estruturada (sem coluna própria no schema — ver docstring).
    this.logger.log(
      `[logistica] baixa manual de fiado: charge=${charge.id} company=${companyId} amount=${charge.amount} user=${opts.userId ?? 'n/d'} paidAt=${now.toISOString()}`,
    );

    // QUITAR → RECOVERY: se este fiado alimentava a cadência hbx-recovery e o
    // cliente zerou a dívida vencida, PARA a cadência (best-effort, idempotente,
    // SEM WhatsApp). Roda DEPOIS da baixa (o recompute já vê esta charge paga).
    // Nunca quebra a baixa: qualquer erro é engolido (log).
    const customerProfileId = String(charge.customerProfileId || '').trim();
    if (this.recovery && customerProfileId) {
      try {
        await this.recovery.resolverSeQuitado(companyId, customerProfileId);
      } catch (e: any) {
        this.logger.warn(
          `[logistica] quitar→recovery best-effort falhou charge=${charge.id} company=${companyId}: ${String(e?.message || e)}`,
        );
      }
    }

    return { id: charge.id, status: 'approved', paidAt: now.toISOString(), alreadyPaid: false };
  }

  // ── W2 (contrato nº6) — SALDOS em aberto por cliente (visão da empresa) ──────
  /**
   * "Quem me deve": todos os clientes da empresa com saldo em aberto — charges
   * 'pending' da logística + entregas 'entregue' aguardando o fechamento mensal.
   * REUSA a fonte única saldoAbertoPorClientes (a mesma da rota e do extrato — as
   * três visões nunca divergem). Read-only, company-scoped.
   *
   * GATE moduloFinanceiroAtivo FAIL-CLOSED: com o módulo financeiro do tenant OFF,
   * dinheiro não aparece em lugar NENHUM da logística (regra do M4, a mesma que
   * esconde saldo/pix no listRota) → devolve lista vazia sem nem consultar valores.
   *
   * Semântica dos campos (idêntica ao extratoCliente): saldoAberto = pendente +
   * aguardando (o TOTAL devido); aguardandoFechamento = só a parcela mensal ainda
   * não faturada. Ordenado por saldoAberto desc (quem deve mais primeiro).
   */
  async saldosFinanceiro(companyId: number): Promise<SaldosFinanceiroResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    // Mesma leitura best-effort do listRota: config ausente = default seguro (false).
    let moduloFinanceiroAtivo = false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true },
      });
      moduloFinanceiroAtivo = cfg?.moduloFinanceiroAtivo ?? false;
    } catch (e: any) {
      this.logger.warn(`[logistica] saldos loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }
    if (!moduloFinanceiroAtivo) return { moduloFinanceiroAtivo: false, clientes: [] };

    // Candidatos: quem TEM charge pending da logística OU entrega aguardando o
    // fechamento — evita varrer a carteira inteira de clientes da empresa.
    const [pendentes, aguardando] = await Promise.all([
      this.prisma.financeiroCharge.findMany({
        where: {
          companyId,
          status: 'pending',
          sourceModule: { in: ['logistica_entrega', 'logistica_fechamento'] },
          customerProfileId: { not: null },
        },
        select: { customerProfileId: true },
        distinct: ['customerProfileId'],
      }),
      this.prisma.entrega.findMany({
        where: { companyId, status: 'entregue', cobrancaStatus: 'aguardando_fechamento' },
        select: { customerProfileId: true },
        distinct: ['customerProfileId'],
      }),
    ]);
    const ids = Array.from(
      new Set([
        ...pendentes.map((p) => p.customerProfileId).filter((id): id is string => Boolean(id)),
        ...aguardando.map((a) => a.customerProfileId),
      ]),
    );
    if (ids.length === 0) return { moduloFinanceiroAtivo: true, clientes: [] };

    // Fonte única do valor (a MESMA da rota/extrato) + só quem tem valor > 0.
    const saldos = await this.saldoAbertoPorClientes(companyId, ids);
    const comSaldo = ids.filter((id) => {
      const s = saldos.get(id);
      return (s?.pendente ?? 0) > 0 || (s?.aguardando ?? 0) > 0;
    });
    if (comSaldo.length === 0) return { moduloFinanceiroAtivo: true, clientes: [] };

    const nomes = await this.prisma.customerProfile.findMany({
      where: { companyId, id: { in: comSaldo } },
      select: { id: true, name: true },
    });
    const nomePorId = new Map(nomes.map((n) => [n.id, n.name]));

    const clientes = comSaldo
      .map((id) => {
        const s = saldos.get(id);
        return {
          customerProfileId: id,
          nome: String(nomePorId.get(id) || '').trim() || null,
          saldoAberto: somaSaldo(s),
          aguardandoFechamento: round2(s?.aguardando ?? 0),
        };
      })
      .sort((a, b) => b.saldoAberto - a.saldoAberto);

    return { moduloFinanceiroAtivo: true, clientes };
  }

  // ── S4 SCORE-DE-FIADO (11/07) — pontualidade do cliente final ────────────────
  /**
   * "Esse cliente merece fiado?" respondido com o dado que já nasce aqui dentro:
   * os FinanceiroCharge da logística (customerProfileId + sourceModule
   * logistica_*), comparando dueDate × paidAt/status. Computado ON-THE-FLY —
   * SEM persistência, SEM migration, read-only, company-scoped. Quem gate a
   * feature (HBX_SCORE_FIADO_ENABLED, 404 com OFF) é o CONTROLLER — este método
   * nem chega a rodar com a flag desligada (zero query nova no deploy inerte).
   *
   * FÓRMULA v1 (simples e explicável, sem IA — S4-score-de-fiado.md):
   *   começa em 100; pagamento em dia +2 cada; atraso leve (≤7d) −5 cada;
   *   atraso grave (>7d) −15 cada; charge vencida EM ABERTO hoje −20 cada;
   *   teto 100, piso 0. Atraso em DIAS DE CALENDÁRIO (paidAt × dueDate, fuso
   *   local — mesma convenção de dia do resolveDayRange); "vencida" segue o
   *   corte do recovery: dueDate ESTRITAMENTE antes do início de HOJE (charge
   *   que vence hoje ainda não é atraso).
   *
   * Mínimo de histórico: com menos de 3 charges FECHADAS (pagas) → score null
   * com motivo 'historico_insuficiente' (não se rotula cliente com 2 dados).
   *
   * ⚠️ Cobrança mensal: entregas 'aguardando_fechamento' ainda NÃO viraram
   * charge — não existem aqui e portanto NÃO contam como atraso (só a fatura
   * fechada no fechar-mês entra, quando vencer/for paga). Charges canceladas/
   * estornadas ficam fora da conta (nem punem nem premiam).
   *
   * GATE moduloFinanceiroAtivo FAIL-CLOSED (regra M4, a mesma do extrato):
   * módulo financeiro do tenant OFF → devolve score null com motivo
   * 'financeiro_off' SEM consultar charge nenhum (dinheiro não roda em lugar
   * nenhum). LEI DO VENDEDOR: o endpoint é Admin-only (controller).
   */
  async scoreFiadoCliente(companyId: number, clienteId: string): Promise<ScoreFiadoResult | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true },
    });
    if (!cliente) return null;

    // Mesma leitura best-effort do extrato: config ausente = default seguro (false).
    let moduloFinanceiroAtivo = false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true },
      });
      moduloFinanceiroAtivo = cfg?.moduloFinanceiroAtivo ?? false;
    } catch (e: any) {
      this.logger.warn(`[logistica] score loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }
    if (!moduloFinanceiroAtivo) {
      return {
        clienteId: cliente.id,
        moduloFinanceiroAtivo: false,
        score: null,
        motivo: 'financeiro_off',
        insumos: null,
      };
    }

    // Só charges da LOGÍSTICA deste cliente (a assinatura HBX não entra). Mesmo
    // teto do extrato (500 mais recentes) — custo limitado, sem varrer histórico
    // infinito. NÃO usa HbxRecoveryCustomer.paymentHistoryScore (enviesado: só
    // cobre quem já caiu no funil de dívida).
    const charges = await this.prisma.financeiroCharge.findMany({
      where: {
        companyId,
        customerProfileId: cliente.id,
        sourceModule: { in: ['logistica_entrega', 'logistica_fechamento'] },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: { status: true, lifecycle: true, dueDate: true, paidAt: true },
    });

    const inicioHoje = resolveDayRange().start;
    let emDia = 0;
    let atrasoLeve = 0;
    let atrasoGrave = 0;
    let vencidasEmAberto = 0;

    for (const c of charges) {
      const paga = c.lifecycle === 'paid' || c.status === 'approved';
      if (paga) {
        // Pago-na-hora nasce quitado (paidAt=dueDate≈agora) → 0 dias → em dia.
        // Defensivo: paga sem dueDate/paidAt (charge legada) = sem prova de
        // atraso → conta como em dia.
        const atrasoDias = diasDeAtrasoCalendario(c.dueDate, c.paidAt);
        if (atrasoDias <= 0) emDia++;
        else if (atrasoDias <= 7) atrasoLeve++;
        else atrasoGrave++;
        continue;
      }
      // Vencida EM ABERTO hoje: pending com dueDate estritamente antes do início
      // de hoje (convenção do recovery). Pending futura/de hoje: ainda não é
      // atraso, fica fora. Cancelada/estornada/failed: fora da conta.
      if (c.status === 'pending' && c.dueDate && c.dueDate.getTime() < inicioHoje.getTime()) {
        vencidasEmAberto++;
      }
    }

    const fechadas = emDia + atrasoLeve + atrasoGrave;
    const insumos: ScoreFiadoInsumos = { fechadas, emDia, atrasoLeve, atrasoGrave, vencidasEmAberto };

    // Mínimo de histórico: menos de 3 charges fechadas = sem base pra rotular.
    if (fechadas < 3) {
      return {
        clienteId: cliente.id,
        moduloFinanceiroAtivo: true,
        score: null,
        motivo: 'historico_insuficiente',
        insumos,
      };
    }

    const bruto = 100 + emDia * 2 - atrasoLeve * 5 - atrasoGrave * 15 - vencidasEmAberto * 20;
    const score = Math.max(0, Math.min(100, bruto));
    return { clienteId: cliente.id, moduloFinanceiroAtivo: true, score, motivo: null, insumos };
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
// NOTA (BUG 5, 11/07): esta resolveDayRange é DUPLICADA em logistica-rota.service.ts —
// mesma forma, cada uma com sua própria parseDateOrNull local. Não deduplicado
// agora (fora do escopo do fix); só mantidas as duas em paridade.
export function resolveDayRange(dateInput?: string): { start: Date; end: Date; dayISO: string } {
  const base = parseDateOrNull(dateInput) ?? new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  const dayISO = start.toISOString().slice(0, 10);
  return { start, end, dayISO };
}

function parseUpdatedSince(value?: string): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException('updatedSince inválido. Use uma data ISO.');
  return parsed;
}

function actorIdOrNull(actor?: LogisticaActor | null): number | null {
  const id = Number(actor?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // "YYYY-MM-DD" puro é lido no fuso LOCAL (mesmo cuidado do M2/rota: em Brasília
  // -3, o parse UTC via `new Date(value)` escorregaria pro dia anterior — e sem
  // regex aqui, a validação de dia impossível também não existia).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(y, mo - 1, day, 0, 0, 0, 0);
    // FIX (BUG 5, 11/07) — round-trip: sem isso, "2026-02-30" (30 de fevereiro,
    // impossível mas bem-formada) fazia overflow silencioso pro dia 02/mar em vez
    // de cair pra HOJE como já acontecia com "abc"/"2026-13-45" — inconsistente.
    // Se o Date construído não bate com y/mo/day pedidos, é rollover → inválida.
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// M8 — sanitiza a idempotencyKey do celular: trim, corta em 80 (coluna), vazio = null.
// Não impõe formato uuid (fail-safe: qualquer key estável do cliente serve pra dedupe).
function normalizeIdempotencyKey(v: string | null | undefined): string | null {
  const s = String(v || '').trim().slice(0, 80);
  return s.length > 0 ? s : null;
}

// M4 — só um dos métodos de recebimento aceitos passa; qualquer outro vira null.
function normalizeReceipt(v: string | null | undefined): 'pix' | 'dinheiro' | 'fiado' | null {
  const s = String(v || '').trim().toLowerCase();
  return s === 'pix' || s === 'dinheiro' || s === 'fiado' ? s : null;
}

// M6 — forma de pagamento aceita (fonte da verdade do fluxo). Fora do conjunto = null.
function normalizeForma(v: string | null | undefined): 'aberto' | 'mensal' | 'na_hora' | 'pendura' | null {
  const s = String(v || '').trim().toLowerCase();
  return s === 'aberto' || s === 'mensal' || s === 'na_hora' || s === 'pendura' ? s : null;
}

// M6 — método padrão do na_hora. Vazio/null = limpa; pix|dinheiro = grava; resto = null.
function normalizeMetodoPadrao(v: string | null | undefined): 'pix' | 'dinheiro' | null {
  const s = String(v || '').trim().toLowerCase();
  return s === 'pix' || s === 'dinheiro' ? s : null;
}

// M6 — dia de fechamento válido (1..31); fora da faixa = clampado à borda.
function clampDiaFechamento(v: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return 1;
  return Math.min(31, Math.max(1, n));
}

// R2 — dinheiro é sempre 2 casas (evita 19.999999 virar cobrança).
function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

// W2 — limite de página do histórico: default quando ausente/inválido, teto duro.
function clampLimit(v: number | undefined, def: number, max: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(max, n);
}

// F1 — total do saldo em aberto (pendente + mensal a fechar), arredondado.
// S4 SCORE-DE-FIADO — atraso em DIAS DE CALENDÁRIO (fuso local, mesma convenção
// de dia do resolveDayRange): pagou no mesmo dia do vencimento = 0 (em dia);
// no dia seguinte = 1. Sem dueDate ou sem paidAt não há prova de atraso → 0.
function diasDeAtrasoCalendario(dueDate: Date | null, paidAt: Date | null): number {
  if (!dueDate || !paidAt) return 0;
  const dia = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  return Math.round((dia(paidAt) - dia(dueDate)) / 86_400_000);
}

function somaSaldo(s: { pendente: number; aguardando: number } | undefined): number {
  return round2((s?.pendente ?? 0) + (s?.aguardando ?? 0));
}

// R3 — violação de unique (Prisma P2002 OU o code 23505 do Postgres cru). Usado pra
// tratar a corrida do charge-por-entrega como "já existe" (idempotente), sem depender
// de importar o namespace do Prisma (o mock de teste também bate aqui por code).
function isUniqueViolation(e: any): boolean {
  const code = e?.code;
  return code === 'P2002' || code === '23505';
}

// R2 — status de cobrança já-RESOLVIDO (não relança). 'lancada'/'faturada' já viraram
// charge; 'isenta'/'nao_contabilizado' são desfechos sem charge; 'aguardando_fechamento'
// espera o fechar-mês. Só 'pendente'/'falhou' (ou vazio) seguem para o lançamento.
function isCobrancaResolvida(status: string | null | undefined): boolean {
  const s = String(status || '').trim().toLowerCase();
  return (
    s === 'lancada' ||
    s === 'isenta' ||
    s === 'faturada' ||
    s === 'aguardando_fechamento' ||
    s === 'nao_contabilizado'
  );
}

// R4 — mapeia o cobrancaStatus JÁ resolvido para o vocabulário do cobrancaOutcome
// persistido (M2). 'faturada' colapsa em 'lancada' (ambos = já virou charge).
function outcomeDoStatus(status: string | null | undefined): CobrancaOutcome {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'faturada' || s === 'lancada') return 'lancada';
  if (s === 'isenta') return 'isenta';
  if (s === 'nao_contabilizado') return 'nao_contabilizado';
  if (s === 'aguardando_fechamento') return 'aguardando_fechamento';
  return 'falhou';
}

// R2 (pendura) — próximo diaFechamento do cliente a partir de hoje; se não houver
// dia configurado ou for inválido, vence hoje (fail-safe: não perde a cobrança).
function proximoDiaFechamento(dia: number | null | undefined): Date {
  const d = Number(dia);
  const hoje = new Date();
  if (!Number.isInteger(d) || d < 1 || d > 31) return hoje;
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(d, diasNoMes(hoje.getFullYear(), hoje.getMonth())), 12, 0, 0);
  if (alvo.getTime() < hoje.getTime()) {
    // já passou o dia neste mês → próximo mês.
    const m = hoje.getMonth() + 1;
    const ano = hoje.getFullYear() + Math.floor(m / 12);
    const mes = m % 12;
    return new Date(ano, mes, Math.min(d, diasNoMes(ano, mes)), 12, 0, 0);
  }
  return alvo;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

// R2 (fechar-mês) — resolve o mês de referência (default: hoje). Aceita "YYYY-MM".
function parseMesRef(mesRef?: string): { ano: number; mes: number; dia: number; label: string } {
  const now = new Date();
  const raw = String(mesRef || '').trim();
  const m = raw.match(/^(\d{4})-(\d{1,2})$/);
  const ano = m ? Number(m[1]) : now.getFullYear();
  const mes = m ? Math.min(11, Math.max(0, Number(m[2]) - 1)) : now.getMonth();
  return { ano, mes, dia: now.getDate(), label: `${ano}-${String(mes + 1).padStart(2, '0')}` };
}

// R2 (fechar-mês) — data de vencimento da fatura: diaFechamento do mês de referência
// (clampado ao último dia do mês). Sem dia configurado = último dia do mês.
function fechamentoDoMes(ref: { ano: number; mes: number }, dia: number | null | undefined): Date {
  const ultimo = diasNoMes(ref.ano, ref.mes);
  const d = Number(dia);
  const alvo = Number.isInteger(d) && d >= 1 && d <= 31 ? Math.min(d, ultimo) : ultimo;
  return new Date(ref.ano, ref.mes, alvo, 12, 0, 0);
}

// ── tipos ───────────────────────────────────────────────────────────────────
export interface CreateEntregaInput {
  customerProfileId: string;
  contatoId?: string;
  productId?: number;
  quantidade?: number;
  valor?: number;
  scheduledAt?: string;
  notes?: string;
  // MULTILOCAL (10/07) — local de entrega opcional (validado como do mesmo
  // cliente+empresa no serviço); null/ausente = endereço do perfil (legado).
  localId?: string;
}

export interface RotaCliente {
  id: string;
  nome: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  formaPagamento?: string;
  metodoPadrao?: string | null;
  // F1 — "quanto me deve" (charges pending da logística + mensal a fechar) e o
  // teto de fiado do cliente (null = sem limite). Base do badge da chegada.
  saldoAberto?: number;
  limiteFiado?: number | null;
}

export interface RotaProduto {
  id: number;
  nome: string;
  unidade: string | null;
}

export interface RotaEntregaItem {
  id: string;
  qtdPrevista: number;
  qtdEntregue: number | null;
  // F1 — preço unitário do item (0 = sem preço): o QR Pix da chegada recalcula o
  // valor ao vivo conforme o stepper (mesma conta do backend no confirmar).
  valorUnit?: number;
  produto: RotaProduto | null;
}

export interface RotaItem {
  id: string;
  status: string;
  quantidade: number;
  valor?: number;
  scheduledAt: string | null;
  deliveredAt: string | null;
  deliveredLat: number | null;
  deliveredLng: number | null;
  cobrancaStatus?: string;
  notes: string | null;
  updatedAt: string;
  entregador: { id: number; nome: string | null; email: string | null } | null;
  comprovante: {
    fotoId: string | null;
    assinaturaId: string | null;
    fotoEnviada: boolean;
    assinaturaEnviada: boolean;
    codigoGerado: boolean;
    confirmadoAt: string | null;
  };
  // MULTILOCAL (10/07) — rótulo curto do local desta entrega ("Casa"|"Loja"…), null
  // quando a entrega não tem local (usa o endereço/geo do perfil).
  localApelido: string | null;
  cliente: RotaCliente;
  contato: { id: string; nome: string; whatsapp: string | null; phone: string | null } | null;
  produto: RotaProduto | null;
  itens: RotaEntregaItem[];
}

// F1 — Pix DIRETO do tenant (BR Code gerado no app, taxa zero). Só vem quando o
// módulo financeiro está ON e a chave foi configurada em Ajustes.
export interface RotaPix {
  chave: string;
  nome: string | null;
  cidade: string | null;
}

export interface RotaResult {
  date: string;
  total: number;
  refreshedAt: string;
  effectsEnabled: boolean;
  routeId: string | null;
  trackingRequired: boolean;
  routeMode?: 'ESSENTIAL' | 'TRACKED' | null;
  routeStatus: string | null;
  trackingSessionId: string | null;
  trackingStatus: string | null;
  moduloFinanceiroAtivo?: boolean;
  pix?: RotaPix | null;
  // AVISO-CHEGANDO — o app só arma o anel de ~500m quando isto é true (evita POST
  // inútil com o recurso OFF). avisoChegandoDistanciaM é o raio configurado (m).
  avisoChegandoAtivo: boolean;
  avisoChegandoDistanciaM: number;
  comprovante: RotaRequisitosComprovante;
  items: RotaItem[];
}

export interface RotaRequisitosComprovante {
  fotoObrigatoria: boolean;
  assinaturaObrigatoria: boolean;
  codigoObrigatorio: boolean;
}

export interface ConfirmarGps {
  lat?: number;
  lng?: number;
  // B1 — precisão do GPS em metros (coords.accuracy). Só decide a realimentação
  // da coordenada do cliente (accuracy<=60m); nunca bloqueia a confirmação.
  accuracy?: number;
  receiptMethod?: string;
  itens?: Array<{ id: string; qtdEntregue: number }>;
  // F2 (08/07) — produtos NOVOS incluídos/trocados na folha de chegada (não
  // previstos). O preço SEMPRE vem do servidor (regra de ouro) — este payload só
  // carrega productId + qtd; jamais um preço vindo do cliente.
  novosItens?: Array<{ productId: number; qtdEntregue: number }>;
  // M8 (offline-first) — chave de idempotência (uuid do celular). Se a MESMA key já
  // foi gravada nesta entrega, o confirmar é um REPLAY (fila offline) → devolve o
  // desfecho anterior SEM re-executar WhatsApp/charge.
  idempotencyKey?: string;
  comprovanteFotoId?: string;
  comprovanteAssinaturaId?: string;
  comprovanteCodigo?: string;
}

export interface ConfirmarResult {
  id: string;
  status: string;
  effectsEnabled: boolean;
  whatsappSent: boolean;
  cobrancaLancada: boolean;
  // M8 — true quando este confirmar foi um replay idempotente (mesma key já gravada):
  // nada foi re-executado, o desfecho é o da confirmação original.
  replayed?: boolean;
}

// R4 — desfecho RICO dos efeitos (persistido na Entrega + base do MasterEvent de falha).
export type WhatsappStatus = 'enviado' | 'falhou' | 'pulado';

export interface WhatsappResult {
  status: WhatsappStatus;
  // razão curta quando pulado/falhou: aviso_off | sem_telefone | erro. null quando enviado.
  motivo: string | null;
}

// Espelha o cobrancaStatus da entrega em vocabulário estável + 'falhou' (exceção)
// e 'nao_avaliada' (usado quando a cobrança não é reprocessada, ex.: reenviar aviso).
export type CobrancaOutcome =
  | 'lancada'
  | 'aguardando_fechamento'
  | 'nao_contabilizado'
  | 'isenta'
  | 'falhou'
  | 'nao_avaliada';

export interface CobrancaResult {
  lancada: boolean;
  outcome: CobrancaOutcome;
}

// R4 — retorno do reenviar-aviso (endpoint ADMIN, teto 1).
export interface ReenviarAvisoResult {
  id: string;
  whatsappStatus: WhatsappStatus;
  motivo: string | null;
  reenviado: boolean;
}

// R2 — fechar-mês
export interface FecharMesFatura {
  clienteId: string;
  nome: string;
  amount: number;
  entregas: number;
  dueDate: string;
}

export interface FecharMesResult {
  companyId: number;
  mesRef: string;
  faturas: FecharMesFatura[];
  chargesCriados: number;
}

// R2 — extrato por cliente
export interface ExtratoCharge {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  lifecycle: string;
  dueDate: string | null;
  sourceModule: string | null;
  entregaId: string | null;
  createdAt: string | null;
  paidAt: string | null;
}

export interface ExtratoResult {
  clienteId: string;
  nome: string | null;
  // M4: financeiro do tenant. OFF → sem valores (charges vazio, saldos null).
  moduloFinanceiroAtivo: boolean;
  total: number;
  // F1 — o "quanto me deve" da ficha: pendências (charges 'pending' da logística)
  // + mensal ainda não faturado. saldoAberto já é a SOMA dos dois.
  // M4: null quando o financeiro do tenant está OFF (dinheiro não aparece).
  saldoAberto: number | null;
  aguardandoFechamento: number | null;
  charges: ExtratoCharge[];
}

// M6 — resumo do dia (card do admin na tela de Logística).
export interface ResumoDiaResult {
  date: string;
  entregues: number;
  recebidoHoje: number;
  aReceber: number;
}

// M6 — editar a forma de pagamento do cliente (na ficha).
export interface UpdateFinanceiroClienteInput {
  formaPagamento?: string;
  metodoPadrao?: string | null;
  contabilizar?: boolean;
  diaFechamento?: number | null;
  // F1 — teto de fiado (R$). null limpa (sem limite).
  limiteFiado?: number | null;
  // S2 COBRANÇA-WHATS — opt-out por cliente do aviso de cobrança no zap.
  avisarCobranca?: boolean;
}

export interface FinanceiroClienteDTO {
  id: string;
  formaPagamento: string;
  metodoPadrao: string | null;
  contabilizar: boolean;
  diaFechamento: number | null;
  limiteFiado: number | null;
  // S2 COBRANÇA-WHATS — toggle "Avisar cobrança no WhatsApp" da ficha.
  avisarCobranca: boolean;
}

// ── PR10072026 W2 — Financeiro do cliente (fase 1) ────────────────────────────

// W2 (contrato nº4) — histórico de entregas do cliente (extrato de ENTREGAS).
export interface HistoricoEntregaItemLinha {
  produtoNome: string | null;
  // M4: null quando o financeiro do tenant está OFF (dinheiro não aparece).
  valorUnit: number | null;
  qtd: number;
}

export interface HistoricoEntregaItem {
  id: string;
  scheduledAt: string | null;
  deliveredAt: string | null;
  status: string;
  // M4: valor e cobrancaStatus são null com o financeiro do tenant OFF.
  valor: number | null;
  receiptMethod: string | null;
  cobrancaStatus: string | null;
  whatsappStatus: string | null;
  whatsappMotivo: string | null;
  itens: HistoricoEntregaItemLinha[];
}

export interface HistoricoEntregasResult {
  clienteId: string;
  nome: string | null;
  items: HistoricoEntregaItem[];
  // id da última linha da página (ordem do banco) — null quando acabou.
  nextCursor: string | null;
}

// W2 (contrato nº5) — baixa manual do fiado. alreadyPaid é ADITIVO ao contrato
// ({id, status, paidAt}): true quando a charge JÁ estava paga (resposta idempotente).
export interface QuitarChargeResult {
  id: string;
  status: string;
  paidAt: string | null;
  alreadyPaid: boolean;
}

// W2 (contrato nº6) — saldos em aberto por cliente (visão da empresa).
export interface SaldosClienteRow {
  customerProfileId: string;
  nome: string | null;
  // TOTAL devido (pendente + mensal a fechar) — mesma semântica do extratoCliente.
  saldoAberto: number;
  aguardandoFechamento: number;
}

export interface SaldosFinanceiroResult {
  moduloFinanceiroAtivo: boolean;
  clientes: SaldosClienteRow[];
}

// ── S4 SCORE-DE-FIADO — pontualidade do cliente final (computado on-the-fly) ──
// Os INSUMOS são o "porquê" do número (o front mostra sem caixa-preta):
//   fechadas         = charges pagas (base do mínimo de 3);
//   emDia            = pagas até o dia do vencimento (+2 cada);
//   atrasoLeve       = pagas com 1–7 dias de atraso (−5 cada);
//   atrasoGrave      = pagas com >7 dias de atraso (−15 cada);
//   vencidasEmAberto = 'pending' vencidas antes de hoje (−20 cada).
export interface ScoreFiadoInsumos {
  fechadas: number;
  emDia: number;
  atrasoLeve: number;
  atrasoGrave: number;
  vencidasEmAberto: number;
}

export interface ScoreFiadoResult {
  clienteId: string;
  // M4: financeiro do tenant OFF → fail-closed (score null, insumos null).
  moduloFinanceiroAtivo: boolean;
  // 0–100; null quando não dá pra afirmar nada (ver motivo).
  score: number | null;
  motivo: 'historico_insuficiente' | 'financeiro_off' | null;
  insumos: ScoreFiadoInsumos | null;
}

import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { CreditActionUsageService } from '../credits/credit-action-usage.service';
import { FiscalComprovanteEntregaService } from '../fiscal/fiscal-comprovante-entrega.service';
import { EstoqueService } from '../fiscal/estoque.service';
import { LogisticaRotaService, haversineKm, hasCoord, type Coord } from './logistica-rota.service';
import { LogisticaConfigService, renderTemplateAviso, storedNivel } from './logistica-config.service';
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
import { resolverCoordenadaMultilocal, GPS_ACCURACY_LIMITE_METROS } from './logistica-geo-fonte.util';
// F0 (27/07) — MOTOR CONFIÁVEL: o cursor da Agenda (`proximaData`) só avança
// no DESFECHO (aqui), nunca na geração. Ver avancarPlanoNoDesfecho abaixo.
import { sourceDateFromOccurrenceKey, saoPauloMidnight } from './logistica-agenda-cursor.util';
import { nextOccurrenceDate } from './logistica-agenda.service';
import { saoPauloDateKey } from './logistica-occurrence.service';
import { registrarEventoAgenda, formatDDMM } from './logistica-agenda-evento.util';
// F3 (27/07) — {eta} no aviso de chegada (minutos até chegar, do etaAt).
import { formatEtaMinutos } from './logistica-tracking-public.util';

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
    // A Logística usa crédito quando a entrega é iniciada/criada, mesmo que não
    // seja concluída depois. Opcional mantém testes diretos compatíveis.
    @Optional() private readonly creditActionUsage?: CreditActionUsageService,
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
    // FISCAL F2a — comprovante SEM VALOR FISCAL pega carona no aviso "entregue"
    // (gate por empresa DENTRO do serviço fiscal). @Optional() (ausente nos
    // testes = texto puro). Sem ciclo: o fiscal não injeta LogisticaService.
    @Optional() private readonly fiscalComprovante?: FiscalComprovanteEntregaService,
    // FISCAL F3 — baixa DEFINITIVA de estoque quando o motorista conclui a
    // entrega (decisão do dono: baixa na entrega, não na emissão; a NF-e do
    // fechamento CONCILIA). Gate estoqueAtivo + dedup por entrega+produto moram
    // DENTRO do serviço. @Optional() (ausente nos testes = no-op).
    @Optional() private readonly fiscalEstoque?: EstoqueService,
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
        // L4-A (18/07) — 'avulsa' | 'recorrente' | null (legado). Operacional,
        // não comercial: exposto a QUALQUER ator (app filtra Avulsos/Recorrentes).
        origem: true,
        // PR18072026 W1 (coordenador) — `valor` precisa ser lido pelo SERVIDOR
        // mesmo fora do billingAudience pra computar `valorHoje` (total seguro
        // da entrega, sem expor valorUnit/catálogo). A saída pro billingAudience
        // (campo `valor` cru) continua gateada abaixo — só o SELECT abriu.
        valor: true,
        scheduledAt: true,
        deliveredAt: true,
        deliveredLat: true,
        deliveredLng: true,
        // MODO CADERNETA (05/08) — COMO foi recebida. Lido sempre (a config do
        // tenant só é carregada DEPOIS desta query); quem gateia a SAÍDA é o
        // moduloFinanceiroAtivoConfig lá embaixo, igual ao debitoAtual.
        receiptMethod: true,
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
            // PR18072026 W1 — observação livre sobre o cliente ("deixa na
            // portaria"...). Operacional, não financeiro: visível a qualquer ator.
            observacoes: true,
            // PR18072026 W1 (coordenador) — metodoPadrao (pix|dinheiro|null) NÃO é
            // valor/margem: é só o método fixo do cliente 'na_hora', que o botão
            // [Pago] do app usa como receiptMethod. Sai do gate de billingAudience
            // (senão o entregador comum sem cobrança cai sempre no fallback
            // 'dinheiro' — bug reportado pelo W4); gate próprio é moduloFinanceiroAtivo
            // (abaixo, na resposta). formaPagamento/limiteFiado CONTINUAM só p/
            // billingAudience — não mexido.
            metodoPadrao: true,
            ...(billingAudience
              ? {
                  // Dados comerciais são exclusivos de dono/master. A omissão no
                  // select impede vazamento mesmo antes da serialização HTTP.
                  formaPagamento: true as const,
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
            // PR18072026 W1 (coordenador) — mesmo motivo do `valor` acima: o
            // SERVIDOR precisa somar valorUnit×qtdPrevista pra `valorHoje` mesmo
            // fora do billingAudience. A saída pro billingAudience (valorUnit cru
            // por item) continua gateada abaixo — só o SELECT abriu.
            valorUnit: true,
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
    // PR18072026 W1 (coordenador) — valor REAL da config, independente do ator.
    // `moduloFinanceiroAtivo` acima preserva a semântica ORIGINAL (só true p/
    // billingAudience — gate de pix/formaPagamento/saldoAberto/limiteFiado/valor/
    // cobrancaStatus/valorUnit, todos dado comercial de verdade, intocados). Este
    // aqui gateia SÓ os campos ADITIVOS seguros p/ o entregador comum (sem
    // cobrança): metodoPadrao (chip [Pago]), debitoAtual e valorHoje.
    let moduloFinanceiroAtivoConfig = false;
    let pix: RotaPix | null = null;
    // AVISO-CHEGANDO — o app só arma o 2º anel (~500m) quando avisoChegandoAtivo
    // é true (effectsEnabled global E o toggle da empresa) — evita POST inútil
    // com o recurso OFF. Defaults seguros (false/500) se a leitura falhar.
    let avisoChegandoAtivo = false;
    let avisoChegandoDistanciaM = 500;
    // S2 (25/07, PR25072026-ROTA-CONFERIDA) — mesmo default do planejador
    // (LogisticaRotaService.DEFAULT_VELOCIDADE_KMH, privado lá — duplicado aqui
    // de propósito: é só o fallback de leitura, não uma 2ª fonte de verdade).
    let velocidadeMediaKmH = 25;
    let comprovante: RotaRequisitosComprovante = {
      fotoObrigatoria: false,
      assinaturaObrigatoria: false,
      codigoObrigatorio: false,
    };
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: {
          // PR18072026 W1 (coordenador) — moduloFinanceiroAtivo (o TOGGLE) sai do
          // gate de billingAudience: é um booleano de feature, não dado comercial —
          // precisa ser lido p/ QUALQUER ator pra gatear metodoPadrao/debitoAtual/
          // valorHoje. pixChave/pixNome/pixCidade (dado sensível de verdade)
          // CONTINUAM só p/ billingAudience — intocado.
          moduloFinanceiroAtivo: true as const,
          ...(billingAudience
            ? {
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
          // S2 (25/07, PR25072026-ROTA-CONFERIDA) — precisa da velocidade média
          // pra converter a perna (Haversine, recalculada aqui no reload — ver
          // legDistanceM abaixo) em legDurationS. MESMO default do planejador
          // (LogisticaRotaService.DEFAULT_VELOCIDADE_KMH) quando ausente/≤0.
          velocidadeMediaKmH: true,
        },
      });
      moduloFinanceiroAtivoConfig = cfg?.moduloFinanceiroAtivo ?? false;
      moduloFinanceiroAtivo = billingAudience && moduloFinanceiroAtivoConfig;
      // O QR só existe com o módulo ON e a chave configurada (regra do M4 preservada:
      // financeiro OFF = nenhum pagamento aparece na entrega, nunca).
      if (moduloFinanceiroAtivo && cfg?.pixChave) {
        pix = { chave: cfg.pixChave, nome: cfg.pixNome ?? null, cidade: cfg.pixCidade ?? null };
      }
      avisoChegandoAtivo = this.effectsEnabled && !!cfg?.avisoChegandoEnabled;
      if (typeof cfg?.avisoChegandoDistanciaM === 'number' && cfg.avisoChegandoDistanciaM > 0) {
        avisoChegandoDistanciaM = cfg.avisoChegandoDistanciaM;
      }
      if (typeof cfg?.velocidadeMediaKmH === 'number' && cfg.velocidadeMediaKmH > 0) {
        velocidadeMediaKmH = cfg.velocidadeMediaKmH;
      }
      comprovante = this.operacao?.requisitosFromConfig(cfg) ?? comprovante;
    } catch (e: any) {
      this.logger.warn(`[logistica] listRota loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }

    // F1 — saldo em aberto POR CLIENTE ("quanto me deve"), fonte única
    // (saldoAbertoPorClientes). SÓ com o módulo financeiro ON — OFF significa que
    // dinheiro não aparece (nem roda) em lugar nenhum da entrega. Best-effort:
    // falha aqui NUNCA derruba a rota — o app só fica sem o badge.
    // PR18072026 W1 (coordenador) — gate por moduloFinanceiroAtivoConfig (não mais
    // preso a billingAudience): debitoAtual (aditivo, seguro) também precisa deste
    // mapa pro entregador comum. saldoAberto (billing-only) segue lendo o MESMO mapa.
    let saldoPorCliente = new Map<string, { pendente: number; aguardando: number }>();
    if (moduloFinanceiroAtivoConfig) {
      try {
        saldoPorCliente = await this.saldoAbertoPorClientes(
          companyId,
          Array.from(new Set(rows.map((r) => r.customerProfile.id))),
        );
      } catch (e: any) {
        this.logger.warn(`[logistica] listRota saldoAberto company=${companyId} falhou: ${String(e?.message || e)}`);
      }
    }

    // PR27072026 F2 — PARADA AMARELA DE DEVEDOR: mesmo gate de moduloFinanceiroAtivoConfig
    // acima (sem financeiro real não existe "devedor"). resolverDevedorNaRota já
    // resolve NORMAL sozinho fora do Advanced+ — chamar sempre é seguro, só evitamos
    // a query extra quando já sabemos que não há financeiro.
    let devedorPorCliente = new Map<string, { devedor: boolean; modo: 'COBRANCA' | 'EXCLUIR' | 'NORMAL'; saldoAberto: number; motivo: string | null }>();
    if (moduloFinanceiroAtivoConfig) {
      try {
        devedorPorCliente = await this.resolverDevedorNaRota(
          companyId,
          Array.from(new Set(rows.map((r) => r.customerProfile.id))),
        );
      } catch (e: any) {
        this.logger.warn(`[logistica] listRota devedorNaRota company=${companyId} falhou: ${String(e?.message || e)}`);
      }
    }
    // EXCLUIR: a entrega do devedor NÃO entra na montagem/leitura de hoje — filtro
    // só na SELEÇÃO (a ocorrência CONTINUA 'agendada', ninguém cancela nada aqui;
    // o fechamento de caixa F0 a devolve no dia seguinte). Fica ANTES do cálculo de
    // driverIds/routeMetadata de propósito: aquele bloco só decide QUAL sessão de
    // tracking mostrar (não muda com a exclusão) — reduzir o blast radius aqui.
    const rowsVisiveis = rows.filter((r) => devedorPorCliente.get(r.customerProfile.id)?.modo !== 'EXCLUIR');

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
    // S2 (25/07, PR25072026-ROTA-CONFERIDA) — "perna a perna": rastreia o ÚLTIMO
    // ponto físico válido ao longo da SEQUÊNCIA (`rows` já vem ordenado por
    // rotaOrdem asc — o orderBy do fetch acima, a MESMA ordem que o app usa pra
    // numerar o carrossel). Fica FORA do .map (closure) de propósito: precisa
    // avançar sequencialmente entre paradas (Array.prototype.map processa os
    // índices em ordem crescente, garantido pelo spec).
    let prevLegCoord: Coord | null = null;
    return {
      date: dayISO,
      total: rowsVisiveis.length,
      refreshedAt: new Date().toISOString(),
      ...operationalRouteMetadata,
      ...(billingAudience ? { routeMode: routeMode ?? null } : {}),
      effectsEnabled: this.effectsEnabled,
      ...(billingAudience ? { moduloFinanceiroAtivo, pix } : {}),
      avisoChegandoAtivo,
      avisoChegandoDistanciaM,
      comprovante,
      items: rowsVisiveis.map((r) => {
        const foto = r.comprovantes.find((item) => item.tipo === 'foto') ?? null;
        const assinatura = r.comprovantes.find((item) => item.tipo === 'assinatura') ?? null;
        // PR18072026 W1 (coordenador) — valorHoje: total SEGURO da entrega ATUAL
        // pro entregador comum ver quanto cobrar na porta, sem expor valorUnit
        // por item nem o catálogo inteiro (isso continua billingAudience-only,
        // abaixo). Soma EntregaItem.valorUnit×qtdPrevista — a MESMA fonte
        // canônica que gerarDia/materialize já grava (precoAcordado > catálogo >
        // precoPadrao, ver resolveValorUnit/resolveUnitValue); entrega legada sem
        // EntregaItem (ainda usa o campo escalar) cai no r.valor.
        const valorHoje = moduloFinanceiroAtivoConfig
          ? round2(
              r.itens.length > 0
                ? r.itens.reduce(
                    (sum, it) => sum + Math.max(0, Number(it.qtdPrevista) || 0) * Math.max(0, Number(it.valorUnit) || 0),
                    0,
                  )
                : Math.max(0, Number(r.valor) || 0),
            )
          : undefined;
        // FIX (25/07) — o local só vale como fonte de lat/lng se tiver os DOIS
        // eixos válidos; senão a fonte inteira cai pro perfil (nunca mistura
        // local.lat com customerProfile.lng). Ver logistica-geo-fonte.util.ts.
        const clienteCoord = resolverCoordenadaMultilocal(r.local, r.customerProfile);
        // S2 — perna (trecho) da parada ANTERIOR até esta, recalculada por
        // Haversine. SEM coluna nova (contrato da sprint): o listRota não
        // guarda a matriz OSRM do planejamento original (não persistida), então
        // toda leitura/reload aproxima por linha reta — legFonte:'aproximada'
        // documenta a origem do número pro app nunca confundir com o cálculo
        // real por ruas (só planejar/iniciar respondem 'osrm', e só na hora).
        // Não chama o proxy/OSRM aqui de propósito: listRota é hot-path de
        // polling (refresh frequente do app) e o degrau 1 (LogisticaOsrmService)
        // tem rate-limit de 30/min/empresa — gastar chamada de matriz num GET
        // de leitura estoura esse orçamento rapidinho, sem necessidade (é só
        // pra exibir, não pra rotear de novo).
        const stopParaLeg = { id: r.id, lat: clienteCoord.lat, lng: clienteCoord.lng, status: r.status, nome: null };
        const semCoordenadaParada = !hasCoord(stopParaLeg);
        let legDistanceM: number | null = null;
        let legDurationS: number | null = null;
        let legFonte: 'osrm' | 'aproximada' | null = null;
        if (!semCoordenadaParada) {
          const curLegCoord: Coord = { lat: clienteCoord.lat as number, lng: clienteCoord.lng as number };
          if (prevLegCoord) {
            const legKm = haversineKm(prevLegCoord, curLegCoord);
            legDistanceM = Math.round(legKm * 1000);
            legDurationS = Math.round((legKm / velocidadeMediaKmH) * 3600);
            legFonte = 'aproximada';
          }
          // Avança mesmo na 1ª parada válida (sem perna própria: prevLegCoord
          // ainda era null) — é o ponto de partida pra perna da PRÓXIMA.
          prevLegCoord = curLegCoord;
        }
        // `prevLegCoord` NÃO avança quando a parada está semCoordenada: a
        // próxima parada válida precisa medir a partir do último ponto físico
        // conhecido (pular o "buraco"), não do vazio.
        // PR27072026 F2 — PARADA AMARELA: só marca "só cobrar" no modo COBRANCA
        // (EXCLUIR nem chega aqui — já saiu em rowsVisiveis; NORMAL/BASIC/sem
        // financeiro devolvem devedor:false do resolverDevedorNaRota). Mesmo gate
        // de moduloFinanceiroAtivoConfig do debitoAtual logo abaixo — o entregador
        // comum PRECISA ver isto (é ele quem decide na porta, não só o billing owner).
        const devedorInfo = devedorPorCliente.get(r.customerProfile.id);
        const somenteCobranca = !!(moduloFinanceiroAtivoConfig && devedorInfo?.devedor && devedorInfo.modo === 'COBRANCA');
        return {
          id: r.id,
        status: r.status,
        quantidade: r.quantidade,
        // L4-A (18/07) — legado (antes deste pacote) grava null; o app trata
        // null como recorrente (mesmo default do bug que este pacote corrige).
        origem: r.origem ?? null,
        ...(billingAudience ? { valor: r.valor } : {}),
        ...(valorHoje !== undefined ? { valorHoje } : {}),
        scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        deliveredLat: r.deliveredLat ?? null,
        deliveredLng: r.deliveredLng ?? null,
        // MODO CADERNETA (05/08) — 'dinheiro'|'pix'|'cartao'|'fiado'|null. Mesmo
        // gate ADITIVO do metodoPadrao/debitoAtual (config do tenant, não papel
        // do ator): é o que a lista do dia usa pra dizer quem PAGOU e quem ficou
        // devendo, em vez de sete "Entregue" iguais.
        ...(moduloFinanceiroAtivoConfig ? { receiptMethod: r.receiptMethod ?? null } : {}),
        ...(billingAudience ? { cobrancaStatus: r.cobrancaStatus } : {}),
        // PR27072026 F2 — chip "Só cobrar" da parada amarela de devedor (ver
        // resolverDevedorNaRota). somenteCobranca sempre presente (boolean estável,
        // nunca undefined) pro front não precisar de `?.`; motivoCobranca só
        // preenche junto ("R$ X em aberto").
        somenteCobranca,
        motivoCobranca: somenteCobranca ? (devedorInfo?.motivo ?? null) : null,
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
        // S2 (25/07, PR25072026-ROTA-CONFERIDA) — conector "perna a perna" da
        // lista da rota (app.js routeLegConnector). Ver nota acima (Haversine
        // sempre, sem coluna nova; legFonte documenta a aproximação).
        semCoordenada: semCoordenadaParada,
        legDistanceM,
        legDurationS,
        legFonte,
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
          lat: clienteCoord.lat,
          lng: clienteCoord.lng,
          phone: r.customerProfile.phone ?? null,
          // PR18072026 W1 — observação livre sobre o cliente (operacional, sempre
          // visível — não gateado por billingAudience).
          observacoes: r.customerProfile.observacoes ?? null,
          // PR18072026 W1 (coordenador) — DUAS exposições ADITIVAS gateadas por
          // moduloFinanceiroAtivoConfig (o valor REAL da config, independente do
          // ator) — NÃO por billingAudience: o entregador comum (sem cobrança)
          // precisa das duas pra folha de chegada modo simples (W4):
          //   metodoPadrao → receiptMethod do botão [Pago] (cliente 'na_hora').
          //   debitoAtual  → mesma fonte canônica de saldoAberto (saldoAbertoPorClientes),
          //                  só com o nome que o app espera.
          // Não mexe no bloco billingAudience abaixo (formaPagamento/saldoAberto/
          // limiteFiado seguem EXCLUSIVOS de dono/master).
          ...(moduloFinanceiroAtivoConfig
            ? {
                metodoPadrao: r.customerProfile.metodoPadrao ?? null,
                debitoAtual: somaSaldo(saldoPorCliente.get(r.customerProfile.id)),
              }
            : {}),
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
  async createEntrega(
    companyId: number,
    input: CreateEntregaInput,
    actor?: LogisticaActor | null,
  ): Promise<{ id: string }> {
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

    // 🔴 28/07 — MOTORISTA DA PARADA AVULSA (Rota rápida do APK).
    //
    // Sem isto a entrega nascia `entregadorId: null` e o Iniciar caía em
    // "Atribua as entregas a exatamente um motorista" (resolveSingleDriver
    // exige EXATAMENTE 1 e conta null como órfã) — uma parada avulsa travava
    // a rota do dia INTEIRA. Mesma regra do admin-route/prepare, que adota as
    // abertas sem dono pra quem monta; a Rota rápida não passa por lá.
    //
    // Só entra com `paraMinhaRota` explícito: o painel web (admin agendando pra
    // outro motorista) continua nascendo sem dono, pro prepare adotar depois.
    // Ator inválido/de outra empresa cai em null — nunca inventa motorista.
    let entregadorId: number | null = null;
    if (input.paraMinhaRota) {
      const candidato = actorIdOrNull(actor);
      if (candidato) {
        const driver = await this.prisma.user.findFirst({
          where: { id: candidato, companyId, isActive: true, isSystemMaster: false },
          select: { id: true },
        });
        entregadorId = driver?.id ?? null;
      }
    }

    const entregaId = randomUUID();
    const creditReservation = this.creditActionUsage
      ? await this.creditActionUsage.authorize({
          companyId,
          actionKey: 'logistica_delivery',
          refId: `entrega:${entregaId}`,
          metadata: { trigger: 'entrega_iniciada' },
        })
      : null;
    if (creditReservation && !creditReservation.allowed) {
      throw new BadRequestException('Saldo de créditos insuficiente para iniciar a entrega.');
    }

    let created: { id: string };
    try {
      created = await this.prisma.entrega.create({
        data: {
        id: entregaId,
        companyId,
        customerProfileId: conta.id,
        contatoId,
        // MULTILOCAL — ONDE entrega (null = perfil/legado), já validado do cliente.
        localId,
        productId,
        quantidade,
        valor,
        status: 'agendada',
        // 28/07 — null quando não é "minha rota" (comportamento de sempre).
        entregadorId,
        atribuidoPorUserId: entregadorId,
        atribuidoAt: entregadorId ? new Date() : null,
        // L4-A (18/07) — criação manual (POST /logistica/entregas) é sempre avulsa.
        origem: 'avulsa',
        scheduledAt,
        cobrancaStatus: 'pendente',
        notes: input.notes?.trim() || null,
        },
        select: { id: true },
      });
    } catch (error) {
      await creditReservation?.release?.().catch(() => undefined);
      throw error;
    }
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
        cobrancaStatus: true, idempotencyKey: true, whatsappStatus: true, cobrancaOutcome: true, deliveredAt: true,
        comprovanteCodigoHash: true, comprovanteCodigoSalt: true,
        // F0 (27/07) — precisa pra avançar o cursor da Agenda no desfecho.
        agendaOcorrenciaKey: true, planoEntregaId: true,
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
    const recebidoNaHora = metodoImediato(receiptMethod) ? true : undefined;

    // Passo 1 (SEMPRE): grava status/GPS + as quantidades por item numa MESMA TRANSAÇÃO.
    // R3 — atomicidade do NÚCLEO do confirmar: ou o status 'entregue'/GPS E as qtd dos
    // itens caem juntos, ou nada cai (rollback). Assim o desfecho fica CONSISTENTE — não
    // existe "entregue com itens pela metade". A transação envolve APENAS escrita local
    // (Entrega + EntregaItem desta entrega); os efeitos externos (WhatsApp blindado +
    // cobrança) ficam FORA da tx, como antes — nada de I/O externo dentro de transação.
    // Idempotente: reconfirmar não duplica efeito (jaEntregue barra o Passo 2).
    const jaEntregue = entrega.status === 'entregue';
    // Reabertura é uma correção operacional da MESMA entrega. Permite alterar
    // itens/quantidades, mas não cobra crédito rastreado nem dispara WhatsApp e
    // cobrança externa uma segunda vez.
    const reabertaParaCorrecao = !jaEntregue && entrega.deliveredAt != null;
    // `preco` = preço de HOJE editado na chegada (22/07). Só entra quando veio
    // número finito >= 0; undefined = mantém o valorUnit que já está no item.
    const itensValidos = Array.isArray(gps.itens)
      ? gps.itens
          .map((it) => ({ id: String(it?.id || '').trim(), qtd: Number(it?.qtdEntregue), preco: precoEditado((it as any)?.valorUnit) }))
          .filter((it) => it.id && Number.isFinite(it.qtd))
      : [];
    // F2 — produtos NOVOS a criar (qtd<=0 é no-op: nada a adicionar). productId
    // precisa ser um inteiro positivo; o resto (existência/empresa) é resolvido
    // DENTRO da tx (company-scoped — regra de ouro do preço vem junto).
    const novosItensValidos = Array.isArray(gps.novosItens)
      ? gps.novosItens
          .map((it) => ({ productId: Math.trunc(Number(it?.productId)), qtd: Number(it?.qtdEntregue), preco: precoEditado((it as any)?.valorUnit) }))
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
    if (this.trackedBilling && !reabertaParaCorrecao) {
      trackedCharge = await this.trackedBilling.prepareDeliveryCompletion(
        companyId,
        entrega.id,
        actorIdOrNull(actor),
      );
    }
    // F0 (27/07) — avanço do cursor acontece NA tx; o evento de extrato só grava
    // DEPOIS do commit (ver contrato em logistica-agenda-evento.util.ts).
    let avancoAgenda: { origemKey: string; proximaKey: string | null } | null = null;
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
        // F0 (27/07) — CURSOR NO DESFECHO: entregou uma ocorrência da Agenda?
        // O plano anda. Dentro da MESMA transação núcleo (ver avancarPlanoNoDesfecho);
        // o evento do extrato fica pra depois do commit.
        if (entrega.agendaOcorrenciaKey && entrega.planoEntregaId) {
          avancoAgenda = await this.avancarPlanoNoDesfecho(tx, companyId, {
            planoEntregaId: entrega.planoEntregaId,
            agendaOcorrenciaKey: entrega.agendaOcorrenciaKey,
          });
        }
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
            data: {
              qtdEntregue: Math.max(0, Math.trunc(it.qtd)),
              // Preço de HOJE (22/07): escopo de UMA entrega, dentro da mesma tx da
              // quantidade. Não existe caminho daqui pro catálogo nem pro preço
              // acordado do cliente — o passado não é reescrito.
              ...(it.preco !== undefined ? { valorUnit: it.preco } : {}),
            },
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
                // Preço editado na chegada vence o catálogo — SÓ neste item desta
                // entrega (22/07). Sem edição, segue a regra de ouro de sempre.
                valorUnit: novo.preco !== undefined ? novo.preco : Math.max(0, precoCatalogo),
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
          // 22/07 — o "algum item tem preço > 0" sozinho travava o caso legítimo de
          // ZERAR o preço na chegada (cortesia/brinde do dia): a soma daria 0, a
          // condição seria falsa e a entrega ficaria com o valor velho. Preço
          // explicitamente editado no payload também libera o recálculo.
          const houvePrecoEditado =
            itensValidos.some((it) => it.preco !== undefined) || novosItensValidos.some((it) => it.preco !== undefined);
          if (itensRows.length > 0 && (houvePrecoEditado || itensRows.some((it) => (Number(it.valorUnit) || 0) > 0))) {
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
    // FORA da tx do confirmar — mesmo padrão do persistirDesfecho).
    await this.realimentarCoordenadaPorta(companyId, entrega.customerProfileId, entrega.localId ?? null, {
      lat,
      lng,
      accuracy: gps.accuracy,
    });

    // Passo 2 (SÓ com a flag ON e SÓ na primeira confirmação): os efeitos externos.
    // Enquanto HBX_LOGISTICA_ENABLED OFF → nenhum WhatsApp, nenhuma cobrança.
    //
    // R4 — FALHA VISÍVEL: o desfecho dos DOIS efeitos é PERSISTIDO na Entrega
    // (whatsappStatus/whatsappMotivo + cobrancaOutcome), não só logado. Se algum
    // efeito FALHA, emite UM MasterEvent (trilha do cockpit master). Best-effort:
    // gravar o desfecho/emitir o evento NUNCA pode derrubar o confirmar.
    // HISTÓRICO (22/07) — o saldo ANTES desta entrega tem que ser lido AQUI, antes
    // de lançar/quitar a cobrança: depois de lançar, o "valor antigo" já não existe
    // mais em lugar nenhum. É a foto que a tela do APK mostra ("Valor antigo").
    const saldoAntes = await this.saldoAbertoPorClientes(companyId, [entrega.customerProfileId])
      .then((m) => {
        const s = m.get(entrega.customerProfileId);
        return round2((s?.pendente || 0) + (s?.aguardando || 0));
      })
      .catch(() => 0);

    // ── 28/07 — BUG DO VALOR: correção que não chegava no dinheiro ────────────
    // Reabrir existe pra UMA coisa ("corrigir quantidade ou incluir itens") e
    // era exatamente nisso que falhava: o reconfirmar recalcula `Entrega.valor`
    // pelos itens (tx acima) mas pula o bloco de efeitos inteiro
    // (`!reabertaParaCorrecao` — e faz certo: não pode disparar WhatsApp nem
    // criar 2ª cobrança), então o charge ficava com o valor VELHO. Entregou 3
    // galões, cobrou 2. A cobrança que ainda NÃO foi recebida passa a seguir a
    // entrega; dinheiro recebido nunca se mexe (mesma trava dos freios do
    // reabrir/cancelar). Best-effort: nunca derruba o confirmar.
    let cobrancaAjustada = false;
    if (reabertaParaCorrecao) {
      cobrancaAjustada = await this.sincronizarCobrancaReaberta(companyId, entrega.id, valorCobranca);
    }

    let whatsappSent = false;
    let cobrancaLancada = false;
    if (this.effectsEnabled && !jaEntregue && !reabertaParaCorrecao) {
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

    // BOTÃO "PAGO" (22/07) — quita TODAS as cobranças ainda pendentes deste cliente,
    // não só a de hoje. Roda DEPOIS do lancarCobranca (a charge de hoje já existe e,
    // sendo pix/dinheiro, já nasceu quitada) e só com método imediato: 'fiado' NUNCA
    // quita nada. Reusa quitarCharge — mesma trava atômica, mesma trilha de log, e o
    // gancho do recovery vem junto. Best-effort: falhar aqui não desfaz a entrega.
    let quitadas = 0;
    let valorQuitado = 0;
    if (gps.quitarAberto === true && metodoImediato(receiptMethod)) {
      try {
        const pendentes = await this.prisma.financeiroCharge.findMany({
          where: {
            companyId,
            customerProfileId: entrega.customerProfileId,
            status: 'pending',
            sourceModule: { in: ['logistica_entrega', 'logistica_fechamento'] },
          },
          select: { id: true, amount: true },
        });
        for (const p of pendentes) {
          const r = await this.quitarCharge(companyId, p.id, { userId: actorIdOrNull(actor) });
          if (r && !r.alreadyPaid) {
            quitadas += 1;
            valorQuitado = round2(valorQuitado + (Number(p.amount) || 0));
          }
        }
      } catch (e: any) {
        this.logger.warn(
          `[logistica] quitar-aberto best-effort falhou entrega=${entrega.id} company=${companyId}: ${String(e?.message || e)}`,
        );
      }
    }

    // F0 (27/07) — extrato do avanço do cursor, pós-commit, prisma raiz.
    await this.registrarAvancoAgendaPosCommit(companyId, entrega, avancoAgenda, actorIdOrNull(actor));

    // FISCAL F3 — baixa de estoque da entrega confirmada. Best-effort: rua
    // NUNCA trava por estoque (negativo vira aviso no log do serviço). O dedup
    // interno (entrega+produto) torna seguro rodar também na reconfirmação —
    // item NOVO de uma correção baixa; item já baixado não baixa 2×.
    if (this.fiscalEstoque) {
      await this.fiscalEstoque.baixaPorEntrega(companyId, entrega.id).catch((e: any) => {
        this.logger.warn(`[logistica] baixa de estoque entrega=${entrega.id} falhou: ${String(e?.message || e)}`);
      });
    }

    // HISTÓRICO DO CLIENTE (22/07) — a linha que o entregador mostra na porta.
    // Best-effort por decisão: registro NUNCA pode derrubar operação de rua.
    await this.registrarHistorico(companyId, {
      customerProfileId: entrega.customerProfileId,
      entregaId: entrega.id,
      tipo: metodoImediato(receiptMethod) ? 'pago' : 'entregue',
      valorAnterior: saldoAntes,
      valorEvento: round2(valorCobranca),
      // Pago quita o total (saldo velho + hoje) → sobra zero. Entregue soma.
      valorTotal:
        metodoImediato(receiptMethod)
          ? gps.quitarAberto === true
            ? 0
            : round2(saldoAntes)
          : round2(saldoAntes + valorCobranca),
      receiptMethod,
      lat,
      lng,
      actor,
    });

    // M3 — re-ETA das paradas restantes (aditivo, best-effort, não muda o retorno).
    await this.recalcularEtaSilencioso(companyId, actor);

    return {
      id: entrega.id,
      status: 'entregue',
      effectsEnabled: this.effectsEnabled,
      whatsappSent,
      cobrancaLancada,
      cobrancaAjustada,
      quitadas,
      valorQuitado,
    };
  }

  /**
   * 28/07 — sincroniza a cobrança de uma entrega REABERTA com o valor corrigido.
   *
   * Regra única, a mesma dos freios do reabrir e do cancelar: **dinheiro que
   * ainda não foi recebido segue a entrega; dinheiro recebido não se mexe.**
   * Por isso o WHERE trava em `status:'pending'` + `paidAt:null` — charge pago
   * (ou já cancelado) fica intacto, e desde o freio do reabrir uma entrega paga
   * nem chega aqui. `amount: { not: novo }` deixa o caminho ocioso quando nada
   * mudou (o caso comum: reabriu, olhou, confirmou igual).
   *
   * Valor corrigido pra ZERO (cortesia/brinde do dia) NÃO vira charge de R$ 0,00
   * — a cobrança é cancelada e a entrega fica 'isenta', senão a cobrança
   * automática iria cobrar zero real do cliente no WhatsApp.
   *
   * Best-effort por contrato do módulo: a entrega já está gravada como
   * 'entregue' quando este método roda — um erro aqui vira log, nunca rollback.
   */
  private async sincronizarCobrancaReaberta(
    companyId: number,
    entregaId: string,
    valor: number,
  ): Promise<boolean> {
    const novo = round2(Math.max(0, Number(valor) || 0));
    try {
      if (novo <= 0) {
        const zerada = await this.prisma.financeiroCharge.updateMany({
          where: { companyId, entregaId, status: 'pending', paidAt: null },
          data: { status: 'cancelled', lifecycle: 'cancelled' },
        });
        if (zerada.count > 0) {
          await this.prisma.entrega.update({ where: { id: entregaId }, data: { cobrancaStatus: 'isenta' } });
          return true;
        }
        return false;
      }
      const ajustada = await this.prisma.financeiroCharge.updateMany({
        where: { companyId, entregaId, status: 'pending', paidAt: null, amount: { not: novo } },
        data: { amount: novo },
      });
      return ajustada.count > 0;
    } catch (e: any) {
      this.logger.warn(
        `[logistica] ajuste da cobrança reaberta falhou entrega=${entregaId} company=${companyId}: ${String(e?.message || e)}`,
      );
      return false;
    }
  }

  // ── REABRIR ENTREGA CONCLUÍDA ─────────────────────────────────────────────
  async reabrirEntrega(
    companyId: number,
    id: string,
    actor?: LogisticaActor | null,
  ): Promise<{ id: string; status: string } | null> {
    if (!companyId || !id) return null;
    const actorWhere = actor ? await this.requireOperacao().whereForActor(actor) : {};
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId, ...actorWhere },
      // customerProfileId/planoEntregaId entram pro evento do extrato da agenda.
      select: { id: true, status: true, customerProfileId: true, planoEntregaId: true },
    });
    if (!entrega) return null;
    if (entrega.status === 'cancelada') throw new BadRequestException('Entrega cancelada não pode ser reaberta.');
    if (entrega.status !== 'entregue') return { id: entrega.id, status: entrega.status };

    // ── 28/07 — FREIO DO DINHEIRO JÁ RECEBIDO (incidente Dejanira, cia 41) ────
    // O caso real: entrega confirmada e PAGA na hora (R$ 20 no bolso, charge
    // approved/paid), reaberta 5 minutos depois e nunca reconfirmada. Resultado
    // no banco: status 'agendada' + deliveredAt preenchido + cobrança paga —
    // uma entrega que o painel mostra como "a fazer" com dinheiro dentro. Nem
    // o fechamento de caixa a resgata (ele se recusa a tocar em qualquer coisa
    // com cobrança resolvida, e faz certo).
    //
    // Reabrir NÃO pode desfazer um recebimento sozinho (regra do dono: sistema
    // nunca decide dinheiro sozinho), e reabrir por cima dele produz mentira.
    // Então recusa e diz onde resolver. Fiado ainda PENDENTE segue reabrindo
    // normal — nada foi recebido, o desfecho é que manda.
    const cobranca = await this.prisma.financeiroCharge.findFirst({
      where: { companyId, entregaId: entrega.id },
      select: { amount: true, status: true, lifecycle: true, paidAt: true },
    });
    if (cobranca && (cobranca.paidAt || cobranca.status === 'approved' || cobranca.lifecycle === 'paid')) {
      const valor = `R$ ${round2(Number(cobranca.amount) || 0).toFixed(2).replace('.', ',')}`;
      throw new BadRequestException(
        `Esta entrega já foi paga (${valor}). Cancele o recebimento no financeiro do cliente antes de reabrir.`,
      );
    }

    const changed = await this.prisma.entrega.updateMany({
      where: { id: entrega.id, companyId, status: 'entregue' },
      data: {
        status: 'agendada',
        startedAt: null,
        // deliveredAt permanece como marca interna de correção. Ao confirmar de
        // novo ele recebe o horário novo; isso evita efeitos/cobranças duplicados.
        idempotencyKey: null,
      },
    });
    if (changed.count !== 1) throw new ConflictException('A entrega mudou enquanto era reaberta. Atualize e tente novamente.');
    // Extrato da agenda (F0): reabrir tira a entrega do dia de novo — some da
    // vista se ninguém reconfirmar. Vira linha com dia/hora/autor na ficha do
    // cliente. Best-effort por contrato do util: nunca derruba a reabertura.
    await registrarEventoAgenda(this.prisma, {
      companyId,
      customerProfileId: entrega.customerProfileId,
      entregaId: entrega.id,
      planoEntregaId: entrega.planoEntregaId,
      tipo: 'ENTREGA_REABERTA',
      deTexto: 'entregue',
      paraTexto: 'a fazer',
      origem: 'app',
      actorUserId: actorIdOrNull(actor),
    });
    await this.recalcularEtaSilencioso(companyId, actor);
    return { id: entrega.id, status: 'agendada' };
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

  // ── F0 (27/07) — CURSOR NO DESFECHO ──────────────────────────────────────────
  /**
   * Regra-mãe do dono (27/07): "Registrou entrega? Beleza. Não registrou? Volta
   * tudo pro seu lugar." O cursor `LogisticaPlanoEntrega.proximaData` só anda
   * AQUI — no desfecho da ocorrência (chamado de dentro da transação núcleo de
   * `confirmarEntrega` E de `cancelarEntrega`) — NUNCA na geração
   * (`generateDay`, logistica-agenda.service.ts). Era o avanço-na-geração que
   * causava "a sexta que não volta".
   *
   * Avança a partir da DATA DE ORIGEM da chave (`sourceDateFromOccurrenceKey`),
   * NUNCA do dia em que o desfecho aconteceu — entrega de sexta adiantada e
   * executada numa segunda avança o plano pra sexta SEGUINTE, não pra segunda
   * seguinte (senão a cadência do cliente escorrega pro dia errado pra sempre).
   *
   * IDEMPOTENTE por construção: o `updateMany` só pega quando `proximaData`
   * ainda não passou da origem (`<= dataOrigem` ou nula) — dois desfechos da
   * MESMA ocorrência avançam o plano 1 vez só.
   *
   * TELEMETRIA FORA DA TRANSAÇÃO (endurecido 27/07): esta função NÃO grava o
   * evento PLANO_AVANCADO — devolve as datas e o CHAMADOR grava DEPOIS do
   * commit, com o prisma raiz. Erro de INSERT dentro da tx abortaria a
   * transação núcleo no Postgres (mesmo com catch) e derrubaria a confirmação
   * na porta do cliente por causa de uma linha de extrato — nunca.
   */
  private async avancarPlanoNoDesfecho(
    tx: any,
    companyId: number,
    input: {
      planoEntregaId: string;
      agendaOcorrenciaKey: string;
    },
  ): Promise<{ origemKey: string; proximaKey: string | null } | null> {
    const origem = sourceDateFromOccurrenceKey(input.agendaOcorrenciaKey);
    if (!origem) return null;
    const plano = await tx.logisticaPlanoEntrega.findFirst({
      where: { id: input.planoEntregaId, companyId },
      select: { diaSemana: true, frequencia: true, intervaloDias: true },
    });
    if (!plano) return null; // plano some (reparo de dados) — desfecho da entrega não pode travar por isso
    const dataOrigem = saoPauloMidnight(origem);
    const proxima = nextOccurrenceDate(plano, dataOrigem);
    const avancado = await tx.logisticaPlanoEntrega.updateMany({
      where: {
        id: input.planoEntregaId,
        companyId,
        OR: [{ proximaData: null }, { proximaData: { lte: dataOrigem } }],
      },
      data: { proximaData: proxima },
    });
    if (avancado.count === 0) return null; // outro desfecho já venceu a corrida — idempotente
    return { origemKey: origem, proximaKey: saoPauloDateKey(proxima) };
  }

  /** Grava o PLANO_AVANCADO pós-commit (prisma raiz — ver contrato no evento.util). */
  private async registrarAvancoAgendaPosCommit(
    companyId: number,
    entrega: { id: string; customerProfileId: string; planoEntregaId: string | null },
    avanco: { origemKey: string; proximaKey: string | null } | null,
    actorUserId: number | null,
  ): Promise<void> {
    if (!avanco || !entrega.planoEntregaId) return;
    await registrarEventoAgenda(this.prisma, {
      companyId,
      customerProfileId: entrega.customerProfileId,
      entregaId: entrega.id,
      planoEntregaId: entrega.planoEntregaId,
      tipo: 'PLANO_AVANCADO',
      deTexto: formatDDMM(avanco.origemKey),
      paraTexto: avanco.proximaKey ? formatDDMM(avanco.proximaKey) : null,
      origem: 'desfecho',
      actorUserId,
    });
  }

  // ── B1 — GPS de ouro jogado fora: realimenta o cadastro do cliente ──────────
  /**
   * FIX 25/07 (incidente empresa 41) — o GPS de ouro corrigia o PERFIL, mas quem o
   * mapa/rota/card leem é o LOCAL (`local ?? perfil`, ver `toStop` em
   * logistica-rota.service.ts e o card em nucleo-cadastro.service.ts). Como a
   * realimentação era um OU exclusivo (`entrega.localId ? local : perfil`), toda
   * entrega SEM `localId` corrigia só o perfil — e o local seguia com o palpite do
   * geocode pra sempre. Na conta do André as 3 entregas confirmadas tinham
   * `localId = null`: o perfil convergiu pra porta certa e o mapa continuou apontando
   * 2.991 m longe. Agora a porta real irriga OS DOIS lados que a leitura pode usar:
   *
   *  · LOCAL — o da entrega quando ela tem um; senão o PRINCIPAL ativo do cliente
   *    (é ele que o card e a rota leem quando a entrega não carrega local).
   *  · PERFIL — só quando a porta é a do endereço da CONTA (entrega sem local, ou
   *    local principal). GPS de um local secundário ("Loja") nunca reescreve o
   *    endereço da conta.
   *
   * Best-effort como os dois espelhos que ele orquestra: falha aqui NUNCA reverte a
   * entrega.
   */
  private async realimentarCoordenadaPorta(
    companyId: number,
    customerProfileId: string,
    localIdDaEntrega: string | null,
    gps: { lat: number | null; lng: number | null; accuracy?: number },
  ): Promise<void> {
    if (!gpsDeOuro(gps)) return; // mesmo crivo dos espelhos — evita query à toa.
    let localId = localIdDaEntrega;
    let portaEhDaConta = !localIdDaEntrega;
    try {
      if (localId) {
        const local = await this.prisma.localEntrega.findFirst({
          where: { id: localId, companyId },
          select: { isPrincipal: true },
        });
        portaEhDaConta = Boolean(local?.isPrincipal);
      } else {
        const principal = await this.prisma.localEntrega.findFirst({
          where: { companyId, customerProfileId, ativo: true, isPrincipal: true },
          select: { id: true },
        });
        localId = principal?.id ?? null;
      }
    } catch (e: any) {
      this.logger.warn(`[logistica] realimentarCoordenadaPorta cliente=${customerProfileId} falhou: ${String(e?.message || e)}`);
    }
    if (localId) await this.realimentarCoordenadaLocal(companyId, localId, gps);
    if (portaEhDaConta) await this.realimentarCoordenadaCliente(companyId, customerProfileId, gps);
  }

  /**
   * B1 (07/07) — o pino do cadastro nasce de geocode (CEP→Nominatim), impreciso
   * no BR (número de casa raro no OSM) → o geofence quase nunca dispara certo.
   * Ao confirmar com GPS PRECISO (accuracy<=60m), atualiza CustomerProfile.lat/lng
   * + geoFonte='gps_entrega' — a porta CONVERGE a cada entrega (última vence).
   * NUNCA sobrescreve uma coordenada marcada 'gps_cadastro' (o dono usou "Usar
   * este local" no cadastro E o fix PROVOU precisão <=60m — decisão humana
   * explícita, intocável). TETO DE PRECISÃO (25/07) — 'gps_impreciso' (fix ruim,
   * sem prova de precisão) NÃO entra nessa proteção: esta função É o corretivo
   * dele, e segue sobrescrevendo normalmente. Best-effort FORA da transação do
   * confirmar: falha aqui NUNCA reverte a entrega (mesmo padrão do persistirDesfecho).
   */
  private async realimentarCoordenadaCliente(
    companyId: number,
    customerProfileId: string,
    gps: { lat: number | null; lng: number | null; accuracy?: number },
  ): Promise<void> {
    if (!gpsDeOuro(gps)) return;
    try {
      const conta = await this.prisma.customerProfile.findFirst({
        where: { id: customerProfileId, companyId },
        select: { geoFonte: true },
      });
      // decisão humana intocável — SÓ 'gps_cadastro' bloqueia (25/07: 'gps_impreciso'
      // é justamente o oposto disso, e passa direto pra ser sobrescrito abaixo).
      if (!conta || conta.geoFonte === 'gps_cadastro') return;
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
   * mesma regra do perfil). TETO DE PRECISÃO (25/07) — 'gps_impreciso' NÃO é
   * protegido (é o alvo desta correção). company-scoped; best-effort FORA da tx
   * do confirmar: falha aqui NUNCA reverte a entrega.
   */
  private async realimentarCoordenadaLocal(
    companyId: number,
    localId: string,
    gps: { lat: number | null; lng: number | null; accuracy?: number },
  ): Promise<void> {
    if (!gpsDeOuro(gps)) return;
    try {
      const local = await this.prisma.localEntrega.findFirst({
        where: { id: localId, companyId },
        select: { geoFonte: true },
      });
      // decisão humana intocável — SÓ 'gps_cadastro' bloqueia (ver comentário
      // equivalente em realimentarCoordenadaCliente acima).
      if (!local || local.geoFonte === 'gps_cadastro') return;
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
  ): Promise<{ id: string; cobrancaCancelada?: boolean } | null> {
    if (!companyId || !id) return null;
    const actorWhere = actor ? await this.requireOperacao().whereForActor(actor) : {};
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId, ...actorWhere },
      select: {
        id: true, status: true, notes: true, customerProfileId: true,
        // F0 (27/07) — precisa pra avançar o cursor da Agenda no desfecho.
        agendaOcorrenciaKey: true, planoEntregaId: true,
      },
    });
    if (!entrega) return null;
    if (entrega.status === 'entregue') {
      throw new BadRequestException('Entrega já concluída não pode ser cancelada.');
    }
    const notes = motivo?.trim()
      ? `${entrega.notes ? entrega.notes + ' | ' : ''}Cancelada: ${motivo.trim()}`.slice(0, 500)
      : entrega.notes;
    // F0 (27/07) — status + cursor no MESMO $transaction (era update() solto):
    // cancelar É um desfecho (a ocorrência foi DECIDIDA, mesmo sem entregar), e
    // a regra-mãe não permite "cancelou mas o cursor não andou" ficar meio-feito.
    // Evento do extrato só DEPOIS do commit (contrato do evento.util).
    // ── 28/07 — NINGUÉM PAGA POR ENTREGA CANCELADA (ordem do dono) ───────────
    // Cobrança só existe numa entrega não-'entregue' depois de um REABRIR (é o
    // confirmar que lança). Era assim que nascia a cobrança órfã: reabre →
    // cancela → o fiado da entrega que não aconteceu continua na conta do
    // cliente (caso Daniela, cia 48, R$ 11). Cancelar a entrega agora cancela
    // junto a cobrança DELA que ainda não foi recebida.
    //
    // Trava dupla e deliberada: `paidAt: null` + `status: 'pending'`. Dinheiro
    // JÁ RECEBIDO nunca é desfeito por aqui (regra do dono: sistema não decide
    // dinheiro sozinho) — e desde o freio do reabrir uma entrega paga nem chega
    // neste caminho. NÃO lança exceção em nenhum ramo: `cancelarEntrega` é o
    // mesmo caminho da fila offline do APK (logistica-offline.service.ts), e um
    // throw aqui quebraria o replay do motorista.
    const desfecho = await this.prisma.$transaction(async (tx) => {
      const cobranca = await tx.financeiroCharge.updateMany({
        where: { companyId, entregaId: entrega.id, status: 'pending', paidAt: null },
        data: { status: 'cancelled', lifecycle: 'cancelled' },
      });
      const cobrancaCancelada = cobranca.count > 0;
      await tx.entrega.update({
        where: { id: entrega.id },
        data: {
          status: 'cancelada',
          notes,
          // Sem charge viva, o status da cobrança volta pro neutro — deixar
          // 'lancada' numa entrega cancelada é a mentira que gerou o caso.
          ...(cobrancaCancelada ? { cobrancaStatus: 'pendente' } : {}),
        },
      });
      const avanco = entrega.agendaOcorrenciaKey && entrega.planoEntregaId
        ? await this.avancarPlanoNoDesfecho(tx, companyId, {
          planoEntregaId: entrega.planoEntregaId,
          agendaOcorrenciaKey: entrega.agendaOcorrenciaKey,
        })
        : null;
      return { avanco, cobrancaCancelada };
    });
    // Default defensivo: mock pobre de $transaction em teste devolve undefined.
    const { avanco: avancoAgenda = null, cobrancaCancelada = false } = desfecho ?? {};
    await this.registrarAvancoAgendaPosCommit(companyId, entrega, avancoAgenda, actorIdOrNull(actor));
    // HISTÓRICO (22/07) — "Sem atendimento" também é visita, e é a linha que evita
    // a discussão "vocês nunca vieram". Best-effort, nunca derruba o cancelamento.
    await this.registrarHistorico(companyId, {
      customerProfileId: entrega.customerProfileId,
      entregaId: entrega.id,
      tipo: 'sem_atendimento',
      motivo: motivo?.trim() || null,
      actor,
    });
    // M3 — re-ETA das paradas restantes (aditivo, best-effort, não muda o retorno).
    await this.recalcularEtaSilencioso(companyId, actor);
    return { id: entrega.id, cobrancaCancelada };
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

    // FISCAL F2a — comprovante SEM VALOR FISCAL (PDF) na MESMA mensagem (vira
    // documento com o texto de caption). O gate por empresa mora no serviço
    // fiscal; falha na geração vira log e o texto segue sozinho.
    let anexoComprovante: Record<string, unknown> | null = null;
    if (this.fiscalComprovante) {
      anexoComprovante = await this.fiscalComprovante.anexoParaEntrega(companyId, entrega.id).catch((e: any) => {
        this.logger.warn(`[logistica] comprovante fiscal entrega=${entrega.id} falhou: ${String(e?.message || e)}`);
        return null;
      });
    }

    // MESMO caminho da cadência (queueOutboundForCompany) — disjuntor, 1-número=1-conexão,
    // gate de conexão viva, warmup e outbox com retry. NUNCA API crua, NUNCA socket novo.
    await this.conversations.queueOutboundForCompany(companyId, {
      to: contact,
      contactId: contact,
      body: finalBody,
      messageType: 'text',
      sourceModule: 'logistica_entrega',
      senderType: 'system',
      variables: {
        module: 'logistica',
        event: 'entregue',
        entregaId: entrega.id,
        ...(anexoComprovante ? { attachment: anexoComprovante } : {}),
      },
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
  ): Promise<{ cliente: string; itens: string; qtd: number; quantidade: number; produto: string; empresa: string; eta: string }> {
    const vars = { cliente, itens: '', qtd: 0, quantidade: 0, produto: '', empresa: '', eta: '' };
    try {
      const entrega = await this.prisma.entrega.findFirst({
        where: { id: entregaId, companyId },
        select: {
          quantidade: true,
          // F3 (27/07) — {eta} no template do aviso: minutos até a chegada.
          etaAt: true,
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
      // F3 (27/07) — {eta}: só quando existe etaAt fresco (rota rastreada);
      // sem ETA a variável fica "" e o render limpa o espaço órfão.
      vars.eta = formatEtaMinutos(entrega.etaAt) ?? '';
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
    receiptMethod?: 'pix' | 'dinheiro' | 'cartao' | 'fiado' | null,
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
    const pagoNaHora = forma !== 'pendura' && metodoImediato(receiptMethod);
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

  // ── PR27072026 F2 — PARADA AMARELA DE DEVEDOR (fonte ÚNICA) ─────────────────
  /**
   * Resolve o tratamento de cada cliente pra rota de HOJE a partir do MESMO
   * saldo/limite que listRota e o extrato já usam (saldoAbertoPorClientes +
   * CustomerProfile.limiteFiado) e do modo configurado em
   * LogisticaConfig.devedorNaRota ('COBRANCA' default | 'EXCLUIR' | 'NORMAL').
   *
   * Fonte ÚNICA do cálculo: listRota (chip amarelo "só cobrar") e o `prepare` do
   * admin-route (filtro da MONTAGEM, pra EXCLUIR nunca ganhar rotaOrdem) chamam
   * ISTO — os dois nunca podem divergir sobre quem é devedor.
   *
   * devedor = saldoAberto > 0 E (limiteFiado nulo OU saldoAberto > limiteFiado)
   * — MESMA fórmula de risco que o resto do módulo já usa.
   *
   * Cliente NÃO devedor sempre volta NORMAL, mesmo com o tenant configurado em
   * COBRANCA/EXCLUIR (a config é "o que fazer com quem deve", não afeta quem
   * está em dia). Fail-safe (tudo NORMAL) quando: sem companyId/clientes, config
   * ilegível, moduloFinanceiroAtivo OFF (sem financeiro real não existe "saldo"
   * de verdade — M4) ou nível BASIC (gate de nível — a "escada" comercial).
   */
  async resolverDevedorNaRota(
    companyId: number,
    clienteIds: string[],
  ): Promise<Map<string, { devedor: boolean; modo: 'COBRANCA' | 'EXCLUIR' | 'NORMAL'; saldoAberto: number; motivo: string | null }>> {
    const resultado = new Map<string, { devedor: boolean; modo: 'COBRANCA' | 'EXCLUIR' | 'NORMAL'; saldoAberto: number; motivo: string | null }>();
    const ids = Array.from(new Set((clienteIds || []).filter(Boolean)));
    if (!companyId || ids.length === 0) return resultado;
    for (const id of ids) resultado.set(id, { devedor: false, modo: 'NORMAL', saldoAberto: 0, motivo: null });

    let cfg: { moduloFinanceiroAtivo: boolean; devedorNaRota: unknown; logisticaNivel: unknown } | null = null;
    try {
      cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true, devedorNaRota: true, logisticaNivel: true },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] resolverDevedorNaRota loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
      return resultado; // fail-safe: tudo NORMAL
    }
    // M4 — sem financeiro real, "saldo em aberto" não existe (nada escreve nele).
    if (!cfg?.moduloFinanceiroAtivo) return resultado;
    // Gate de nível (F1/F2): BASIC nunca vê parada amarela nem exclusão.
    if (storedNivel(cfg.logisticaNivel) === 'BASIC') return resultado;

    const modoRaw = String(cfg.devedorNaRota || 'COBRANCA').trim().toUpperCase();
    const modoConfig: 'COBRANCA' | 'EXCLUIR' | 'NORMAL' =
      modoRaw === 'EXCLUIR' ? 'EXCLUIR' : modoRaw === 'NORMAL' ? 'NORMAL' : 'COBRANCA';
    if (modoConfig === 'NORMAL') return resultado; // tenant escolheu ignorar débito na rota

    try {
      const [clientes, saldos] = await Promise.all([
        this.prisma.customerProfile.findMany({
          where: { id: { in: ids }, companyId },
          select: { id: true, limiteFiado: true },
        }),
        this.saldoAbertoPorClientes(companyId, ids),
      ]);
      for (const cliente of clientes) {
        const saldoAberto = somaSaldo(saldos.get(cliente.id));
        const limite = cliente.limiteFiado;
        const devedor = saldoAberto > 0 && (limite == null || saldoAberto > limite);
        if (!devedor) continue; // fica NORMAL (default já setado acima)
        const motivo =
          modoConfig === 'COBRANCA' ? `R$ ${saldoAberto.toFixed(2).replace('.', ',')} em aberto` : null;
        resultado.set(cliente.id, { devedor: true, modo: modoConfig, saldoAberto, motivo });
      }
    } catch (e: any) {
      this.logger.warn(`[logistica] resolverDevedorNaRota saldo company=${companyId} falhou: ${String(e?.message || e)}`);
    }
    return resultado;
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

  // ── HISTÓRICO DO CLIENTE (22/07) — log de visita, apagável, sem dinheiro junto ─
  /**
   * Grava UMA linha do histórico do cliente. Chamado no desfecho da visita
   * (confirmarEntrega / cancelarEntrega).
   *
   * BEST-EFFORT POR DECISÃO: qualquer erro aqui é logado e engolido. Histórico é
   * REGISTRO; se virar bloqueio, uma falha de escrita trava o entregador na porta
   * do cliente — o oposto do que ele serve. O título é montado aqui (e não na
   * tela) pra que o texto do passado nunca mude quando a tela mudar.
   */
  private async registrarHistorico(
    companyId: number,
    input: {
      customerProfileId: string;
      entregaId?: string | null;
      tipo: 'entregue' | 'pago' | 'sem_atendimento';
      valorAnterior?: number;
      valorEvento?: number;
      valorTotal?: number;
      receiptMethod?: string | null;
      motivo?: string | null;
      lat?: number | null;
      lng?: number | null;
      actor?: LogisticaActor | null;
    },
  ): Promise<void> {
    try {
      if (!companyId || !input.customerProfileId) return;
      const metodo = normalizeReceipt(input.receiptMethod);
      // NOMENCLATURA (22/07, cobrado pelo dono): nada de acusar o cliente. "Ficou
      // devendo"/"fiado" é o vocabulário que sobra na tela quando ELE está do lado
      // do entregador lendo. O fato é o mesmo, a palavra é comercial: a receber.
      const titulo =
        input.tipo === 'pago'
          ? 'Entregue e pago'
          : input.tipo === 'entregue'
            ? 'Entregue, a receber'
            : 'Sem atendimento';
      // Resumo dos itens: a MESMA frase que o app mostrou na chegada ("1× Galão
      // 20L"), congelada. Sem isto o histórico de amanhã leria o produto de hoje.
      let itensResumo: string | null = null;
      if (input.entregaId) {
        const itens = await this.prisma.entregaItem.findMany({
          where: { entregaId: input.entregaId },
          select: { qtdEntregue: true, qtdPrevista: true, product: { select: { name: true } } },
          take: 12,
        });
        const partes = itens
          .map((it) => {
            const qtd = Math.max(0, it.qtdEntregue ?? it.qtdPrevista ?? 0);
            const nome = String(it.product?.name || 'item').trim();
            return qtd > 0 ? `${qtd}× ${nome}` : '';
          })
          .filter(Boolean);
        itensResumo = partes.length ? partes.join(', ').slice(0, 240) : null;
      }
      await this.prisma.clienteHistorico.create({
        data: {
          companyId,
          customerProfileId: input.customerProfileId,
          entregaId: input.entregaId || null,
          tipo: input.tipo,
          titulo: titulo.slice(0, 120),
          itensResumo,
          valorAnterior: round2(input.valorAnterior || 0),
          valorEvento: round2(input.valorEvento || 0),
          valorTotal: round2(input.valorTotal || 0),
          receiptMethod: metodo,
          motivo: input.motivo ? String(input.motivo).slice(0, 240) : null,
          lat: typeof input.lat === 'number' ? input.lat : null,
          lng: typeof input.lng === 'number' ? input.lng : null,
          registradoPorUserId: actorIdOrNull(input.actor ?? null),
        },
      });
    } catch (e: any) {
      this.logger.warn(
        `[logistica] histórico best-effort falhou cliente=${input.customerProfileId} company=${companyId}: ${String(e?.message || e)}`,
      );
    }
  }

  /**
   * Histórico de UM cliente pro app do entregador. Company-scoped; cliente de outra
   * empresa → null (o controller vira 404). Ordem: mais novo primeiro.
   *
   * GATE DE VALORES: com o módulo financeiro do tenant OFF, dinheiro não aparece em
   * lugar nenhum da logística (regra M4) — os campos de valor voltam zerados, mas as
   * linhas continuam (o "quando eu vim aqui" não é dado financeiro).
   */
  async historicoCliente(
    companyId: number,
    clienteId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: ClienteHistoricoItem[]; nextCursor: string | null } | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true },
    });
    if (!cliente) return null;

    // Mesma leitura de config do historicoEntregasCliente (regra M4), com o mesmo
    // default seguro quando a config não existe/falha.
    let financeiroOn = false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true },
      });
      financeiroOn = cfg?.moduloFinanceiroAtivo ?? false;
    } catch (e: any) {
      this.logger.warn(`[logistica] histórico-cliente loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }

    const take = clampLimit(opts.limit, 30, 100);
    const cursor = String(opts.cursor || '').trim() || null;
    const rows = await this.prisma.clienteHistorico.findMany({
      where: { companyId, customerProfileId: cliente.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const temMais = rows.length > take;
    const pagina = temMais ? rows.slice(0, take) : rows;

    return {
      items: pagina.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        titulo: r.titulo,
        itensResumo: r.itensResumo,
        valorAnterior: financeiroOn ? r.valorAnterior : 0,
        valorEvento: financeiroOn ? r.valorEvento : 0,
        valorTotal: financeiroOn ? r.valorTotal : 0,
        receiptMethod: financeiroOn ? r.receiptMethod : null,
        motivo: r.motivo,
        entregaId: r.entregaId,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: temMais ? pagina[pagina.length - 1].id : null,
    };
  }

  /**
   * F0 (27/07, pedido explícito do dono) — EXTRATO DE EVENTOS DA AGENDA: "dia e
   * hora EXATOS de tudo". MESMO padrão de paginação/gate do `historicoCliente`
   * logo acima (cursor, company-scoped, cliente de outra empresa → null → o
   * controller vira 404). O nome do autor é resolvido num 2º lookup em lote —
   * `LogisticaAgendaEvento` guarda só o id (sem relação com User) de propósito,
   * mas a ficha do cliente quer o nome, não o número.
   */
  async agendaEventosCliente(
    companyId: number,
    clienteId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: AgendaEventoItem[]; nextCursor: string | null } | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true },
    });
    if (!cliente) return null;

    const take = clampLimit(opts.limit, 30, 100);
    const cursor = String(opts.cursor || '').trim() || null;
    const rows = await this.prisma.logisticaAgendaEvento.findMany({
      where: { companyId, customerProfileId: cliente.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const temMais = rows.length > take;
    const pagina = temMais ? rows.slice(0, take) : rows;

    const autorIds = [...new Set(
      pagina.map((r) => r.actorUserId).filter((autorId): autorId is number => autorId != null),
    )];
    const autores = autorIds.length
      ? await this.prisma.user.findMany({
        where: { id: { in: autorIds }, companyId },
        select: { id: true, name: true },
      })
      : [];
    const nomePorAutorId = new Map(autores.map((u) => [u.id, u.name || null]));

    return {
      items: pagina.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        deTexto: r.deTexto,
        paraTexto: r.paraTexto,
        origem: r.origem,
        autor: r.actorUserId != null ? (nomePorAutorId.get(r.actorUserId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: temMais ? pagina[pagina.length - 1].id : null,
    };
  }

  /**
   * Apaga UMA linha do histórico. Só a linha: Entrega e FinanceiroCharge ficam
   * intactas (é o motivo desta tabela existir separada). Company-scoped.
   */
  async apagarHistorico(companyId: number, clienteId: string, historicoId: string): Promise<{ ok: boolean } | null> {
    if (!companyId || !clienteId || !historicoId) return null;
    const res = await this.prisma.clienteHistorico.deleteMany({
      where: { id: String(historicoId).trim(), companyId, customerProfileId: String(clienteId).trim() },
    });
    return res.count > 0 ? { ok: true } : null;
  }

  /** Limpa o histórico inteiro de UM cliente. Mesma regra: não toca em dinheiro. */
  async limparHistorico(companyId: number, clienteId: string): Promise<{ ok: boolean; removidos: number } | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true },
    });
    if (!cliente) return null;
    const res = await this.prisma.clienteHistorico.deleteMany({
      where: { companyId, customerProfileId: cliente.id },
    });
    return { ok: true, removidos: res.count };
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

/**
 * B1 — "GPS de ouro": coordenada numérica válida E precisão de porta (accuracy<=60m).
 * Único crivo pra escrever `geoFonte='gps_entrega'`; extraído (25/07) porque agora três
 * caminhos usam o MESMO limite (perfil, local e o orquestrador dos dois) e um limite que
 * se separa vira porta de pino ruim entrando pelo lado que ninguém olhou.
 *
 * TETO DE PRECISÃO (25/07) — MESMO limite (`GPS_ACCURACY_LIMITE_METROS`, 60m) do
 * cadastro (`decidirGeoFonteCadastro` em logistica-geo-fonte.util.ts): nada de "60"
 * mágico duplicado entre a realimentação por entrega e o cadastro original.
 */
function gpsDeOuro(gps: { lat: number | null; lng: number | null; accuracy?: number }): boolean {
  if (typeof gps.lat !== 'number' || typeof gps.lng !== 'number') return false;
  return typeof gps.accuracy === 'number' && Number.isFinite(gps.accuracy) && gps.accuracy <= GPS_ACCURACY_LIMITE_METROS;
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
// CADERNETA (04/08) — 'cartao' entrou junto com o modo caderneta (maquininha na
// rua/balcão): aditivo — o app antigo nunca manda 'cartao', zero mudança pra quem roda.
function normalizeReceipt(v: string | null | undefined): 'pix' | 'dinheiro' | 'cartao' | 'fiado' | null {
  const s = String(v || '').trim().toLowerCase();
  return s === 'pix' || s === 'dinheiro' || s === 'cartao' || s === 'fiado' ? s : null;
}

// CADERNETA (04/08) — método IMEDIATO = dinheiro em mãos na hora (quita o charge).
// Fonte única: os 5 pontos do confirmar que decidiam por "pix||dinheiro" leem daqui.
function metodoImediato(v: string | null | undefined): boolean {
  return v === 'pix' || v === 'dinheiro' || v === 'cartao';
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

// PREÇO DE HOJE (22/07) — normaliza o valorUnit opcional que a folha de chegada
// passou a mandar. `undefined` (campo ausente) é diferente de 0 (zerado de
// propósito): só o ausente mantém o preço que já estava no item.
function precoEditado(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return round2(n);
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
  // 28/07 — Rota rápida: a entrega já nasce atribuída a quem está criando.
  // Ver CreateEntregaDto.paraMinhaRota.
  paraMinhaRota?: boolean;
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
  // PR18072026 W1 — observação livre sobre o cliente (operacional, sempre visível).
  observacoes?: string | null;
  formaPagamento?: string;
  metodoPadrao?: string | null;
  // F1 — "quanto me deve" (charges pending da logística + mensal a fechar) e o
  // teto de fiado do cliente (null = sem limite). Base do badge da chegada.
  saldoAberto?: number;
  // PR18072026 W1 (coordenador) — mesma fonte canônica de saldoAberto, gateada
  // por moduloFinanceiroAtivoConfig (não billingAudience): visível ao entregador comum.
  debitoAtual?: number;
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
  // L4-A (18/07) — 'avulsa' | 'recorrente' | null (legado). Operacional, não
  // comercial: sempre exposto (o app usa isto pra separar Avulsos/Recorrentes).
  origem: string | null;
  valor?: number;
  // PR18072026 W1 (coordenador) — total SEGURO da entrega atual (gateado por
  // moduloFinanceiroAtivoConfig, não billingAudience): quanto cobrar na porta,
  // sem expor valorUnit por item nem o catálogo inteiro (isso é billingAudience-only).
  valorHoje?: number;
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
  // S2 (25/07, PR25072026-ROTA-CONFERIDA) — "perna a perna": trecho da parada
  // ANTERIOR (na ordem rotaOrdem) até esta, recalculado por Haversine a cada
  // listRota (sem coluna nova — ver comentário no corpo do método). null na 1ª
  // parada da lista e em qualquer parada semCoordenada (ou logo após uma).
  semCoordenada: boolean;
  legDistanceM: number | null;
  legDurationS: number | null;
  legFonte: 'osrm' | 'aproximada' | null;
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

// HISTÓRICO DO CLIENTE (22/07) — uma linha da lista que o APK mostra na ficha.
export interface ClienteHistoricoItem {
  id: string;
  tipo: string; // entregue | pago | sem_atendimento
  titulo: string;
  itensResumo: string | null;
  valorAnterior: number;
  valorEvento: number;
  valorTotal: number;
  receiptMethod: string | null;
  motivo: string | null;
  entregaId: string | null;
  createdAt: string;
}

// F0 (27/07) — EXTRATO DA AGENDA: uma linha da lista que a ficha do cliente vai
// mostrar (dia/hora exatos de toda mudança). Ver LogisticaAgendaEvento no schema.
export interface AgendaEventoItem {
  id: string;
  tipo: string; // DIA_ALTERADO | OCORRENCIA_GERADA | OCORRENCIA_ADIANTADA | PLANO_AVANCADO | OCORRENCIA_DEVOLVIDA | CANCELADA_FECHAMENTO
  deTexto: string | null;
  paraTexto: string | null;
  origem: string; // montagem | desfecho | fechamento | descarte | manual | reparo
  autor: string | null;
  createdAt: string;
}

export interface ConfirmarGps {
  lat?: number;
  lng?: number;
  // B1 — precisão do GPS em metros (coords.accuracy). Só decide a realimentação
  // da coordenada do cliente (accuracy<=60m); nunca bloqueia a confirmação.
  accuracy?: number;
  receiptMethod?: string;
  // `valorUnit` = preço de HOJE editado na chegada (22/07). Escopo de UMA entrega
  // (ver ConfirmarEntregaItemDto): nunca vai pro catálogo nem pro preço acordado.
  itens?: Array<{ id: string; qtdEntregue: number; valorUnit?: number }>;
  // F2 (08/07) — produtos NOVOS incluídos/trocados na folha de chegada (não
  // previstos). O preço vem do servidor (regra de ouro), EXCETO quando o entregador
  // editou o valor de hoje na tela (valorUnit explícito — 22/07).
  novosItens?: Array<{ productId: number; qtdEntregue: number; valorUnit?: number }>;
  // Botão [Pago] da chegada: quita todo o saldo em aberto do cliente, não só a
  // entrega de hoje. Só vale com receiptMethod imediato (pix|dinheiro).
  quitarAberto?: boolean;
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
  // Botão [Pago] (22/07): quantas cobranças antigas foram quitadas junto e quanto
  // isso somou. 0/0 quando o botão foi [Entregue] ou não havia dívida velha.
  quitadas?: number;
  valorQuitado?: number;
  // 28/07 — true quando o reconfirmar de uma entrega REABERTA corrigiu o valor
  // (ou cancelou) a cobrança ainda não recebida dela. Ver sincronizarCobrancaReaberta.
  cobrancaAjustada?: boolean;
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

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConfigService, renderTemplateAviso } from './logistica-config.service';

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
  ) {}

  /**
   * M3 — re-ETA aditivo: após confirmar/cancelar, recalcula o etaAt das paradas
   * RESTANTES do dia (sem reordenar o que já foi feito). Best-effort: qualquer
   * erro é engolido (log) — NÃO afeta o desfecho do confirmar/cancelar (N6).
   */
  private async recalcularEtaSilencioso(companyId: number): Promise<void> {
    try {
      await this.rota.recalcularEtaRestantes(companyId);
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
  async listRota(companyId: number, dateInput?: string): Promise<RotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(dateInput);

    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        // Entregas AGENDADAS pro dia + as que ficaram sem data mas ainda abertas.
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { scheduledAt: null, status: { in: ['agendada', 'em_rota'] } },
        ],
      },
      orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: {
        id: true,
        status: true,
        quantidade: true,
        valor: true,
        scheduledAt: true,
        deliveredAt: true,
        deliveredLat: true,
        deliveredLng: true,
        cobrancaStatus: true,
        notes: true,
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
            // M4 — pagamento condicional: a folha de chegada lê formaPagamento p/
            // decidir se mostra os chips (só 'aberto') ou some (costumeiro).
            formaPagamento: true,
            metodoPadrao: true,
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
            product: { select: { id: true, name: true, unidade: true } },
          },
        },
      },
    });

    // M4 — a regra dos chips depende do módulo financeiro do tenant (opt-in).
    // OFF → NENHUM chip de pagamento, nunca (só qtd + Entregue). Best-effort: se a
    // config não existir ainda, o default do schema (false) é o comportamento seguro.
    let moduloFinanceiroAtivo = false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true },
      });
      moduloFinanceiroAtivo = cfg?.moduloFinanceiroAtivo ?? false;
    } catch (e: any) {
      this.logger.warn(`[logistica] listRota loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }

    return {
      date: dayISO,
      total: rows.length,
      effectsEnabled: this.effectsEnabled,
      moduloFinanceiroAtivo,
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        quantidade: r.quantidade,
        valor: r.valor,
        scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        deliveredLat: r.deliveredLat ?? null,
        deliveredLng: r.deliveredLng ?? null,
        cobrancaStatus: r.cobrancaStatus,
        notes: r.notes ?? null,
        cliente: {
          id: r.customerProfile.id,
          nome: r.customerProfile.name ?? null,
          endereco: r.customerProfile.endereco ?? null,
          cidade: r.customerProfile.cidade ?? null,
          uf: r.customerProfile.uf ?? null,
          lat: r.customerProfile.lat ?? null,
          lng: r.customerProfile.lng ?? null,
          phone: r.customerProfile.phone ?? null,
          // M4 — a folha de chegada decide os chips por aqui (só 'aberto' mostra).
          formaPagamento: r.customerProfile.formaPagamento ?? 'aberto',
          metodoPadrao: r.customerProfile.metodoPadrao ?? null,
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
                    produto: { id: r.product.id, nome: r.product.name, unidade: r.product.unidade ?? null },
                  },
                ]
              : [],
      })),
    };
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

    // Contato: se informado, tem de ser da MESMA conta+empresa; senão null.
    let contatoId: string | null = null;
    if (input.contatoId) {
      const contato = await this.prisma.contato.findFirst({
        where: { id: String(input.contatoId).trim(), companyId, customerProfileId },
        select: { id: true },
      });
      contatoId = contato?.id ?? null;
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
  async confirmarEntrega(companyId: number, id: string, gps: ConfirmarGps): Promise<ConfirmarResult | null> {
    if (!companyId || !id) return null;
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true, status: true, customerProfileId: true, contatoId: true, valor: true, cobrancaStatus: true },
    });
    if (!entrega) return null;
    if (entrega.status === 'cancelada') {
      throw new BadRequestException('Entrega cancelada não pode ser confirmada.');
    }

    const lat = typeof gps.lat === 'number' && Number.isFinite(gps.lat) ? gps.lat : null;
    const lng = typeof gps.lng === 'number' && Number.isFinite(gps.lng) ? gps.lng : null;

    // M4 — desfecho do pagamento: só um dos métodos aceitos é gravado (o resto é
    // ignorado). Vem da folha de chegada SOMENTE quando o cliente é 'aberto' + módulo
    // financeiro ON; costumeiro/OFF nunca manda. A CRIAÇÃO do charge é M6 — aqui só
    // registra o método e marca recebidoNaHora quando pago no ato.
    const receiptMethod = normalizeReceipt(gps.receiptMethod);
    const recebidoNaHora = receiptMethod === 'pix' || receiptMethod === 'dinheiro' ? true : undefined;

    // Passo 1 (SEMPRE): grava status/GPS. Idempotente — reconfirmar não duplica efeito.
    const jaEntregue = entrega.status === 'entregue';
    await this.prisma.entrega.update({
      where: { id: entrega.id },
      data: {
        status: 'entregue',
        deliveredAt: new Date(),
        deliveredLat: lat,
        deliveredLng: lng,
        startedAt: undefined,
        receiptMethod: receiptMethod ?? undefined,
        recebidoNaHora,
      },
    });

    // M4 — grava as quantidades do stepper por item (best-effort, aditivo). Só toca
    // EntregaItem DESTA entrega (isolado por entregaId). Erro aqui não afeta o desfecho.
    if (Array.isArray(gps.itens) && gps.itens.length > 0) {
      for (const it of gps.itens) {
        const itemId = String(it?.id || '').trim();
        const qtd = Number(it?.qtdEntregue);
        if (!itemId || !Number.isFinite(qtd)) continue;
        try {
          await this.prisma.entregaItem.updateMany({
            where: { id: itemId, entregaId: entrega.id },
            data: { qtdEntregue: Math.max(0, Math.trunc(qtd)) },
          });
        } catch (e: any) {
          this.logger.warn(`[logistica] gravar qtdEntregue item=${itemId} falhou: ${String(e?.message || e)}`);
        }
      }
    }

    // Passo 2 (SÓ com a flag ON e SÓ na primeira confirmação): os efeitos externos.
    // Enquanto HBX_LOGISTICA_ENABLED OFF → nenhum WhatsApp, nenhuma cobrança.
    let whatsappSent = false;
    let cobrancaLancada = false;
    if (this.effectsEnabled && !jaEntregue) {
      whatsappSent = await this.dispararWhatsappEntregue(companyId, entrega).catch((e) => {
        this.logger.warn(`[logistica] whatsapp entregue falhou entrega=${entrega.id}: ${String(e?.message || e)}`);
        return false;
      });
      cobrancaLancada = await this.lancarCobranca(companyId, entrega).catch((e) => {
        this.logger.warn(`[logistica] cobrança falhou entrega=${entrega.id}: ${String(e?.message || e)}`);
        return false;
      });
    }

    // M3 — re-ETA das paradas restantes (aditivo, best-effort, não muda o retorno).
    await this.recalcularEtaSilencioso(companyId);

    return { id: entrega.id, status: 'entregue', effectsEnabled: this.effectsEnabled, whatsappSent, cobrancaLancada };
  }

  // ── CANCELAR ────────────────────────────────────────────────────────────────
  async cancelarEntrega(companyId: number, id: string, motivo?: string): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId },
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
    await this.recalcularEtaSilencioso(companyId);
    return { id: entrega.id };
  }

  // ── EFEITO 1: WhatsApp "entregue" (caminho blindado, sem loop/socket/API-crua) ─
  /**
   * SOMENTE via queueOutboundForCompany (disjuntor/1-número=1-conexão/outbox).
   * Uma mensagem, on-success, acabou. Sem telefone = no-op silencioso.
   */
  private async dispararWhatsappEntregue(
    companyId: number,
    entrega: { id: string; customerProfileId: string; contatoId: string | null },
  ): Promise<boolean> {
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
      return false;
    }

    // Destinatário: o contato da entrega (whatsapp/phone) ou o telefone da conta.
    let contact = '';
    let nome = String(conta?.name || '').trim();
    if (entrega.contatoId) {
      const contato = await this.prisma.contato.findFirst({
        where: { id: entrega.contatoId, companyId },
        select: { nome: true, whatsapp: true, phone: true },
      });
      contact = String(contato?.whatsapp || contato?.phone || '').trim();
      if (contato?.nome) nome = String(contato.nome).trim();
    }
    if (!contact) {
      contact = String(conta?.phoneNormalized || conta?.phone || '').trim();
    }
    if (!contact) {
      this.logger.log(`[logistica] entrega=${entrega.id} sem telefone — WhatsApp pulado (no-op).`);
      return false;
    }

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
    return true;
  }

  /**
   * M5 — monta as variáveis do template a partir dos EntregaItem (entregues, com
   * fallback pra qtdPrevista) + o legado escalar da Entrega. Best-effort: se algo
   * falhar, devolve vars mínimas (só o cliente) — a mensagem ainda sai.
   *   {itens}   = "2× Galão 20L, 1× Água com gás"
   *   {qtd}     = soma das quantidades
   *   {produto} = nome do produto principal (o primeiro item / o produto legado)
   */
  private async montarVarsAviso(
    companyId: number,
    entregaId: string,
    cliente: string,
  ): Promise<{ cliente: string; itens: string; qtd: number; produto: string }> {
    const vars = { cliente, itens: '', qtd: 0, produto: '' };
    try {
      const entrega = await this.prisma.entrega.findFirst({
        where: { id: entregaId, companyId },
        select: {
          quantidade: true,
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
    } catch (e: any) {
      this.logger.warn(`[logistica] montarVarsAviso entrega=${entregaId} falhou: ${String(e?.message || e)}`);
    }
    return vars;
  }

  // ── EFEITO 2: cobrança conforme contrato do cliente ──────────────────────────
  /**
   * Lê modeloCobranca do cliente e lança um FinanceiroCharge (mesmo model do
   * resto do sistema — não é caminho paralelo). paymentMethod='MANUAL',
   * status='pending' (nada dispara MercadoPago). Modelo mensal acumula p/ fechar
   * no diaFechamento; avulso/assinatura lançam a entrega direto.
   */
  private async lancarCobranca(
    companyId: number,
    entrega: { id: string; customerProfileId: string; valor: number; cobrancaStatus: string },
  ): Promise<boolean> {
    if (entrega.cobrancaStatus === 'lancada' || entrega.cobrancaStatus === 'isenta') return false;

    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: entrega.customerProfileId, companyId },
      select: { id: true, name: true, modeloCobranca: true },
    });
    const modelo = String(conta?.modeloCobranca || '').trim().toLowerCase();

    // Sem modelo definido = cliente não configurado p/ cobrança: marca isenta e sai.
    if (!modelo || modelo === 'assinatura') {
      // 'assinatura' = já paga um fixo recorrente à parte; a entrega não gera avulsa.
      await this.prisma.entrega.update({
        where: { id: entrega.id },
        data: { cobrancaStatus: 'isenta' },
      });
      return false;
    }

    // 'mensal' e 'avulso' geram um FinanceiroCharge da entrega (regime de caixa manual).
    const amount = Math.max(0, Number(entrega.valor) || 0);
    if (amount <= 0) {
      await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'isenta' } });
      return false;
    }

    const nome = String(conta?.name || 'cliente').trim();
    await this.prisma.financeiroCharge.create({
      data: {
        companyId,
        amount,
        currency: 'BRL',
        description: `Entrega — ${nome}`.slice(0, 180),
        billingCycle: modelo === 'mensal' ? 'MONTHLY' : 'MONTHLY',
        paymentMethod: 'MANUAL',
        status: 'pending',
        lifecycle: 'in_progress',
        providerPayload: JSON.stringify({ source: 'logistica_entrega', entregaId: entrega.id, modelo }),
      },
    });
    await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'lancada' } });
    return true;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function resolveDayRange(dateInput?: string): { start: Date; end: Date; dayISO: string } {
  const base = parseDateOrNull(dateInput) ?? new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  const dayISO = start.toISOString().slice(0, 10);
  return { start, end, dayISO };
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// M4 — só um dos métodos de recebimento aceitos passa; qualquer outro vira null.
function normalizeReceipt(v: string | null | undefined): 'pix' | 'dinheiro' | 'fiado' | null {
  const s = String(v || '').trim().toLowerCase();
  return s === 'pix' || s === 'dinheiro' || s === 'fiado' ? s : null;
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
  formaPagamento: string;
  metodoPadrao: string | null;
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
  produto: RotaProduto | null;
}

export interface RotaItem {
  id: string;
  status: string;
  quantidade: number;
  valor: number;
  scheduledAt: string | null;
  deliveredAt: string | null;
  deliveredLat: number | null;
  deliveredLng: number | null;
  cobrancaStatus: string;
  notes: string | null;
  cliente: RotaCliente;
  contato: { id: string; nome: string; whatsapp: string | null; phone: string | null } | null;
  produto: RotaProduto | null;
  itens: RotaEntregaItem[];
}

export interface RotaResult {
  date: string;
  total: number;
  effectsEnabled: boolean;
  moduloFinanceiroAtivo: boolean;
  items: RotaItem[];
}

export interface ConfirmarGps {
  lat?: number;
  lng?: number;
  receiptMethod?: string;
  itens?: Array<{ id: string; qtdEntregue: number }>;
}

export interface ConfirmarResult {
  id: string;
  status: string;
  effectsEnabled: boolean;
  whatsappSent: boolean;
  cobrancaLancada: boolean;
}

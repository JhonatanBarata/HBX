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
    await this.prisma.$transaction(async (tx) => {
      await tx.entrega.update({
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
      // M4 — quantidades do stepper por item. Só toca EntregaItem DESTA entrega (isolado
      // por entregaId). Dentro da tx: se algo aqui falhar, o status também não muda.
      for (const it of itensValidos) {
        await tx.entregaItem.updateMany({
          where: { id: it.id, entregaId: entrega.id },
          data: { qtdEntregue: Math.max(0, Math.trunc(it.qtd)) },
        });
      }
    });

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
    opts: { deletedByUserId?: number | null; motivo?: string | null } = {},
  ): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const row = await this.prisma.entrega.findFirst({
      where: { id: String(id).trim(), companyId },
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
   * O charge é o MESMO model do resto do sistema (não é caminho paralelo), marcado
   * paymentMethod='MANUAL', status='pending' — NADA dispara MercadoPago.
   *
   * IDEMPOTENTE em 2 camadas: (1) guarda por cobrancaStatus já-resolvido; (2) guarda
   * por entregaId — se já existe um charge desta entrega, NÃO duplica.
   */
  private async lancarCobranca(
    companyId: number,
    entrega: { id: string; customerProfileId: string; valor: number; cobrancaStatus: string },
  ): Promise<boolean> {
    // Camada 1: status já-resolvido (lançada/isenta/aguardando/nao_contabilizado) = no-op.
    if (isCobrancaResolvida(entrega.cobrancaStatus)) return false;

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
      return false;
    }

    const forma = String(conta?.formaPagamento || 'aberto').trim().toLowerCase();

    // 'mensal' = fatura fecha no diaFechamento: NÃO lança por entrega. O charge (1 só,
    // agrupando N entregas) nasce no fechar-mês. A entrega fica aguardando.
    if (forma === 'mensal') {
      await this.prisma.entrega.update({
        where: { id: entrega.id },
        data: { cobrancaStatus: 'aguardando_fechamento' },
      });
      return false;
    }

    // Valor zero = nada a cobrar: marca isenta e sai (sem charge).
    const amount = round2(Math.max(0, Number(entrega.valor) || 0));
    if (amount <= 0) {
      await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'isenta' } });
      return false;
    }

    // Camada 2 (idempotência dura): se já existe charge DESTA entrega, não duplica.
    const jaExiste = await this.prisma.financeiroCharge.findFirst({
      where: { companyId, entregaId: entrega.id },
      select: { id: true },
    });
    if (jaExiste) {
      await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'lancada' } });
      return false;
    }

    // dueDate: avulso/na_hora = hoje; pendura (fiado) = regra do cliente (diaFechamento,
    // senão hoje). Só 'aberto'/'avulso'/'na_hora'/'pendura' chegam aqui.
    const dueDate = forma === 'pendura' ? proximoDiaFechamento(conta?.diaFechamento) : new Date();

    const nome = String(conta?.name || 'cliente').trim();
    // R3 — a criação do charge por entrega é ATÔMICA no banco: o índice UNIQUE PARCIAL
    // "FinanceiroCharge_entregaId_key" (WHERE entregaId IS NOT NULL) garante 1 charge
    // por entrega mesmo sob 2 confirmarEntrega simultâneos. Se o INSERT bater no unique
    // (P2002), a corrida foi perdida: OUTRA chamada já criou o charge desta entrega →
    // trata como "já existe" (idempotente), marca 'lancada' e NÃO propaga o erro.
    try {
      await this.prisma.financeiroCharge.create({
        data: {
          companyId,
          amount,
          currency: 'BRL',
          description: `Entrega — ${nome}`.slice(0, 180),
          // billingCycle: cobrança da entrega é PONTUAL (não recorrente) → ONCE.
          billingCycle: 'ONCE',
          paymentMethod: 'MANUAL',
          status: 'pending',
          lifecycle: 'in_progress',
          // R2 — LINK: cliente + entrega + origem + vencimento (mata dívidas 2/3/4).
          customerProfileId: entrega.customerProfileId,
          entregaId: entrega.id,
          sourceModule: 'logistica_entrega',
          dueDate,
          providerPayload: JSON.stringify({ source: 'logistica_entrega', entregaId: entrega.id, forma }),
        },
      });
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        // Corrida perdida: o charge desta entrega já foi criado por outra chamada.
        await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'lancada' } });
        return false;
      }
      throw e;
    }
    await this.prisma.entrega.update({ where: { id: entrega.id }, data: { cobrancaStatus: 'lancada' } });
    return true;
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
      await this.prisma.$transaction(async (tx) => {
        if (amount > 0) {
          await tx.financeiroCharge.create({
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
        }
        // Marca as entregas somadas como faturadas (idempotência: só as que estavam
        // 'aguardando_fechamento' passam a 'faturada' — a 2ª rodada não acha nenhuma).
        await tx.entrega.updateMany({
          where: { companyId, id: { in: entregaIds }, cobrancaStatus: 'aguardando_fechamento' },
          data: { cobrancaStatus: 'faturada' },
        });
      });

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

    return {
      clienteId: cliente.id,
      nome: String(cliente.name || '').trim() || null,
      total: charges.length,
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

// R2 — dinheiro é sempre 2 casas (evita 19.999999 virar cobrança).
function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
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
  total: number;
  charges: ExtratoCharge[];
}

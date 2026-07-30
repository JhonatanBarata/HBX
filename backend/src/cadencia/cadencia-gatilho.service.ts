import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AtividadesService } from '../atividades/atividades.service';
import { ConversationsService } from '../messaging/conversations.service';
import { InboxRealtimeService } from '../messaging/inbox-realtime.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import { EventRuleService, type EventRuleRow } from '../automation/event-rule.service';
import { classifyRoboReplyHeat } from '../vendas/vendas-robo-heat';
import { getBusinessDateParts } from '../vendas/business-hours.util';
import type { CreateGatilhoDto, UpdateGatilhoDto } from './dto/cadencia.dto';

// ================================================================
// WORM-13 (13b) — Gatilhos REATIVOS. Evento -> acoes seguras que reusam
// superficies existentes. Nenhuma acao dispara WhatsApp automatico: o inbound ja
// significa que o humano falou; o bot de atendimento cuida da resposta. As acoes
// permitidas sao: mover_status (funil), criar_atividade (hook WORM-12) e
// notificar_vendedor (timeline + realtime).
//
// Enganche: registra um relay que o MessagingService chama de dentro de
// processPersistedInbound (o inbound ja e detectado ali — nao criamos detector
// novo). O relay NAO tem flag: ele so REAGE a um humano real que respondeu, e as
// acoes sao no proprio funil/agenda (nada auto-envia mensagem).
//
// S08 (MOTOR-ÚNICO): a partir desta sprint, este service é PRODUTOR/CONSUMIDOR
// do evento genérico `lead_respondeu_whatsapp` no `EventRuleService`
// (backend/src/automation/event-rule.service.ts) — o motor genérico que busca
// as regras ativas, itera e isola erro por regra. A resolução do lead pelo
// telefone e a EXECUÇÃO das ações (mover_status/criar_atividade/
// notificar_vendedor) continuam 100% aqui, delegadas pelo `EventRuleService`
// via `registerActionHandler` — nada foi duplicado. `EventRuleService` é
// instanciado à mão (`new EventRuleService(this.prisma)`, ver comentário no
// próprio arquivo) para não criar um ciclo de módulo Nest
// (AutomationModule -> CadenciaModule -> AutomationModule).
// `InboundRouterService`/`ConversationsService.dispatchCadenciaInbound`
// continuam com o MESMO nome/assinatura de sempre — só o que acontece por
// baixo do hook mudou; isso preserva os testes de caracterização S01, que
// mockam `conversations.dispatchCadenciaInbound` diretamente.
// ================================================================

const VALID_EVENTS = ['lead_respondeu_whatsapp', 'email_lido'] as const;
const VALID_STATUS = ['novo', 'contato', 'retorno', 'qualificado', 'encerrado'];
const VALID_ACTION_TYPES = ['mover_status', 'criar_atividade', 'notificar_vendedor'] as const;

type GatilhoRow = {
  id: string;
  companyId: number;
  ownerId: number | null;
  nome: string;
  evento: string;
  acoesJson: string;
  ativo: boolean;
  lastFiredAt: Date | null;
  fireCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type GatilhoAcao = {
  tipo: string;
  status?: string; // mover_status
  titulo?: string; // criar_atividade / notificar_vendedor
  atividadeTipo?: string; // criar_atividade
  diasVencimento?: number; // criar_atividade
  mensagem?: string; // notificar_vendedor
};

export type CadenciaInboundEvent = {
  companyId: number;
  fromPhone: string;
  conversationId?: number | null;
  text?: string | null;
};

@Injectable()
export class CadenciaGatilhoService implements OnModuleInit {
  private readonly logger = new Logger(CadenciaGatilhoService.name);
  private readonly eventRules: EventRuleService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly atividades: AtividadesService,
    private readonly conversations: ConversationsService,
    private readonly inboxRealtime: InboxRealtimeService,
  ) {
    // Instanciado à mão de propósito (não injetado via Nest DI) — ver
    // comentário S08 no topo do arquivo e no próprio event-rule.service.ts:
    // evita ciclo de módulo (AutomationModule já importa CadenciaModule).
    this.eventRules = new EventRuleService(this.prisma);
  }

  onModuleInit() {
    // S08: registra este domínio como o único produtor/consumidor do evento
    // 'lead_respondeu_whatsapp' no motor genérico. O EventRuleService busca
    // as regras ativas e itera; quem resolve o lead pelo telefone e executa
    // as ações é este service, delegado por aqui.
    this.eventRules.registerActionHandler('lead_respondeu_whatsapp', (companyId, rule, payload) =>
      this.applyGatilhoToInboundPayload(companyId, rule, payload),
    );

    // Registra o relay no ConversationsService: o MessagingService o chama de
    // dentro de processPersistedInbound (best-effort, sem bloquear o inbound).
    (this.conversations as any).setCadenciaInboundHook?.(async (evt: CadenciaInboundEvent) => {
      await this.handleInbound(evt).catch((e) =>
        this.logger.warn(`[cadencia-gatilho] inbound hook falhou: ${String(e?.message || e)}`),
      );
    });
  }

  private async resolveContext(user: any): Promise<VendasAccessContext> {
    return resolveVendasAccessContext(this.prisma, user);
  }

  private assertCanManage(context: VendasAccessContext) {
    if (context.isAdmin || context.canViewCompanyCards) return;
    throw new ForbiddenException('Sem permissão para gerenciar gatilhos.');
  }

  private normalizeEvento(value: unknown): string {
    const raw = String(value || '').trim().toLowerCase();
    return (VALID_EVENTS as readonly string[]).includes(raw) ? raw : 'lead_respondeu_whatsapp';
  }

  private sanitizeAcoes(input: unknown): GatilhoAcao[] {
    if (!Array.isArray(input)) return [];
    const out: GatilhoAcao[] = [];
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue;
      const tipo = String((raw as any).tipo || '').trim().toLowerCase();
      if (!(VALID_ACTION_TYPES as readonly string[]).includes(tipo)) continue;
      const acao: GatilhoAcao = { tipo };
      if (tipo === 'mover_status') {
        const status = String((raw as any).status || '').trim().toLowerCase();
        if (!VALID_STATUS.includes(status)) continue;
        acao.status = status;
      }
      if (tipo === 'criar_atividade') {
        acao.titulo = String((raw as any).titulo || 'Retornar contato').trim().slice(0, 160);
        acao.atividadeTipo = String((raw as any).atividadeTipo || 'ligacao').trim().toLowerCase().slice(0, 40);
        const dias = Number((raw as any).diasVencimento);
        acao.diasVencimento = Number.isFinite(dias) ? Math.max(0, Math.min(30, Math.trunc(dias))) : 2;
      }
      if (tipo === 'notificar_vendedor') {
        acao.titulo = String((raw as any).titulo || 'Lead respondeu').trim().slice(0, 160);
        acao.mensagem = String((raw as any).mensagem || '').trim().slice(0, 400);
      }
      out.push(acao);
    }
    return out;
  }

  private serialize(row: GatilhoRow) {
    let acoes: GatilhoAcao[] = [];
    try {
      acoes = this.sanitizeAcoes(JSON.parse(row.acoesJson || '[]'));
    } catch {
      acoes = [];
    }
    return {
      id: row.id,
      nome: row.nome,
      evento: row.evento,
      acoes,
      ativo: row.ativo,
      fireCount: row.fireCount,
      lastFiredAt: row.lastFiredAt ? new Date(row.lastFiredAt).toISOString() : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    };
  }

  // ---------------- AUTOMATION S04 (leitura agregada, read-only) ----------------
  // Alimenta o bloco `regras` do GET /automation/overview. Diferente de
  // listForUser (que resolve contexto de permissão e devolve as linhas cheias),
  // isto é só uma contagem por empresa — não expõe dado, não exige canManage.
  async countActiveForCompany(companyId: number): Promise<number> {
    return (this.prisma as any).cadenciaGatilho.count({ where: { companyId, ativo: true } });
  }

  // ---------------- CRUD ----------------
  async listForUser(user: any) {
    const context = await this.resolveContext(user);
    const rows = (await (this.prisma as any).cadenciaGatilho.findMany({
      where: { companyId: context.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })) as GatilhoRow[];
    return {
      ok: true,
      canManage: context.isAdmin || context.canViewCompanyCards,
      gatilhos: rows.map((r) => this.serialize(r)),
    };
  }

  async createForUser(user: any, dto: CreateGatilhoDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const nome = String(dto?.nome || '').trim().slice(0, 120);
    if (!nome) throw new BadRequestException('Nome do gatilho obrigatório.');
    const acoes = this.sanitizeAcoes(dto?.acoes);
    if (!acoes.length) throw new BadRequestException('Adicione ao menos uma ação.');
    const row = (await (this.prisma as any).cadenciaGatilho.create({
      data: {
        companyId: context.companyId,
        ownerId: context.userId,
        nome,
        evento: this.normalizeEvento(dto?.evento),
        acoesJson: JSON.stringify(acoes),
        ativo: true,
      },
    })) as GatilhoRow;
    return { ok: true, gatilho: this.serialize(row) };
  }

  async updateForUser(user: any, id: string, dto: UpdateGatilhoDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadenciaGatilho.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
    })) as GatilhoRow | null;
    if (!existing) throw new NotFoundException('Gatilho não encontrado.');
    const data: Record<string, any> = {};
    if (dto?.nome !== undefined) {
      const nome = String(dto.nome || '').trim().slice(0, 120);
      if (!nome) throw new BadRequestException('Nome obrigatório.');
      data.nome = nome;
    }
    if (dto?.evento !== undefined) data.evento = this.normalizeEvento(dto.evento);
    if (dto?.acoes !== undefined) {
      const acoes = this.sanitizeAcoes(dto.acoes);
      if (!acoes.length) throw new BadRequestException('Adicione ao menos uma ação.');
      data.acoesJson = JSON.stringify(acoes);
    }
    if (dto?.ativo !== undefined) data.ativo = Boolean(dto.ativo);
    const row = (await (this.prisma as any).cadenciaGatilho.update({ where: { id: existing.id }, data })) as GatilhoRow;
    return { ok: true, gatilho: this.serialize(row) };
  }

  async deleteForUser(user: any, id: string) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadenciaGatilho.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
      select: { id: true },
    })) as { id: string } | null;
    if (!existing) throw new NotFoundException('Gatilho não encontrado.');
    await (this.prisma as any).cadenciaGatilho.delete({ where: { id: existing.id } });
    return { ok: true, deleted: true };
  }

  // ================================================================
  // REAÇÃO ao inbound (chamada pelo relay do MessagingService).
  // S08: vira um wrapper fino sobre o EventRuleService — a validação de
  // companyId/phone continua aqui de propósito (evita até a query de regras
  // quando o payload é inútil, "no-op barato" também neste nível). Quem busca
  // as regras ativas do evento, itera e isola erro por regra é o
  // EventRuleService.emit; quem resolve o lead e executa as ações continua
  // sendo este service (applyGatilhoToInboundPayload/applyGatilhoActions,
  // abaixo). Best-effort: nunca lança.
  // ================================================================
  async handleInbound(evt: CadenciaInboundEvent) {
    const companyId = Number(evt?.companyId || 0);
    const phone = String(evt?.fromPhone || '').replace(/\D/g, '');
    if (!companyId || !phone) return;

    // S4 LEAD-CENTRICO (04-robozinho.md, item 4 "Te chamou"): roda SEMPRE que um
    // humano responde (não depende de a empresa ter configurado um CadenciaGatilho
    // — é comportamento embutido do robozinho, não um gatilho opcional). Best-effort:
    // nunca derruba o resto do hook (gatilhos configurados continuam abaixo).
    const lead = await this.matchLeadByPhone(companyId, phone);
    if (lead) {
      await this.maybeHandleRoboHotReply(companyId, lead, evt).catch((e) =>
        this.logger.warn(`[cadencia-gatilho] te-chamou falhou lead=${lead.id}: ${String(e?.message || e)}`),
      );
    }

    await this.eventRules.emit(companyId, 'lead_respondeu_whatsapp', evt as unknown as Record<string, unknown>);
  }

  // ================================================================
  // "Te chamou" (S4 LEAD-CENTRICO, item 4): resposta inbound QUENTE de um lead
  // que TINHA Automação ligado -> etapa 'retorno' + atividade com contexto (quem, o
  // que pediu, o que a Automação já fez, prazo sugerido). Reusa AtividadesService
  // (hook WORM-12) — nada de sistema novo de notificação.
  //
  // "Robô ligado nesta resposta" = a inscrição de cadência do lead foi pausada
  // por `interruptForInbound` (CommercialContactControlService, SEMPRE roda
  // primeiro no InboundRouterService, ANTES deste hook) com
  // lastError='inbound_received', HÁ POUCO TEMPO. Sem essa janela de recência,
  // uma cadência cancelada há dias voltaria a "acender" o Te chamou a cada nova
  // mensagem do lead — a recência garante que é ESTA resposta que desligou Automação.
  // ================================================================
  private async maybeHandleRoboHotReply(
    companyId: number,
    lead: { id: string; assignedUserId: number | null; status: string },
    evt: CadenciaInboundEvent,
  ): Promise<void> {
    const text = String(evt?.text || '').trim();
    if (!text) return;

    const RECENT_WINDOW_MS = 5 * 60 * 1000;
    const recentlyPaused = typeof (this.prisma as any).cadenciaInscricao?.findFirst === 'function'
      ? await (this.prisma as any).cadenciaInscricao.findFirst({
          where: {
            companyId,
            leadId: lead.id,
            status: 'cancelada',
            lastError: 'inbound_received',
            updatedAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, cadenciaId: true, currentStep: true },
        })
      : null;
    if (!recentlyPaused) {
      // Robô não estava ligado nesta resposta — mas pode ser resposta a um
      // CONTATO MANUAL do /vendas (item 3 do dia-de-vendedor, 30/07).
      await this.maybeHandleManualVendasReply(companyId, lead, evt, text);
      return;
    }

    const heat = classifyRoboReplyHeat(text);
    if (!heat.quente) return;

    // Não regride etapa já avançada por humano — só surfaceia o contexto.
    const willMoveToRetorno = !['qualificado', 'encerrado'].includes(lead.status) && lead.status !== 'retorno';

    const cadencia = recentlyPaused.cadenciaId
      ? await (this.prisma as any).cadencia
          .findUnique({ where: { id: recentlyPaused.cadenciaId }, select: { nome: true } })
          .catch(() => null)
      : null;
    const toques = Math.max(0, Math.trunc(Number(recentlyPaused.currentStep || 0)));
    const excerpt = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    const now = new Date();
    const prazo = new Date(now.getTime() + 2 * 60 * 60 * 1000); // sugestão: retornar em até 2h

    // Idempotência: se este MESMO evento (mesma inscrição pausada) já foi tratado,
    // o create abaixo bate no @@unique([leadId, idempotencyKey]) — P2002 = já feito,
    // não duplica nem status nem atividade.
    try {
      await this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          eventType: 'robo_te_chamou',
          title: 'Te chamou — robô identificou interesse',
          description: `Respondeu: "${excerpt}". Automação (${cadencia?.nome || 'cadência'}) já tinha enviado ${toques} toque(s). ${heat.motivo} Sugestão: retornar até ${prazo.toLocaleString('pt-BR')}.`,
          sourceType: 'automacao',
          statusFrom: lead.status,
          statusTo: willMoveToRetorno ? 'retorno' : lead.status,
          resultLabel: 'te_chamou',
          idempotencyKey: `robo-te-chamou:${recentlyPaused.id}`,
        },
      });
    } catch (error: any) {
      if (String(error?.code || '') === 'P2002') return; // já tratado
      throw error;
    }

    if (willMoveToRetorno) {
      await this.prisma.vendasLead.updateMany({
        where: { id: lead.id, companyId },
        data: { status: 'retorno', lastContactAt: now },
      });
    }

    await this.atividades.createFromAutomation({
      leadId: lead.id,
      companyId,
      titulo: `Te chamou: retornar contato${cadencia?.nome ? ` (${cadencia.nome})` : ''}`.slice(0, 160),
      vencimento: now,
      tipo: 'mensagem',
      responsavelId: lead.assignedUserId,
      origin: 'automacao',
    });
  }

  // ================================================================
  // "Te chamou" do CONTATO MANUAL (item 3 dia-de-vendedor, 30/07): a conversa
  // nasceu de um disparo À MÃO pelo /vendas (Copiloto/cockpit — o envio grava o
  // link canônico `CompanyConversation.vendasLeadId`) e o lead respondeu. Aqui
  // NÃO existe robô pra continuar a conversa (o classificador só roda dentro de
  // campanha), então SEM gate de calor DE PROPÓSITO: qualquer resposta humana é
  // "sua vez" — até um "não tenho interesse" precisa aparecer pro vendedor
  // decidir, senão morre no vácuo (cena real Tagliágua: "como que funciona ?" e
  // o card parado em Planejar com "Te chamou" em 0).
  // ================================================================
  private async maybeHandleManualVendasReply(
    companyId: number,
    lead: { id: string; assignedUserId: number | null; status: string },
    evt: CadenciaInboundEvent,
    text: string,
  ): Promise<void> {
    const conversationId = Number(evt?.conversationId || 0);
    if (!conversationId) return;
    // Não regride etapa avançada nem re-acende o que já está aceso.
    if (['qualificado', 'encerrado', 'retorno'].includes(String(lead.status || ''))) return;
    if (typeof (this.prisma as any).companyConversation?.findFirst !== 'function') return;
    const linked = await (this.prisma as any).companyConversation.findFirst({
      where: { id: conversationId, companyId, vendasLeadId: lead.id },
      select: { id: true },
    });
    if (!linked) return; // conversa não é do /vendas (ou é de outro lead) — nada a fazer

    const excerpt = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    const now = new Date();
    const parts = getBusinessDateParts(now); // dia-negócio -03, mesmo relógio do resto do vendas
    const diaKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

    // Idempotência por conversa/dia: o lead pode mandar várias mensagens em
    // sequência — 1 evento de timeline por dia basta; o updateMany abaixo já é
    // no-op quando o status saiu de novo/contato.
    try {
      await this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          eventType: 'robo_te_chamou',
          title: 'Te chamou — respondeu seu contato',
          description: `Respondeu: "${excerpt}". Contato feito manualmente pelo Vendas — sem robô nesta conversa, o retorno é seu.`,
          sourceType: 'vendas',
          statusFrom: lead.status,
          statusTo: 'retorno',
          resultLabel: 'te_chamou',
          idempotencyKey: `manual-te-chamou:${conversationId}:${diaKey}`,
        },
      });
    } catch (error: any) {
      if (String(error?.code || '') === 'P2002') return; // já tratado hoje
      throw error;
    }

    await this.prisma.vendasLead.updateMany({
      where: { id: lead.id, companyId, status: { in: ['novo', 'contato'] } },
      data: { status: 'retorno', lastContactAt: now },
    });

    await this.atividades.createFromAutomation({
      leadId: lead.id,
      companyId,
      titulo: 'Te chamou: responder a conversa',
      vencimento: now,
      tipo: 'mensagem',
      responsavelId: lead.assignedUserId,
      origin: 'automacao',
    });
  }

  // Handler registrado no EventRuleService para 'lead_respondeu_whatsapp'
  // (ver onModuleInit). Recebe UMA regra ativa já filtrada por empresa+evento
  // e o payload cru do inbound; casa o telefone com um VendasLead da empresa
  // e, se achar, delega a execução das ações para applyGatilhoActions.
  private async applyGatilhoToInboundPayload(
    companyId: number,
    rule: EventRuleRow,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const evt = payload as unknown as CadenciaInboundEvent;
    const phone = String(evt?.fromPhone || '').replace(/\D/g, '');
    if (!phone) return;

    // Casa o lead pelo telefone (sufixo — WhatsApp normaliza com/sem 9).
    const lead = await this.matchLeadByPhone(companyId, phone);
    if (!lead) return;

    await this.applyGatilhoActions(companyId, rule, lead);
  }

  // Executa TODAS as ações de UMA regra (mesmo corpo de loop que existia
  // dentro do handleInbound antes da S08 — só extraído, não duplicado) e
  // incrementa fireCount/lastFiredAt, como sempre foi feito.
  private async applyGatilhoActions(
    companyId: number,
    gatilho: EventRuleRow,
    lead: { id: string; assignedUserId: number | null; status: string },
  ): Promise<void> {
    let acoes: GatilhoAcao[] = [];
    try {
      acoes = this.sanitizeAcoes(JSON.parse(gatilho.acoesJson || '[]'));
    } catch {
      acoes = [];
    }
    for (const acao of acoes) {
      await this.executeAcao(companyId, lead, acao, gatilho).catch((e) =>
        this.logger.warn(`[cadencia-gatilho] acao ${acao.tipo} falhou lead=${lead.id}: ${String(e?.message || e)}`),
      );
    }
    await (this.prisma as any).cadenciaGatilho
      .update({ where: { id: gatilho.id }, data: { lastFiredAt: new Date(), fireCount: { increment: 1 } } })
      .catch(() => null);
  }

  private async matchLeadByPhone(companyId: number, digits: string) {
    // Tenta match exato do normalizado; se nao, sufixo dos ultimos 8 digitos.
    const tail = digits.slice(-8);
    const rows = (await this.prisma.vendasLead.findMany({
      where: { companyId, OR: [{ phoneNormalized: digits }, { phoneNormalized: { endsWith: tail } }, { phone: { endsWith: tail } }] },
      select: { id: true, assignedUserId: true, status: true },
      take: 1,
      orderBy: { updatedAt: 'desc' },
    })) as Array<{ id: string; assignedUserId: number | null; status: string }>;
    return rows[0] || null;
  }

  private async executeAcao(
    companyId: number,
    lead: { id: string; assignedUserId: number | null; status: string },
    acao: GatilhoAcao,
    gatilho: EventRuleRow,
  ) {
    if (acao.tipo === 'mover_status' && acao.status && acao.status !== lead.status) {
      const now = new Date();
      await this.prisma.vendasLead.updateMany({
        where: { id: lead.id, companyId },
        data: { status: acao.status, lastContactAt: now },
      });
      await this.prisma.vendasLeadTimelineEvent
        .create({
          data: {
            leadId: lead.id,
            eventType: 'status_change',
            title: `Gatilho "${gatilho.nome}": movido para ${acao.status}`.slice(0, 200),
            statusFrom: lead.status,
            statusTo: acao.status,
            sourceType: 'automacao',
          },
        })
        .catch(() => null);
    } else if (acao.tipo === 'criar_atividade') {
      const venc = new Date();
      venc.setDate(venc.getDate() + (acao.diasVencimento ?? 2));
      await this.atividades.createFromAutomation({
        leadId: lead.id,
        companyId,
        titulo: acao.titulo || 'Retornar contato',
        vencimento: venc,
        tipo: (acao.atividadeTipo as any) || 'ligacao',
        responsavelId: lead.assignedUserId,
        origin: 'automacao',
      });
    } else if (acao.tipo === 'notificar_vendedor') {
      // Notificacao = evento no timeline + push realtime (mesma superficie do
      // automation event ja usado no Vendas). Nao envia WhatsApp.
      await this.prisma.vendasLeadTimelineEvent
        .create({
          data: {
            leadId: lead.id,
            eventType: 'cadencia_notificacao',
            title: (acao.titulo || 'Lead respondeu').slice(0, 200),
            description: (acao.mensagem || '').slice(0, 500) || null,
            sourceType: 'automacao',
          },
        })
        .catch(() => null);
      this.inboxRealtime.publish({
        companyId,
        kind: 'automation',
        conversationId: null,
        automation: {
          type: 'cadencia_gatilho',
          status: 'info',
          text: acao.mensagem || `${acao.titulo || 'Lead respondeu'} — ${gatilho.nome}`,
          leadId: lead.id,
        },
        at: new Date().toISOString(),
      });
    }
  }
}

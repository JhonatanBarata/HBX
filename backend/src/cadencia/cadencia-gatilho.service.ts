import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AtividadesService } from '../atividades/atividades.service';
import { ConversationsService } from '../messaging/conversations.service';
import { InboxRealtimeService } from '../messaging/inbox-realtime.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly atividades: AtividadesService,
    private readonly conversations: ConversationsService,
    private readonly inboxRealtime: InboxRealtimeService,
  ) {}

  onModuleInit() {
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
  // Casa o telefone com um VendasLead da empresa e executa as acoes dos gatilhos
  // ativos do evento 'lead_respondeu_whatsapp'. Best-effort: nunca lanca.
  // ================================================================
  async handleInbound(evt: CadenciaInboundEvent) {
    const companyId = Number(evt?.companyId || 0);
    const phone = String(evt?.fromPhone || '').replace(/\D/g, '');
    if (!companyId || !phone) return;

    const gatilhos = (await (this.prisma as any).cadenciaGatilho.findMany({
      where: { companyId, evento: 'lead_respondeu_whatsapp', ativo: true },
      take: 20,
    })) as GatilhoRow[];
    if (!gatilhos.length) return;

    // Casa o lead pelo telefone (sufixo — WhatsApp normaliza com/sem 9).
    const lead = await this.matchLeadByPhone(companyId, phone);
    if (!lead) return;

    for (const gatilho of gatilhos) {
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
    gatilho: GatilhoRow,
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

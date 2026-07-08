import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import {
  ATIVIDADE_RESULTADOS,
  ATIVIDADE_TIPOS,
  type AtividadeTipo,
  type ConcluirAtividadeDto,
  type CreateAtividadeDto,
  type ListAtividadesQueryDto,
  type UpdateAtividadeDto,
} from './dto/atividades.dto';

// Payload que o WORM-13 (automacao) passa direto no service, sem HTTP.
export type AutomationAtividadeInput = {
  leadId: string;
  companyId: number;
  titulo: string;
  vencimento: Date | string;
  tipo?: AtividadeTipo;
  duracao?: number | null;
  responsavelId?: number | null;
  origin?: 'automacao' | 'ia';
};

type AtividadeRow = {
  id: string;
  leadId: string;
  companyId: number;
  tipo: string;
  titulo: string;
  vencimento: Date;
  duracao: number | null;
  responsavelId: number | null;
  realizadaEm: Date | null;
  resultado: string | null;
  criadaPor: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AtividadesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeTipo(value: unknown): AtividadeTipo {
    const raw = String(value || '').trim().toLowerCase();
    return (ATIVIDADE_TIPOS as readonly string[]).includes(raw) ? (raw as AtividadeTipo) : 'ligacao';
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    const d = new Date(value as any);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private normalizeText(value: unknown, max = 280): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
  }

  // Rotulo canonico de resultado para o engajamento; texto livre vira 'outro'.
  private canonicalResultLabel(value: unknown): string | null {
    const text = this.normalizeText(value);
    if (!text) return null;
    const lowered = text.toLowerCase();
    if ((ATIVIDADE_RESULTADOS as readonly string[]).includes(lowered)) return lowered;
    return 'outro';
  }

  private async resolveContext(user: any): Promise<VendasAccessContext> {
    return resolveVendasAccessContext(this.prisma, user);
  }

  // Escopo de leitura/escrita: quem enxerga so os proprios cards so ve/mexe nas
  // atividades cujo responsavel e ele (mesma polaridade do buildLeadAccessWhere do
  // Vendas). Gerente/admin com viewCompany ve a empresa toda.
  private buildAccessWhere(context: VendasAccessContext, extra: Record<string, any> = {}) {
    const base: Record<string, any> = { companyId: context.companyId, ...extra };
    if (context.canViewCompanyCards) return base;
    if (!context.canViewOwnCards) {
      // Sem nenhuma leitura de card → nada.
      return { ...base, id: { in: [] as string[] } };
    }
    return { ...base, responsavelId: context.userId };
  }

  private serialize(row: AtividadeRow, opts: { canSeeOthers: boolean } = { canSeeOthers: true }) {
    const now = Date.now();
    const venc = row.vencimento ? new Date(row.vencimento).getTime() : 0;
    const pendente = !row.realizadaEm;
    const atrasada = pendente && venc > 0 && venc < now;
    return {
      id: row.id,
      leadId: row.leadId,
      tipo: row.tipo,
      titulo: row.titulo,
      vencimento: row.vencimento ? new Date(row.vencimento).toISOString() : null,
      duracao: row.duracao ?? null,
      diaInteiro: row.duracao == null,
      responsavelId: opts.canSeeOthers ? (row.responsavelId ?? null) : row.responsavelId,
      realizadaEm: row.realizadaEm ? new Date(row.realizadaEm).toISOString() : null,
      resultado: row.resultado ?? null,
      pendente,
      atrasada,
      criadaPor: row.criadaPor,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    };
  }

  private startOfDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private endOfDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  // Garante que o card existe e pertence a empresa (e ao responsavel, se aplicavel).
  private async assertLeadInScope(context: VendasAccessContext, leadId: string) {
    const id = String(leadId || '').trim();
    if (!id) throw new BadRequestException('leadId obrigatorio.');
    const lead = await this.prisma.vendasLead.findFirst({
      where: { id, companyId: context.companyId },
      select: { id: true, assignedUserId: true, createdByUserId: true },
    });
    if (!lead) throw new NotFoundException('Card do lead nao encontrado.');
    if (!context.canViewCompanyCards) {
      const owns = lead.assignedUserId === context.userId || (lead.assignedUserId == null && lead.createdByUserId === context.userId);
      if (!owns) throw new ForbiddenException('Card nao pertence a voce.');
    }
    return lead;
  }

  // -------- LISTAGEM (tela "Hoje": atrasadas | hoje | semana) --------
  async listForUser(user: any, query: ListAtividadesQueryDto = {}) {
    const context = await this.resolveContext(user);
    const canSeeOthers = context.canViewCompanyCards;

    const where: Record<string, any> = this.buildAccessWhere(context);
    if (query.tipo) where.tipo = this.normalizeTipo(query.tipo);
    // Filtro por responsavel so vale para quem ve a empresa toda.
    if (query.responsavelId && canSeeOthers) where.responsavelId = Number(query.responsavelId);
    if (!query.incluirConcluidas) where.realizadaEm = null;

    const rows = (await this.prisma.atividade.findMany({
      where,
      orderBy: [{ vencimento: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    })) as AtividadeRow[];

    // Nome do lead (agenda↔vendas, item A): lookup em lote — 1 query pra todas
    // as linhas, nao 1 por atividade. Lead sumido do banco => null (nao quebra).
    const leadIds = Array.from(new Set(rows.map((row) => row.leadId).filter(Boolean)));
    const leadRows = leadIds.length
      ? await this.prisma.vendasLead.findMany({
          where: { id: { in: leadIds }, companyId: context.companyId },
          select: { id: true, name: true },
        })
      : [];
    const leadNomeMap = new Map<string, string | null>(leadRows.map((lead: { id: string; name: string | null }) => [lead.id, lead.name ?? null]));

    const now = new Date();
    const startToday = this.startOfDay(now);
    const endToday = this.endOfDay(now);
    const endWeek = this.endOfDay(new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000));

    const atrasadas: any[] = [];
    const hoje: any[] = [];
    const semana: any[] = [];
    const concluidas: any[] = [];

    for (const row of rows) {
      const view = { ...this.serialize(row, { canSeeOthers }), leadNome: leadNomeMap.get(row.leadId) ?? null };
      if (row.realizadaEm) {
        concluidas.push(view);
        continue;
      }
      const venc = new Date(row.vencimento);
      if (venc < startToday) atrasadas.push(view);
      else if (venc <= endToday) hoje.push(view);
      else if (venc <= endWeek) semana.push(view);
      else semana.push(view); // futuras alem da semana caem em "semana" (proximas)
    }

    return {
      ok: true,
      counts: {
        atrasadas: atrasadas.length,
        hoje: hoje.length,
        semana: semana.length,
      },
      atrasadas,
      hoje,
      semana,
      concluidas: query.incluirConcluidas ? concluidas : undefined,
    };
  }

  // -------- ATIVIDADES DE UM CARD (usado no detalhe do lead — WORM-11) --------
  async listForLead(user: any, leadId: string) {
    const context = await this.resolveContext(user);
    await this.assertLeadInScope(context, leadId);
    const rows = (await this.prisma.atividade.findMany({
      where: { companyId: context.companyId, leadId: String(leadId).trim() },
      orderBy: [{ realizadaEm: 'asc' }, { vencimento: 'asc' }],
      take: 200,
    })) as AtividadeRow[];
    return {
      ok: true,
      atividades: rows.map((row) => this.serialize(row, { canSeeOthers: context.canViewCompanyCards })),
    };
  }

  // -------- CRIAR --------
  async createForUser(user: any, dto: CreateAtividadeDto) {
    const context = await this.resolveContext(user);
    await this.assertLeadInScope(context, dto.leadId);

    const vencimento = this.parseDate(dto.vencimento);
    if (!vencimento) throw new BadRequestException('Vencimento invalido.');
    const titulo = this.normalizeText(dto.titulo, 160);
    if (!titulo) throw new BadRequestException('Titulo obrigatorio.');

    // Responsavel: vendedor comum so cria pra si; quem gere equipe pode atribuir.
    let responsavelId = context.userId;
    if (dto.responsavelId && context.canViewCompanyCards) responsavelId = Number(dto.responsavelId);

    const row = (await this.prisma.atividade.create({
      data: {
        leadId: String(dto.leadId).trim(),
        companyId: context.companyId,
        tipo: this.normalizeTipo(dto.tipo),
        titulo,
        vencimento,
        duracao: dto.duracao != null ? Math.trunc(Number(dto.duracao)) : null,
        responsavelId,
        criadaPor: 'user',
      },
    })) as AtividadeRow;

    return { ok: true, atividade: this.serialize(row, { canSeeOthers: context.canViewCompanyCards }) };
  }

  // -------- EDITAR (nao concluir) --------
  async updateForUser(user: any, atividadeId: string, dto: UpdateAtividadeDto) {
    const context = await this.resolveContext(user);
    const existing = await this.prisma.atividade.findFirst({
      where: this.buildAccessWhere(context, { id: String(atividadeId || '').trim() }),
    });
    if (!existing) throw new NotFoundException('Atividade nao encontrada.');

    const data: Record<string, any> = {};
    if (dto.tipo !== undefined) data.tipo = this.normalizeTipo(dto.tipo);
    if (dto.titulo !== undefined) {
      const titulo = this.normalizeText(dto.titulo, 160);
      if (!titulo) throw new BadRequestException('Titulo obrigatorio.');
      data.titulo = titulo;
    }
    if (dto.vencimento !== undefined) {
      const venc = this.parseDate(dto.vencimento);
      if (!venc) throw new BadRequestException('Vencimento invalido.');
      data.vencimento = venc;
    }
    if (dto.duracao !== undefined) data.duracao = dto.duracao == null ? null : Math.trunc(Number(dto.duracao));
    if (dto.responsavelId !== undefined && context.canViewCompanyCards) {
      data.responsavelId = dto.responsavelId == null ? null : Number(dto.responsavelId);
    }

    const row = (await this.prisma.atividade.update({
      where: { id: existing.id },
      data,
    })) as AtividadeRow;
    return { ok: true, atividade: this.serialize(row, { canSeeOthers: context.canViewCompanyCards }) };
  }

  // -------- CONCLUIR (1 tap + resultado) --------
  // Escreve UM evento na timeline do card (reuso) e, se resultado='remarcar' com nova
  // data, cria a proxima atividade automaticamente.
  async concluirForUser(user: any, atividadeId: string, dto: ConcluirAtividadeDto = {}) {
    const context = await this.resolveContext(user);
    const existing = (await this.prisma.atividade.findFirst({
      where: this.buildAccessWhere(context, { id: String(atividadeId || '').trim() }),
    })) as AtividadeRow | null;
    if (!existing) throw new NotFoundException('Atividade nao encontrada.');
    if (existing.realizadaEm) throw new BadRequestException('Atividade ja concluida.');

    const now = new Date();
    const resultadoText = this.normalizeText(dto.resultado);
    const resultLabel = this.canonicalResultLabel(dto.resultado);
    const remarcarPara = this.parseDate(dto.remarcarPara);

    const updated = (await this.prisma.atividade.update({
      where: { id: existing.id },
      data: { realizadaEm: now, resultado: resultadoText },
    })) as AtividadeRow;

    // Evento na timeline do card (WORM-10 termometro deriva do engajamento; aqui
    // fica o registro consultavel). Best-effort: nao derruba a conclusao.
    await this.prisma.vendasLeadTimelineEvent
      .create({
        data: {
          leadId: existing.leadId,
          eventType: 'atividade_concluida',
          title: `Atividade concluida: ${existing.titulo}`.slice(0, 200),
          description: resultadoText,
          sourceType: 'atividade',
          resultLabel,
          createdByUserId: context.userId || null,
        },
      })
      .catch(() => null);

    // Toca o card (updatedAt) para o funil/engajamento reordenar; best-effort.
    await this.prisma.vendasLead
      .updateMany({
        where: { id: existing.leadId, companyId: context.companyId },
        data: { lastContactAt: now },
      })
      .catch(() => null);

    let proxima: any = null;
    if (resultLabel === 'remarcar' && remarcarPara) {
      const nova = (await this.prisma.atividade.create({
        data: {
          leadId: existing.leadId,
          companyId: existing.companyId,
          tipo: existing.tipo,
          titulo: existing.titulo,
          vencimento: remarcarPara,
          duracao: existing.duracao,
          responsavelId: existing.responsavelId,
          criadaPor: 'user',
        },
      })) as AtividadeRow;
      proxima = this.serialize(nova, { canSeeOthers: context.canViewCompanyCards });
    }

    return {
      ok: true,
      atividade: this.serialize(updated, { canSeeOthers: context.canViewCompanyCards }),
      proxima,
    };
  }

  // -------- DELETAR --------
  async deleteForUser(user: any, atividadeId: string) {
    const context = await this.resolveContext(user);
    const existing = await this.prisma.atividade.findFirst({
      where: this.buildAccessWhere(context, { id: String(atividadeId || '').trim() }),
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Atividade nao encontrada.');
    await this.prisma.atividade.delete({ where: { id: existing.id } });
    return { ok: true, deleted: true };
  }

  // ================================================================
  // HOOK WORM-13 — criacao por automacao/IA (sem HTTP, sem access context).
  // O WORM-13 chama isto direto: "lead respondeu → atividade 'ligar em 2 dias'".
  // Idempotencia/dedupe fica a cargo do chamador (o 13 desenha a regra).
  // ================================================================
  async createFromAutomation(input: AutomationAtividadeInput) {
    const leadId = String(input?.leadId || '').trim();
    const companyId = Math.trunc(Number(input?.companyId || 0));
    if (!leadId || !companyId) throw new BadRequestException('leadId e companyId obrigatorios.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: leadId, companyId },
      select: { id: true, assignedUserId: true },
    });
    if (!lead) throw new NotFoundException('Card do lead nao encontrado.');

    const vencimento = this.parseDate(input.vencimento);
    if (!vencimento) throw new BadRequestException('Vencimento invalido.');
    const titulo = this.normalizeText(input.titulo, 160);
    if (!titulo) throw new BadRequestException('Titulo obrigatorio.');

    const origin = input.origin === 'ia' ? 'ia' : 'automacao';
    const responsavelId = input.responsavelId != null ? Number(input.responsavelId) : (lead.assignedUserId ?? null);

    const row = (await this.prisma.atividade.create({
      data: {
        leadId,
        companyId,
        tipo: this.normalizeTipo(input.tipo),
        titulo,
        vencimento,
        duracao: input.duracao != null ? Math.trunc(Number(input.duracao)) : null,
        responsavelId,
        criadaPor: origin,
      },
    })) as AtividadeRow;

    return this.serialize(row);
  }
}

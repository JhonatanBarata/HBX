import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SavedSearchService } from '../saved-search/saved-search.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import type { CreateRotinaDto, UpdateRotinaDto } from './dto/cadencia.dto';

// ================================================================
// WORM-13 (13c) — ROTINAS recorrentes em cima do WORM-15 (SavedSearch).
// "Toda segunda, puxa N leads do filtro salvo Y pro vendedor Z." O runner diario
// dispara SavedSearch.run quando o dia da semana bate e a janela de recorrencia
// esta aberta (everyWeeks). Atras da MESMA flag do runner de cadencia
// (HBX_CADENCIA_RUNNER_ENABLED, default OFF).
// ================================================================

const RUNNER_FLAG = 'HBX_CADENCIA_RUNNER_ENABLED';

type RotinaRow = {
  id: string;
  companyId: number;
  ownerId: number | null;
  nome: string;
  savedSearchId: string;
  assignedSellerId: number | null;
  everyWeeks: number;
  weekdaysJson: string;
  maxLeads: number;
  startsAt: Date;
  endsAt: Date | null;
  visibleOnlyToOwner: boolean;
  ativa: boolean;
  lastRunAt: Date | null;
  lastRunCount: number | null;
  lastRunStatus: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CadenciaRotinaService {
  private readonly logger = new Logger(CadenciaRotinaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly savedSearch: SavedSearchService,
  ) {}

  private get runnerEnabled(): boolean {
    const v = String(process.env[RUNNER_FLAG] || '').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  private async resolveContext(user: any): Promise<VendasAccessContext> {
    return resolveVendasAccessContext(this.prisma, user);
  }

  private assertCanManage(context: VendasAccessContext) {
    if (context.isAdmin || context.canViewCompanyCards) return;
    throw new ForbiddenException('Sem permissão para gerenciar rotinas.');
  }

  private parseWeekdays(json: string | null | undefined): number[] {
    try {
      const arr = JSON.parse(json || '[]');
      if (!Array.isArray(arr)) return [1];
      const out = arr.map((n) => Math.trunc(Number(n))).filter((n) => n >= 0 && n <= 6);
      return out.length ? Array.from(new Set(out)).sort() : [1];
    } catch {
      return [1];
    }
  }

  private normalizeWeekdays(input: unknown): number[] {
    if (!Array.isArray(input)) return [1];
    const out = input.map((n) => Math.trunc(Number(n))).filter((n) => n >= 0 && n <= 6);
    return out.length ? Array.from(new Set(out)).sort() : [1];
  }

  private serialize(row: RotinaRow) {
    return {
      id: row.id,
      nome: row.nome,
      savedSearchId: row.savedSearchId,
      assignedSellerId: row.assignedSellerId ?? null,
      everyWeeks: row.everyWeeks,
      weekdays: this.parseWeekdays(row.weekdaysJson),
      maxLeads: row.maxLeads,
      startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : null,
      endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
      visibleOnlyToOwner: row.visibleOnlyToOwner,
      ativa: row.ativa,
      lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
      lastRunCount: row.lastRunCount ?? null,
      lastRunStatus: row.lastRunStatus ?? null,
      lastError: row.lastError ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    };
  }

  private buildReadWhere(context: VendasAccessContext): Record<string, any> {
    const base: Record<string, any> = { companyId: context.companyId };
    if (context.isAdmin || context.canViewCompanyCards) return base;
    // Vendedor comum: so ve as proprias ou as visiveis (nao "visibleOnlyToOwner"
    // de outro dono).
    return { ...base, OR: [{ ownerId: context.userId }, { visibleOnlyToOwner: false }] };
  }

  private async assertSavedSearchInCompany(companyId: number, savedSearchId: string) {
    const found = (await (this.prisma as any).savedSearch.findFirst({
      where: { id: savedSearchId, companyId },
      select: { id: true },
    })) as { id: string } | null;
    if (!found) throw new BadRequestException('Pesquisa salva inválida para esta empresa.');
  }

  // ---------------- CRUD ----------------
  async listForUser(user: any) {
    const context = await this.resolveContext(user);
    const rows = (await (this.prisma as any).cadenciaRotina.findMany({
      where: this.buildReadWhere(context),
      orderBy: { createdAt: 'desc' },
      take: 100,
    })) as RotinaRow[];
    return {
      ok: true,
      canManage: context.isAdmin || context.canViewCompanyCards,
      runnerEnabled: this.runnerEnabled,
      rotinas: rows.map((r) => this.serialize(r)),
    };
  }

  async createForUser(user: any, dto: CreateRotinaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const nome = String(dto?.nome || '').trim().slice(0, 120);
    if (!nome) throw new BadRequestException('Nome da rotina obrigatório.');
    const savedSearchId = String(dto?.savedSearchId || '').trim();
    if (!savedSearchId) throw new BadRequestException('Pesquisa salva obrigatória.');
    await this.assertSavedSearchInCompany(context.companyId, savedSearchId);

    const row = (await (this.prisma as any).cadenciaRotina.create({
      data: {
        companyId: context.companyId,
        ownerId: context.userId,
        nome,
        savedSearchId,
        assignedSellerId: dto?.assignedSellerId != null ? Number(dto.assignedSellerId) : null,
        everyWeeks: Math.max(1, Math.min(12, Math.trunc(Number(dto?.everyWeeks) || 1))),
        weekdaysJson: JSON.stringify(this.normalizeWeekdays(dto?.weekdays)),
        maxLeads: Math.max(1, Math.min(200, Math.trunc(Number(dto?.maxLeads) || 50))),
        startsAt: dto?.startsAt ? new Date(dto.startsAt) : new Date(),
        endsAt: dto?.endsAt ? new Date(dto.endsAt) : null,
        visibleOnlyToOwner: Boolean(dto?.visibleOnlyToOwner),
        ativa: true,
      },
    })) as RotinaRow;
    return { ok: true, rotina: this.serialize(row) };
  }

  async updateForUser(user: any, id: string, dto: UpdateRotinaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadenciaRotina.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
    })) as RotinaRow | null;
    if (!existing) throw new NotFoundException('Rotina não encontrada.');
    const data: Record<string, any> = {};
    if (dto?.nome !== undefined) {
      const nome = String(dto.nome || '').trim().slice(0, 120);
      if (!nome) throw new BadRequestException('Nome obrigatório.');
      data.nome = nome;
    }
    if (dto?.savedSearchId !== undefined) {
      const sid = String(dto.savedSearchId || '').trim();
      if (!sid) throw new BadRequestException('Pesquisa salva obrigatória.');
      await this.assertSavedSearchInCompany(context.companyId, sid);
      data.savedSearchId = sid;
    }
    if (dto?.assignedSellerId !== undefined) data.assignedSellerId = dto.assignedSellerId == null ? null : Number(dto.assignedSellerId);
    if (dto?.everyWeeks !== undefined) data.everyWeeks = Math.max(1, Math.min(12, Math.trunc(Number(dto.everyWeeks) || 1)));
    if (dto?.weekdays !== undefined) data.weekdaysJson = JSON.stringify(this.normalizeWeekdays(dto.weekdays));
    if (dto?.maxLeads !== undefined) data.maxLeads = Math.max(1, Math.min(200, Math.trunc(Number(dto.maxLeads) || 50)));
    if (dto?.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    if (dto?.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto?.visibleOnlyToOwner !== undefined) data.visibleOnlyToOwner = Boolean(dto.visibleOnlyToOwner);
    if (dto?.ativa !== undefined) data.ativa = Boolean(dto.ativa);
    const row = (await (this.prisma as any).cadenciaRotina.update({ where: { id: existing.id }, data })) as RotinaRow;
    return { ok: true, rotina: this.serialize(row) };
  }

  async deleteForUser(user: any, id: string) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadenciaRotina.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
      select: { id: true },
    })) as { id: string } | null;
    if (!existing) throw new NotFoundException('Rotina não encontrada.');
    await (this.prisma as any).cadenciaRotina.delete({ where: { id: existing.id } });
    return { ok: true, deleted: true };
  }

  // ================================================================
  // RUNNER — dispara as rotinas devidas hoje. Chamado pelo scheduler SOMENTE se a
  // flag estiver ON. Roda SavedSearch.run em nome do owner da rotina.
  // ================================================================
  async runDueRoutines(nowInput?: Date) {
    if (!this.runnerEnabled) return { ok: true, skipped: 'runner_disabled' as const };
    const now = nowInput ?? new Date();
    const weekday = now.getDay(); // 0=Dom..6=Sab

    const rows = (await (this.prisma as any).cadenciaRotina.findMany({
      where: { ativa: true, startsAt: { lte: now } },
      take: 100,
    })) as RotinaRow[];

    let ran = 0;
    let skipped = 0;
    for (const rotina of rows) {
      try {
        if (rotina.endsAt && new Date(rotina.endsAt).getTime() < now.getTime()) {
          skipped += 1;
          continue;
        }
        const weekdays = this.parseWeekdays(rotina.weekdaysJson);
        if (!weekdays.includes(weekday)) {
          skipped += 1;
          continue;
        }
        // Ja rodou hoje? (dedupe: 1 execucao por dia).
        if (rotina.lastRunAt && this.isSameDay(new Date(rotina.lastRunAt), now)) {
          skipped += 1;
          continue;
        }
        // everyWeeks: respeita a cadencia de semanas desde startsAt.
        if (rotina.everyWeeks > 1) {
          const weeksSinceStart = Math.floor((now.getTime() - new Date(rotina.startsAt).getTime()) / (7 * 24 * 3600 * 1000));
          if (weeksSinceStart % rotina.everyWeeks !== 0) {
            skipped += 1;
            continue;
          }
        }
        await this.executeRotina(rotina, now);
        ran += 1;
      } catch (error: any) {
        this.logger.warn(`[cadencia-rotina] falha rotina=${rotina.id}: ${String(error?.message || error)}`);
        await (this.prisma as any).cadenciaRotina
          .update({ where: { id: rotina.id }, data: { lastRunAt: now, lastRunStatus: 'erro', lastError: String(error?.message || error).slice(0, 200) } })
          .catch(() => null);
      }
    }
    return { ok: true, considered: rows.length, ran, skipped };
  }

  // Roda a pesquisa salva como o OWNER da rotina (reusa SavedSearch.runForUser,
  // que ja aplica a query oficial do Radar e a distribuicao por vendedor). Nao
  // reescreve consulta nem inventa mecanismo.
  private async executeRotina(rotina: RotinaRow, now: Date) {
    const owner = rotina.ownerId
      ? await this.prisma.user.findUnique({ where: { id: rotina.ownerId }, select: { id: true, companyId: true, role: true } }).catch(() => null)
      : null;
    const runUser = owner
      ? { id: owner.id, companyId: owner.companyId, role: owner.role }
      : { id: rotina.ownerId || 0, companyId: rotina.companyId };

    const result: any = await this.savedSearch.runForUser(runUser, rotina.savedSearchId).catch((e) => {
      throw new Error(`saved_search_run_failed: ${String(e?.message || e)}`);
    });
    const count = Number(result?.count ?? 0) || 0;
    await (this.prisma as any).cadenciaRotina.update({
      where: { id: rotina.id },
      data: { lastRunAt: now, lastRunCount: count, lastRunStatus: 'sucesso', lastError: null },
    });
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
}

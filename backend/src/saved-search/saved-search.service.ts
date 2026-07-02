import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebscrapingService } from '../webscraping/webscraping.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import {
  SAVED_SEARCH_FILTER_KEYS,
  type CreateSavedSearchDto,
  type UpdateSavedSearchDto,
} from './dto/saved-search.dto';

type SavedSearchRow = {
  id: string;
  companyId: number;
  ownerId: number;
  nome: string;
  filtroJson: string;
  assignedSellerId: number | null;
  lastRunAt: Date | null;
  lastCount: number | null;
  createdAt: Date;
  updatedAt: Date;
};

// Recorte de filtros do Radar que a pesquisa salva guarda. Espelha
// SAVED_SEARCH_FILTER_KEYS; o resto e descartado no salvar.
type SavedSearchFiltro = Record<string, unknown>;

@Injectable()
export class SavedSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webscraping: WebscrapingService,
  ) {}

  private async resolveContext(user: any): Promise<VendasAccessContext> {
    return resolveVendasAccessContext(this.prisma, user);
  }

  // Admin/gerente (ve a empresa toda) pode atribuir recorte a vendedor; vendedor
  // comum so salva pra si.
  private canAssignSeller(context: VendasAccessContext) {
    return context.isAdmin || context.canViewCompanyCards;
  }

  private normalizeName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 120) : null;
  }

  // Mantem so as chaves conhecidas de filtro (subset de RadarFiltersInput). Evita
  // que o filtroJson vire deposito de qualquer coisa que o cliente mandar.
  private sanitizeFiltro(input: unknown): SavedSearchFiltro {
    const out: SavedSearchFiltro = {};
    if (!input || typeof input !== 'object') return out;
    const src = input as Record<string, unknown>;
    for (const key of SAVED_SEARCH_FILTER_KEYS) {
      const value = src[key];
      if (value === undefined || value === null || value === '') continue;
      out[key] = value;
    }
    return out;
  }

  private parseFiltro(json: string | null | undefined): SavedSearchFiltro {
    try {
      const parsed = JSON.parse(json || '{}');
      return this.sanitizeFiltro(parsed);
    } catch {
      return {};
    }
  }

  private serialize(row: SavedSearchRow) {
    return {
      id: row.id,
      nome: row.nome,
      filtro: this.parseFiltro(row.filtroJson),
      assignedSellerId: row.assignedSellerId ?? null,
      lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
      lastCount: row.lastCount ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  // Vendedores ativos da empresa (para o seletor "atribuir a vendedor"). So quem
  // pode atribuir enxerga a lista; vendedor comum recebe [].
  private async listCompanySellers(context: VendasAccessContext) {
    if (!this.canAssignSeller(context)) return [];
    const rows = await (this.prisma.user as any)
      .findMany({
        where: { companyId: context.companyId, role: 'USER', isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      .catch(() => [] as Array<{ id: number; name: string | null }>);
    return (rows || []).map((r: any) => ({
      id: Number(r.id),
      name: String(r.name || '').trim() || `Vendedor #${r.id}`,
    }));
  }

  private async assertSellerInCompany(context: VendasAccessContext, sellerId: number) {
    const seller = await this.prisma.user
      .findFirst({
        where: { id: sellerId, companyId: context.companyId, role: 'USER', isActive: true },
        select: { id: true },
      })
      .catch(() => null);
    if (!seller) throw new BadRequestException('Vendedor invalido para esta empresa.');
    return seller;
  }

  // Escopo de leitura: admin/gerente ve as pesquisas da empresa toda; vendedor
  // comum ve as proprias E as que foram atribuidas a ele (assignedSellerId).
  private buildReadWhere(context: VendasAccessContext): Record<string, any> {
    const base: Record<string, any> = { companyId: context.companyId };
    if (this.canAssignSeller(context)) return base;
    return {
      ...base,
      OR: [{ ownerId: context.userId }, { assignedSellerId: context.userId }],
    };
  }

  // ---------------- LISTAR ----------------
  async listForUser(user: any) {
    const context = await this.resolveContext(user);
    const rows = (await (this.prisma as any).savedSearch.findMany({
      where: this.buildReadWhere(context),
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    })) as SavedSearchRow[];
    return {
      ok: true,
      canAssignSeller: this.canAssignSeller(context),
      sellers: await this.listCompanySellers(context),
      searches: rows.map((row) => this.serialize(row)),
    };
  }

  // ---------------- CRIAR ----------------
  async createForUser(user: any, dto: CreateSavedSearchDto) {
    const context = await this.resolveContext(user);
    const nome = this.normalizeName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome da pesquisa obrigatorio.');
    const filtro = this.sanitizeFiltro(dto?.filtro);

    let assignedSellerId: number | null = null;
    if (dto?.assignedSellerId != null) {
      if (!this.canAssignSeller(context)) {
        throw new ForbiddenException('Sem permissao para atribuir recorte a vendedor.');
      }
      assignedSellerId = Number(dto.assignedSellerId);
      await this.assertSellerInCompany(context, assignedSellerId);
    }

    const row = (await (this.prisma as any).savedSearch.create({
      data: {
        companyId: context.companyId,
        ownerId: context.userId,
        nome,
        filtroJson: JSON.stringify(filtro),
        assignedSellerId,
      },
    })) as SavedSearchRow;

    if (assignedSellerId) {
      await this.applyAssignedSellerStandingOrder(context.companyId, assignedSellerId, filtro).catch(() => null);
    }

    return { ok: true, search: this.serialize(row) };
  }

  // ---------------- EDITAR ----------------
  async updateForUser(user: any, id: string, dto: UpdateSavedSearchDto) {
    const context = await this.resolveContext(user);
    const existing = (await (this.prisma as any).savedSearch.findFirst({
      where: this.buildWriteWhere(context, id),
    })) as SavedSearchRow | null;
    if (!existing) throw new NotFoundException('Pesquisa nao encontrada.');

    const data: Record<string, any> = {};
    let nextFiltro = this.parseFiltro(existing.filtroJson);

    if (dto?.nome !== undefined) {
      const nome = this.normalizeName(dto.nome);
      if (!nome) throw new BadRequestException('Nome da pesquisa obrigatorio.');
      data.nome = nome;
    }
    if (dto?.filtro !== undefined) {
      nextFiltro = this.sanitizeFiltro(dto.filtro);
      data.filtroJson = JSON.stringify(nextFiltro);
    }
    let assignedSellerId = existing.assignedSellerId;
    if (dto?.assignedSellerId !== undefined) {
      if (!this.canAssignSeller(context)) {
        throw new ForbiddenException('Sem permissao para atribuir recorte a vendedor.');
      }
      if (dto.assignedSellerId == null) {
        assignedSellerId = null;
      } else {
        assignedSellerId = Number(dto.assignedSellerId);
        await this.assertSellerInCompany(context, assignedSellerId);
      }
      data.assignedSellerId = assignedSellerId;
    }

    const row = (await (this.prisma as any).savedSearch.update({
      where: { id: existing.id },
      data,
    })) as SavedSearchRow;

    if (assignedSellerId) {
      await this.applyAssignedSellerStandingOrder(context.companyId, assignedSellerId, nextFiltro).catch(() => null);
    }

    return { ok: true, search: this.serialize(row) };
  }

  // ---------------- DELETAR ----------------
  async deleteForUser(user: any, id: string) {
    const context = await this.resolveContext(user);
    const existing = (await (this.prisma as any).savedSearch.findFirst({
      where: this.buildWriteWhere(context, id),
      select: { id: true },
    })) as { id: string } | null;
    if (!existing) throw new NotFoundException('Pesquisa nao encontrada.');
    await (this.prisma as any).savedSearch.delete({ where: { id: existing.id } });
    return { ok: true, deleted: true };
  }

  // ---------------- RODAR (reusa a query do Radar) ----------------
  // POST /saved-search/:id/run: aplica o filtro salvo na MESMA query da tela do
  // Radar (listRadarLeadsForUser) — nao reescreve consulta. Atualiza lastRunAt/
  // lastCount para o historico "esse nicho esta crescendo".
  async runForUser(user: any, id: string) {
    const context = await this.resolveContext(user);
    const row = (await (this.prisma as any).savedSearch.findFirst({
      where: { ...this.buildReadWhere(context), id: String(id || '').trim() },
    })) as SavedSearchRow | null;
    if (!row) throw new NotFoundException('Pesquisa nao encontrada.');

    const filtro = this.parseFiltro(row.filtroJson);
    const result: any = await this.webscraping.listRadarLeadsForUser(user, this.toRadarInput(filtro));
    const count = Number(result?.meta?.totalAvailable ?? result?.total ?? (Array.isArray(result?.items) ? result.items.length : 0)) || 0;

    await (this.prisma as any).savedSearch
      .update({ where: { id: row.id }, data: { lastRunAt: new Date(), lastCount: count } })
      .catch(() => null);

    return { ok: true, count, result };
  }

  // ---------------- helpers ----------------

  // Escrita (editar/deletar): dono da pesquisa OU admin/gerente da empresa.
  private buildWriteWhere(context: VendasAccessContext, id: string): Record<string, any> {
    const base: Record<string, any> = { id: String(id || '').trim(), companyId: context.companyId };
    if (this.canAssignSeller(context)) return base;
    return { ...base, ownerId: context.userId };
  }

  // Converte o filtro salvo (chaves da tela: alcance/quantos) para o input do
  // Radar (radiusKm/limit). 'alcance' e string em km na tela.
  private toRadarInput(filtro: SavedSearchFiltro): Record<string, any> {
    const input: Record<string, any> = { ...filtro };
    if (input.alcance !== undefined) {
      const km = Number(input.alcance);
      if (Number.isFinite(km) && km > 0) input.radiusKm = km;
      delete input.alcance;
    }
    if (input.quantos !== undefined) {
      const n = Number(input.quantos);
      if (Number.isFinite(n) && n > 0) input.limit = n;
      delete input.quantos;
    }
    return input;
  }

  // Atribuir recorte ao vendedor = alimentar a distribuicao existente: grava o
  // standing order (cidade/UF/segmento) no proprio vendedor via a rotina do
  // Radar, para o motor de reabastecimento tratar aquele recorte como fonte
  // preferencial daquele vendedor (nao inventa mecanismo novo). Best-effort.
  private async applyAssignedSellerStandingOrder(companyId: number, sellerId: number, filtro: SavedSearchFiltro) {
    const city = String((filtro as any).city || '').trim();
    const state = String((filtro as any).state || '').trim();
    const segment = String((filtro as any).segment || '').trim();
    // Sem cidade+segmento a distribuicao nao tem alvo — nao mexe no standing order.
    if (!city || !segment) return;

    const alcanceRaw = (filtro as any).alcance ?? (filtro as any).radiusKm;
    const alcance = alcanceRaw != null && String(alcanceRaw).trim() ? String(alcanceRaw).trim() : '';
    const quantosRaw = Number((filtro as any).quantos ?? (filtro as any).limit ?? 0);
    const quantos = Number.isFinite(quantosRaw) && quantosRaw > 0 ? Math.min(20, Math.trunc(quantosRaw)) : 5;

    // Reusa a rotina oficial: passa um "user" minimo do proprio vendedor para o
    // saveRadarSellerStandingOrder gravar no radarSellerStandingOrderJson dele.
    await this.webscraping.saveRadarSellerStandingOrder(
      { id: sellerId, companyId },
      { active: true, city, state, segment, alcance, quantos },
    );
  }
}

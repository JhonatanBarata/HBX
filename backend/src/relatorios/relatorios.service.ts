import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveVendasAccessContext } from '../team/team-access-runtime';

// WORM-18 — Relatorios "Acompanhe sua equipe" (6 widgets, pro dono/admin).
// NATUREZA: SO LEITURA. Agrega dados que JA EXISTEM (VendasLead, conversas do
// Webwhats no banco = CompanyConversation/CompanyMessage, RadarDistribution).
// Sem tabela, sem migration, sem warehouse: queries diretas com cache ~5min.
//
// LEI DO VENDEDOR (docs/Rules/PAGAMENTOS.md): valores R$ SO para admin — e,
// dentro de ADMIN, o Gerente (canViewBilling=false) NAO ve dinheiro. O gate
// vive no BACKEND (nao confiar so na UI): sem admin, 403; sem canViewBilling,
// os R$ vem zerados/omitidos e canViewValues=false sinaliza a UI.

export type RelatoriosPeriod = { key: string; label: string; start: Date; end: Date };

type ReportContext = {
  companyId: number;
  isAdmin: boolean;
  canViewValues: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

// Etapas do funil de Vendas (VendasLead.status) na ordem de progressao.
const FUNNEL_STAGES: { key: string; label: string }[] = [
  { key: 'novo', label: 'Novo' },
  { key: 'contato', label: 'Em contato' },
  { key: 'retorno', label: 'Retorno' },
  { key: 'qualificado', label: 'Qualificado' },
  { key: 'encerrado', label: 'Encerrado' },
];

// Sem resposta ha mais de 2h = dinheiro evaporando (metrica roubavel nº1 do .md).
const NO_REPLY_THRESHOLD_MS = 2 * 60 * 60 * 1000;
// Recem-aberta aproveitada = primeiro contato em menos de 48h.
const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  // cache por (companyId + endpoint + periodo). TTL 5min — relatorio nao precisa
  // de tempo real; alivia o banco em telas que o dono deixa aberta.
  private readonly cache = new Map<string, { at: number; value: any }>();

  private resolvePeriod(periodRaw?: string): RelatoriosPeriod {
    const period = String(periodRaw || '7d').trim().toLowerCase();
    const now = new Date();
    const start = new Date(now);
    if (period === 'today' || period === 'hoje') {
      start.setHours(0, 0, 0, 0);
      return { key: 'today', label: 'Hoje', start, end: now };
    }
    const days = period === '30d' ? 30 : 7;
    start.setDate(start.getDate() - Math.max(1, days - 1));
    start.setHours(0, 0, 0, 0);
    return { key: `${days}d`, label: `${days} dias`, start, end: now };
  }

  // Gate central. So Admin/Master passa (relatorio "pro dono"). Vendedor = 403.
  // canViewValues separa o Dono (ve R$) do Gerente (ADMIN sem billing) — LEI DO
  // VENDEDOR reforcada mesmo dentro do papel ADMIN.
  private async resolveReportContext(user: any): Promise<ReportContext> {
    const access = await resolveVendasAccessContext(this.prisma, user);
    const isAdmin = Boolean(access.isAdmin || access.isSystemMaster);
    if (!isAdmin) {
      throw new ForbiddenException('Relatorios da equipe sao exclusivos do Admin.');
    }
    const canViewValues = await this.resolveCanViewValues(access);
    return { companyId: access.companyId, isAdmin, canViewValues };
  }

  private async resolveCanViewValues(access: any): Promise<boolean> {
    if (access.isSystemMaster) return true;
    // Gerente = ADMIN com canViewBilling=false; nao ve dinheiro.
    const row = await this.prisma.user
      .findUnique({ where: { id: access.userId }, select: { canViewBilling: true } })
      .catch(() => null);
    return (row as any)?.canViewBilling !== false;
  }

  private cacheKey(companyId: number, endpoint: string, period: RelatoriosPeriod, extra = '') {
    return `${companyId}:${endpoint}:${period.key}:${extra}`;
  }

  private getCached<T>(key: string): T | null {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
    if (hit) this.cache.delete(key);
    return null;
  }

  private setCached(key: string, value: any) {
    this.cache.set(key, { at: Date.now(), value });
  }

  // Nomes dos vendedores da empresa (para rotular linhas por assignedUserId).
  private async loadSellerNames(companyId: number): Promise<Map<number, string>> {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true, email: true },
    });
    const map = new Map<number, string>();
    for (const u of users as any[]) {
      const label = String(u.name || u.email || `Usuario ${u.id}`).trim() || `Usuario ${u.id}`;
      map.set(Number(u.id), label);
    }
    return map;
  }

  // ── Widget 1 — 💰 Funil em R$ por etapa (ganho/perdido no periodo) ─────────
  // Fonte: VendasLead. Conta cards por etapa e soma o R$ do que GANHOU
  // (saleStatus=sale_confirmed) vs. PERDEU (encerrado sem venda) no periodo.
  async getFunnelRevenue(user: any, periodRaw?: string) {
    const ctx = await this.resolveReportContext(user);
    const period = this.resolvePeriod(periodRaw);
    const key = this.cacheKey(ctx.companyId, 'funnel', period, ctx.canViewValues ? 'v' : 'n');
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId: ctx.companyId,
        OR: [
          { createdAt: { gte: period.start, lte: period.end } },
          { updatedAt: { gte: period.start, lte: period.end } },
          { closedAt: { gte: period.start, lte: period.end } },
        ],
      },
      select: {
        status: true,
        saleStatus: true,
        saleValue: true,
        closedAt: true,
        saleConfirmedAt: true,
      },
      take: 5000,
    });

    const stageCounts = new Map<string, number>(FUNNEL_STAGES.map((s) => [s.key, 0]));
    let wonCount = 0;
    let wonValue = 0;
    let lostCount = 0;
    for (const lead of leads as any[]) {
      const status = String(lead.status || 'novo').trim().toLowerCase();
      if (stageCounts.has(status)) stageCounts.set(status, (stageCounts.get(status) || 0) + 1);
      const confirmed = String(lead.saleStatus || '') === 'sale_confirmed';
      const inPeriod = (d: unknown) =>
        d instanceof Date && d.getTime() >= period.start.getTime() && d.getTime() <= period.end.getTime();
      if (confirmed && inPeriod(lead.saleConfirmedAt || lead.closedAt)) {
        wonCount += 1;
        wonValue += Number(lead.saleValue || 0) || 0;
      } else if (status === 'encerrado' && inPeriod(lead.closedAt)) {
        lostCount += 1;
      }
    }

    const stages = FUNNEL_STAGES.map((s) => ({ stage: s.label, count: stageCounts.get(s.key) || 0 }));
    const result = {
      period: { key: period.key, label: period.label },
      stages,
      won: { count: wonCount, value: ctx.canViewValues ? round1(wonValue) : null },
      lost: { count: lostCount, value: null }, // "perdido" = card encerrado sem venda; R$ potencial nao existe no schema
      canViewValues: ctx.canViewValues,
    };
    this.setCached(key, result);
    return result;
  }

  // ── Widget 2 — 🔕 Chats sem resposta >2h, por vendedor ─────────────────────
  // Fonte: Webwhats no banco (CompanyConversation/CompanyMessage). Ultima msg e
  // do lead (INBOUND) e ninguem respondeu (OUTBOUND) ha >2h. Computado do banco,
  // NAO do motor ao vivo (regra da missao). Nao usa periodo (e estado AGORA).
  async getUnansweredChats(user: any) {
    const ctx = await this.resolveReportContext(user);
    const key = `${ctx.companyId}:unanswered:now`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    const now = Date.now();
    const cutoff = new Date(now - NO_REPLY_THRESHOLD_MS);
    const conversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId: ctx.companyId,
        channel: 'whatsapp',
        lastMessageAt: { lte: cutoff },
      },
      select: {
        id: true,
        assignedUserId: true,
        currentStep: true,
        lastMessageAt: true,
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: { direction: true, timestamp: true },
        },
      },
      orderBy: { lastMessageAt: 'asc' },
      take: 3000,
    });

    const sellerNames = await this.loadSellerNames(ctx.companyId);
    const bySeller = new Map<number | string, { userId: number | null; name: string; count: number; oldestMs: number }>();
    let total = 0;
    for (const conv of conversations as any[]) {
      const last = Array.isArray(conv.messages) ? conv.messages[0] : null;
      // sem mensagem, ou ultima ja e OUTBOUND (empresa respondeu) => nao conta
      if (!last || String(last.direction || '').toUpperCase() !== 'INBOUND') continue;
      const lastTs = last.timestamp instanceof Date ? last.timestamp.getTime() : new Date(conv.lastMessageAt).getTime();
      if (now - lastTs < NO_REPLY_THRESHOLD_MS) continue;
      total += 1;
      const userId = conv.assignedUserId ? Number(conv.assignedUserId) : null;
      const mapKey = userId ?? 'unassigned';
      const name = userId ? sellerNames.get(userId) || `Usuario ${userId}` : 'Sem responsavel';
      const entry = bySeller.get(mapKey) || { userId, name, count: 0, oldestMs: lastTs };
      entry.count += 1;
      entry.oldestMs = Math.min(entry.oldestMs, lastTs);
      bySeller.set(mapKey, entry);
    }

    const rows = Array.from(bySeller.values())
      .map((e) => ({
        userId: e.userId,
        seller: e.name,
        count: e.count,
        waitingHours: round1((now - e.oldestMs) / (60 * 60 * 1000)),
      }))
      .sort((a, b) => b.count - a.count || b.waitingHours - a.waitingHours);

    const result = { thresholdHours: 2, total, rows };
    this.setCached(key, result);
    return result;
  }

  // ── Widget 3 — 📈 Leads entregues × trabalhados × convertidos por vendedor ──
  // Entregues: RadarDistributionDailyUsage.deliveredCount (por userId no periodo).
  // Trabalhados: VendasLead com attemptCount>0 ou lastContactAt no periodo.
  // Convertidos: VendasLead saleStatus=sale_confirmed no periodo.
  async getSellerFunnel(user: any, periodRaw?: string) {
    const ctx = await this.resolveReportContext(user);
    const period = this.resolvePeriod(periodRaw);
    const key = this.cacheKey(ctx.companyId, 'seller-funnel', period);
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    const startDayKey = this.dayKey(period.start);
    const endDayKey = this.dayKey(period.end);

    const [usageRows, leads, sellerNames] = await Promise.all([
      this.prisma.radarDistributionDailyUsage.findMany({
        where: { companyId: ctx.companyId, dayKey: { gte: startDayKey, lte: endDayKey } },
        select: { userId: true, deliveredCount: true },
      }),
      this.prisma.vendasLead.findMany({
        where: {
          companyId: ctx.companyId,
          assignedUserId: { not: null },
          OR: [
            { updatedAt: { gte: period.start, lte: period.end } },
            { lastContactAt: { gte: period.start, lte: period.end } },
            { saleConfirmedAt: { gte: period.start, lte: period.end } },
          ],
        },
        select: {
          assignedUserId: true,
          attemptCount: true,
          lastContactAt: true,
          saleStatus: true,
          saleConfirmedAt: true,
        },
        take: 8000,
      }),
      this.loadSellerNames(ctx.companyId),
    ]);

    type Agg = { userId: number; seller: string; delivered: number; worked: number; converted: number };
    const agg = new Map<number, Agg>();
    const ensure = (userId: number): Agg => {
      let a = agg.get(userId);
      if (!a) {
        a = { userId, seller: sellerNames.get(userId) || `Usuario ${userId}`, delivered: 0, worked: 0, converted: 0 };
        agg.set(userId, a);
      }
      return a;
    };

    for (const row of usageRows as any[]) {
      const userId = row.userId ? Number(row.userId) : 0;
      if (!userId) continue;
      ensure(userId).delivered += Number(row.deliveredCount || 0) || 0;
    }
    for (const lead of leads as any[]) {
      const userId = Number(lead.assignedUserId || 0);
      if (!userId) continue;
      const a = ensure(userId);
      const worked =
        Number(lead.attemptCount || 0) > 0 ||
        (lead.lastContactAt instanceof Date &&
          lead.lastContactAt.getTime() >= period.start.getTime() &&
          lead.lastContactAt.getTime() <= period.end.getTime());
      if (worked) a.worked += 1;
      if (
        String(lead.saleStatus || '') === 'sale_confirmed' &&
        lead.saleConfirmedAt instanceof Date &&
        lead.saleConfirmedAt.getTime() >= period.start.getTime() &&
        lead.saleConfirmedAt.getTime() <= period.end.getTime()
      ) {
        a.converted += 1;
      }
    }

    const rows = Array.from(agg.values()).sort(
      (a, b) => b.converted - a.converted || b.worked - a.worked || b.delivered - a.delivered,
    );
    const result = { period: { key: period.key, label: period.label }, rows };
    this.setCached(key, result);
    return result;
  }

  // ── Widget 4 — ⏱️ Tempo medio 1ª resposta por vendedor ─────────────────────
  // Fonte: Webwhats no banco. Para cada conversa, mede o gap entre a 1ª msg do
  // lead (INBOUND) e a 1ª resposta humana da empresa (OUTBOUND senderType=human)
  // que veio DEPOIS. Media por assignedUserId. So conversas com resposta contam.
  async getFirstResponseTime(user: any, periodRaw?: string) {
    const ctx = await this.resolveReportContext(user);
    const period = this.resolvePeriod(periodRaw);
    const key = this.cacheKey(ctx.companyId, 'first-response', period);
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    const conversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId: ctx.companyId,
        channel: 'whatsapp',
        lastMessageAt: { gte: period.start, lte: period.end },
      },
      select: {
        id: true,
        assignedUserId: true,
        messages: {
          where: { timestamp: { gte: period.start, lte: period.end } },
          orderBy: { timestamp: 'asc' },
          select: { direction: true, senderType: true, timestamp: true },
          take: 60,
        },
      },
      take: 3000,
    });

    const sellerNames = await this.loadSellerNames(ctx.companyId);
    type Agg = { userId: number | null; seller: string; totalMs: number; samples: number };
    const agg = new Map<number | string, Agg>();

    for (const conv of conversations as any[]) {
      const msgs = Array.isArray(conv.messages) ? conv.messages : [];
      // primeiro INBOUND do lead
      let inboundAt: number | null = null;
      let gapMs: number | null = null;
      for (const m of msgs) {
        const dir = String(m.direction || '').toUpperCase();
        const ts = m.timestamp instanceof Date ? m.timestamp.getTime() : null;
        if (ts == null) continue;
        if (dir === 'INBOUND') {
          if (inboundAt == null) inboundAt = ts;
        } else if (dir === 'OUTBOUND') {
          // so conta resposta HUMANA (nao bot/system) e que veio depois de um INBOUND
          const sender = String(m.senderType || '').toLowerCase();
          if (inboundAt != null && sender === 'human') {
            gapMs = ts - inboundAt;
            break;
          }
        }
      }
      if (gapMs == null || gapMs < 0) continue;
      const userId = conv.assignedUserId ? Number(conv.assignedUserId) : null;
      const mapKey = userId ?? 'unassigned';
      const name = userId ? sellerNames.get(userId) || `Usuario ${userId}` : 'Sem responsavel';
      const entry = agg.get(mapKey) || { userId, seller: name, totalMs: 0, samples: 0 };
      entry.totalMs += gapMs;
      entry.samples += 1;
      agg.set(mapKey, entry);
    }

    const rows = Array.from(agg.values())
      .map((e) => ({
        userId: e.userId,
        seller: e.seller,
        samples: e.samples,
        avgMinutes: round1(e.totalMs / e.samples / (60 * 1000)),
      }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes);

    const result = { period: { key: period.key, label: period.label }, rows };
    this.setCached(key, result);
    return result;
  }

  // ── Widget 5 — 🐣 Recem-abertas aproveitadas (<48h) ────────────────────────
  // Fonte: VendasLead criados no periodo. "Aproveitada" = primeiro contato
  // (lastContactAt) em menos de 48h da criacao. Tambem conta as ainda pendentes.
  async getFreshLeadsUsage(user: any, periodRaw?: string) {
    const ctx = await this.resolveReportContext(user);
    const period = this.resolvePeriod(periodRaw);
    const key = this.cacheKey(ctx.companyId, 'fresh', period);
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    const leads = await this.prisma.vendasLead.findMany({
      where: { companyId: ctx.companyId, createdAt: { gte: period.start, lte: period.end } },
      select: { createdAt: true, lastContactAt: true, attemptCount: true },
      take: 8000,
    });

    const now = Date.now();
    let opened = 0;
    let usedIn48h = 0;
    let stillWaiting = 0; // aberto ha <48h, sem contato ainda (janela ainda aberta)
    let missed = 0; // ja passou 48h e nunca foi contatado
    for (const lead of leads as any[]) {
      opened += 1;
      const createdMs = lead.createdAt instanceof Date ? lead.createdAt.getTime() : null;
      if (createdMs == null) continue;
      const contactedMs = lead.lastContactAt instanceof Date ? lead.lastContactAt.getTime() : null;
      const contacted = contactedMs != null || Number(lead.attemptCount || 0) > 0;
      if (contacted && contactedMs != null && contactedMs - createdMs <= FRESH_WINDOW_MS) {
        usedIn48h += 1;
      } else if (!contacted) {
        if (now - createdMs <= FRESH_WINDOW_MS) stillWaiting += 1;
        else missed += 1;
      }
    }

    const rate = opened > 0 ? round1((usedIn48h / opened) * 100) : 0;
    const result = {
      period: { key: period.key, label: period.label },
      opened,
      usedIn48h,
      stillWaiting,
      missed,
      ratePct: rate,
    };
    this.setCached(key, result);
    return result;
  }

  // ── Widget 6 — 🤖 IA: conversas tocadas × devolvidas × convertidas ─────────
  // Fonte: Webwhats no banco + VendasLead. "Tocada": conversa teve msg do bot
  // (senderType=bot) OU botActive. "Devolvida": humanAssigned=true (passou pro
  // humano). "Convertida": telefone da conversa bate com um VendasLead com venda
  // confirmada no periodo.
  async getBotFunnel(user: any, periodRaw?: string) {
    const ctx = await this.resolveReportContext(user);
    const period = this.resolvePeriod(periodRaw);
    const key = this.cacheKey(ctx.companyId, 'bot', period);
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    const conversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId: ctx.companyId,
        channel: 'whatsapp',
        lastMessageAt: { gte: period.start, lte: period.end },
      },
      select: {
        id: true,
        contact: true,
        botActive: true,
        humanAssigned: true,
        messages: {
          where: { senderType: 'bot' },
          take: 1,
          select: { id: true },
        },
      },
      take: 4000,
    });

    let touched = 0;
    let handedToHuman = 0;
    const touchedPhones = new Set<string>();
    for (const conv of conversations as any[]) {
      const botTouched = Boolean(conv.botActive) || (Array.isArray(conv.messages) && conv.messages.length > 0);
      if (!botTouched) continue;
      touched += 1;
      if (conv.humanAssigned) handedToHuman += 1;
      const digits = onlyDigits(conv.contact);
      if (digits) touchedPhones.add(digits);
    }

    // Convertidas: das conversas tocadas pelo bot, quantas viraram venda confirmada
    // no periodo (match por telefone). Busca leads confirmados e cruza os digitos.
    let converted = 0;
    if (touchedPhones.size > 0) {
      const confirmedLeads = await this.prisma.vendasLead.findMany({
        where: {
          companyId: ctx.companyId,
          saleStatus: 'sale_confirmed',
          saleConfirmedAt: { gte: period.start, lte: period.end },
        },
        select: { phone: true, phoneNormalized: true },
        take: 5000,
      });
      for (const lead of confirmedLeads as any[]) {
        const norm = onlyDigits(lead.phoneNormalized || lead.phone);
        if (norm && touchedPhones.has(norm)) converted += 1;
      }
    }

    const result = {
      period: { key: period.key, label: period.label },
      touched,
      handedToHuman,
      converted,
    };
    this.setCached(key, result);
    return result;
  }

  // Painel completo em 1 chamada (a tela usa este). Reusa os metodos (cada um
  // tem seu proprio cache). O gate roda em cada um — barato e consistente.
  async getDashboard(user: any, periodRaw?: string) {
    const [funnelRevenue, unansweredChats, sellerFunnel, firstResponse, freshLeads, botFunnel] = await Promise.all([
      this.getFunnelRevenue(user, periodRaw),
      this.getUnansweredChats(user),
      this.getSellerFunnel(user, periodRaw),
      this.getFirstResponseTime(user, periodRaw),
      this.getFreshLeadsUsage(user, periodRaw),
      this.getBotFunnel(user, periodRaw),
    ]);
    return {
      period: this.resolvePeriod(periodRaw),
      funnelRevenue,
      unansweredChats,
      sellerFunnel,
      firstResponse,
      freshLeads,
      botFunnel,
    };
  }

  private dayKey(date: Date): string {
    // dayKey no formato YYYY-MM-DD (fuso America/Sao_Paulo, igual ao Radar).
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(date);
  }
}

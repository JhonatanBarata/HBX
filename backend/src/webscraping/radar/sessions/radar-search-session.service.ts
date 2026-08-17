import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebscrapingService } from '../../webscraping.service';

/**
 * RadarSearchSessionService — REFUNDAÇÃO F1 (28/07).
 *
 * O "trabalho do vendedor" (buscar 1 segmento em N cidades, com teto e pausa automática)
 * morava num loop React dentro da aba do navegador: sair da tela matava a fila, F5 matava a
 * fila, deploy matava a fila — e a tela voltava quebrada ("mais morto que o Silvio Santos").
 *
 * Agora a sessão é linha de banco e ESTE serviço é o único orquestrador: cria 1 run por
 * cidade EM SÉRIE (reusando o pump/stale-requeue que já existem), avança o cursor quando o
 * run fecha, pausa sozinho depois de N leads e retoma de onde parou. O front vira espectador:
 * POST cria, GET re-hidrata TUDO, pause/resume/cancel são 1 clique.
 *
 * Serviço Nest de verdade (fora dos mixins) — modelo do desmonte F6: injetável, testável,
 * nenhum método novo no monólito.
 */

export type RadarSessionCity = {
  city: string;
  state: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  runId?: string | null;
  foundCount?: number;
  message?: string | null;
  // LOTE 4 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): quanto desta cidade veio da
  // Receita e quanto veio da web. Campos OPCIONAIS de propósito: sessão em voo no momento do
  // deploy tem `citiesJson` sem eles, e AUSENTE ≠ ZERO — escrever 0 por falta de dado faria o
  // relatório mentir na direção oposta ("Receita 0" numa cidade que ninguém mediu).
  rfbCount?: number;
  webCount?: number;
  // Quantas empresas a Receita TEM nesta cidade (`metricsJson.rfbDrain.available`, medido pelo
  // Lote 2). É daqui que sai o motivo honesto "sem base na Receita" — sem ele, a cidade zerada
  // volta a ser um 0 mudo que não diz se a base é pobre ou se a busca falhou.
  rfbAvailable?: number;
};

type StartSessionInput = {
  cities: Array<{ city: string; state?: string | null }>;
  segment: string;
  quantity?: number;
  pauseAfterLeads?: number;
  targetTotal?: number;
  filters?: Record<string, unknown>;
};

const SESSION_ACTIVE_STATUSES = ['running', 'paused'];
const RUN_TERMINAL_STATUSES = new Set(['completed', 'completed_insufficient_results', 'canceled', 'failed', 'partial_error']);
const MAX_CITIES_PER_SESSION = 100;
const DEFAULT_QUANTITY_PER_CITY = 100;
const SWEEP_INTERVAL_MS = 4_000;
// Sessão terminal continua visível no GET por este período — a tela que voltar do almoço
// ainda encontra o resultado ("apreciar o resultado") em vez de um vazio inexplicado.
const FINISHED_VISIBILITY_MS = 30 * 60_000;

@Injectable()
export class RadarSearchSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadarSearchSessionService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ticking = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WebscrapingService))
    private readonly webscraping: WebscrapingService,
  ) {}

  onModuleInit() {
    // Reconciler: o mesmo padrão de pump dos outros workers do módulo. Uma query indexada a
    // cada 4s (0-1 sessão viva no caso típico) — é o que faz a sessão sobreviver a restart:
    // o boot volta, o sweeper acha a sessão 'running' órfã e continua de onde parou.
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch((error) => {
        this.logger.warn(`[radar-session] sweep falhou: ${String((error as any)?.message || error)}`);
      });
    }, SWEEP_INTERVAL_MS);
    if (typeof this.sweepTimer.unref === 'function') this.sweepTimer.unref();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  // ── criação ──────────────────────────────────────────────────────────────────────────────────
  async startSessionForUser(user: any, input: StartSessionInput) {
    const companyId = Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId || !userId) throw new BadRequestException('Sessão sem empresa/usuário identificado.');

    const segment = String(input?.segment || '').trim();
    if (!segment) throw new BadRequestException('Segmento é obrigatório para pesquisar no Radar.');

    const seen = new Set<string>();
    const cities: RadarSessionCity[] = (Array.isArray(input?.cities) ? input.cities : [])
      .map((item) => ({
        city: String(item?.city || '').trim(),
        state: String(item?.state || '').trim().toUpperCase() || null,
      }))
      .filter((item) => {
        if (!item.city) return false;
        const key = `${item.city.toLowerCase()}|${item.state || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_CITIES_PER_SESSION)
      .map((item) => ({ ...item, status: 'pending' as const }));
    if (!cities.length) throw new BadRequestException('Selecione pelo menos uma cidade.');

    const quantity = this.clampInt(input?.quantity, 1, 100, DEFAULT_QUANTITY_PER_CITY);
    const pauseAfterLeads = this.clampInt(input?.pauseAfterLeads, 0, 1000, 0);
    const targetTotal = this.clampInt(input?.targetTotal, 0, 10_000, 0);

    // 1 trabalho vivo por empresa (mesma "lagoa única" do run atual): sessão nova substitui a
    // anterior explicitamente — cancelamento HONESTO, nunca a guerra silenciosa de 645 runs.
    await this.cancelActiveSessions(companyId, user, 'Substituída por uma nova busca.');

    const filters = { ...(input?.filters || {}) };
    delete (filters as any).cities;
    const session = await this.prisma.radarSearchSession.create({
      data: {
        companyId,
        userId,
        status: 'running',
        segment,
        citiesJson: JSON.stringify(cities),
        cursorIndex: 0,
        targetTotal,
        pauseAfterLeads,
        filtersJson: JSON.stringify({ ...filters, quantity }),
        message: `Busca em ${cities.length} cidade(s) na fila do Radar.`,
      },
    });
    // Primeiro tick AGUARDADO (não espera o sweeper): o POST já responde com a cidade 1 rodando.
    await this.tick(session.id).catch(() => null);
    return this.presentSessionForUser(user, session.id);
  }

  // ── controles ────────────────────────────────────────────────────────────────────────────────
  async pauseSessionForUser(user: any, sessionId: string) {
    const session = await this.loadOwnedSession(user, sessionId);
    if (session.status === 'running') {
      await this.prisma.radarSearchSession.update({
        where: { id: session.id },
        data: {
          status: 'paused',
          pauseReason: 'manual',
          message: session.currentRunId
            ? 'Pausa pedida: o Radar termina a cidade atual e para.'
            : 'Radar pausado. Continue quando quiser.',
        },
      });
    }
    return this.presentSessionForUser(user, session.id);
  }

  async resumeSessionForUser(user: any, sessionId: string) {
    const session = await this.loadOwnedSession(user, sessionId);
    if (session.status === 'paused') {
      await this.prisma.radarSearchSession.update({
        where: { id: session.id },
        data: {
          status: 'running',
          pauseReason: null,
          foundSinceResume: 0,
          message: 'Radar retomado — continuando de onde parou.',
        },
      });
      await this.tick(session.id).catch(() => null);
    }
    return this.presentSessionForUser(user, session.id);
  }

  async cancelSessionForUser(user: any, sessionId: string) {
    const session = await this.loadOwnedSession(user, sessionId);
    if (SESSION_ACTIVE_STATUSES.includes(session.status)) {
      await this.finishSession(session.id, 'canceled', 'Busca cancelada pelo usuário.');
      if (session.currentRunId) {
        await this.webscraping.cancelSearchRunForUser(user, session.currentRunId).catch(() => null);
      }
    }
    return this.presentSessionForUser(user, session.id);
  }

  // ── leitura (a fonte ÚNICA de re-hidratação do front) ───────────────────────────────────────
  async getActiveSessionForUser(user: any) {
    const companyId = Number(user?.companyId || 0);
    if (!companyId) return null;
    let session = await this.prisma.radarSearchSession.findFirst({
      where: { companyId, status: { in: SESSION_ACTIVE_STATUSES } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!session) {
      session = await this.prisma.radarSearchSession.findFirst({
        where: { companyId, updatedAt: { gte: new Date(Date.now() - FINISHED_VISIBILITY_MS) } },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (!session) return null;
    return this.presentSessionForUser(user, session.id);
  }

  // ── reconciler ───────────────────────────────────────────────────────────────────────────────
  private async sweep() {
    const due = await this.prisma.radarSearchSession.findMany({
      where: {
        OR: [
          { status: 'running' },
          // Pausada com run em voo: ainda precisa dobrar o resultado quando o run fechar.
          { status: 'paused', currentRunId: { not: null } },
        ],
      },
      select: { id: true },
      take: 20,
    });
    for (const row of due) {
      await this.tick(row.id).catch(() => null);
    }
  }

  /** Um passo da máquina: dobra run terminal → decide (pausa/completa) → inicia próxima cidade. */
  async tick(sessionId: string) {
    if (this.ticking.has(sessionId)) return;
    this.ticking.add(sessionId);
    try {
      const session = await this.prisma.radarSearchSession.findFirst({ where: { id: sessionId } });
      if (!session || !['running', 'paused'].includes(session.status)) return;

      const cities = this.parseCities(session.citiesJson);
      let cursorIndex = session.cursorIndex;
      let currentRunId = session.currentRunId;
      let foundTotal = session.foundTotal;
      let foundSinceResume = session.foundSinceResume;
      let dirty = false;

      // 1) run em voo → só age quando ele fecha (o pump/stale-requeue cuidam do meio)
      if (currentRunId) {
        const run = await this.prisma.webscrapingSearchRun.findFirst({
          where: { id: currentRunId, companyId: session.companyId },
          // LOTE 4: `metricsJson` entra no MESMO select — o relatório por cidade não paga uma
          // segunda ida ao banco por cidade fechada.
          select: { id: true, status: true, foundCount: true, errorMessage: true, metricsJson: true },
        });
        const runStatus = String(run?.status || '');
        if (run && !RUN_TERMINAL_STATUSES.has(runStatus)) return; // em voo — nada a fazer
        const entry = cities[cursorIndex];
        if (entry) {
          entry.runId = currentRunId;
          entry.foundCount = Number(run?.foundCount || 0);
          entry.status = !run || runStatus === 'failed' || runStatus === 'partial_error'
            ? 'failed'
            : runStatus === 'canceled' ? 'canceled' : 'completed';
          entry.message = run?.errorMessage || null;
          // LOTE 4: o breakdown do run vira o relatório por cidade. Só carimba NÚMERO — run
          // antigo/sem métrica deixa o campo ausente e a tela mostra apenas o total, em vez de
          // inventar "Receita 0 · Web 0" pra uma cidade que nunca foi medida.
          const medidas = this.parseRunLaneMetrics((run as any)?.metricsJson);
          if (medidas.rfb != null) entry.rfbCount = medidas.rfb;
          if (medidas.web != null) entry.webCount = medidas.web;
          if (medidas.rfbAvailable != null) entry.rfbAvailable = medidas.rfbAvailable;
        }
        const gained = Number(run?.foundCount || 0);
        foundTotal += gained;
        foundSinceResume += gained;
        // Run cancelado por fora (não pelo botão da sessão) = a sessão foi substituída/parada
        // no nível do run. Sessão acompanha com honestidade em vez de recriar a cidade em loop.
        if (runStatus === 'canceled' && session.status === 'running') {
          await this.prisma.radarSearchSession.update({
            where: { id: session.id },
            data: {
              citiesJson: JSON.stringify(cities),
              cursorIndex: cursorIndex + 1,
              currentRunId: null,
              foundTotal,
              foundSinceResume,
              status: 'canceled',
              finishedAt: new Date(),
              message: 'A execução atual foi cancelada fora da sessão. Busca encerrada.',
            },
          });
          return;
        }
        currentRunId = null;
        cursorIndex += 1;
        dirty = true;
      }

      // 2) decisões de fim/pausa
      const persistProgress = async (extra: Record<string, unknown> = {}) => {
        await this.prisma.radarSearchSession.update({
          where: { id: session.id },
          data: {
            citiesJson: JSON.stringify(cities),
            cursorIndex,
            currentRunId,
            foundTotal,
            foundSinceResume,
            ...extra,
          },
        });
      };

      if (session.status === 'paused') {
        // Só dobra o progresso; quem inicia cidade nova é o resume.
        if (dirty) {
          await persistProgress({
            message: 'Radar pausado. Continue quando quiser — a próxima cidade está guardada.',
          });
        }
        return;
      }
      if (session.targetTotal > 0 && foundTotal >= session.targetTotal) {
        await persistProgress({
          status: 'completed',
          finishedAt: new Date(),
          message: `Alvo do trabalho atingido: ${foundTotal} lead(s) no total.`,
        });
        return;
      }
      if (cursorIndex >= cities.length) {
        const anyOk = cities.some((c) => c.status === 'completed');
        // LOTE 4 (17/08): "Busca concluída: 3 lead(s) em 6 cidade(s)" escondia 5 cidades mortas
        // atrás da média — era exatamente a "pesquisa suja" que o dono via. Cidade `pending` (a
        // sessão nem chegou nela, por pausa/cancelamento) NÃO é cidade zerada: só conta quem
        // rodou e voltou sem card, senão a frase mente de novo, agora pra cima.
        const zeradas = cities.filter((c) => c.status !== 'pending' && Number(c.foundCount || 0) === 0).length;
        await persistProgress({
          status: anyOk ? 'completed' : 'failed',
          finishedAt: new Date(),
          message: anyOk
            ? (zeradas > 0
              ? `Busca concluída: ${foundTotal} lead(s) em ${cities.length} cidade(s) — ${zeradas} ${zeradas === 1 ? 'cidade' : 'cidades'} sem resultado.`
              : `Busca concluída: ${foundTotal} lead(s) em ${cities.length} cidade(s).`)
            : 'Nenhuma cidade completou a busca. Tente novamente ou ajuste os filtros.',
        });
        return;
      }
      if (session.pauseAfterLeads > 0 && foundSinceResume >= session.pauseAfterLeads) {
        await persistProgress({
          status: 'paused',
          pauseReason: 'pause_after_leads',
          message: `Pausa automática: ${foundSinceResume} lead(s) desde a última retomada. Aperte Continuar para seguir.`,
        });
        return;
      }

      // 3) inicia a próxima cidade — pelo MESMO caminho do run avulso (cota, política de equipe,
      // dedup e pump inclusos). A sessão não inventa um segundo jeito de buscar.
      const next = cities[cursorIndex];
      const queueUser = await this.buildSessionUser(session);
      const filters = this.parseFilters(session.filtersJson);
      const remaining = session.targetTotal > 0 ? Math.max(1, session.targetTotal - foundTotal) : null;
      const quantity = this.clampInt(
        remaining == null ? Number(filters.quantity) : Math.min(Number(filters.quantity) || DEFAULT_QUANTITY_PER_CITY, remaining),
        1,
        100,
        DEFAULT_QUANTITY_PER_CITY,
      );
      try {
        const response: any = await this.webscraping.startRadarSearchRunForUser(queueUser, {
          ...filters,
          city: next.city,
          state: next.state || undefined,
          segment: session.segment,
          quantity,
        });
        const runId = String(response?.id || response?.runId || '').trim();
        if (!runId) throw new Error('Radar não confirmou a execução.');
        next.status = 'running';
        next.runId = runId;
        currentRunId = runId;
        await persistProgress({
          message: `Buscando em ${next.city}${next.state ? `/${next.state}` : ''} (${cursorIndex + 1} de ${cities.length}).`,
        });
      } catch (error) {
        next.status = 'failed';
        next.message = String((error as any)?.message || error).slice(0, 300);
        cursorIndex += 1;
        currentRunId = null;
        await persistProgress({
          message: `Falha ao iniciar ${next.city}: ${next.message}`,
        });
      }
    } finally {
      this.ticking.delete(sessionId);
    }
  }

  // ── apresentação ─────────────────────────────────────────────────────────────────────────────
  private async presentSessionForUser(user: any, sessionId: string) {
    const session = await this.prisma.radarSearchSession.findFirst({ where: { id: sessionId } });
    if (!session) return null;
    const cities = this.parseCities(session.citiesJson);
    const currentEntry = cities[session.cursorIndex] || null;
    const lastRunId = session.currentRunId
      || [...cities].reverse().find((c) => c.runId)?.runId
      || null;
    let currentRun: any = null;
    if (lastRunId) {
      currentRun = await this.webscraping.getRadarSearchRunForUser(user, lastRunId).catch(() => null);
    }
    const liveFound = session.currentRunId
      ? Number((currentRun as any)?.foundCount ?? (currentRun as any)?.meta?.foundCount ?? 0)
      : 0;
    return {
      id: session.id,
      status: session.status,
      pauseReason: session.pauseReason,
      message: session.message,
      segment: session.segment,
      cities,
      cityCount: cities.length,
      cursorIndex: session.cursorIndex,
      currentCity: currentEntry ? { city: currentEntry.city, state: currentEntry.state } : null,
      targetTotal: session.targetTotal,
      pauseAfterLeads: session.pauseAfterLeads,
      foundTotal: session.foundTotal + liveFound,
      foundSinceResume: session.foundSinceResume + liveFound,
      currentRunId: session.currentRunId,
      currentRun,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      updatedAt: session.updatedAt,
    };
  }

  // ── apoio ────────────────────────────────────────────────────────────────────────────────────
  private async cancelActiveSessions(companyId: number, user: any, message: string) {
    const active = await this.prisma.radarSearchSession.findMany({
      where: { companyId, status: { in: SESSION_ACTIVE_STATUSES } },
      select: { id: true, currentRunId: true },
    });
    for (const session of active) {
      await this.finishSession(session.id, 'canceled', message);
      if (session.currentRunId) {
        await this.webscraping.cancelSearchRunForUser(user, session.currentRunId).catch(() => null);
      }
    }
  }

  private async finishSession(sessionId: string, status: 'canceled' | 'completed' | 'failed', message: string) {
    await this.prisma.radarSearchSession.update({
      where: { id: sessionId },
      data: { status, message, currentRunId: null, finishedAt: new Date() },
    }).catch(() => null);
  }

  private async loadOwnedSession(user: any, sessionId: string) {
    const companyId = Number(user?.companyId || 0);
    const session = await this.prisma.radarSearchSession.findFirst({
      where: { id: String(sessionId || ''), companyId },
    });
    if (!session) throw new BadRequestException('Busca não encontrada para esta empresa.');
    return session;
  }

  /** Mesmo contrato do buildQueueUser do pump: usuário REAL (papel/política preservados). */
  private async buildSessionUser(session: { userId: number; companyId: number }) {
    const user = await this.prisma.user.findFirst({
      where: { id: session.userId, companyId: session.companyId },
      select: {
        id: true, companyId: true, role: true, isSystemMaster: true, isActive: true,
        name: true, email: true, username: true, phone: true,
        company: { select: { id: true, name: true, slug: true } },
      },
    }).catch(() => null);
    if (user?.id) return { ...user, masterContext: { active: false } };
    return {
      id: session.userId,
      companyId: session.companyId,
      role: 'ADMIN',
      isSystemMaster: false,
      masterContext: { active: false },
    };
  }

  private parseCities(json: string): RadarSessionCity[] {
    try {
      const parsed = JSON.parse(String(json || '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * LOTE 4 (17/08): lê do `metricsJson` do run SÓ o que o relatório por cidade precisa —
   * `laneBreakdown` (quem ENTREGOU: rfb/web) e `rfbDrain.available` (quanto a Receita TEM na
   * cidade, medido pelo Lote 2). Reusa o namespace que já existe; nada de campo novo.
   * Parse tolerante no mesmo estilo do `parseCities`/`parseFilters`: métrica quebrada nunca pode
   * derrubar o tick da sessão (o tick é quem faz a fila multi-cidade andar). Campo ausente volta
   * `null` — e `null` é o que impede a tela de escrever "Receita 0" por falta de dado.
   */
  private parseRunLaneMetrics(json: unknown): { rfb: number | null; web: number | null; rfbAvailable: number | null } {
    const vazio = { rfb: null, web: null, rfbAvailable: null };
    // `Number(null)` é 0 e `Number('')` também — sem este guarda, chave ausente viraria zero e o
    // relatório mentiria na direção oposta (o furo que este lote existe pra fechar).
    const inteiro = (value: unknown): number | null => {
      if (value == null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    };
    try {
      const bruto: any = typeof json === 'string' ? JSON.parse(json) : json;
      if (!bruto || typeof bruto !== 'object') return vazio;
      const lanes = bruto.laneBreakdown && typeof bruto.laneBreakdown === 'object' ? bruto.laneBreakdown : null;
      const drenagem = bruto.rfbDrain && typeof bruto.rfbDrain === 'object' ? bruto.rfbDrain : null;
      return {
        rfb: lanes ? inteiro(lanes.rfb) : null,
        web: lanes ? inteiro(lanes.web) : null,
        rfbAvailable: drenagem ? inteiro(drenagem.available) : null,
      };
    } catch {
      return vazio;
    }
  }

  private parseFilters(json: string | null): Record<string, any> {
    try {
      const parsed = JSON.parse(String(json || '{}'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }
}

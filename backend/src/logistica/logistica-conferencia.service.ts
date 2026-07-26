import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaOsrmService } from './logistica-osrm.service';
import { resolverCoordenadaMultilocal } from './logistica-geo-fonte.util';
import {
  haversineKm,
  planRouteByRoads,
  resolveDayRange,
  type Coord,
  type OsrmTablePayload,
  type RouteDegradedReason,
  type RouteEngine,
  type Stop,
} from './logistica-rota.service';
import {
  conferirParadas,
  type MotivoConferencia,
  type ParadaConferenciaInput,
  type SemaforoCor,
} from './logistica-conferencia.util';

// Só as entregas ABERTAS entram na conferência (mesmo recorte do planejador —
// LogisticaRotaService.STATUS_ABERTO, duplicado aqui de propósito: ver comentário de
// `fetchParadasEstendidas`).
const STATUS_ABERTO = ['agendada', 'em_rota'] as const;

/**
 * S3 (25/07, PR25072026-ROTA-CONFERIDA) — "conferir": o CÉREBRO da frente, DRY-RUN
 * ABSOLUTO (Lei nº3: conferir NUNCA debita crédito nem grava rota).
 *
 * Roda o MESMO motor de planejamento da S1 (planRouteByRoads: proxy→OSRM público→
 * Haversine) em memória — nunca grava `rotaOrdem`/`etaAt`, nunca chama
 * `LogisticaRouteBillingService.prepareRoute`, nunca dispara WhatsApp — e devolve, por
 * parada, o semáforo de confiança do pino (logistica-conferencia.util.ts): a rota pode
 * estar matematicamente correta e ainda assim levar o entregador a um pino ERRADO (Lei
 * nº1) se a fonte da coordenada não foi provada no campo. É o aviso ANTES de sair de
 * casa, nunca um bloqueio (Lei nº7 — vermelho não impede iniciar a rota).
 */
@Injectable()
export class LogisticaConferenciaService {
  private readonly logger = new Logger(LogisticaConferenciaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: LogisticaConfigService,
    // Mesmo padrão @Optional() de LogisticaRotaService.osrm: sem o proxy injetado
    // (teste instanciando direto, ou módulo sem o provider), planRouteByRoads pula
    // sozinho pro degrau 2 (OSRM público) — nunca quebra por causa deste opcional.
    @Optional() private readonly osrm?: LogisticaOsrmService,
  ) {}

  async conferir(companyId: number, input: ConferirRotaInput = {}, entregadorId?: number): Promise<ConferirRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const cfg = await this.config.getConfig(companyId);
    const origem = coordFromInput(input.origemLat, input.origemLng);
    const deliveryIds = normalizeDeliveryIds(input.deliveryIds);

    const rows = await this.fetchParadasEstendidas(companyId, start, end, entregadorId, deliveryIds);

    // Resolve a fonte MULTILOCAL (mesma regra do planejador, `resolverCoordenadaMultilocal`)
    // e guarda geoFonte/ids de junção à parte — `planRouteByRoads` só conhece `Stop`
    // (id/lat/lng/status/nome/rotaOrdem), o resto vive num Map por id.
    const extras = new Map<string, { geoFonte: string | null; customerProfileId: string; localId: string | null }>();
    const stops: Stop[] = rows.map((r) => {
      const coord = resolverCoordenadaMultilocal(r.local, r.customerProfile);
      extras.set(r.id, { geoFonte: coord.geoFonte, customerProfileId: r.customerProfileId, localId: r.localId });
      return {
        id: r.id,
        lat: coord.lat,
        lng: coord.lng,
        status: r.status,
        nome: r.local?.apelido ?? r.customerProfile?.name ?? null,
        rotaOrdem: r.rotaOrdem ?? null,
      };
    });

    // DRY-RUN: roda o motor em memória. NUNCA persiste (sem prisma.entrega.update*
    // depois disto), NUNCA chama routeBilling — é só leitura + cálculo.
    const plan = await planRouteByRoads(stops, {
      origem,
      velocidadeKmH: cfg.velocidadeMediaKmH,
      paradaMin: cfg.tempoParadaMin,
      partida: new Date(),
      osrmTable: this.osrmTableFetcher(companyId),
    });

    const customerProfileIds = [...new Set(rows.map((r) => r.customerProfileId))];
    // nunca_entregue e diverge_gps_ouro: 1 query agregada CADA (nunca N+1 por parada).
    const [entreguesPorCliente, ultimaEntregaConcluida] = await Promise.all([
      this.contarEntreguesConcluidas(companyId, customerProfileIds),
      this.buscarUltimaEntregaConcluida(companyId, customerProfileIds),
    ]);

    const inputsConferencia: ParadaConferenciaInput[] = plan.paradas.map((p) => {
      const extra = extras.get(p.id);
      const chave = extra ? chaveHistorico(extra.customerProfileId, extra.localId) : '';
      const ultimaEntrega = ultimaEntregaConcluida.get(chave);
      const distanciaGpsOuroM =
        ultimaEntrega && typeof p.lat === 'number' && typeof p.lng === 'number'
          ? Math.round(haversineKm({ lat: p.lat, lng: p.lng }, ultimaEntrega) * 1000)
          : null;
      return {
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        geoFonte: extra?.geoFonte ?? null,
        legDistanceM: p.legDistanceM,
        temEntregaConcluida: extra ? entreguesPorCliente.has(chave) : false,
        distanciaGpsOuroM,
      };
    });

    const conferidas = conferirParadas(inputsConferencia, { engine: plan.engine });
    const conferidaPorId = new Map(conferidas.map((c) => [c.id, c] as const));

    const paradas: ConferirRotaParada[] = plan.paradas.map((p) => {
      // conferidaPorId sempre tem a chave (1:1 com plan.paradas, ver map acima) —
      // o "!" documenta essa garantia estrutural, não um risco de runtime.
      const c = conferidaPorId.get(p.id)!;
      return {
        id: p.id,
        nome: p.nome,
        rotaOrdem: p.rotaOrdem,
        lat: p.lat,
        lng: p.lng,
        etaAt: p.etaAt ? p.etaAt.toISOString() : null,
        legDistanceM: p.legDistanceM,
        legDurationS: p.legDurationS,
        semaforo: c.semaforo,
        motivos: c.motivos,
      };
    });

    this.logger.log(
      `[logistica] conferência ${dayISO} company=${companyId}: ${paradas.length} parada(s) ` +
        `(engine=${plan.engine}${plan.degradedReason ? ` degradedReason=${plan.degradedReason}` : ''}).`,
    );

    return {
      date: dayISO,
      engine: plan.engine,
      degradedReason: plan.degradedReason ?? null,
      total: paradas.length,
      verdes: paradas.filter((p) => p.semaforo === 'verde').length,
      amarelas: paradas.filter((p) => p.semaforo === 'amarelo').length,
      vermelhas: paradas.filter((p) => p.semaforo === 'vermelho').length,
      distanciaTotalKm: Math.round(plan.distanciaTotalKm * 100) / 100,
      terminoPrevisto: plan.terminoPrevisto ? plan.terminoPrevisto.toISOString() : null,
      paradas,
    };
  }

  // ── infra ────────────────────────────────────────────────────────────────────
  /**
   * Select PRÓPRIO — decisão registrada no relatório da S3: `fetchParadasAbertas` de
   * LogisticaRotaService é PRIVADO e alimenta o caminho que GRAVA rotaOrdem/etaAt.
   * `/rota/conferir` é uma rota READ-ONLY de diagnóstico; duplicar o select aqui
   * (ESTENDIDO com geoFonte de local/perfil + customerProfileId/localId, que o
   * planejador não precisa) evita tocar num arquivo grande que outras sprints desta
   * mesma frente (e o dono, em paralelo) já mexem — zero risco pro caminho que grava.
   * Mesmo filtro (status aberto + janela do dia) e mesma ordenação/teto (300) do
   * planejador, pra os dois lerem exatamente o mesmo "dia".
   */
  private async fetchParadasEstendidas(
    companyId: number,
    start: Date,
    end: Date,
    entregadorId?: number,
    deliveryIds?: string[],
  ): Promise<ParadaConferenciaRow[]> {
    return this.prisma.entrega.findMany({
      where: {
        companyId,
        ...(entregadorId ? { entregadorId } : {}),
        ...(deliveryIds?.length ? { id: { in: deliveryIds } } : {}),
        status: { in: [...STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      orderBy: [{ rotaOrdem: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: {
        id: true,
        status: true,
        rotaOrdem: true,
        customerProfileId: true,
        localId: true,
        local: { select: { apelido: true, lat: true, lng: true, geoFonte: true } },
        customerProfile: { select: { name: true, lat: true, lng: true, geoFonte: true } },
      },
    });
  }

  /**
   * Mesmo adaptador de LogisticaRotaService.osrmTableFetcher (privado lá — sem
   * visibilidade pra reusar de fora). Duplicado aqui de propósito: são 3 linhas, e o
   * risco de reimplementar errado é menor que o de abrir a visibilidade de um método
   * privado do serviço que GRAVA rota pra um consumidor read-only.
   */
  private osrmTableFetcher(companyId: number): ((coords: Coord[]) => Promise<OsrmTablePayload>) | undefined {
    if (!this.osrm) return undefined;
    const osrm = this.osrm;
    return async (coords: Coord[]) => {
      const coordsRaw = coords.map((c) => `${c.lng},${c.lat}`).join(';');
      return (await osrm.table(companyId, coordsRaw)) as OsrmTablePayload;
    };
  }

  /**
   * `nunca_entregue` barato: 1 `groupBy` contando quantas entregas 'entregue' cada
   * (cliente, local) já teve — nunca um `findFirst` por parada (N+1). Guard de array
   * vazio: `groupBy`/`in: []` com lista vazia não tem nada a agrupar.
   */
  private async contarEntreguesConcluidas(companyId: number, customerProfileIds: string[]): Promise<Set<string>> {
    if (customerProfileIds.length === 0) return new Set();
    const grupos = await this.prisma.entrega.groupBy({
      by: ['customerProfileId', 'localId'],
      where: { companyId, status: 'entregue', customerProfileId: { in: customerProfileIds } },
      _count: { _all: true },
    });
    return new Set(
      grupos.filter((g: any) => g._count._all > 0).map((g: any) => chaveHistorico(g.customerProfileId, g.localId)),
    );
  }

  /**
   * `diverge_gps_ouro` barato: 1 query com `DISTINCT ON` (Postgres) traz a ÚLTIMA
   * entrega CONCLUÍDA (maior deliveredAt) por (cliente, local) — sem isso seria 1
   * `findFirst` por parada (N+1 que o S3 explicitamente proíbe). Mesmo padrão já usado
   * em `modules.service.ts` (WebscrapingLatestUsageRow). `Prisma.join` exige array
   * não-vazio, daí o guard early-return.
   */
  private async buscarUltimaEntregaConcluida(companyId: number, customerProfileIds: string[]): Promise<Map<string, Coord>> {
    if (customerProfileIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<UltimaEntregaConcluidaRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("customerProfileId", COALESCE("localId", ''))
        "customerProfileId", "localId", "deliveredLat", "deliveredLng"
      FROM "Entrega"
      WHERE "companyId" = ${companyId}
        AND "status" = 'entregue'
        AND "deliveredLat" IS NOT NULL
        AND "deliveredLng" IS NOT NULL
        AND "customerProfileId" IN (${Prisma.join(customerProfileIds)})
      ORDER BY "customerProfileId", COALESCE("localId", ''), "deliveredAt" DESC
    `);
    const mapa = new Map<string, Coord>();
    for (const row of rows) {
      if (typeof row.deliveredLat === 'number' && typeof row.deliveredLng === 'number') {
        mapa.set(chaveHistorico(row.customerProfileId, row.localId), { lat: row.deliveredLat, lng: row.deliveredLng });
      }
    }
    return mapa;
  }
}

/** Chave de junção (cliente, local) — local null vira string vazia (mesmo cliente sem
 *  LocalEntrega cadastrado, endereço do perfil/legado). Usada nos dois agregados
 *  (nunca_entregue e diverge_gps_ouro) e no map de extras — mantém as 3 pontas em sincronia. */
function chaveHistorico(customerProfileId: string, localId: string | null): string {
  return `${customerProfileId}|${localId ?? ''}`;
}

// PR18072026 (duplicado de logistica-rota.service.ts, privado lá): valida
// origemLat/Lng vindos do body — finito, dentro da faixa, nunca 0,0 (mesmo crivo do
// planejador, pra origem inválida nunca ser tratada como um ponto real no oceano).
function coordFromInput(lat?: number | null, lng?: number | null): Coord | null {
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  ) {
    return { lat, lng };
  }
  return null;
}

// Mesma normalização de logistica-rota.service.ts (privada lá): trim + tamanho + teto
// de 300 ids, dedupe via Set (ordem não importa aqui — a conferência não tem conceito
// de "ordem manual" como o planejador).
function normalizeDeliveryIds(value?: string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [
    ...new Set(value.map((id) => String(id || '').trim()).filter((id) => id.length > 0 && id.length <= 80)),
  ].slice(0, 300);
  return ids.length ? ids : undefined;
}

// ── tipos de I/O ────────────────────────────────────────────────────────────────
interface ParadaConferenciaRow {
  id: string;
  status: string;
  rotaOrdem: number | null;
  customerProfileId: string;
  localId: string | null;
  local: { apelido: string | null; lat: number | null; lng: number | null; geoFonte: string | null } | null;
  customerProfile: { name: string | null; lat: number | null; lng: number | null; geoFonte: string | null } | null;
}

interface UltimaEntregaConcluidaRow {
  customerProfileId: string;
  localId: string | null;
  deliveredLat: number | null;
  deliveredLng: number | null;
}

export interface ConferirRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
  deliveryIds?: string[];
}

export interface ConferirRotaParada {
  id: string;
  nome: string | null;
  rotaOrdem: number;
  lat: number | null;
  lng: number | null;
  etaAt: string | null;
  legDistanceM: number | null;
  legDurationS: number | null;
  semaforo: SemaforoCor;
  motivos: MotivoConferencia[];
}

export interface ConferirRotaResult {
  date: string;
  engine: RouteEngine;
  degradedReason: RouteDegradedReason | null;
  total: number;
  verdes: number;
  amarelas: number;
  vermelhas: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  paradas: ConferirRotaParada[];
}

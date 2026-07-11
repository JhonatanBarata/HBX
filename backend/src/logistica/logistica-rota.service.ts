import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * LOGÍSTICA-MOBILE M3 (05/07) — MOTOR DE ROTA + ETA (100% local, sem API paga).
 *
 * Ordena a rota do dia do entregador e calcula a previsão de término. Tudo com
 * matemática PURA (Haversine + nearest-neighbor + 2-opt), zero Google Directions,
 * zero chamada externa, R$0. É "bom o bastante" para ≤50 paradas de 1 entregador.
 *
 * ── O QUE FAZ ────────────────────────────────────────────────────────────────
 *  1) Pega as entregas ABERTAS do dia (status 'agendada' | 'em_rota').
 *  2) Ordena por proximidade: nearest-neighbor a partir da ORIGEM (GPS do
 *     entregador ao iniciar, ou a 1ª parada com coord se sem origem) + refino
 *     2-opt (troca de arestas que reduz o trajeto total). Paradas SEM lat/lng
 *     vão pro FIM da fila (flag semCoordenada) — não dá pra roteá-las.
 *  3) Grava `rotaOrdem` (0..N) em cada Entrega.
 *  4) ETA cumulativo: por parada, tempo de trajeto (distância /
 *     velocidadeMediaKmH) + tempoParadaMin. Grava `etaAt` por parada e devolve a
 *     previsão de término (etaAt da última).
 *
 * ── ADITIVO / NÃO QUEBRA N6/M2 ───────────────────────────────────────────────
 * Só GRAVA rotaOrdem/etaAt (colunas M2, opcionais). Não dispara WhatsApp nem
 * cobrança — isso é só no confirmar (N6), atrás de HBX_LOGISTICA_ENABLED. O
 * re-ETA no confirmar/cancelar é aditivo e best-effort (try/catch): se falhar,
 * o comportamento do N6 segue intacto.
 */
@Injectable()
export class LogisticaRotaService {
  private readonly logger = new Logger(LogisticaRotaService.name);

  // Defaults do LogisticaConfig quando a empresa ainda não configurou (schema).
  private static readonly DEFAULT_VELOCIDADE_KMH = 25;
  private static readonly DEFAULT_PARADA_MIN = 5;

  // Só as entregas ABERTAS entram na rota (as concluídas/canceladas saem).
  private static readonly STATUS_ABERTO = ['agendada', 'em_rota'] as const;

  constructor(private readonly prisma: PrismaService) {}

  // ── PLANEJAR ROTA ────────────────────────────────────────────────────────────
  /**
   * Ordena a rota do dia, grava rotaOrdem/etaAt e devolve a rota + término
   * previsto + quantas paradas ficaram sem coordenada.
   */
  async planejarRota(companyId: number, input: PlanejarRotaInput = {}): Promise<PlanejarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const config = await this.loadConfig(companyId);
    const origem = coordFromInput(input.origemLat, input.origemLng);

    const rows = await this.fetchParadasAbertas(companyId, start, end);

    // Ordena (NN + 2-opt) e calcula ETA cumulativo a partir de AGORA (ou input.startAt).
    const partida = parseDateOrNull(input.startAt) ?? new Date();
    const plan = planRoute(
      rows.map((r) => toStop(r)),
      { origem, velocidadeKmH: config.velocidadeMediaKmH, paradaMin: config.tempoParadaMin, partida },
    );

    // Persiste rotaOrdem/etaAt de cada parada (sequencial: são poucas paradas/dia).
    for (const p of plan.paradas) {
      await this.prisma.entrega.update({
        where: { id: p.id },
        data: { rotaOrdem: p.rotaOrdem, etaAt: p.etaAt },
      });
    }

    const semCoordenada = plan.paradas.filter((p) => p.semCoordenada).length;
    this.logger.log(
      `[logistica] rota planejada ${dayISO} company=${companyId}: ${plan.paradas.length} parada(s), ` +
        `${semCoordenada} sem coord, término ~${plan.terminoPrevisto ?? 'n/a'}.`,
    );

    return {
      date: dayISO,
      total: plan.paradas.length,
      semCoordenada,
      distanciaTotalKm: round2(plan.distanciaTotalKm),
      terminoPrevisto: plan.terminoPrevisto ? plan.terminoPrevisto.toISOString() : null,
      velocidadeMediaKmH: config.velocidadeMediaKmH,
      tempoParadaMin: config.tempoParadaMin,
      paradas: plan.paradas.map((p) => ({
        id: p.id,
        rotaOrdem: p.rotaOrdem,
        etaAt: p.etaAt ? p.etaAt.toISOString() : null,
        semCoordenada: p.semCoordenada,
        lat: p.lat,
        lng: p.lng,
        status: p.status,
        nome: p.nome,
      })),
    };
  }

  // ── INICIAR ROTA ─────────────────────────────────────────────────────────────
  /**
   * Marca o início da rota. Re-planeja com a ORIGEM atual (GPS do entregador ao
   * apertar "iniciar") e coloca a 1ª parada em 'em_rota' com startedAt=agora.
   */
  async iniciarRota(companyId: number, input: IniciarRotaInput = {}): Promise<PlanejarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    // Re-planeja a partir da origem atual (mesmo caminho do planejar).
    const plan = await this.planejarRota(companyId, {
      date: input.date,
      origemLat: input.origemLat,
      origemLng: input.origemLng,
    });

    // 1ª parada roteável (rotaOrdem=0) vira 'em_rota' com startedAt — só se ainda
    // estiver 'agendada' (não rebaixa nada já em rota/entregue).
    const primeira = plan.paradas.find((p) => p.rotaOrdem === 0 && !p.semCoordenada) ?? plan.paradas[0];
    if (primeira && primeira.status === 'agendada') {
      await this.prisma.entrega.update({
        where: { id: primeira.id },
        data: { status: 'em_rota', startedAt: new Date() },
      });
      primeira.status = 'em_rota';
    }
    return plan;
  }

  // ── RE-ETA (hook aditivo do confirmar/cancelar do N6) ────────────────────────
  /**
   * Recalcula etaAt das paradas RESTANTES (ainda abertas) do dia, SEM reordenar o
   * que já foi feito — só desloca o ETA cumulativo pra frente/trás conforme as
   * paradas que saíram da fila. Best-effort: chamado dentro de try/catch pelo N6,
   * qualquer erro aqui NÃO afeta o confirmar/cancelar.
   *
   * @param baseDate dia da entrega tocada (default: hoje) — a fatia de re-cálculo.
   */
  async recalcularEtaRestantes(companyId: number, baseDate?: Date): Promise<{ recalculadas: number } | null> {
    if (!companyId) return null;
    const { start, end } = resolveDayRange(baseDate ? toDayISO(baseDate) : undefined);
    const config = await this.loadConfig(companyId);

    const rows = await this.fetchParadasAbertas(companyId, start, end);
    if (rows.length === 0) return { recalculadas: 0 };

    // NÃO reordena: mantém o rotaOrdem já gravado (o que já foi entregue saiu da
    // lista de abertas; a ordem relativa das restantes é preservada). Ordena pela
    // rotaOrdem atual (nulls por último) e refaz só o ETA cumulativo.
    const stops = rows.map((r) => toStop(r)).sort(compareByRotaOrdem);
    const partida = new Date();
    const withEta = computeEta(stops, {
      velocidadeKmH: config.velocidadeMediaKmH,
      paradaMin: config.tempoParadaMin,
      partida,
    });

    let recalculadas = 0;
    for (const p of withEta) {
      await this.prisma.entrega.update({ where: { id: p.id }, data: { etaAt: p.etaAt } });
      recalculadas++;
    }
    return { recalculadas };
  }

  // ── infra ────────────────────────────────────────────────────────────────────
  private async loadConfig(companyId: number): Promise<{ velocidadeMediaKmH: number; tempoParadaMin: number }> {
    let cfg: { velocidadeMediaKmH: number; tempoParadaMin: number } | null = null;
    try {
      cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { velocidadeMediaKmH: true, tempoParadaMin: true },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }
    const velocidadeMediaKmH =
      cfg && cfg.velocidadeMediaKmH > 0 ? cfg.velocidadeMediaKmH : LogisticaRotaService.DEFAULT_VELOCIDADE_KMH;
    const tempoParadaMin =
      cfg && cfg.tempoParadaMin >= 0 ? cfg.tempoParadaMin : LogisticaRotaService.DEFAULT_PARADA_MIN;
    return { velocidadeMediaKmH, tempoParadaMin };
  }

  private async fetchParadasAbertas(companyId: number, start: Date, end: Date): Promise<ParadaRow[]> {
    return this.prisma.entrega.findMany({
      where: {
        companyId,
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      orderBy: [{ rotaOrdem: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: {
        id: true,
        status: true,
        rotaOrdem: true,
        scheduledAt: true,
        // MULTILOCAL (11/07) — geo da PORTA da entrega: quando há um LOCAL, a rota
        // ordena pela coordenada DELE (cada endereço do cliente tem a sua). Sem o
        // local, todas as paradas do cliente cairiam no geo do principal e a rota
        // multi-local ordenaria pela porta errada. MESMO select/regra do listRota.
        local: { select: { apelido: true, lat: true, lng: true } },
        customerProfile: { select: { name: true, lat: true, lng: true } },
      },
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MATEMÁTICA PURA (exportada e testável sem banco)
// ════════════════════════════════════════════════════════════════════════════

const EARTH_RADIUS_KM = 6371;

/** Uma parada roteável: id + coord (null quando o cliente não tem lat/lng). */
export interface Stop {
  id: string;
  lat: number | null;
  lng: number | null;
  status: string;
  nome: string | null;
  rotaOrdem?: number | null;
}

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * Haversine — distância em KM entre 2 pontos (lat/lng em graus). Pura.
 * Erro < 0.5% p/ distâncias urbanas; suficiente p/ heurística de rota.
 */
export function haversineKm(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Uma parada com coordenada garantida (lat/lng number). */
export type StopComCoord = Stop & { lat: number; lng: number };

/**
 * Só as paradas COM coordenada válida entram na roteirização. Predicado boolean
 * simples (não type-guard) — o guard geraria um tipo-complemento intratável no
 * ramo negativo (`{...s}` spread de tipo não-objeto). Onde o tipo estreito é
 * necessário, usamos filtrarComCoord.
 */
export function hasCoord(s: Stop): boolean {
  return (
    typeof s.lat === 'number' &&
    typeof s.lng === 'number' &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng)
  );
}

/** Filtra e ESTREITA para paradas com coord garantida (para NN/2-opt). */
export function filtrarComCoord(stops: Stop[]): StopComCoord[] {
  return stops.filter(hasCoord) as StopComCoord[];
}

/** Distância total (km) de uma sequência ordenada, a partir de uma origem. */
export function routeCostKm(order: Array<Stop & { lat: number; lng: number }>, origem?: Coord | null): number {
  if (order.length === 0) return 0;
  let total = 0;
  let prev: Coord = origem ?? { lat: order[0].lat, lng: order[0].lng };
  for (const s of order) {
    total += haversineKm(prev, { lat: s.lat, lng: s.lng });
    prev = { lat: s.lat, lng: s.lng };
  }
  return total;
}

/**
 * Nearest-neighbor: começa na origem (ou na 1ª parada se sem origem) e vai
 * sempre à parada mais próxima ainda não visitada. Heurística gulosa — a base
 * que o 2-opt refina. Pura.
 */
export function nearestNeighbor(
  stops: Array<Stop & { lat: number; lng: number }>,
  origem?: Coord | null,
): Array<Stop & { lat: number; lng: number }> {
  const restantes = [...stops];
  const ordem: Array<Stop & { lat: number; lng: number }> = [];
  if (restantes.length === 0) return ordem;

  let atual: Coord;
  if (origem) {
    atual = origem;
  } else {
    // Sem origem: a 1ª parada da lista é o ponto de partida.
    const first = restantes.shift()!;
    ordem.push(first);
    atual = { lat: first.lat, lng: first.lng };
  }

  while (restantes.length > 0) {
    let melhorIdx = 0;
    let melhorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = haversineKm(atual, { lat: restantes[i].lat, lng: restantes[i].lng });
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = i;
      }
    }
    const escolhido = restantes.splice(melhorIdx, 1)[0];
    ordem.push(escolhido);
    atual = { lat: escolhido.lat, lng: escolhido.lng };
  }
  return ordem;
}

/**
 * 2-opt: parte de uma ordem inicial (ex.: NN) e reverte segmentos enquanto isso
 * REDUZIR o custo total (com a origem fixa). Converge para um ótimo local — nunca
 * PIORA a rota (garantia usada no teste: custo 2-opt ≤ custo NN). Pura.
 */
export function twoOpt(
  initial: Array<Stop & { lat: number; lng: number }>,
  origem?: Coord | null,
  maxPasses = 30,
): Array<Stop & { lat: number; lng: number }> {
  if (initial.length < 4) return [...initial]; // < 4 paradas: 2-opt não muda nada
  let best = [...initial];
  let bestCost = routeCostKm(best, origem);
  let improved = true;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = twoOptSwap(best, i, k);
        const cost = routeCostKm(candidate, origem);
        if (cost + 1e-9 < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Reverte o segmento [i..k] (inclusive) da ordem — o movimento do 2-opt. */
function twoOptSwap<T>(order: T[], i: number, k: number): T[] {
  return [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
}

export interface EtaOptions {
  velocidadeKmH: number;
  paradaMin: number;
  partida: Date;
}

/** Uma parada já com rotaOrdem e etaAt calculados. */
export interface PlannedStop extends Stop {
  rotaOrdem: number;
  etaAt: Date | null;
  semCoordenada: boolean;
}

/**
 * ETA cumulativo ao longo de uma sequência JÁ ORDENADA (respeita o rotaOrdem que
 * vier). Por parada: etaAt = partida + Σ (trajeto até ela + tempoParada das
 * anteriores). Trajeto = distância(prev→atual) / velocidade. A 1ª parada NÃO tem
 * origem conhecida aqui (é só o ETA relativo da sequência), então seu trajeto é 0
 * e o ETA é partida + tempoParada. Paradas sem coord recebem etaAt=null (não dá
 * pra estimar trajeto), mas mantêm o rotaOrdem. Pura.
 */
export function computeEta(stops: Stop[], opts: EtaOptions): PlannedStop[] {
  const velocidade = opts.velocidadeKmH > 0 ? opts.velocidadeKmH : 25;
  const paradaMin = opts.paradaMin >= 0 ? opts.paradaMin : 5;
  const out: PlannedStop[] = [];
  let acumuladoMin = 0;
  let prev: Coord | null = null;

  for (let idx = 0; idx < stops.length; idx++) {
    const s = stops[idx];
    const rotaOrdem = typeof s.rotaOrdem === 'number' ? s.rotaOrdem : idx;
    if (!hasCoord(s)) {
      // Sem coord: mantém a ordem, mas não estima ETA (null).
      out.push({ ...s, rotaOrdem, etaAt: null, semCoordenada: true });
      continue;
    }
    const cur: Coord = { lat: s.lat as number, lng: s.lng as number };
    // Trajeto desde a parada anterior COM coord (a 1ª não tem prev → 0).
    const trajetoKm = prev ? haversineKm(prev, cur) : 0;
    const trajetoMin = (trajetoKm / velocidade) * 60;
    acumuladoMin += trajetoMin + paradaMin; // chega + descarrega
    const etaAt = new Date(opts.partida.getTime() + acumuladoMin * 60_000);
    out.push({ ...s, rotaOrdem, etaAt, semCoordenada: false });
    prev = cur;
  }
  return out;
}

export interface PlanRouteOptions {
  origem?: Coord | null;
  velocidadeKmH: number;
  paradaMin: number;
  partida: Date;
}

export interface PlanRouteResult {
  paradas: PlannedStop[];
  distanciaTotalKm: number;
  terminoPrevisto: Date | null;
}

/**
 * PIPELINE COMPLETO (puro): separa com/sem coord → NN → 2-opt → rotaOrdem 0..N
 * (roteáveis primeiro, sem-coord no fim) → ETA cumulativo → término previsto.
 */
export function planRoute(stops: Stop[], opts: PlanRouteOptions): PlanRouteResult {
  const comCoord = filtrarComCoord(stops);
  const semCoord = stops.filter((s) => !hasCoord(s));

  // Ordena os roteáveis: NN a partir da origem + refino 2-opt.
  const nn = nearestNeighbor(comCoord, opts.origem);
  const otimizado = twoOpt(nn, opts.origem);

  // rotaOrdem: 0..M-1 para os roteáveis (na ordem otimizada), depois os sem-coord.
  const ordenados: Stop[] = [
    ...otimizado.map((s, i) => ({ ...s, rotaOrdem: i })),
    ...semCoord.map((s, i) => ({ ...s, rotaOrdem: otimizado.length + i })),
  ];

  const paradas = computeEta(ordenados, {
    velocidadeKmH: opts.velocidadeKmH,
    paradaMin: opts.paradaMin,
    partida: opts.partida,
  });

  const distanciaTotalKm = routeCostKm(otimizado, opts.origem);
  // Término = etaAt da última parada COM coord (as sem-coord não têm ETA).
  const comEta = paradas.filter((p) => p.etaAt != null);
  const terminoPrevisto = comEta.length > 0 ? comEta[comEta.length - 1].etaAt : null;

  return { paradas, distanciaTotalKm, terminoPrevisto };
}

// ── helpers de mapeamento / data ────────────────────────────────────────────────
function toStop(r: ParadaRow): Stop {
  return {
    id: r.id,
    // MULTILOCAL (11/07) — PREFERE o geo do LOCAL quando a entrega tem um (cada
    // porta tem sua coordenada); senão cai no perfil (legado). MESMA regra que o
    // listRota aplica. Só a FONTE do lat/lng muda — o NN/2-opt segue intacto.
    lat: r.local ? (r.local.lat ?? null) : (r.customerProfile?.lat ?? null),
    lng: r.local ? (r.local.lng ?? null) : (r.customerProfile?.lng ?? null),
    status: r.status,
    // Rótulo da parada: apelido do local ("Casa"|"Loja") quando presente, senão o nome do cliente.
    nome: r.local?.apelido ?? r.customerProfile?.name ?? null,
    rotaOrdem: r.rotaOrdem ?? null,
  };
}

function compareByRotaOrdem(a: Stop, b: Stop): number {
  const ao = typeof a.rotaOrdem === 'number' ? a.rotaOrdem : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.rotaOrdem === 'number' ? b.rotaOrdem : Number.MAX_SAFE_INTEGER;
  return ao - bo;
}

function coordFromInput(lat?: number | null, lng?: number | null): Coord | null {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveDayRange(dateInput?: string): { start: Date; end: Date; dayISO: string } {
  const base = parseDateOrNull(dateInput) ?? new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end, dayISO: toDayISO(start) };
}

function toDayISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // "YYYY-MM-DD" puro é lido no fuso LOCAL (mesmo cuidado do M2: em Brasília -3,
  // o parse UTC escorregaria pro dia anterior).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── tipos de I/O ────────────────────────────────────────────────────────────────
interface ParadaRow {
  id: string;
  status: string;
  rotaOrdem: number | null;
  scheduledAt: Date | null;
  // MULTILOCAL (11/07) — o LOCAL da entrega (null = perfil/legado); seu geo tem
  // prioridade sobre o do perfil na roteirização.
  local: { apelido: string | null; lat: number | null; lng: number | null } | null;
  customerProfile: { name: string | null; lat: number | null; lng: number | null } | null;
}

export interface PlanejarRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
  startAt?: string; // hora de partida (default: agora) — usado no cálculo do ETA
}

export interface IniciarRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
}

export interface PlanejarRotaParada {
  id: string;
  rotaOrdem: number;
  etaAt: string | null;
  semCoordenada: boolean;
  lat: number | null;
  lng: number | null;
  status: string;
  nome: string | null;
}

export interface PlanejarRotaResult {
  date: string;
  total: number;
  semCoordenada: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  paradas: PlanejarRotaParada[];
}

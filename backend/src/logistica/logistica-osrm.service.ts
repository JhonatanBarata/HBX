import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';

/**
 * S4 (docs/PLANEJAMENTOS/PR21072026-NAVEGACAO-HBX/S4-OSRM-BACKEND.md) — proxy do
 * OSRM público via backend. `router.project-osrm.org` é servidor de
 * DEMONSTRAÇÃO (sem SLA, pode bloquear tráfego comercial a qualquer momento)
 * e até esta sprint o app do entregador chamava ele DIRETO do aparelho. Agora
 * passa por aqui: cache compartilhado por rota, rate-limit por empresa
 * (trava contra loop — o disjuntor de recálculo da S3 já segura o normal), e
 * self-host futuro vira só trocar `OSRM_BASE_URL`.
 *
 * O app mantém o fallback pro público (roadGeometry/roadOptimizedPoints em
 * app.js): qualquer erro daqui (400/429/502/timeout) e ele cai direto no
 * `router.project-osrm.org` como fazia antes desta sprint — este endpoint
 * NUNCA pode virar ponto único de falha da navegação.
 *
 * Stateless por design: sem Prisma, sem migration. Cache e rate-limit são
 * estado em memória do processo (mesmo padrão de
 * `RadarSearchRateLimiterService` / `LogisticaGeoService` — sem cron, sem
 * Redis, processo único).
 */

const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
const UPSTREAM_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const CACHE_COORDS_DECIMALS = 5;
const MAX_COORDS_POINTS = 80;
const RATE_LIMIT_PER_MIN = 30;
const MINUTE_MS = 60 * 1000;

// Par "lng,lat" — mesma ordem de eixo do OSRM público. Regex trava o FORMATO
// (dígitos/ponto/sinal); a faixa numérica (lat -90..90, lng -180..180) é
// conferida depois de parsear, regex sozinha não bounda intervalo com sinal.
const COORDS_PAIR_RE = /^-?\d{1,3}(?:\.\d{1,8})?,-?\d{1,3}(?:\.\d{1,8})?$/;

type OsrmPoint = [lng: number, lat: number];

interface CacheEntry {
  body: unknown;
  expiresAt: number;
}

function osrmUnavailable(): HttpException {
  return new HttpException(
    { statusCode: 502, code: 'OSRM_INDISPONIVEL', message: 'Roteamento indisponível no momento.' },
    502,
  );
}

function rateLimited(): HttpException {
  return new HttpException(
    {
      statusCode: 429,
      code: 'OSRM_RATE_LIMIT',
      message: 'Muitas chamadas de roteamento em sequência. Aguarde um instante.',
    },
    429,
  );
}

@Injectable()
export class LogisticaOsrmService {
  private readonly logger = new Logger(LogisticaOsrmService.name);
  // LRU simples via ordem de inserção do Map: hit re-insere a chave no fim;
  // ao estourar CACHE_MAX_ENTRIES descarta a mais antiga (a primeira do Map).
  private readonly cache = new Map<string, CacheEntry>();
  // Janela deslizante de 1 min por empresa — mesmo desenho do
  // RadarSearchRateLimiterService (array de timestamps, podado a cada chamada).
  private readonly hits = new Map<number, number[]>();

  private baseUrl(): string {
    const raw = String(process.env.OSRM_BASE_URL || '').trim();
    return (raw || DEFAULT_OSRM_BASE_URL).replace(/\/+$/, '');
  }

  /** Valida e normaliza `coords=lng,lat;lng,lat;…`. Nunca repassa string crua. */
  private parseCoords(raw: unknown): { normalized: string; points: OsrmPoint[] } {
    const value = String(raw ?? '').trim();
    if (!value) throw new BadRequestException('coords é obrigatório.');
    const pairs = value.split(';');
    if (pairs.length < 2 || pairs.length > MAX_COORDS_POINTS) {
      throw new BadRequestException(`coords deve ter entre 2 e ${MAX_COORDS_POINTS} pontos.`);
    }
    const points: OsrmPoint[] = [];
    for (const pair of pairs) {
      if (!COORDS_PAIR_RE.test(pair)) throw new BadRequestException('coords em formato inválido.');
      const [lngRaw, latRaw] = pair.split(',');
      const lng = Number(lngRaw);
      const lat = Number(latRaw);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new BadRequestException('lng fora da faixa válida (-180..180).');
      }
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new BadRequestException('lat fora da faixa válida (-90..90).');
      }
      points.push([lng, lat]);
    }
    const normalized = points.map(([lng, lat]) => `${lng},${lat}`).join(';');
    return { normalized, points };
  }

  private cacheKey(kind: 'route' | 'table', points: OsrmPoint[], steps: boolean): string {
    const rounded = points
      .map(([lng, lat]) => `${lng.toFixed(CACHE_COORDS_DECIMALS)},${lat.toFixed(CACHE_COORDS_DECIMALS)}`)
      .join(';');
    return `${kind}:${steps ? '1' : '0'}:${rounded}`;
  }

  private cacheGet(key: string): unknown {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    // Recência: remove e reinsere no fim (LRU simples via ordem do Map).
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.body;
  }

  private cacheSet(key: string, body: unknown): void {
    this.cache.delete(key);
    this.cache.set(key, { body, expiresAt: Date.now() + CACHE_TTL_MS });
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /**
   * Só conta pra janela quando a chamada REALMENTE sai pro upstream (cache hit
   * é de graça — não é ele que ameaça o servidor de demonstração). Estoura →
   * 429, disjuntor contra loop de recálculo (a S3 já segura o caso normal).
   */
  private consumeRate(companyId: number): void {
    const key = Math.trunc(Number(companyId) || 0);
    if (!key) return;
    const now = Date.now();
    const existing = this.hits.get(key) || [];
    const pruned = existing.filter((ts) => ts > now - MINUTE_MS);
    if (pruned.length >= RATE_LIMIT_PER_MIN) {
      this.hits.set(key, pruned);
      throw rateLimited();
    }
    pruned.push(now);
    this.hits.set(key, pruned);
  }

  /** Timeout 9s; qualquer falha (rede, timeout, status não-2xx, JSON quebrado) vira 502 OSRM_INDISPONIVEL. */
  private async fetchUpstream(url: string): Promise<unknown> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`upstream status ${res.status}`);
      return await res.json();
    } catch (e: any) {
      this.logger.warn(`[logistica] osrm upstream falhou: ${String(e?.message || e)}`);
      throw osrmUnavailable();
    }
  }

  /** GET /logistica/osrm/route — repassa pra `${OSRM_BASE_URL}/route/v1/driving/...`. */
  async route(companyId: number, coordsRaw: unknown, stepsRaw: unknown): Promise<unknown> {
    const { normalized, points } = this.parseCoords(coordsRaw);
    const steps = stepsRaw === true || stepsRaw === 'true' || stepsRaw === '1';
    const key = this.cacheKey('route', points, steps);
    const cached = this.cacheGet(key);
    if (cached !== undefined) return cached;

    this.consumeRate(companyId);
    const url = `${this.baseUrl()}/route/v1/driving/${normalized}?overview=full&geometries=geojson&steps=${steps}`;
    const body = await this.fetchUpstream(url);
    this.cacheSet(key, body);
    return body;
  }

  /** GET /logistica/osrm/table — repassa pra `${OSRM_BASE_URL}/table/v1/driving/...`. */
  async table(companyId: number, coordsRaw: unknown): Promise<unknown> {
    const { normalized, points } = this.parseCoords(coordsRaw);
    const key = this.cacheKey('table', points, false);
    const cached = this.cacheGet(key);
    if (cached !== undefined) return cached;

    this.consumeRate(companyId);
    const url = `${this.baseUrl()}/table/v1/driving/${normalized}?annotations=duration`;
    const body = await this.fetchUpstream(url);
    this.cacheSet(key, body);
    return body;
  }

  /** Usado só nos testes — zera o estado em memória entre casos. */
  resetForTest(): void {
    this.cache.clear();
    this.hits.clear();
  }
}

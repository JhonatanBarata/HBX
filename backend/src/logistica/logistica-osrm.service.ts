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
const MINUTE_MS = 60 * 1000;
/**
 * 🔴 30/07 — O TETO DEPENDE DE QUEM ESTÁ ATENDENDO. Enquanto o roteador era o
 * servidor de DEMONSTRAÇÃO público, 30 rotas/min por empresa era educação (uso
 * comercial pesado lá é abuso). Desde 29/07 o roteador é NOSSO (container
 * `hbx-osrm` no VPS): uma consulta de rota custa alguns milissegundos de CPU, e
 * 30/min estrangulava operação real — 5 motoristas navegando, cada um pedindo
 * traçado da fila + retraço ao errar entrada, batem o teto e caem no público
 * (justamente o servidor que a gente parou de usar). Auto-hospedado o teto sobe
 * pra 300/min e continua sendo DISJUNTOR: uso legítimo nunca chega perto, laço
 * de bug morre. Regra da casa: freio limita AVARIA, não uso legítimo.
 */
const RATE_LIMIT_PER_MIN_PUBLICO = 30;
const RATE_LIMIT_PER_MIN_SELF_HOST = 300;

// Par "lng,lat" — mesma ordem de eixo do OSRM público. Regex trava o FORMATO
// (dígitos/ponto/sinal); a faixa numérica (lat -90..90, lng -180..180) é
// conferida depois de parsear, regex sozinha não bounda intervalo com sinal.
const COORDS_PAIR_RE = /^-?\d{1,3}(?:\.\d{1,8})?,-?\d{1,3}(?:\.\d{1,8})?$/;

// Par "grau,tolerância" de um waypoint (`bearings` do OSRM). Item VAZIO é legal e
// quer dizer "esse waypoint não tem restrição de direção" — só a origem
// costuma ter. Mesma disciplina do COORDS_PAIR_RE: regex trava o FORMATO, a
// faixa numérica é conferida depois de parsear.
const BEARING_PAIR_RE = /^\d{1,3},\d{1,3}$/;

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

  /** Roteador próprio (qualquer base que não seja o demo público) — ver RATE_LIMIT_*. */
  private selfHosted(): boolean {
    return !/project-osrm\.org/i.test(this.baseUrl());
  }

  private rateLimitPerMin(): number {
    return this.selfHosted() ? RATE_LIMIT_PER_MIN_SELF_HOST : RATE_LIMIT_PER_MIN_PUBLICO;
  }

  /**
   * Valida e normaliza `bearings=grau,tolerância;…` (30/07 — retraço da rota).
   * Um item POR waypoint, na mesma ordem de `coords`; item vazio = waypoint sem
   * restrição. Serve pro roteador saber pra que lado o carro está apontado:
   * sem isso, quem errou uma entrada recebe rota nova mandando fazer retorno na
   * hora, porque o OSRM assume que dá pra sair do ponto em qualquer direção.
   * Ausente/vazio devolve null e a URL sai sem o parâmetro (comportamento de
   * antes desta sprint, intocado).
   */
  private parseBearings(raw: unknown, totalPoints: number): string | null {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    const items = value.split(';');
    if (items.length !== totalPoints) {
      throw new BadRequestException('bearings deve ter um item por ponto de coords.');
    }
    const normalized: string[] = [];
    let algumPreenchido = false;
    for (const item of items) {
      const pair = item.trim();
      if (!pair) {
        normalized.push('');
        continue;
      }
      if (!BEARING_PAIR_RE.test(pair)) throw new BadRequestException('bearings em formato inválido.');
      const [grauRaw, faixaRaw] = pair.split(',');
      const grau = Number(grauRaw);
      const faixa = Number(faixaRaw);
      if (!Number.isFinite(grau) || grau < 0 || grau > 360) {
        throw new BadRequestException('bearings: grau fora da faixa válida (0..360).');
      }
      if (!Number.isFinite(faixa) || faixa < 0 || faixa > 180) {
        throw new BadRequestException('bearings: tolerância fora da faixa válida (0..180).');
      }
      normalized.push(`${grau},${faixa}`);
      algumPreenchido = true;
    }
    // Só vazios = nada a restringir; não suja a URL nem a chave de cache.
    return algumPreenchido ? normalized.join(';') : null;
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

  // `bearings` ENTRA na chave: mesma origem apontada pra outro lado é outra rota.
  // Sem isso, o traçado calculado com direção vazaria pra quem pediu sem (e
  // vice-versa) — mesmo motivo do sufixo de `steps`.
  private cacheKey(
    kind: 'route' | 'table',
    points: OsrmPoint[],
    steps: boolean,
    bearings?: string | null,
  ): string {
    const rounded = points
      .map(([lng, lat]) => `${lng.toFixed(CACHE_COORDS_DECIMALS)},${lat.toFixed(CACHE_COORDS_DECIMALS)}`)
      .join(';');
    return `${kind}:${steps ? '1' : '0'}:${bearings || '-'}:${rounded}`;
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
    if (pruned.length >= this.rateLimitPerMin()) {
      this.hits.set(key, pruned);
      throw rateLimited();
    }
    pruned.push(now);
    this.hits.set(key, pruned);
  }

  /**
   * 30/07 — RESPOSTA DE ERRO LÓGICO NÃO ENTRA NO CACHE. O OSRM devolve HTTP 200
   * com `code:"NoRoute"` quando não consegue atender (típico com `bearings`: o
   * carro apontado pra dentro de rua sem saída). Guardar isso por 10 min fazia o
   * mesmo "não achei" voltar de graça mesmo depois de o carro já ter virado —
   * cache de fracasso é pior que cache nenhum.
   */
  private respostaUtil(body: unknown): boolean {
    const code = (body as { code?: unknown } | null)?.code;
    return code === undefined || code === 'Ok';
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
  async route(
    companyId: number,
    coordsRaw: unknown,
    stepsRaw: unknown,
    bearingsRaw?: unknown,
  ): Promise<unknown> {
    const { normalized, points } = this.parseCoords(coordsRaw);
    const steps = stepsRaw === true || stepsRaw === 'true' || stepsRaw === '1';
    const bearings = this.parseBearings(bearingsRaw, points.length);
    const key = this.cacheKey('route', points, steps, bearings);
    const cached = this.cacheGet(key);
    if (cached !== undefined) return cached;

    this.consumeRate(companyId);
    const bearingsQuery = bearings ? `&bearings=${encodeURIComponent(bearings)}` : '';
    const url = `${this.baseUrl()}/route/v1/driving/${normalized}?overview=full&geometries=geojson&steps=${steps}${bearingsQuery}`;
    const body = await this.fetchUpstream(url);
    this.cacheSet(key, body);
    return body;
  }

  /**
   * GET /logistica/osrm/table — repassa pra `${OSRM_BASE_URL}/table/v1/driving/...`.
   * S1 (25/07, PR25072026-ROTA-CONFERIDA) — `annotations=duration,distance`:
   * o planejador de rota (LogisticaRotaService.planRouteByRoads, DEGRAU 1 da
   * cadeia proxy→público→Haversine) também precisa da distância por perna,
   * não só do tempo. `durations` continua no MESMO formato pro consumidor
   * antigo (mapa do app, roadOptimizedPoints em app.js) — a annotation extra
   * só ACRESCENTA `distances` ao payload, nunca troca o que já existia.
   */
  async table(companyId: number, coordsRaw: unknown): Promise<unknown> {
    const { normalized, points } = this.parseCoords(coordsRaw);
    const key = this.cacheKey('table', points, false);
    const cached = this.cacheGet(key);
    if (cached !== undefined) return cached;

    this.consumeRate(companyId);
    const url = `${this.baseUrl()}/table/v1/driving/${normalized}?annotations=duration,distance`;
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

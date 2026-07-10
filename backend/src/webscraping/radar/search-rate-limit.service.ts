// GUARDRAILS S3 (10/07, docs/PLANEJAMENTOS/MASTER-REFAB/PLANO.md) — throttle da busca GRÁTIS
// do radar (queryCnpjBaseForUser, filtro avançado do "Buscar empresas") POR EMPRESA. Freio
// FÍSICO contra scraper varrendo a base 28M via filtro em loop — não é cota comercial (aquela
// é o teto DIÁRIO de ENTREGAS, em commercial-usage-limits.service.ts; este freio é sobre a
// BUSCA em si, que não debita nada e por isso não passava por nenhum teto até hoje).
//
// PADRÃO da casa (mesmo desenho do AiGatewayService/SourceBudgetService): classe com estado
// ESTÁTICO em memória, sem DI — o mixin de presentation não é instanciado via Nest DI em todo
// call-site. Janela deslizante simples: array de timestamps por empresa, podado a cada chamada
// (sem cron, sem Redis — processo único, mesma premissa do resto da casa).
//
// Envs (<=0 = desliga aquela janela; as duas <=0 = throttle inteiro desligado):
//   HBX_SEARCH_RATE_PER_MIN  (default 30)
//   HBX_SEARCH_RATE_PER_HOUR (default 400)

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export class RadarSearchRateLimiterService {
  private static readonly hits = new Map<number, number[]>();

  static perMinuteLimit(): number {
    return envInt('HBX_SEARCH_RATE_PER_MIN', 30);
  }

  static perHourLimit(): number {
    return envInt('HBX_SEARCH_RATE_PER_HOUR', 400);
  }

  /**
   * Registra 1 busca da empresa e diz se ela cabe nas 2 janelas (minuto/hora). Poda o histórico
   * pra caber só na maior janela (1h) — mantém o Map limitado sem cron nenhum.
   */
  static checkAndConsume(companyId: number): { allowed: boolean } {
    const perMin = RadarSearchRateLimiterService.perMinuteLimit();
    const perHour = RadarSearchRateLimiterService.perHourLimit();
    if (perMin <= 0 && perHour <= 0) return { allowed: true }; // escape hatch explícito

    const key = Math.trunc(Number(companyId) || 0);
    if (!key) return { allowed: true };

    const now = Date.now();
    const existing = RadarSearchRateLimiterService.hits.get(key) || [];
    const pruned = existing.filter((ts) => ts > now - HOUR_MS);

    const countLastMinute = pruned.filter((ts) => ts > now - MINUTE_MS).length;
    const countLastHour = pruned.length;

    const minuteBlocked = perMin > 0 && countLastMinute >= perMin;
    const hourBlocked = perHour > 0 && countLastHour >= perHour;
    if (minuteBlocked || hourBlocked) {
      RadarSearchRateLimiterService.hits.set(key, pruned);
      return { allowed: false };
    }

    pruned.push(now);
    RadarSearchRateLimiterService.hits.set(key, pruned);
    return { allowed: true };
  }

  /** Usado só nos testes — zera o estado estático entre casos (mesmo furo do AiGatewayService). */
  static resetForTest() {
    RadarSearchRateLimiterService.hits.clear();
  }
}

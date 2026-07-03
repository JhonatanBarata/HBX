import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WaSendThrottleService } from './wa-send-throttle.service';

/**
 * GATEWAY-WA S1 — Saúde de FROTA do motor Webwhats
 * (docs/PLANEJAMENTOS/GATEWAY-WA/GATEWAY-WA-sprint-1-telemetria.md).
 *
 * Consome `GET /health/fleet` do motor (mesmo padrão de HTTP/apikey do webwhats-bridge) com cache
 * curto em memória (default 20s) — o painel de frota do dono não deve martelar o motor a cada
 * refresh. O gap que este sprint fecha é HISTÓRICO/FROTA: por instância, o estado vivo do socket,
 * circuito aberto?, tentativas atuais e últimos eventos do disjuntor.
 *
 * Este serviço só LÊ o motor + junta os contadores do freio de envio (S3, WaSendThrottleService)
 * — não muda comportamento de conexão nenhum. A UI fica fora deste sprint (o dono liga depois).
 */
@Injectable()
export class WebwhatsFleetHealthService {
  private readonly logger = new Logger(WebwhatsFleetHealthService.name);
  private cache: { at: number; fleet: any } | null = null;

  constructor(private readonly throttle: WaSendThrottleService) {}

  private cacheTtlMs(): number {
    const raw = Number(process.env.HBX_WEBWHATS_FLEET_CACHE_MS || 20000);
    return Number.isFinite(raw) ? Math.max(5000, Math.min(60000, raw)) : 20000;
  }

  private readMotorConfig(): { url: string; apiKey: string; timeoutMs: number } | null {
    const url = String(process.env.WHATSAPP_MODAL_INTERNAL_URL || '').trim().replace(/\/+$/, '');
    const apiKey = String(process.env.WHATSAPP_MODAL_API_KEY || '').trim();
    const timeoutRaw = Number(
      process.env.WHATSAPP_MODAL_TIMEOUT_MS || process.env.WHATSAPP_PROVIDER_TIMEOUT_MS || 12000,
    );
    const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(2000, Math.min(30000, timeoutRaw)) : 12000;
    if (!url || !apiKey) return null;
    return { url, apiKey, timeoutMs };
  }

  private async fetchFleet(): Promise<{ ok: boolean; fleet: any; error?: string }> {
    const config = this.readMotorConfig();
    if (!config) {
      return { ok: false, fleet: null, error: 'WHATSAPP_MODAL_INTERNAL_URL/API_KEY não configurados' };
    }
    const url = new URL('health/fleet', `${config.url}/`).toString();
    try {
      const response = await axios.request({
        method: 'GET',
        url,
        timeout: config.timeoutMs,
        headers: { apikey: config.apiKey },
        validateStatus: () => true,
      });
      if (response.status === 404) {
        return { ok: false, fleet: null, error: 'endpoint /health/fleet ausente no motor (sprint do motor não subiu)' };
      }
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, fleet: null, error: `motor respondeu status ${response.status}` };
      }
      return { ok: true, fleet: response.data ?? null };
    } catch (error) {
      return { ok: false, fleet: null, error: String((error as any)?.message || error) };
    }
  }

  /**
   * Retorna o JSON de frota (do motor) + contadores do freio de envio (S3) + idade do cache.
   * Cache curto: chamadas dentro da janela reusam a última resposta boa do motor. Se o motor
   * estiver fora, devolve `motorReachable: false` com o erro — nunca lança (o painel decide).
   */
  async getFleetHealth(): Promise<{
    motorReachable: boolean;
    error: string | null;
    cacheAgeMs: number;
    fleet: any;
    sendThrottle: ReturnType<WaSendThrottleService['getStats']>;
  }> {
    const now = Date.now();
    const ttl = this.cacheTtlMs();
    if (this.cache && now - this.cache.at < ttl) {
      return {
        motorReachable: true,
        error: null,
        cacheAgeMs: now - this.cache.at,
        fleet: this.cache.fleet,
        sendThrottle: this.throttle.getStats(),
      };
    }

    const result = await this.fetchFleet();
    if (result.ok) {
      this.cache = { at: now, fleet: result.fleet };
      return {
        motorReachable: true,
        error: null,
        cacheAgeMs: 0,
        fleet: result.fleet,
        sendThrottle: this.throttle.getStats(),
      };
    }

    // Motor fora: se ainda houver cache (mesmo velho), devolve-o marcado; senão fleet null.
    this.logger.warn(`Webwhats fleet health indisponível: ${result.error}`);
    return {
      motorReachable: false,
      error: result.error ?? 'motor indisponível',
      cacheAgeMs: this.cache ? now - this.cache.at : 0,
      fleet: this.cache?.fleet ?? null,
      sendThrottle: this.throttle.getStats(),
    };
  }
}

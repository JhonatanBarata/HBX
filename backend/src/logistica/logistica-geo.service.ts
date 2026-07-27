import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { resolverCnefe } from '../nucleo/cnefe-resolver.util';
import { resolveServerGeo } from '../nucleo/nucleo-geo.util';
import { consultarCepPublico } from './logistica-cep.util';

/**
 * PR20072026-ROTA-SALVA F3.2 — geocode REVERSO (GPS → endereço), server-side,
 * pra sequência de cliente na Leitura de Rota (o app captura lat/lng do GPS de
 * campo e pede uma sugestão de endereço EDITÁVEL, nunca autoritativa).
 *
 * MESMO estilo de `nucleo-geo.util.ts` (Nominatim, User-Agent identificável,
 * timeout curto, kill-switch de rede via env) — não importa aquele util
 * porque ele resolve `/search` (endereço→coordenada), não `/reverse`
 * (coordenada→endereço); replicado aqui enxuto, mesmo precedente do próprio
 * nucleo-geo.util.ts ao não importar `radar-search-geo.service.ts` por dado
 * cross-module (“a tabela é dado puro, segura de importar direto”).
 *
 * Contrato (00-ORQUESTRACAO.md, LEI): `GET /logistica/geo/reverse?lat=&lng=` →
 * `{ endereco, numero?, bairro, cidade, uf, cep, fonte }`. 200 SEMPRE — flag
 * OFF (default), timeout, erro de rede, ou sem match → `fonte:'nenhum'` com
 * campos vazios, NUNCA 500. Validação de lat/lng fora do intervalo → 400
 * (isto sim é erro de INPUT do chamador, não falha de rede).
 *
 * Cache em memória por CÉLULA (~arredonda lat/lng a 3 casas decimais), TTL
 * 24h — evita martelar o Nominatim (rate-limit 1 req/s) quando várias paradas
 * da mesma leitura caem perto uma da outra. Cache é processo-local (reinicia
 * no restart do backend); aceitável pra este uso (sugestão editável, não dado
 * de auditoria).
 */

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_TIMEOUT_MS = 2500;
// Nominatim exige UA identificável com contato — mesmo motivo de nucleo-geo.util.ts.
const NOMINATIM_USER_AGENT = 'HBX-Logistica/1.0 (contato@hbxsystem.com.br)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_CELL_DECIMALS = 3;

export interface ReverseGeoResult {
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  fonte: 'geocode' | 'nenhum';
}

const VAZIO: ReverseGeoResult = { endereco: '', numero: '', bairro: '', cidade: '', uf: '', cep: '', fonte: 'nenhum' };

/** R2 (27/07) — resposta do CEP+número → pino (rota rápida do APK). */
export interface CepNumeroResult {
  fonte: 'cnefe' | 'geocode' | 'nenhum';
  precisao?: 'porta' | 'rua';
  lat: number | null;
  lng: number | null;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  numero: string;
}

interface CacheEntry {
  result: ReverseGeoResult;
  expiresAt: number;
}

@Injectable()
export class LogisticaGeoService {
  private readonly logger = new Logger(LogisticaGeoService.name);
  private readonly cache = new Map<string, CacheEntry>();

  /** Kill-switch de rede — MESMO env de nucleo-geo.util.ts (default OFF). */
  private networkEnabled(): boolean {
    const v = String(process.env.HBX_GEO_SERVER_ENABLED ?? '').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  private cacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(CACHE_CELL_DECIMALS)},${lng.toFixed(CACHE_CELL_DECIMALS)}`;
  }

  async reverse(latRaw: unknown, lngRaw: unknown): Promise<ReverseGeoResult> {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('lat deve estar entre -90 e 90.');
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('lng deve estar entre -180 e 180.');
    }

    if (!this.networkEnabled()) return { ...VAZIO };

    const key = this.cacheKey(lat, lng);
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return { ...cached.result };

    const result = await this.geocodeViaNominatim(lat, lng);
    this.cache.set(key, { result, expiresAt: now + CACHE_TTL_MS });
    return { ...result };
  }

  /**
   * R2/R9 (27/07, rota rápida) — CEP + número → pino. Ordem: base CNEFE local
   * (porta/rua provada, sem rede externa) → Nominatim com freio (nucleo-geo.util) →
   * 'nenhum' (mas ainda devolve o ENDEREÇO do ViaCEP quando houver, pro app
   * pré-preencher o cadastro). 200 SEMPRE, salvo input inválido (400 — erro do
   * chamador, não falha de rede).
   */
  async cepNumero(cepRaw: unknown, numeroRaw: unknown, ufRaw?: unknown): Promise<CepNumeroResult> {
    const cep = String(cepRaw ?? '').replace(/\D+/g, '');
    if (cep.length !== 8) throw new BadRequestException('Informe o CEP completo (8 dígitos).');
    const numeroDigits = String(numeroRaw ?? '').replace(/\D+/g, '');
    const numero = Number(numeroDigits);
    if (!numeroDigits || numeroDigits.length > 6 || !Number.isInteger(numero) || numero <= 0) {
      throw new BadRequestException('Informe o número do endereço.');
    }
    const ufParam = String(ufRaw ?? '').trim().toUpperCase();

    const viaCep = await consultarCepPublico(cep);
    const uf = /^[A-Z]{2}$/.test(ufParam) ? ufParam : viaCep?.uf ?? '';
    const base = {
      endereco: viaCep?.logradouro ?? '',
      bairro: viaCep?.bairro ?? '',
      cidade: viaCep?.localidade ?? '',
      uf,
      cep,
      numero: String(numero),
    };

    const cnefe = await resolverCnefe({ cep, numero, endereco: viaCep?.logradouro || null, uf });
    if (cnefe) {
      return {
        fonte: 'cnefe',
        precisao: cnefe.precisao,
        lat: cnefe.lat,
        lng: cnefe.lng,
        ...base,
        endereco: base.endereco || (cnefe.logradouro ?? ''),
        cidade: base.cidade || (cnefe.municipio ?? ''),
      };
    }

    // resolveServerGeo tenta CNEFE de novo por dentro (barato: cache de UF + índice),
    // e cai no Nominatim com o MESMO freio do cadastro — nunca pino de loteria.
    const geo = await resolveServerGeo({
      endereco: viaCep?.logradouro ?? null,
      numero: String(numero),
      bairro: viaCep?.bairro ?? null,
      cidade: viaCep?.localidade ?? null,
      uf: uf || null,
      cep,
    });
    if (geo) return { fonte: 'geocode', lat: geo.lat, lng: geo.lng, ...base };

    return { fonte: 'nenhum', lat: null, lng: null, ...base };
  }

  /** Nominatim /reverse — best-effort, NUNCA lança (qualquer falha vira 'nenhum'). */
  private async geocodeViaNominatim(lat: number, lng: number): Promise<ReverseGeoResult> {
    try {
      const url = `${NOMINATIM_REVERSE_URL}?format=jsonv2&addressdetails=1&zoom=18&lat=${encodeURIComponent(
        String(lat),
      )}&lon=${encodeURIComponent(String(lng))}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
      });
      if (!res.ok) return { ...VAZIO };
      const body = (await res.json()) as { address?: Record<string, string> };
      const address = body?.address;
      if (!address || typeof address !== 'object') return { ...VAZIO };
      return parseNominatimAddress(address);
    } catch (e: any) {
      // timeout (AbortSignal.timeout), rede fora, JSON quebrado — degrada, nunca propaga.
      this.logger.debug(`[logistica] geo/reverse falhou (degradando p/ 'nenhum'): ${String(e?.message || e)}`);
      return { ...VAZIO };
    }
  }
}

/** Parser puro (testável isolado) do `address` do payload jsonv2 do Nominatim. */
export function parseNominatimAddress(address: Record<string, string | undefined>): ReverseGeoResult {
  const endereco = String(address.road ?? '').trim();
  const numero = String(address.house_number ?? '').trim();
  const bairro = String(address.suburb ?? address.neighbourhood ?? '').trim();
  const cidade = String(address.city ?? address.town ?? address.village ?? '').trim();
  const cep = String(address.postcode ?? '').trim();
  const uf = resolveUf(address);

  const temAlgo = endereco || bairro || cidade || cep || uf;
  return {
    endereco,
    numero,
    bairro,
    cidade,
    uf,
    cep,
    fonte: temAlgo ? 'geocode' : 'nenhum',
  };
}

/** UF (sigla 2 letras): prioriza o código ISO ("BR-SP" → "SP"); fallback = nada
 *  (o Nominatim às vezes só devolve o nome do estado por extenso — não
 *  arriscamos mapear nome→sigla errado; o app deixa o campo editável). */
function resolveUf(address: Record<string, string | undefined>): string {
  const iso = String(address['ISO3166-2-lvl4'] ?? '').trim().toUpperCase();
  const match = /^BR-([A-Z]{2})$/.exec(iso);
  if (match) return match[1];
  const stateCode = String((address as any).state_code ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(stateCode)) return stateCode;
  return '';
}

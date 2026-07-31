import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { resolverCnefe } from '../nucleo/cnefe-resolver.util';
import { resolveServerGeo } from '../nucleo/nucleo-geo.util';
import { consultarCepPublico } from './logistica-cep.util';
import {
  coordenadaDaUrl,
  DestinoLido,
  hostDeMapa,
  lerTextoColado,
} from './logistica-geo-link.util';

/** geo/link — cache curto por link (o mesmo link é colado várias vezes seguidas). */
const LINK_CACHE_TTL_MS = 30 * 60 * 1000;
const LINK_CACHE_MAX = 120;
const LINK_TIMEOUT_MS = 6000;

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
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const BUSCA_CACHE_TTL_MS = 60 * 60 * 1000;
const BUSCA_CACHE_MAX = 200;
const BUSCA_LIMIT = 6;
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

/** MODO PASSEIO (29/07) — um resultado da busca de lugar/endereço do mapa. */
export interface BuscaGeoItem {
  nome: string;
  detalhe: string;
  lat: number;
  lng: number;
  distanciaM?: number;
}

interface BuscaCacheEntry {
  items: BuscaGeoItem[];
  expiresAt: number;
}

@Injectable()
export class LogisticaGeoService {
  private readonly logger = new Logger(LogisticaGeoService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly buscaCache = new Map<string, BuscaCacheEntry>();
  private readonly linkCache = new Map<string, { destino: DestinoLido; expiresAt: number }>();

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

  /**
   * MODO PASSEIO (29/07) — busca "estilo Google Maps" do mapa do passeio:
   * texto livre → até 6 lugares com coordenada. Mesmo contrato de degradação
   * do reverse: flag OFF, timeout ou rede fora → `{ items: [] }`, NUNCA 500
   * (o app tem fallback client-side). Cache LRU por termo (1h) segura o
   * rate-limit de 1 req/s do Nominatim contra digitação repetida.
   */
  async busca(qRaw: unknown, latRaw?: unknown, lngRaw?: unknown): Promise<{ items: BuscaGeoItem[] }> {
    const qOriginal = String(qRaw ?? '').trim().slice(0, 120);
    if (qOriginal.length < 3) throw new BadRequestException('Digite pelo menos 3 letras.');
    if (!this.networkEnabled()) return { items: [] };

    const buscaProxima = /\b(perto de mim|pr[oó]xim[oa]s?)\b/i.test(qOriginal);
    const q = this.normalizarConsultaProxima(qOriginal);
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const centro =
      Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
        ? { lat, lng }
        : null;
    const key = `${q.toLowerCase()}|${centro ? `${centro.lat.toFixed(2)},${centro.lng.toFixed(2)}` : ''}|${buscaProxima ? 'perto' : ''}`;
    const now = Date.now();
    const cached = this.buscaCache.get(key);
    if (cached && cached.expiresAt > now) {
      this.buscaCache.delete(key);
      this.buscaCache.set(key, cached);
      return { items: cached.items.map((item) => ({ ...item })) };
    }

    const items = await this.buscarViaNominatim(q, centro, buscaProxima);
    this.buscaCache.set(key, { items, expiresAt: now + BUSCA_CACHE_TTL_MS });
    while (this.buscaCache.size > BUSCA_CACHE_MAX) {
      const oldest = this.buscaCache.keys().next().value;
      if (oldest === undefined) break;
      this.buscaCache.delete(oldest);
    }
    return { items: items.map((item) => ({ ...item })) };
  }

  private normalizarConsultaProxima(q: string): string {
    const limpa = q
      .replace(/\b(perto de mim|pr[oó]xim[oa]s?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (/^bares?$/i.test(limpa)) return 'bar';
    return limpa || q;
  }

  private distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const r = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  private async buscarViaNominatim(
    q: string,
    centro: { lat: number; lng: number } | null,
    buscaProxima: boolean,
  ): Promise<BuscaGeoItem[]> {
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        countrycodes: 'br',
        limit: String(BUSCA_LIMIT),
        'accept-language': 'pt-BR',
        q,
      });
      if (centro) {
        const alcance = buscaProxima ? 0.07 : 0.18;
        params.set(
          'viewbox',
          `${centro.lng - alcance},${centro.lat + alcance},${centro.lng + alcance},${centro.lat - alcance}`,
        );
        if (buscaProxima) params.set('bounded', '1');
      }
      const url = `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) return [];
      return rows
        .map((row) => {
          const lat = Number(row?.lat);
          const lng = Number(row?.lon);
          const display = String(row?.display_name ?? '');
          const nome = String(row?.name ?? '').trim() || display.split(',')[0]?.trim() || '';
          const detalhe = display.split(',').slice(1, 4).map((part) => part.trim()).filter(Boolean).join(', ');
          const item: BuscaGeoItem = { nome: nome.slice(0, 60), detalhe: detalhe.slice(0, 90), lat, lng };
          if (centro && Number.isFinite(lat) && Number.isFinite(lng)) {
            item.distanciaM = Math.round(this.distanciaMetros(centro, { lat, lng }));
          }
          return item;
        })
        .filter(
          (item) =>
            item.nome &&
            Number.isFinite(item.lat) && Math.abs(item.lat) <= 90 &&
            Number.isFinite(item.lng) && Math.abs(item.lng) <= 180,
        )
        .sort((a, b) =>
          centro ? Number(a.distanciaM ?? Number.MAX_SAFE_INTEGER) - Number(b.distanciaM ?? Number.MAX_SAFE_INTEGER) : 0,
        );
    } catch (e: any) {
      this.logger.debug(`[logistica] geo/busca falhou (degradando p/ vazio): ${String(e?.message || e)}`);
      return [];
    }
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

  /**
   * 31/07 (APK-ROTA, pedido do dono) — TEXTO/LINK DE LOCALIZAÇÃO COLADO → ponto.
   *
   * O caminho principal do "abrir localização do WhatsApp" é o `geo:` do Android,
   * resolvido dentro do aparelho, sem passar por aqui. Este endpoint cobre o que
   * o aparelho NÃO consegue: o link curto do Google (maps.app.goo.gl), que só
   * vira coordenada depois de seguir o redirecionamento — chamada de rede, que
   * mora no servidor (com cache e teto), nunca solta no celular.
   *
   * Nunca 500: sem achar, devolve `fonte:'nenhum'` e o app pede o endereço na mão.
   */
  async link(uRaw: unknown): Promise<DestinoLido> {
    const bruto = String(uRaw ?? '').trim().slice(0, 2048);
    if (!bruto) throw new BadRequestException('Cole o link ou a localização.');

    const { destino, link } = lerTextoColado(bruto);
    // Coordenada que já estava no texto/URL: pronto, sem rede nenhuma.
    if (destino.fonte !== 'nenhum') return destino;
    if (!link || !hostDeMapa(link)) return destino;

    const cacheado = this.linkCache.get(link);
    if (cacheado && cacheado.expiresAt > Date.now()) return cacheado.destino;
    // Kill-switch de rede do módulo (mesmo do reverse/busca): desligado, o
    // servidor não abre nada — o app continua funcionando pelo `geo:`.
    if (!this.networkEnabled()) return destino;

    const final = await this.seguirRedirecionamento(link);
    const resolvido = final ? coordenadaDaUrl(final) : { ...destino };
    const saida: DestinoLido =
      resolvido.fonte === 'url'
        ? { ...resolvido, fonte: 'redirecionamento' }
        : { ...destino, rotulo: resolvido.rotulo || destino.rotulo };
    this.linkCache.set(link, { destino: saida, expiresAt: Date.now() + LINK_CACHE_TTL_MS });
    while (this.linkCache.size > LINK_CACHE_MAX) {
      const maisVelho = this.linkCache.keys().next().value;
      if (maisVelho === undefined) break;
      this.linkCache.delete(maisVelho);
    }
    return saida;
  }

  /**
   * Segue o redirecionamento SEM ler corpo: só o cabeçalho `Location`, no máximo
   * 4 saltos, e cada salto tem que continuar num host de mapa conhecido. É essa
   * checagem por salto que impede o endpoint de virar proxy pra rede interna
   * (SSRF por redirecionamento é o buraco clássico de "resolvedor de link").
   */
  private async seguirRedirecionamento(url: string): Promise<string> {
    let atual = url;
    for (let salto = 0; salto < 4; salto++) {
      if (!hostDeMapa(atual)) return '';
      let res: Response;
      try {
        res = await fetch(atual, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'text/html' },
          signal: AbortSignal.timeout(LINK_TIMEOUT_MS),
        });
      } catch (e: any) {
        this.logger.debug(`[logistica] geo/link não abriu (degradando): ${String(e?.message || e)}`);
        return '';
      }
      const location = res.headers.get('location');
      if (!location) return atual;
      try {
        atual = new URL(location, atual).toString();
      } catch {
        return '';
      }
      if (coordenadaDaUrl(atual).fonte === 'url') return atual;
    }
    return atual;
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

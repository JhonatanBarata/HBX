// R9 (27/07, frente APK-rota) — resolver de coordenada pela base CNEFE/IBGE local.
//
// A base `cnefe` (banco separado no MESMO Postgres, ver backend/scripts/cnefe/README.md)
// tem o endereço georreferenciado do Censo 2022: (cep, numero) → lat/lng da PORTA.
// Isto mata o "Não sei onde fica este endereço" pra cadastro que TEM CEP+número —
// sem depender do Nominatim (rate-limit, via ambígua, rua numerada = pino de loteria).
//
// MESMA LEI do freio do geocode (nucleo-geo.util.ts): pino errado é PIOR que pino
// vazio. Fail-CLOSED em toda dúvida:
//  - cidade de CEP ÚNICO (o mesmo CEP cobre a cidade inteira): (cep, numero) casa
//    dezenas de ruas diferentes → candidatos espalhados → NULL (dispersão > teto);
//  - cadastro COM logradouro e nenhum candidato de via compatível → NULL;
//  - fallback de RUA (número vizinho) SÓ com via compatível provada e vizinho perto
//    (delta de número e distância com teto) — sem logradouro no cadastro, não há rua.
//
// UF sem carga: marca `cnefe_uf` como pendente (agendador noturno baixa e carrega —
// ver backend/scripts/cnefe/rodar-pendentes.sh) e devolve null; o chamador segue no
// caminho de sempre (Nominatim). Best-effort SEMPRE: nunca lança, nunca trava cadastro
// nem conferência; falha de banco entra em cooldown pra não martelar conexão quebrada.

import { PrismaClient } from '@prisma/client';
import { viasCompativeis } from './nucleo-geo.util';

const UFS_VALIDAS = new Set([
  'RO', 'AC', 'AM', 'RR', 'PA', 'AP', 'TO',
  'MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA',
  'MG', 'ES', 'RJ', 'SP',
  'PR', 'SC', 'RS',
  'MS', 'MT', 'GO', 'DF',
]);

/** Dispersão máxima (m) entre candidatos do MESMO (cep, numero) — acima disto o CEP
 *  é "geral" (cidade inteira) e o número casa ruas diferentes: ambíguo, sem pino. */
export const CNEFE_DISPERSAO_PORTA_M = 250;
/** Dispersão máxima (m) dos vizinhos de número no fallback de RUA. */
export const CNEFE_DISPERSAO_RUA_M = 400;
/** Diferença máxima de numeração pro vizinho ainda contar como "mesma altura da rua". */
export const CNEFE_VIZINHO_DELTA_MAX = 200;
/** Teto de tempo por consulta — a conferência nunca fica lenta por causa do CNEFE. */
const CNEFE_QUERY_TIMEOUT_MS = 1500;
/** Falhou banco/conexão → silêncio por este tempo (não martela conexão quebrada). */
const CNEFE_FALHA_COOLDOWN_MS = 60 * 1000;
/** Cache do status por UF (evita 1 SELECT em cnefe_uf a cada resolução). */
const CNEFE_UF_CACHE_TTL_MS = 10 * 60 * 1000;

export interface CnefeInput {
  cep?: string | null;
  numero?: string | number | null;
  /** Logradouro do cadastro — quando presente, o candidato PRECISA ter via compatível. */
  endereco?: string | null;
  uf?: string | null;
}

export interface CnefePino {
  lat: number;
  lng: number;
  precisao: 'porta' | 'rua';
  logradouro: string | null;
  municipio: string | null;
}

/** Linha crua de cnefe_endereco (só o que o escolhedor usa). */
export interface CnefeRow {
  logradouro: string | null;
  numero: number | null;
  lat: number | null;
  lng: number | null;
  nivel_geo: number | null;
  municipio: string | null;
}

// ── helpers puros ────────────────────────────────────────────────────────────────

function normalizarCep8(valor: string | null | undefined): string | null {
  const digitos = String(valor ?? '').replace(/\D+/g, '');
  return digitos.length === 8 ? digitos : null;
}

/**
 * Número da porta a consultar: coluna `numero` primeiro; no legado (número dentro do
 * texto "Rua X, 123 - Centro") só extrai com âncora explícita (vírgula ou "nº") —
 * NUNCA o primeiro número solto do texto ("Rua 12" tem 12 no NOME da via).
 */
export function extrairNumeroPorta(cadastro: { numero?: string | null; endereco?: string | null }): number | null {
  const coluna = String(cadastro.numero ?? '').replace(/\D+/g, '');
  if (coluna) {
    const n = Number(coluna);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const texto = String(cadastro.endereco ?? '');
  const m = /(?:,|n[ºo°]\s*|\bn[uú]mero\s*)\s*(\d{1,6})(?!\d)/i.exec(texto);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function coordValida(row: CnefeRow): row is CnefeRow & { lat: number; lng: number } {
  return (
    typeof row.lat === 'number' && Number.isFinite(row.lat) &&
    typeof row.lng === 'number' && Number.isFinite(row.lng) &&
    !(row.lat === 0 && row.lng === 0)
  );
}

/** Haversine em METROS — local de propósito (nucleo não importa nada de logistica). */
function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Medoide: o candidato com menor soma de distâncias até os demais (nunca inventa
 *  um ponto médio "no meio do nada" entre dois telhados). */
function medoide<T extends { lat: number; lng: number }>(pontos: T[]): T {
  if (pontos.length === 1) return pontos[0];
  let melhor = pontos[0];
  let melhorSoma = Infinity;
  for (const p of pontos) {
    let soma = 0;
    for (const q of pontos) soma += distanciaM(p, q);
    if (soma < melhorSoma) { melhorSoma = soma; melhor = p; }
  }
  return melhor;
}

function dispersaoOk(pontos: Array<{ lat: number; lng: number }>, centro: { lat: number; lng: number }, tetoM: number): boolean {
  return pontos.every((p) => distanciaM(p, centro) <= tetoM);
}

/**
 * PORTA — candidatos do MESMO (cep, numero). Puro e testável.
 * Regras: via compatível quando o cadastro tem logradouro (fail-closed); candidatos
 * têm que se AGRUPAR (dispersão ≤ teto — mata a cidade de CEP único); prefere linhas
 * com `nivel_geo=1` (coordenada do próprio endereço no CNEFE).
 */
export function escolherPinoPorta(rows: CnefeRow[], input: CnefeInput): CnefePino | null {
  let candidatos = (Array.isArray(rows) ? rows : []).filter(coordValida);
  if (!candidatos.length) return null;

  const viaPedida = String(input.endereco ?? '').trim();
  if (viaPedida) {
    candidatos = candidatos.filter((r) => viasCompativeis(viaPedida, r.logradouro));
    if (!candidatos.length) return null;
  }

  const precisos = candidatos.filter((r) => Number(r.nivel_geo) === 1);
  const base = precisos.length ? precisos : candidatos;
  const centro = medoide(base as Array<CnefeRow & { lat: number; lng: number }>);
  if (!dispersaoOk(base as Array<{ lat: number; lng: number }>, centro, CNEFE_DISPERSAO_PORTA_M)) return null;

  return { lat: centro.lat as number, lng: centro.lng as number, precisao: 'porta', logradouro: centro.logradouro ?? null, municipio: centro.municipio ?? null };
}

/**
 * RUA — não existe o número exato no CEP: usa o VIZINHO de numeração mais próximo,
 * SÓ com via compatível provada (sem logradouro no cadastro não há fallback — CEP
 * sozinho numa cidade de CEP único é a cidade inteira). `rows` já vem ordenado por
 * |numero - pedido| (ORDER BY no SQL); o vizinho precisa estar a ≤ DELTA de número e
 * os vizinhos próximos precisam se agrupar (rua não pode "pular" de bairro).
 */
export function escolherPinoRua(rows: CnefeRow[], numeroPedido: number, input: CnefeInput): CnefePino | null {
  const viaPedida = String(input.endereco ?? '').trim();
  if (!viaPedida) return null;

  const candidatos = (Array.isArray(rows) ? rows : [])
    .filter(coordValida)
    .filter((r) => typeof r.numero === 'number' && Number.isFinite(r.numero))
    .filter((r) => viasCompativeis(viaPedida, r.logradouro));
  if (!candidatos.length) return null;

  const vizinho = candidatos[0];
  if (Math.abs((vizinho.numero as number) - numeroPedido) > CNEFE_VIZINHO_DELTA_MAX) return null;

  const proximos = candidatos.slice(0, 5) as Array<CnefeRow & { lat: number; lng: number }>;
  if (!dispersaoOk(proximos, vizinho as { lat: number; lng: number }, CNEFE_DISPERSAO_RUA_M)) return null;

  return { lat: vizinho.lat as number, lng: vizinho.lng as number, precisao: 'rua', logradouro: vizinho.logradouro ?? null, municipio: vizinho.municipio ?? null };
}

// ── acesso ao banco (lazy, best-effort, com cooldown de falha) ───────────────────

function cnefeHabilitado(): boolean {
  const v = String(process.env.HBX_CNEFE_ENABLED ?? '').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

function cnefeDatabaseUrl(): string | null {
  const explicita = String(process.env.CNEFE_DATABASE_URL ?? '').trim();
  if (explicita) return explicita;
  const base = String(process.env.DATABASE_URL ?? '').trim();
  if (!/^postgres(ql)?:\/\//i.test(base)) return null;
  try {
    const u = new URL(base);
    u.pathname = '/cnefe';
    return u.toString();
  } catch {
    return null;
  }
}

type CnefeQueryFn = (sql: string, params: unknown[]) => Promise<any[]>;

let clienteCnefe: PrismaClient | null = null;
let indisponivelAte = 0;
const ufStatusCache = new Map<string, { status: string | null; expiraEm: number }>();

// Gancho de teste: substitui a query real (os testes NUNCA abrem conexão).
let queryOverride: CnefeQueryFn | null = null;
export function __setCnefeQueryForTests(fn: CnefeQueryFn | null): void {
  queryOverride = fn;
  ufStatusCache.clear();
  indisponivelAte = 0;
}

async function cnefeQuery(sql: string, params: unknown[]): Promise<any[]> {
  if (queryOverride) return queryOverride(sql, params);
  if (Date.now() < indisponivelAte) throw new Error('cnefe em cooldown');
  const url = cnefeDatabaseUrl();
  if (!url) throw new Error('cnefe sem DATABASE_URL postgres');
  if (!clienteCnefe) {
    clienteCnefe = new PrismaClient({ datasources: { db: { url } } });
  }
  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error('cnefe timeout')), CNEFE_QUERY_TIMEOUT_MS);
    (t as any).unref?.();
  });
  try {
    return (await Promise.race([clienteCnefe.$queryRawUnsafe(sql, ...params), timeout])) as any[];
  } catch (e) {
    indisponivelAte = Date.now() + CNEFE_FALHA_COOLDOWN_MS;
    throw e;
  }
}

/** Status da UF em `cnefe_uf` (cacheado). null = sem linha (nunca pedida). */
async function statusDaUf(uf: string): Promise<string | null> {
  const cache = ufStatusCache.get(uf);
  if (cache && cache.expiraEm > Date.now()) return cache.status;
  const rows = await cnefeQuery('SELECT status FROM cnefe_uf WHERE uf = $1', [uf]);
  const status = rows.length ? String(rows[0].status ?? '') : null;
  ufStatusCache.set(uf, { status, expiraEm: Date.now() + CNEFE_UF_CACHE_TTL_MS });
  return status;
}

/** UF sem carga vira `pendente` — é o que o agendador noturno (20h, America/Sao_Paulo)
 *  lê pra baixar/carregar (rodar-pendentes.sh). Nunca rebaixa status existente. */
async function marcarUfPendente(uf: string): Promise<void> {
  await cnefeQuery(
    "INSERT INTO cnefe_uf (uf, status) VALUES ($1, 'pendente') ON CONFLICT (uf) DO NOTHING",
    [uf],
  );
  ufStatusCache.delete(uf);
}

/**
 * Resolve (cep, numero) → pino pela base CNEFE local. Best-effort: NUNCA lança —
 * qualquer dúvida/falha/UF-sem-carga devolve null e o chamador segue o caminho de
 * sempre (Nominatim/pendência).
 */
export async function resolverCnefe(input: CnefeInput): Promise<CnefePino | null> {
  if (!cnefeHabilitado()) return null;
  const cep = normalizarCep8(input.cep);
  const numero = extrairNumeroPorta({ numero: input.numero == null ? null : String(input.numero), endereco: input.endereco });
  if (!cep || !numero) return null;
  if (!queryOverride && !cnefeDatabaseUrl()) return null;

  try {
    const uf = String(input.uf ?? '').trim().toUpperCase();
    if (UFS_VALIDAS.has(uf)) {
      const status = await statusDaUf(uf);
      if (status !== 'carregada') {
        if (status === null) await marcarUfPendente(uf);
        return null;
      }
    }

    const porta = (await cnefeQuery(
      'SELECT logradouro, numero, lat, lng, nivel_geo, municipio FROM cnefe_endereco ' +
        'WHERE cep = $1 AND numero = $2 AND lat IS NOT NULL AND lng IS NOT NULL LIMIT 200',
      [cep, numero],
    )) as CnefeRow[];
    const pinoPorta = escolherPinoPorta(porta, input);
    if (pinoPorta) return pinoPorta;

    // Fallback de RUA só faz sentido com logradouro no cadastro (ver escolherPinoRua).
    if (!String(input.endereco ?? '').trim()) return null;
    const rua = (await cnefeQuery(
      'SELECT logradouro, numero, lat, lng, nivel_geo, municipio FROM cnefe_endereco ' +
        'WHERE cep = $1 AND numero IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL ' +
        'ORDER BY ABS(numero - $2) ASC LIMIT 40',
      [cep, numero],
    )) as CnefeRow[];
    return escolherPinoRua(rua, numero, input);
  } catch {
    // banco fora/cooldown/URL inválida — silêncio (o Nominatim continua cobrindo).
    return null;
  }
}

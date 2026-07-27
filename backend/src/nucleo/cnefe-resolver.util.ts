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
/** Teto de tempo por consulta — a conferência nunca fica lenta por causa do CNEFE.
 *  4s cobre o connect frio do client logo após deploy (medido 669ms em prod, mas o
 *  1º acesso paga pool init); o orçamento TOTAL da cura na conferência segue 4s. */
const CNEFE_QUERY_TIMEOUT_MS = 4000;
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

// ── numerais por extenso (27/07, incidente company 48 / Rio Claro) ──────────────
// O IBGE grava a via POR EXTENSO ("RUA OITO", "AVENIDA OITENTA E QUATRO") e o
// cadastro grava em dígito ("Rua 8", "Av. 84"). O veto de via herdado do freio
// Nominatim reprovava a cidade INTEIRA de rua numerada — 0 curas numa base com 50
// endereços perfeitos. Aqui a prova de identidade é o (CEP, número) — o CEP já
// aponta o logradouro oficial — então a comparação converte numeral↔dígito nos
// DOIS lados e aí sim aplica a MESMA régua de palavra inteira ("rua 8" ≠ "rua 80";
// "rua 1" ≠ "rua 12" continuam valendo). O freio do Nominatim NÃO muda: lá a via
// vem de busca por NOME (ambígua por natureza), aqui vem do CEP (unívoca).
const NUMERAL_PT: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
  mil: 1000,
};

/** "avenida oitenta e quatro" → "avenida 84" · "rua oito" → "rua 8". Hífen vira
 *  espaço ("M-47" ↔ "M QUARENTA E SETE"). Palavra não-numeral passa intacta. */
export function normalizarViaNumeral(valor: string | null | undefined): string {
  const tokens = String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const saida: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!(tokens[i] in NUMERAL_PT)) {
      saida.push(tokens[i]);
      i += 1;
      continue;
    }
    // Grupo numeral: soma "mil/cento e vinte e dois"; o "e" só é consumido
    // entre dois numerais (senão volta pra saída como palavra comum).
    let total = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token in NUMERAL_PT) {
        const v = NUMERAL_PT[token];
        total = v === 1000 && total > 0 ? total * 1000 : total + v;
        i += 1;
        continue;
      }
      if (token === 'e' && i + 1 < tokens.length && tokens[i + 1] in NUMERAL_PT) {
        i += 1;
        continue;
      }
      break;
    }
    saida.push(String(total));
  }
  return saida.join(' ');
}

const TIPOS_VIA_CANONICO: Record<string, string> = {
  av: 'av', avn: 'av', avd: 'av', avenida: 'av',
  r: 'rua', rua: 'rua',
  tv: 'travessa', trav: 'travessa', travessa: 'travessa',
  rod: 'rodovia', rodovia: 'rodovia',
  est: 'estrada', estr: 'estrada', estrada: 'estrada',
  al: 'alameda', alameda: 'alameda',
  pc: 'praca', pca: 'praca', praca: 'praca',
};

/** TIPO + NÚMERO da via ("Av. 84" → av/84; "AVENIDA SETENTA E OITO BV" → av/78;
 *  "Rua 8, 3604 - Alto" → rua/8, nunca o 3604 da casa): primeiro token só-dígitos
 *  até 3 posições depois do tipo. null quando a via não é numerada. */
export function viaTipoNumero(valor: string | null | undefined): { tipo: string; numero: number } | null {
  const tokens = normalizarViaNumeral(valor).split(' ').filter(Boolean);
  const tipoIdx = tokens.findIndex((t) => t in TIPOS_VIA_CANONICO);
  if (tipoIdx === -1) return null;
  for (let i = tipoIdx + 1; i < Math.min(tokens.length, tipoIdx + 4); i++) {
    if (/^\d{1,4}$/.test(tokens[i])) return { tipo: TIPOS_VIA_CANONICO[tokens[tipoIdx]], numero: Number(tokens[i]) };
  }
  return null;
}

/**
 * Comparação de via do RESOLVER CNEFE: numeral por extenso vira dígito nos dois
 * lados e aí (a) a régua de palavra inteira de sempre (viasCompativeis) OU (b) via
 * NUMERADA com o MESMO tipo e MESMO número ("Av. 78" ↔ "AVENIDA SETENTA E OITO BV"
 * — o sufixo de bairro do IBGE quebrava a contenção; dentro de um CEP o par
 * tipo+número é unívoco). "rua 8" ≠ "rua 80" e "travessa 8" ≠ "rua 8" seguem de pé.
 */
function viasCompativeisCnefe(pedida: string | null | undefined, candidata: string | null | undefined): boolean {
  const a = normalizarViaNumeral(pedida);
  const b = normalizarViaNumeral(candidata);
  if (viasCompativeis(a, b)) return true;
  const viaA = viaTipoNumero(a);
  const viaB = viaTipoNumero(b);
  return viaA !== null && viaB !== null && viaA.tipo === viaB.tipo && viaA.numero === viaB.numero;
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
    candidatos = candidatos.filter((r) => viasCompativeisCnefe(viaPedida, r.logradouro));
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
    .filter((r) => viasCompativeisCnefe(viaPedida, r.logradouro));
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

function comTimeout<T>(promessa: Promise<T>, ms: number, rotulo: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error(rotulo)), ms);
    (t as any).unref?.();
  });
  return Promise.race([promessa, timeout]);
}

// 27/07 (incidente company 48) — o CONNECT frio do client (engine + pool, logo após
// deploy/1º uso) estourava o teto de consulta e derrubava a cura inteira no cooldown.
// Agora o connect é explícito, pago UMA vez com teto próprio folgado; a consulta em si
// segue com o teto curto de sempre. O connect em voo é compartilhado (sem corrida).
const CNEFE_CONNECT_TIMEOUT_MS = 15000;
let conexaoCnefe: Promise<void> | null = null;

async function cnefeQuery(sql: string, params: unknown[], timeoutMs = CNEFE_QUERY_TIMEOUT_MS): Promise<any[]> {
  if (queryOverride) return queryOverride(sql, params);
  if (Date.now() < indisponivelAte) throw new Error('cnefe em cooldown');
  const url = cnefeDatabaseUrl();
  if (!url) throw new Error('cnefe sem DATABASE_URL postgres');
  if (!clienteCnefe) {
    clienteCnefe = new PrismaClient({ datasources: { db: { url } } });
  }
  try {
    if (!conexaoCnefe) conexaoCnefe = clienteCnefe.$connect();
    await comTimeout(conexaoCnefe, CNEFE_CONNECT_TIMEOUT_MS, 'cnefe connect timeout');
    return (await comTimeout(clienteCnefe.$queryRawUnsafe(sql, ...params), timeoutMs, 'cnefe timeout')) as any[];
  } catch (e) {
    const msg = String((e as any)?.message || e);
    // 27/07 (2º incidente company 48, 14:30) — timeout de UMA consulta (cache frio de
    // disco pós-deploy no índice de 23M linhas) NÃO é banco quebrado: a mesma consulta
    // sai quente logo depois. Cooldown de 60s só pra falha de conexão/banco; envenenar
    // o resolver inteiro por 1 consulta lenta matou a cura na cara do dono ("0 de 1").
    if (msg !== 'cnefe timeout') {
      indisponivelAte = Date.now() + CNEFE_FALHA_COOLDOWN_MS;
      conexaoCnefe = null; // connect quebrado não pode ficar cacheado como "em voo"
      console.warn(`[cnefe] base indisponível (cooldown ${CNEFE_FALHA_COOLDOWN_MS / 1000}s): ${msg}`);
    } else {
      console.warn(`[cnefe] consulta estourou ${timeoutMs}ms (sem cooldown — próxima sai quente): ${msg}`);
    }
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
export async function resolverCnefe(
  input: CnefeInput,
  opts?: { queryTimeoutMs?: number },
): Promise<CnefePino | null> {
  if (!cnefeHabilitado()) return null;
  const cep = normalizarCep8(input.cep);
  const numero = extrairNumeroPorta({ numero: input.numero == null ? null : String(input.numero), endereco: input.endereco });
  if (!cep || !numero) return null;
  if (!queryOverride && !cnefeDatabaseUrl()) return null;
  const timeoutMs = opts?.queryTimeoutMs ?? CNEFE_QUERY_TIMEOUT_MS;

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
      timeoutMs,
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
      timeoutMs,
    )) as CnefeRow[];
    return escolherPinoRua(rua, numero, input);
  } catch {
    // banco fora/cooldown/URL inválida — silêncio (o Nominatim continua cobrindo).
    return null;
  }
}

/**
 * Aquecimento pós-deploy (27/07, 2º incidente company 48): a PRIMEIRA consulta depois
 * do boot paga cache frio de disco no índice de 23M linhas e estourava o teto
 * interativo — a cura da conferência morria com "0 de N" na cara do usuário. Chamado
 * no boot do módulo da conferência (fire-and-forget): conecta e toca cnefe_uf + o
 * índice (cep, numero) com teto folgado. Falha aqui é silêncio — é só aquecimento.
 */
export async function aquecerCnefe(): Promise<void> {
  if (!cnefeHabilitado()) return;
  if (!queryOverride && !cnefeDatabaseUrl()) return;
  try {
    await cnefeQuery('SELECT status FROM cnefe_uf LIMIT 1', [], 30000);
    await cnefeQuery(
      'SELECT 1 FROM cnefe_endereco WHERE cep = $1 AND numero = $2 LIMIT 1',
      ['01001000', 1],
      30000,
    );
  } catch {
    // best-effort: sem base/banco fora, o caminho normal segue cobrindo.
  }
}

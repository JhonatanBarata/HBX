/**
 * BUSCA DA PARADA AVULSA — F1, a consulta única de 3 fontes (peça PURA).
 * Plano: docs/PLANEJAMENTOS/PR12082026-PESQUISA-PAINEL-AVULSA.md (§visão, F1).
 *
 * UMA busca, TRÊS fontes, TODAS locais — zero Nominatim, zero Google no digitar:
 *   👤 clientes   → "CustomerProfile"."searchName" (unaccent) + pg_trgm (fuzzy)
 *   📍 endereços  → banco `cnefe` (agregados: cnefe_via / cnefe_porta_any / cnefe_mun*)
 *   🏪 comércios  → RFB "CnpjPublicCompany"."searchText" (GIN trgm JÁ EXISTENTE,
 *                   4 GB em produção) × "CnpjGeo" (pino; cobre SP hoje)
 *
 * Este arquivo é a REGRA em forma testável, no MESMO molde do
 * `prospector-corredor.sql.ts`: normalizações, limiares e o texto de cada
 * consulta nascem AQUI — o serviço (`logistica-busca.service.ts`) só orquestra,
 * e a prova (`scripts/prova-busca-avulsa.js`) roda ESTES mesmos SQLs (via dist)
 * contra o banco do VPS. Nada de segunda cópia da query escrita à mão.
 *
 * LIMIARES MEDIDOS em produção (12/08/2026, VPS):
 *   word_similarity('mracia','marcia')            = 0.2857  → cliente ≥ 0.25
 *   word_similarity('mracia','jorge / marcia')    = 0.2857  → idem (nome composto)
 *   word_similarity('bar do ze', searchText real) = 1.0
 *   word_similarity('mercad','supermercado ...')  = 0.5714  → comércio ≥ 0.40
 *   (o default do pg_trgm é 0.6 — REPROVARIA o caso do plano "Mracia"→Márcia;
 *    por isso o limiar é explícito aqui, nunca o default do banco.)
 *
 * POR QUE cada fonte usa um caminho de índice diferente (regra: NUNCA varrer
 * 28M sem escopo):
 *   · clientes:  o filtro `companyId` (btree companyId+searchName) reduz a
 *     centenas de linhas por tenant — similarity nelas custa <1 ms. O GIN
 *     trgm em searchName (migration desta frente) é reserva pra tenant grande.
 *   · endereços: `cnefe_via` tem PK (cod_municipio, via_canon) — escopado por
 *     município sobram ~poucos milhares de vias. O GIN trgm em via_canon
 *     (agregados.sql) é reforço do fuzzy.
 *   · comércios: escopo por (normalizedCity, state) — índice composto — E o
 *     operador `<%` (word_similarity indexado pelo GIN trgm de searchText).
 *     O limiar do `<%` vem por SET LOCAL na MESMA transação (ver serviço).
 */

import {
  CNEFE_DISPERSAO_PORTA_M,
  CNEFE_DISPERSAO_RUA_M,
  CNEFE_VIZINHO_DELTA_MAX,
  normalizarViaNumeral,
} from '../nucleo/cnefe-resolver.util';
import { normalizeSearch } from '../nucleo/nucleo-search.util';
import { METROS_POR_GRAU_LAT, METROS_POR_GRAU_LNG } from './prospector-corredor.sql';

// ---------------------------------------------------------------------------
// Constantes (cada número com o porquê)
// ---------------------------------------------------------------------------

/** Itens por grupo. O painel mostra 3 grupos — 6×3 = 18 cartões já é rolagem. */
export const BUSCA_LIMITE_GRUPO = 6;
/** Menos de 2 caracteres não é busca, é ruído de tecla — grupos vazios, 200. */
export const BUSCA_MIN_CHARS = 2;

/** Fuzzy de CLIENTE — 0.25 pega 'mracia'→'marcia' (0.2857 medido). */
export const FUZZY_CLIENTE_MIN = 0.25;
/** Fuzzy de COMÉRCIO (`<%` no GIN da RFB) — 0.40 pega 'mercad' (0.57 medido)
 *  sem abrir a porteira que o default 0.6 fecha demais e 0.2 abriria demais. */
export const FUZZY_COMERCIO_MIN = 0.4;
/** Fuzzy de VIA — 0.40: via é string curta, abaixo disso vira loteria. */
export const FUZZY_VIA_MIN = 0.4;

/** Fator de proximidade = 1/(1 + dist/2000): vale 1.0 na porta, 0.5 a 2 km. */
export const PROX_MEIA_M = 2000;
/** Piso do fator — cliente/loja longe cai na lista, mas não DESAPARECE:
 *  quem manda primeiro é o NOME (é busca, não radar). */
export const PROX_PISO = 0.25;
/** Comércio SEM pino confiável (nivelGeo>2 ou sem CnpjGeo) quando HÁ GPS na
 *  query: fator fixo equivalente a ~1,6 km — não ganha de quem está na esquina,
 *  não morre atrás de quem está do outro lado da cidade. */
export const PROX_SEM_PINO = 0.55;

/** Recência de entrega: quem recebeu nos últimos 30d é quase certeza de ser
 *  "o" cliente procurado (1.25×); 90d ainda ajuda (1.1×); depois, neutro. */
export const RECENCIA_BONUS_30D = 1.25;
export const RECENCIA_BONUS_90D = 1.1;

/** Caixa de ~2,2 km pra achar o município pela porta do Censo mais próxima. */
export const MUNICIPIO_CAIXA_GRAUS = 0.02;

// ---------------------------------------------------------------------------
// Normalizações — cada uma casa com a escrita da SUA fonte
// ---------------------------------------------------------------------------

/** Busca de CLIENTE: a MESMA régua do write-path de `searchName`
 *  (nucleo-search.util#normalizeSearch) + espaço único (digitação corrida). */
export function normalizarBuscaCliente(q: string | null | undefined): string {
  return normalizeSearch(q).replace(/\s+/g, ' ').trim();
}

/** Busca de COMÉRCIO: espelha `normalizeText` de scripts/import-cnpj-dataset.js
 *  (quem grava `searchText`/`normalizedCity` na carga da RFB). Não dá pra
 *  importar de lá (é script JS de carga) — mudou lá, muda aqui no MESMO commit. */
export function normalizarBuscaTexto(q: string | null | undefined): string {
  return String(q ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tipo de via → forma CANÔNICA do banco `cnefe`. ⚠️ DUAS PONTAS: esta tabela
 * espelha o `norm_via()` de backend/scripts/cnefe/agregados.sql (que gera
 * `via_canon` = canon_via(norm_via(x))). Mudou lá, muda aqui no MESMO commit —
 * senão a busca passa a não achar nada, calada (mesmo aviso do agregados.sql).
 */
const TIPO_VIA_CANON_DB: Record<string, string> = {
  av: 'av', avn: 'av', avd: 'av', avenida: 'av',
  r: 'rua', rua: 'rua',
  tv: 'travessa', trav: 'travessa', travessa: 'travessa',
  rod: 'rodovia', rodovia: 'rodovia',
  est: 'estrada', estr: 'estrada', estrada: 'estrada',
  al: 'alameda', alameda: 'alameda',
  pc: 'praca', pca: 'praca', praca: 'praca',
};

/**
 * O texto digitado na forma `via_canon` do banco: "Av. Oitenta e Quatro" →
 * "av 84" · "Rua 08" → "rua 8". Reusa `normalizarViaNumeral` (a régua de
 * numeral↔dígito que já cura cadastro) e aplica o prefixo canônico + corte de
 * zero à esquerda (o `canon_via` do banco faz o mesmo).
 */
export function viaCanonDaBusca(valor: string | null | undefined): string {
  const tokens = normalizarViaNumeral(valor)
    .split(' ')
    .filter(Boolean)
    .map((t) => t.replace(/^0+(\d)/, '$1'));
  if (tokens.length && tokens[0] in TIPO_VIA_CANON_DB) tokens[0] = TIPO_VIA_CANON_DB[tokens[0]];
  return tokens.join(' ');
}

/** Escapa %, _ e \ pra uso em LIKE ... ESCAPE '\' (texto do usuário NUNCA
 *  entra cru num padrão). */
export function escaparLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Guarda das constantes interpoladas no SQL: só NÚMERO finito entra no texto
 *  (mesma postura do regexCestaSql do prospector — interpolação provada segura). */
function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Constante não-numérica no SQL da busca: ${n}`);
  return String(n);
}

export type SqlPronto = { sql: string; params: unknown[] };

/** Distância em METROS via equirectangular (mesmas constantes do corredor do
 *  prospector — sem PostGIS neste cluster). `latCol`/`lngCol` são nomes de
 *  coluna DESTE arquivo, nunca entrada de usuário. */
function distSql(latCol: string, lngCol: string, pLat: string, pLng: string): string {
  return `sqrt(((${latCol} - ${pLat}) * ${num(METROS_POR_GRAU_LAT)}) ^ 2 + ((${lngCol} - ${pLng}) * ${num(METROS_POR_GRAU_LNG)}) ^ 2)`;
}

// ---------------------------------------------------------------------------
// 👤 GRUPO 1 — MEUS CLIENTES (banco principal, multi-tenant SEMPRE)
// ---------------------------------------------------------------------------

/**
 * Ranking: similaridade × proximidade × recência de entrega.
 *
 * 🔴 A RECÊNCIA É A MESMA RÉGUA de logistica-ultima-entrega.util.ts
 * (`ultimaEntregaPorCliente`), reescrita em SQL DE PROPÓSITO — aquele arquivo é
 * lote não commitado de outra sessão viva (12/08) e importá-lo agora acoplaria
 * este commit ao dele. O predicado é IDÊNTICO e não pode divergir:
 *   status = 'entregue' AND "deliveredAt" IS NOT NULL, MAX por cliente,
 *   escopado por companyId. Mudou lá, muda aqui no MESMO commit.
 *
 * Multi-tenant: `companyId` entra no CTE de recência E no WHERE do cliente —
 * nada atravessa empresa. `isCliente = true` = a mesma porta "Meus clientes"
 * que o app já usa (lead não aparece na busca de entrega).
 */
export function sqlBuscaClientes(args: {
  companyId: number;
  q: string;
  lat: number | null;
  lng: number | null;
}): SqlPronto {
  const qNorm = normalizarBuscaCliente(args.q);
  const qLike = `%${escaparLike(qNorm)}%`;
  const sql = `
    WITH ult AS (
      SELECT e."customerProfileId" AS cid, MAX(e."deliveredAt") AS quando
        FROM "Entrega" e
       WHERE e."companyId" = $1
         AND e."status" = 'entregue'
         AND e."deliveredAt" IS NOT NULL
       GROUP BY 1
    ), cand AS (
      SELECT cp."id", cp."name", cp."endereco", cp."numero", cp."bairro",
             cp."cidade", cp."uf", cp."cep", cp."lat", cp."lng", u.quando,
             GREATEST(similarity(cp."searchName", $2), word_similarity($2, cp."searchName")) AS sim,
             CASE WHEN $4::float8 IS NULL OR cp."lat" IS NULL OR cp."lng" IS NULL THEN NULL
                  ELSE ${distSql('cp."lat"', 'cp."lng"', '$4::float8', '$5::float8')}
             END AS dist_m
        FROM "CustomerProfile" cp
        LEFT JOIN ult u ON u.cid = cp."id"
       WHERE cp."companyId" = $1
         AND cp."isCliente" = true
         AND cp."searchName" IS NOT NULL
         AND (cp."searchName" LIKE $3 ESCAPE '\\'
           OR word_similarity($2, cp."searchName") >= ${num(FUZZY_CLIENTE_MIN)})
    )
    SELECT *,
           sim
           * (CASE WHEN dist_m IS NULL THEN 1.0
                   ELSE GREATEST(${num(PROX_PISO)}, 1.0 / (1.0 + dist_m / ${num(PROX_MEIA_M)}.0)) END)
           * (CASE WHEN quando IS NULL THEN 1.0
                   WHEN quando >= now() - interval '30 days' THEN ${num(RECENCIA_BONUS_30D)}
                   WHEN quando >= now() - interval '90 days' THEN ${num(RECENCIA_BONUS_90D)}
                   ELSE 1.0 END) AS score
      FROM cand
     ORDER BY score DESC, "name" ASC NULLS LAST
     LIMIT ${num(BUSCA_LIMITE_GRUPO)}
  `;
  return { sql, params: [args.companyId, qNorm, qLike, args.lat, args.lng] };
}

// ---------------------------------------------------------------------------
// Escopo geográfico — posição → município (banco cnefe), com degrade honesto
// ---------------------------------------------------------------------------

/** A porta do Censo mais próxima diz o município REAL da posição (borda de
 *  cidade não engana centroide). Usa idx_cnefe_porta_lat (bbox ~2,2 km). */
export function sqlMunicipioPorPosicao(lat: number, lng: number): SqlPronto {
  const d = MUNICIPIO_CAIXA_GRAUS;
  const sql = `
    SELECT cod_municipio FROM cnefe_porta
     WHERE lat BETWEEN $1::float8 - ${num(d)} AND $1::float8 + ${num(d)}
       AND lng BETWEEN $2::float8 - ${num(d)} AND $2::float8 + ${num(d)}
     ORDER BY (lat - $1::float8) * (lat - $1::float8) + (lng - $2::float8) * (lng - $2::float8) ASC
     LIMIT 1
  `;
  return { sql, params: [lat, lng] };
}

/** Zona rural sem porta na caixa → centroide de município (645 linhas, seq
 *  scan barato). É aproximação e se apresenta como tal. */
export function sqlMunicipioPorCentroide(lat: number, lng: number): SqlPronto {
  const sql = `
    SELECT cod_municipio FROM cnefe_mun
     ORDER BY (lat - $1::float8) * (lat - $1::float8) + (lng - $2::float8) * (lng - $2::float8) ASC
     LIMIT 1
  `;
  return { sql, params: [lat, lng] };
}

/** Sem GPS: o município vem da CIDADE MODAL dos clientes do tenant (degrade
 *  honesto do plano — sem ranking de distância, sem quebrar). */
export function sqlMunicipioPorCidade(uf: string, cityNorm: string): SqlPronto {
  return {
    sql: `SELECT cod_municipio FROM cnefe_mun_map WHERE uf = $1 AND city_norm = $2 LIMIT 1`,
    params: [uf, cityNorm],
  };
}

/** município → (uf, cidade normalizada) — é o que escopa a RFB. 645 linhas. */
export function sqlCidadeDoMunicipio(codMunicipio: string): SqlPronto {
  return {
    sql: `SELECT uf, city_norm FROM cnefe_mun_map WHERE cod_municipio = $1 LIMIT 1`,
    params: [codMunicipio],
  };
}

/** Cidade modal dos clientes do tenant (banco principal, company-scoped). */
export function sqlCidadeModalDoTenant(companyId: number): SqlPronto {
  const sql = `
    SELECT cp."cidade", cp."uf", count(*) AS total
      FROM "CustomerProfile" cp
     WHERE cp."companyId" = $1
       AND cp."cidade" IS NOT NULL AND btrim(cp."cidade") <> ''
       AND cp."uf" IS NOT NULL AND btrim(cp."uf") <> ''
     GROUP BY 1, 2
     ORDER BY 3 DESC
     LIMIT 1
  `;
  return { sql, params: [companyId] };
}

// ---------------------------------------------------------------------------
// 📍 GRUPO 2 — ENDEREÇOS (banco cnefe, escopado por município)
// ---------------------------------------------------------------------------

/**
 * Prefixo + distância (plano F1). Ordem de força do casamento:
 *   exata ("rua 8" = "rua 8") > prefixo de palavra ("rua 8 %", pega "rua 8 jp"
 *   sem pegar "rua 80") > prefixo cru (digitação no meio da palavra) > fuzzy.
 * `'% ' || q` cobre quem digita só o número ("84" acha "av 84").
 * O pino é o da VIA (mediana do trecho) — o número vira porta na `busca/porta`.
 */
export function sqlBuscaVias(args: {
  codMunicipio: string;
  q: string;
  lat: number | null;
  lng: number | null;
}): SqlPronto {
  const qCanon = viaCanonDaBusca(args.q);
  const qLike = escaparLike(qCanon);
  const sql = `
    SELECT v.via_canon AS via, v.lat, v.lng, btrim(v.cep) AS cep, v.n, v.spread_m,
           (v.via_canon = $2) AS exata,
           GREATEST(similarity(v.via_canon, $2), word_similarity($2, v.via_canon)) AS sim,
           CASE WHEN $4::float8 IS NULL OR v.lat IS NULL OR v.lng IS NULL THEN NULL
                ELSE ${distSql('v.lat', 'v.lng', '$4::float8', '$5::float8')}
           END AS dist_m
      FROM cnefe_via v
     WHERE v.cod_municipio = $1
       AND (v.via_canon LIKE $3 || '%' ESCAPE '\\'
         OR v.via_canon LIKE '% ' || $3 || '%' ESCAPE '\\'
         OR word_similarity($2, v.via_canon) >= ${num(FUZZY_VIA_MIN)})
     ORDER BY (v.via_canon = $2) DESC,
              (v.via_canon LIKE $3 || ' %' ESCAPE '\\') DESC,
              (v.via_canon LIKE $3 || '%' ESCAPE '\\') DESC,
              sim DESC,
              dist_m ASC NULLS LAST,
              v.n DESC
     LIMIT ${num(BUSCA_LIMITE_GRUPO)}
  `;
  return { sql, params: [args.codMunicipio, qCanon, qLike, args.lat, args.lng] };
}

// ---------------------------------------------------------------------------
// 🏪 GRUPO 3 — COMÉRCIOS (RFB 28M, NUNCA sem escopo)
// ---------------------------------------------------------------------------

/**
 * Escopo obrigatório (normalizedCity, state) ANTES de qualquer ranking — sem
 * cidade resolvida este SQL nem é montado (o serviço devolve grupo vazio).
 * `$3 <% "searchText"` é o word_similarity INDEXADO pelo GIN trgm de 4 GB que
 * a carga da RFB já mantém; o limiar (FUZZY_COMERCIO_MIN) entra por
 * `SET LOCAL pg_trgm.word_similarity_threshold` NA MESMA transação (serviço) —
 * o default 0.6 do banco reprovaria 'mercad' (0.57 medido).
 * Distância só com pino confiável (nivelGeo ≤ 2 — a régua do CnpjGeo: 1=porta,
 * 2=rua; 3-4 é bairro/cidade e mentiria metros pro motorista).
 */
export function sqlBuscaComercios(args: {
  cityNorm: string;
  uf: string;
  q: string;
  lat: number | null;
  lng: number | null;
}): SqlPronto {
  const qNorm = normalizarBuscaTexto(args.q);
  const sql = `
    SELECT * FROM (
      SELECT c."cnpj",
             COALESCE(NULLIF(BTRIM(c."nomeFantasia"), ''), c."razaoSocial") AS nome,
             c."address" AS endereco, c."city" AS cidade, c."state" AS uf,
             c."cnae", c."cnaeDescription" AS "cnaeDescricao",
             g."lat" AS lat, g."lng" AS lng, g."nivelGeo" AS "nivelGeo", g."cep" AS cep,
             word_similarity($3, c."searchText") AS sim,
             CASE WHEN $4::float8 IS NULL OR g."lat" IS NULL OR g."lng" IS NULL OR g."nivelGeo" > 2 THEN NULL
                  ELSE ${distSql('g."lat"', 'g."lng"', '$4::float8', '$5::float8')}
             END AS dist_m
        FROM "CnpjPublicCompany" c
        LEFT JOIN "CnpjGeo" g ON g."cnpj" = c."cnpj"
       WHERE c."normalizedCity" = $1
         AND c."state" = $2
         AND c."situacao" = 'ativa'
         AND $3 <% c."searchText"
    ) cand
    CROSS JOIN LATERAL (
      SELECT cand.sim
             * (CASE WHEN $4::float8 IS NULL THEN 1.0
                     WHEN cand.dist_m IS NULL THEN ${num(PROX_SEM_PINO)}
                     ELSE GREATEST(${num(PROX_PISO)}, 1.0 / (1.0 + cand.dist_m / ${num(PROX_MEIA_M)}.0)) END) AS score
    ) s
    ORDER BY s.score DESC, cand."cnpj" ASC
    LIMIT ${num(BUSCA_LIMITE_GRUPO)}
  `;
  return { sql, params: [args.cityNorm, args.uf, qNorm, args.lat, args.lng] };
}

// ---------------------------------------------------------------------------
// O PASSO DO NÚMERO — busca/porta (consumido pela F2)
// ---------------------------------------------------------------------------

export function sqlPortaExata(codMunicipio: string, viaCanon: string, numero: number): SqlPronto {
  return {
    sql: `SELECT numero, lat, lng, btrim(cep) AS cep, n, spread_m, cnefe_nivel
            FROM cnefe_porta_any
           WHERE cod_municipio = $1 AND via_canon = $2 AND numero = $3
           LIMIT 1`,
    params: [codMunicipio, viaCanon, numero],
  };
}

export function sqlPortaVizinhos(codMunicipio: string, viaCanon: string, numero: number): SqlPronto {
  return {
    sql: `SELECT numero, lat, lng, btrim(cep) AS cep, n, spread_m, cnefe_nivel
            FROM cnefe_porta_any
           WHERE cod_municipio = $1 AND via_canon = $2 AND numero IS NOT NULL
           ORDER BY ABS(numero - $3) ASC
           LIMIT 5`,
    params: [codMunicipio, viaCanon, numero],
  };
}

/** Pino da via inteira (S/N ou "confere na tela") — a linha de cnefe_via. */
export function sqlPinoDaVia(codMunicipio: string, viaCanon: string): SqlPronto {
  return {
    sql: `SELECT lat, lng, btrim(cep) AS cep, n, spread_m
            FROM cnefe_via
           WHERE cod_municipio = $1 AND via_canon = $2
           LIMIT 1`,
    params: [codMunicipio, viaCanon],
  };
}

export type PortaRow = {
  numero: number | null;
  lat: number | null;
  lng: number | null;
  cep: string | null;
  n: number | null;
  spread_m: number | null;
  cnefe_nivel: number | null;
};

export type PortaEscolhida = {
  precisao: 'porta' | 'rua';
  numero: number;
  lat: number;
  lng: number;
  cep: string | null;
};

/**
 * Escolhe a porta com as MESMAS leis do resolver de cadastro (fail-closed —
 * pino errado é pior que pino vazio):
 *   · porta exata só com dispersão ≤ CNEFE_DISPERSAO_PORTA_M (250 m) — mata a
 *     cidade de CEP/via única onde o mesmo número existe em bairros diferentes;
 *   · vizinho de número só a ≤ CNEFE_VIZINHO_DELTA_MAX (200) de numeração e
 *     dispersão ≤ CNEFE_DISPERSAO_RUA_M (400 m), rotulado 'rua';
 *   · nada disso → null ("não sei" honesto; o app cai no pino da via).
 */
export function escolherPortaDaBusca(
  exata: PortaRow[],
  vizinhos: PortaRow[],
  numeroPedido: number,
): PortaEscolhida | null {
  const valida = (r: PortaRow | undefined): r is PortaRow & { lat: number; lng: number } =>
    !!r && typeof r.lat === 'number' && typeof r.lng === 'number' &&
    Number.isFinite(r.lat) && Number.isFinite(r.lng) && !(r.lat === 0 && r.lng === 0);

  const p = (Array.isArray(exata) ? exata : []).find(valida);
  if (p && (p.spread_m == null || p.spread_m <= CNEFE_DISPERSAO_PORTA_M)) {
    return { precisao: 'porta', numero: Number(p.numero ?? numeroPedido), lat: p.lat, lng: p.lng, cep: p.cep ?? null };
  }
  for (const v of Array.isArray(vizinhos) ? vizinhos : []) {
    if (!valida(v) || typeof v.numero !== 'number') continue;
    if (Math.abs(v.numero - numeroPedido) > CNEFE_VIZINHO_DELTA_MAX) break; // ordenado por |Δ|
    if (v.spread_m != null && v.spread_m > CNEFE_DISPERSAO_RUA_M) continue;
    return { precisao: 'rua', numero: v.numero, lat: v.lat, lng: v.lng, cep: v.cep ?? null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validações de entrada (o controller usa; puras pra prova cobrar)
// ---------------------------------------------------------------------------

/** lat/lng do query-string → número válido ou null (nunca NaN pra dentro). */
export function coordDaQuery(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  if (n < -180 || n > 180) return null;
  return n;
}

/** Par de coordenadas utilizável? (os dois presentes, não-zero-zero). */
export function parGpsValido(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && !(lat === 0 && lng === 0) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

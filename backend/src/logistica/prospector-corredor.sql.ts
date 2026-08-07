import { Prisma } from '@prisma/client';

/**
 * PROSPECTOR CNPJ — F0, o CORREDOR da rota (peça PURA).
 * Plano: docs/PLANEJAMENTOS/PR07082026-PROSPECTOR-CNPJ.md (§0, §1, §2, F0).
 *
 * Este arquivo é a REGRA em forma testável: conversão metros→graus, a cesta de
 * CNAE "sede de água", o ranqueamento, o cap de embarque e o texto da consulta.
 * O serviço (`prospector-corredor.service.ts`) só orquestra — assim a prova do
 * ranqueamento e da cesta não precisa de banco.
 *
 * REGRA DE OURO DAQUI: a cesta e o ranking existem UMA vez (as constantes
 * abaixo). O SQL é GERADO a partir delas — nunca uma segunda cópia da lista
 * escrita à mão dentro da query, que é como as duas metades divergem em
 * silêncio depois de três sprints.
 *
 * A receita foi MEDIDA em produção (07/08, company 41, 27 paradas):
 * 1.513 pinos nível 1-2 a ≤150 m → 1.428 ativos → 463 na cesta, em ~0,5 s.
 * O bbox (BETWEEN em lat/lng) vem ANTES do cálculo de distância de propósito:
 * é ele que usa o `CnpjGeo @@index([lat, lng])`. Não existe PostGIS neste
 * cluster (conferido em pg_available_extensions) — sem o bbox a consulta vira
 * varredura da tabela inteira.
 */

// ---------------------------------------------------------------------------
// Constantes de conversão e clamps
// ---------------------------------------------------------------------------

/** Metros por grau de LATITUDE (constante no globo). */
export const METROS_POR_GRAU_LAT = 111320.0;
/**
 * Metros por grau de LONGITUDE na latitude de São Paulo (~-22°). É aproximação
 * (cos(22°) × 111320 ≈ 103.230) e foi a usada na medição de produção — mantida
 * IGUAL de propósito: mudar a constante muda o raio efetivo sem ninguém ver.
 */
export const METROS_POR_GRAU_LNG = 102920.0;

export const RAIO_PADRAO_M = 150;
export const RAIO_MIN_M = 50;
export const RAIO_MAX_M = 500;

export const MAX_DIA_PADRAO = 4;
export const MAX_DIA_MIN = 1;
export const MAX_DIA_MAX = 8;

/**
 * Teto de paradas aceitas numa chamada. Uma rota real tem dezenas; este número
 * existe só pra impedir que uma folha corrompida gere uma query de 100 mil
 * parâmetros (o Postgres estoura em 65535).
 */
export const MAX_PARADAS = 500;

export type ParadaCoord = { lat: number; lng: number };

export type LinhaCorredor = {
  cnpj: string;
  nome: string | null;
  cnae: string | null;
  cnaeDescricao: string | null;
  porte: string | null;
  phoneDigits: string | null;
  lat: number;
  lng: number;
  distM: number;
  afinidade: boolean;
};

export type ProspectoCorredor = {
  cnpj: string;
  nome: string;
  cnae: string | null;
  cnaeDescricao: string | null;
  porte: string | null;
  phoneDigits: string | null;
  lat: number;
  lng: number;
  distM: number;
  afinidade: boolean;
};

/**
 * ⚠️ AUSENTE ≠ PEQUENO. `null`/`undefined`/'' caem no PADRÃO; só um número de
 * verdade é clampado. Sem esta guarda, `Number(null)` vale 0 e o clamp devolvia
 * o MÍNIMO — `prospectorRaioM` nulo (que é o estado de toda empresa antes de o
 * admin abrir os Ajustes) encolheria o corredor de 150 m pra 50 m em silêncio,
 * e o teto do dia de 4 pra 1. Defeito achado pelo teste, não em produção.
 */
function clampInt(valor: unknown, min: number, max: number, padrao: number): number {
  if (valor === null || valor === undefined || valor === '') return padrao;
  const n = Math.round(Number(valor));
  if (!Number.isFinite(n)) return padrao;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function clampRaioM(valor: unknown): number {
  return clampInt(valor, RAIO_MIN_M, RAIO_MAX_M, RAIO_PADRAO_M);
}

export function clampMaxDia(valor: unknown): number {
  return clampInt(valor, MAX_DIA_MIN, MAX_DIA_MAX, MAX_DIA_PADRAO);
}

/**
 * Metros → graus. É a conversão que o bbox usa dos dois lados da parada.
 * O raio entra CLAMPADO: 500 m é o teto do plano (F0), e sem clamp um
 * `prospectorRaioM` bobo (50 km) viraria varredura de meia RFB.
 */
export function metrosParaGraus(raioM: unknown): { raioM: number; dLat: number; dLng: number } {
  const raio = clampRaioM(raioM);
  return {
    raioM: raio,
    dLat: raio / METROS_POR_GRAU_LAT,
    dLng: raio / METROS_POR_GRAU_LNG,
  };
}

/** Cap de EMBARQUE: acende `maxDia`, embarca o dobro (reserva pro clique manual). */
export function capDeEmbarque(maxDia: unknown): number {
  return clampMaxDia(maxDia) * 2;
}

// ---------------------------------------------------------------------------
// A cesta "sede de água" — medida: 463 de 1.428 ativos no corredor da company 41
// ---------------------------------------------------------------------------

/**
 * Prefixos de CNAE de quem CONSOME água em galão no balcão/sala de espera.
 * FORA da cesta NÃO é exclusão — é score menor (o dono decide o que vira lead,
 * o corredor só ordena). Prefixo curto casa a divisão inteira: '86' = toda a
 * saúde, '561' = toda a alimentação.
 */
export const CESTA_AGUA: ReadonlyArray<{ prefixo: string; rotulo: string }> = [
  { prefixo: '9602', rotulo: 'salão / estética' },
  { prefixo: '86', rotulo: 'saúde' },
  { prefixo: '9313', rotulo: 'academia' },
  { prefixo: '69', rotulo: 'advocacia / contabilidade' },
  { prefixo: '70', rotulo: 'consultoria / gestão' },
  { prefixo: '82', rotulo: 'escritório e apoio' },
  { prefixo: '85', rotulo: 'educação' },
  { prefixo: '561', rotulo: 'alimentação' },
  { prefixo: '452', rotulo: 'oficina' },
  { prefixo: '6821', rotulo: 'imobiliária' },
  { prefixo: '731', rotulo: 'agência / publicidade' },
];

/** true = está na cesta de afinidade. `cnae` da RFB tem 7 dígitos, sem pontuação. */
export function estaNaCesta(cnae: unknown): boolean {
  const codigo = String(cnae ?? '').replace(/\D/g, '');
  if (!codigo) return false;
  return CESTA_AGUA.some((item) => codigo.startsWith(item.prefixo));
}

/** Rótulo humano da cesta (pro card do APK), ou null fora da cesta. */
export function rotuloDaCesta(cnae: unknown): string | null {
  const codigo = String(cnae ?? '').replace(/\D/g, '');
  if (!codigo) return null;
  // Prefixo mais LONGO vence: 6821 (imobiliária) antes de 69/70 nunca colide,
  // mas a regra deixa a lista crescer sem virar armadilha de ordem.
  const achado = [...CESTA_AGUA]
    .sort((a, b) => b.prefixo.length - a.prefixo.length)
    .find((item) => codigo.startsWith(item.prefixo));
  return achado ? achado.rotulo : null;
}

/**
 * Regex de cesta pro Postgres, GERADO da constante acima. Os prefixos são
 * literais de dígito deste arquivo (nunca entrada de usuário) e a asserção
 * abaixo garante que continuem sendo — é o que torna a interpolação segura.
 */
export function regexCestaSql(): string {
  for (const item of CESTA_AGUA) {
    if (!/^\d+$/.test(item.prefixo)) {
      throw new Error(`Prefixo de CNAE inválido na cesta: ${item.prefixo}`);
    }
  }
  return `^(${CESTA_AGUA.map((item) => item.prefixo).join('|')})`;
}

// ---------------------------------------------------------------------------
// Porte — o desempate final
// ---------------------------------------------------------------------------

/**
 * Porte da RFB vem como TEXTO ('MICRO EMPRESA', 'DEMAIS'...). Mais gente na
 * sala = mais galão: DEMAIS > pequeno porte > micro > não informado.
 */
export const PORTE_RANK: ReadonlyArray<{ valor: string; peso: number }> = [
  { valor: 'DEMAIS', peso: 3 },
  { valor: 'EMPRESA DE PEQUENO PORTE', peso: 2 },
  { valor: 'PEQUENO PORTE', peso: 2 },
  { valor: 'MICRO EMPRESA', peso: 1 },
];

export function porteRank(porte: unknown): number {
  const chave = String(porte ?? '').trim().toUpperCase();
  const achado = PORTE_RANK.find((item) => item.valor === chave);
  return achado ? achado.peso : 0;
}

/** O mesmo ranking de porte em SQL, gerado da constante (sem segunda cópia). */
export function porteRankSql(coluna: string): string {
  const ramos = PORTE_RANK.map((item) => `WHEN '${item.valor.replace(/'/g, "''")}' THEN ${item.peso}`).join(' ');
  return `CASE UPPER(BTRIM(COALESCE(${coluna}, ''))) ${ramos} ELSE 0 END`;
}

// ---------------------------------------------------------------------------
// Ranqueamento e normalização das paradas
// ---------------------------------------------------------------------------

/**
 * A ordem do produto: **afinidade de CNAE > menor distância > porte**.
 * `cnpj` no fim é só desempate estável (mesma rota, mesma ordem, sempre).
 */
export function ordenarProspectos<T extends { afinidade: boolean; distM: number; porte?: string | null; cnpj: string }>(
  linhas: readonly T[],
): T[] {
  return [...linhas].sort((a, b) => {
    if (a.afinidade !== b.afinidade) return a.afinidade ? -1 : 1;
    if (a.distM !== b.distM) return a.distM - b.distM;
    const porte = porteRank(b.porte) - porteRank(a.porte);
    if (porte !== 0) return porte;
    return a.cnpj < b.cnpj ? -1 : a.cnpj > b.cnpj ? 1 : 0;
  });
}

/**
 * Paradas do dia → lista limpa: descarta coordenada inválida/zero-zero,
 * deduplica no ~0,1 m (6 casas) e corta em MAX_PARADAS.
 * (0,0) é o Golfo da Guiné — no Brasil é sempre lixo de cadastro, nunca parada.
 */
export function normalizarParadas(paradas: unknown): ParadaCoord[] {
  if (!Array.isArray(paradas)) return [];
  const vistos = new Set<string>();
  const saida: ParadaCoord[] = [];
  for (const bruto of paradas) {
    const lat = Number((bruto as ParadaCoord)?.lat);
    const lng = Number((bruto as ParadaCoord)?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    const chave = `${lat.toFixed(6)}|${lng.toFixed(6)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ lat, lng });
    if (saida.length >= MAX_PARADAS) break;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// A consulta
// ---------------------------------------------------------------------------

export type ParamsCorredor = {
  companyId: number;
  paradas: readonly ParadaCoord[];
  raioM: number;
  cap: number;
  /**
   * `ProspectoRota` já existe no banco? Enquanto a migration não entrar, o CTE
   * de bloqueados nasce VAZIO em vez de derrubar a consulta inteira — a forma
   * do SQL não muda, só o conteúdo do CTE.
   */
  temTabelaProspecto: boolean;
};

/**
 * O corredor inteiro em UMA consulta. Ordem dos passos (cada um existe por um
 * motivo medido):
 *  1. `paradas`  — VALUES parametrizado (nada de string concatenada).
 *  2. `meus`     — o livro do tenant em UMA varredura. Fazer isso como
 *                  subconsulta correlacionada custou 2.768 ms; como CTE, 502 ms
 *                  (medido em produção, 07/08).
 *  3. `perto`    — bbox (usa o índice) → distância euclidiana → `DISTINCT ON`
 *                  fica com a MENOR distância de cada CNPJ (uma empresa perto
 *                  de 3 paradas aparece uma vez, pela parada mais próxima).
 *  4. join com `CnpjPublicCompany` ativa, exclusões e ordenação.
 *
 * MULTI-TENANT: `companyId` entra em `meus` e em `bloqueados`. `CnpjGeo` e
 * `CnpjPublicCompany` são bases PÚBLICAS da RFB (não têm dono) — o que é do
 * tenant é o que ele já tem e o que ele já dispensou, e isso é escopado.
 */
export function montarSqlCorredor(params: ParamsCorredor): Prisma.Sql {
  const { dLat, dLng, raioM } = metrosParaGraus(params.raioM);
  const paradas = params.paradas;
  if (paradas.length === 0) throw new Error('Corredor sem paradas.');

  const valoresParadas = Prisma.join(
    paradas.map((p) => Prisma.sql`(${p.lat}::float8, ${p.lng}::float8)`),
  );

  // Distância ao quadrado em metros² — comparar quadrados evita uma raiz por
  // linha candidata e dá exatamente o mesmo conjunto.
  const dist2 = Prisma.sql`(((g."lat" - p."lat") * ${METROS_POR_GRAU_LAT}::float8) ^ 2 + ((g."lng" - p."lng") * ${METROS_POR_GRAU_LNG}::float8) ^ 2)`;

  const bloqueados = params.temTabelaProspecto
    ? Prisma.sql`
      SELECT pr."cnpj" AS d
      FROM "ProspectoRota" pr
      WHERE pr."companyId" = ${params.companyId}
        AND (pr."estado" = 'lead' OR (pr."cooldownAte" IS NOT NULL AND pr."cooldownAte" > now()))
    `
    : Prisma.sql`SELECT NULL::text AS d WHERE false`;

  return Prisma.sql`
    WITH paradas("lat", "lng") AS (VALUES ${valoresParadas}),
    meus AS (
      SELECT DISTINCT z.d FROM (
        SELECT regexp_replace(COALESCE(cp."cnpj", ''), '[^0-9]', '', 'g') AS d
          FROM "CustomerProfile" cp WHERE cp."companyId" = ${params.companyId}
        UNION ALL
        SELECT regexp_replace(COALESCE(cp."document", ''), '[^0-9]', '', 'g') AS d
          FROM "CustomerProfile" cp WHERE cp."companyId" = ${params.companyId}
      ) z
      WHERE length(z.d) = 14
    ),
    bloqueados AS (${bloqueados}),
    perto AS (
      SELECT DISTINCT ON (g."cnpj")
        g."cnpj" AS cnpj,
        g."lat" AS lat,
        g."lng" AS lng,
        sqrt(${dist2}) AS dist_m
      FROM paradas p
      JOIN "CnpjGeo" g
        ON g."lat" BETWEEN p."lat" - ${dLat}::float8 AND p."lat" + ${dLat}::float8
       AND g."lng" BETWEEN p."lng" - ${dLng}::float8 AND p."lng" + ${dLng}::float8
      WHERE g."nivelGeo" <= 2
        AND ${dist2} <= (${raioM}::float8) ^ 2
      ORDER BY g."cnpj", ${dist2} ASC
    )
    SELECT
      pe.cnpj AS "cnpj",
      COALESCE(NULLIF(BTRIM(c."nomeFantasia"), ''), c."razaoSocial") AS "nome",
      c."cnae" AS "cnae",
      c."cnaeDescription" AS "cnaeDescricao",
      c."porte" AS "porte",
      c."phoneDigits" AS "phoneDigits",
      pe.lat AS "lat",
      pe.lng AS "lng",
      ROUND(pe.dist_m)::int AS "distM",
      (c."cnae" ~ ${regexCestaSql()}) AS "afinidade"
    FROM perto pe
    JOIN "CnpjPublicCompany" c ON c."cnpj" = pe.cnpj
    WHERE c."situacao" = 'ativa'
      AND NOT EXISTS (SELECT 1 FROM meus m WHERE m.d = pe.cnpj)
      AND NOT EXISTS (SELECT 1 FROM bloqueados b WHERE b.d = pe.cnpj)
    ORDER BY
      (c."cnae" ~ ${regexCestaSql()}) DESC,
      pe.dist_m ASC,
      ${Prisma.raw(porteRankSql('c."porte"'))} DESC,
      pe.cnpj ASC
    LIMIT ${params.cap}
  `;
}

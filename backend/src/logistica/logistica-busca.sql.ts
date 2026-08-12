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
/** Teto de tamanho do `q` (fiscal, 12/08): trigram custa por caractere e o
 *  campo é de BUSCA, não de redação — 80 chars cobre o maior endereço/nome
 *  real e mata o payload malicioso de 1 MB antes de virar CPU no banco. */
export const BUSCA_MAX_CHARS = 80;

/**
 * FREIO DE SERVIDOR (fiscal, 12/08): o teto local (Promise.race) abandona a
 * ESPERA, mas a query seguia rodando no Postgres segurando 1 das 10 conexões
 * do pool — o backend inteiro roda sem statement_timeout. Todo caminho de
 * banco da busca roda com `SET LOCAL statement_timeout` (transação): passou
 * do teto, o SERVIDOR mata a query, não só o cliente desiste dela.
 */
export const BUSCA_STATEMENT_TIMEOUT_MS = 1600;

/** `SET LOCAL statement_timeout` com a MESMA guarda de constante do resto da
 *  peça (só número finito e positivo entra no texto do SQL). */
export function sqlSetStatementTimeout(ms: number): string {
  const inteiro = Math.floor(ms);
  if (!Number.isFinite(inteiro) || inteiro <= 0) {
    throw new Error(`statement_timeout inválido na busca: ${ms}`);
  }
  return `SET LOCAL statement_timeout = ${num(inteiro)}`;
}

/** Fuzzy de CLIENTE — 0.25 pega 'mracia'→'marcia' (0.2857 medido). */
export const FUZZY_CLIENTE_MIN = 0.25;
/**
 * Peso do word_similarity no RANKING de cliente. Medido no tenant real (12/08):
 * word_similarity('mracia', X) EMPATA em 0.2857 pra meia lista ('dona araci',
 * 'a veia maria', 'quiteria - mae do maicon'...) porque o extent curto dilui o
 * denominador — ordenar só por ele deixava a Márcia fora do top-6 no desempate
 * alfabético. O `similarity` clássico desempata ('marcia' 0.2727 ≫ 'a veia
 * maria' 0.1176), então o ranking soma os dois: similarity + 0.5×word_sim
 * (Márcia 0.416 > Farmácia Vânia 0.381 > o resto). O CORTE (WHERE) continua
 * pelo word_similarity ≥ 0.25, que é o que deixa o typo entrar.
 */
export const PESO_WS_CLIENTE = 0.5;
/** Fase 1 do comércio: quantos candidatos por NOME seguem pro reranking por
 *  distância. 40 = sobra pra reordenar sem pagar join/sort na cidade inteira. */
export const COMERCIO_PRE_LIMITE = 40;
/** Fuzzy de COMÉRCIO (`<%` no GIN da RFB) — 0.40 pega 'mercad' (0.57 medido)
 *  sem abrir a porteira que o default 0.6 fecha demais e 0.2 abriria demais. */
export const FUZZY_COMERCIO_MIN = 0.4;
/** Fuzzy de VIA — 0.40: via é string curta, abaixo disso vira loteria. */
export const FUZZY_VIA_MIN = 0.4;

/* SET do limiar do `<%` do fallback fuzzy de comércio. Mora AQUI, e não lá em
   cima junto dos outros freios, por um motivo que o compilador cobra: `const`
   não sobe (TDZ) — escrito antes do FUZZY_COMERCIO_MIN, o arquivo NÃO compila.
   Ele existe pra que a constante passe pela MESMA guarda `num()` de toda
   interpolação desta peça (fiscal, 12/08: nenhum número entra em texto de SQL
   fora da guarda — nem aqui, nem no serviço). */
export const SQL_SET_LIMIAR_FUZZY_COMERCIO =
  `SET LOCAL pg_trgm.word_similarity_threshold = ${num(FUZZY_COMERCIO_MIN)}`;

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
             (similarity(cp."searchName", $2) + ${num(PESO_WS_CLIENTE)} * word_similarity($2, cp."searchName")) AS sim,
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
           /* 🔴 SEM GPS ≠ SEM PINO (fiscal, 12/08 — defeito visto na RUA, não na
              bancada). Isto era um CASE só: dist_m IS NULL vira 1.0. Só que
              dist_m nasce nulo por DOIS motivos diferentes, e tratar os dois
              como "distância máxima de perto" é o que empurrava o cliente SEM
              PINO pro TOPO de uma lista que promete "o mais perto vem primeiro":
                · o request veio sem GPS  → ninguém tem distância: 1.0 é neutro,
                  a proximidade simplesmente não entra na conta (certo);
                · o request TEM GPS e este cliente não tem pino → "não sei onde
                  é" estava valendo mais que a casa medida a 800 m (errado).
              Quem não tem pino agora vale PROX_SEM_PINO — o MESMO 0.55 que o
              grupo de comércios já usava: fica atrás de quem está perto de
              verdade e na frente de quem está longe, sem sumir da lista. */
           * (CASE WHEN $4::float8 IS NULL THEN 1.0
                   WHEN dist_m IS NULL THEN ${num(PROX_SEM_PINO)}
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
 *
 * TRÊS FASES no mesmo SQL (medido em 12/08, Rio Claro = 33k empresas ativas):
 *   fase 1 — candidatos por NOME, cidade-escopados, ORDER BY sim LIMIT 40.
 *     Só colunas do ÍNDICE COBRIDOR ("CnpjPublicCompany_buscaSpCover_idx":
 *     normalizedCity INCLUDE situacao, searchText, cnpj — parcial state='SP'):
 *     a cidade tinha 1 linha POR PÁGINA no heap de 61 GB (Heap Blocks: 31.765
 *     medidos = ~140 ms SÓ de heap); index-only scan corta o heap fora.
 *   fase 2 — só os 40 voltam ao heap por PK pras colunas de exibição;
 *   fase 3 — join com CnpjGeo e reranking por distância.
 * Sem as fases, o ORDER BY final obrigava word_similarity + join na cidade
 * INTEIRA: 580 ms medidos.
 *
 * ⚠️ O UF entra LITERAL no SQL (validado ^[A-Z]{2}$, vem do NOSSO cnefe, nunca
 * do usuário): o índice é PARCIAL (state='SP', o corte honesto — CnpjGeo só
 * cobre SP, ver plano) e o planner não casa predicado parcial com parâmetro.
 * UF ≠ SP simplesmente não casa o índice e degrada pro caminho do heap
 * (~140 ms na cidade de 33k) — funciona, só não voa. Anotado no plano.
 *
 * DOIS CAMINHOS (o serviço tenta o rápido e só cai no fuzzy se vier vazio):
 *   · LIKE (rápido): substring no searchText — é o caso comum (nome certo ou
 *     parcial) e avalia similaridade só em quem casou;
 *   · `<%` (fuzzy, fallback do typo): word_similarity INDEXÁVEL, limiar
 *     FUZZY_COMERCIO_MIN por SET LOCAL na MESMA transação (o default 0.6 do
 *     banco reprovaria 'mercad' = 0.57 medido). Avalia a cidade inteira — é o
 *     preço do typo, pago SÓ quando o caminho rápido não achou nada.
 *
 * Distância só com pino confiável (nivelGeo ≤ 2 — CnpjGeo: 1=porta, 2=rua;
 * 3-4 é bairro/cidade e mentiria metros pro motorista).
 */
function sqlComerciosBase(matchSql: string, args: {
  cityNorm: string;
  uf: string;
  q: string;
  lat: number | null;
  lng: number | null;
}): SqlPronto {
  const uf = String(args.uf ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error(`UF inválida na busca de comércio: ${args.uf}`);
  const qNorm = normalizarBuscaTexto(args.q);
  const qLike = `%${escaparLike(qNorm)}%`;
  const sql = `
    WITH nome AS (
      SELECT c."cnpj", word_similarity($2, c."searchText") AS sim
        FROM "CnpjPublicCompany" c
       WHERE c."normalizedCity" = $1
         AND c."state" = '${uf}'
         AND c."situacao" = 'ativa'
         AND ${matchSql}
       ORDER BY word_similarity($2, c."searchText") DESC, c."cnpj" ASC
       LIMIT ${num(COMERCIO_PRE_LIMITE)}
    ), cand AS (
      SELECT n."cnpj", n.sim,
             COALESCE(NULLIF(BTRIM(c."nomeFantasia"), ''), c."razaoSocial") AS nome,
             c."address" AS endereco, c."city" AS cidade, c."state" AS uf,
             c."cnae", c."cnaeDescription" AS "cnaeDescricao"
        FROM nome n
        JOIN "CnpjPublicCompany" c ON c."cnpj" = n."cnpj"
    ), geo AS (
      SELECT cand.*, g."lat" AS lat, g."lng" AS lng, g."nivelGeo" AS "nivelGeo", g."cep" AS cep,
             CASE WHEN $4::float8 IS NULL OR g."lat" IS NULL OR g."lng" IS NULL OR g."nivelGeo" > 2 THEN NULL
                  ELSE ${distSql('g."lat"', 'g."lng"', '$4::float8', '$5::float8')}
             END AS dist_m
        FROM cand
        LEFT JOIN "CnpjGeo" g ON g."cnpj" = cand."cnpj"
    )
    SELECT geo.*,
           geo.sim
           * (CASE WHEN $4::float8 IS NULL THEN 1.0
                   WHEN geo.dist_m IS NULL THEN ${num(PROX_SEM_PINO)}
                   ELSE GREATEST(${num(PROX_PISO)}, 1.0 / (1.0 + geo.dist_m / ${num(PROX_MEIA_M)}.0)) END) AS score
      FROM geo
     ORDER BY score DESC, geo."cnpj" ASC
     LIMIT ${num(BUSCA_LIMITE_GRUPO)}
  `;
  return { sql, params: [args.cityNorm, qNorm, qLike, args.lat, args.lng] };
}

/** Caminho RÁPIDO (caso comum): substring no searchText, cidade-escopado. */
export function sqlBuscaComerciosLike(args: {
  cityNorm: string; uf: string; q: string; lat: number | null; lng: number | null;
}): SqlPronto {
  return sqlComerciosBase(`c."searchText" LIKE $3 ESCAPE '\\'`, args);
}

/** Fallback do TYPO: word_similarity (`<%`) — só roda quando o LIKE veio
 *  vazio; exige SET LOCAL do limiar na mesma transação (ver serviço).
 *  O OR com o LIKE existe por TIPAGEM ($3 precisa ser referenciado pro
 *  protocolo do Postgres inferir o tipo) e é inofensivo: neste caminho o LIKE
 *  já provou que vem vazio. */
export function sqlBuscaComerciosFuzzy(args: {
  cityNorm: string; uf: string; q: string; lat: number | null; lng: number | null;
}): SqlPronto {
  return sqlComerciosBase(`($2 <% c."searchText" OR c."searchText" LIKE $3 ESCAPE '\\')`, args);
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

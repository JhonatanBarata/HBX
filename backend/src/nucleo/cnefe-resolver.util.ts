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
import { normalizeVia, pinoValido, viasCompativeis } from './nucleo-geo.util';

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
/**
 * SEM NÚMERO (01/08, teste de rota ao vivo) — dispersão máxima (m) do pino de CEP.
 *
 * Teto FOLGADO de propósito, e isso não afrouxa a Lei nº1: aqui o pino já sai
 * ROTULADO `precisao:'cep'` ("é nesta rua, confira na tela"), então o erro que ele
 * pode cometer é o erro que o chamador foi avisado que existe — diferente do pino de
 * porta, que se apresenta como exato. O que este teto ainda mata é o caso que importa:
 * cidade de CEP ÚNICO, onde as linhas se espalham por QUILÔMETROS e o "meio" não fica
 * em rua nenhuma. Avenida longa (o caso real do dono) cabe; cidade inteira não.
 */
export const CNEFE_DISPERSAO_CEP_M = 1500;
/** Teto de linhas lidas pro pino de CEP (o medoide é O(n²) — amostra basta). */
export const CNEFE_CEP_LIMITE_LINHAS = 200;
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
  /**
   * 🔴 O CEP DO CADASTRO MANDA NO NOME DA RUA (09/08, ordem do dono: "se o nome da rua
   * está errado, puxe pelo CEP, e acabou — apague o nome da rua que o cliente está e
   * preencha com o do CEP").
   *
   * Até aqui o nome da rua tinha VETO: `viasCompativeisCnefe` derrubava o candidato
   * quando o cadastro dizia "Rua 18" e o CEP dizia "Rua Dezenove", ou "Rua Jacutinga"
   * onde o Censo tem "Estrada de Jacutinga". O cadastro vencia a base oficial — e o
   * cliente ficava sem pino por causa de uma palavra digitada errada.
   *
   * Com `cepDoCadastro`, a hierarquia inverte: o CEP é dado que o dono digitou e ele
   * identifica UM trecho de rua; o nome oficial sai da base e volta pro cadastro (ver
   * `gravarCuraCnefe`). A prova NÃO afrouxa — continuam valendo a porta/vizinho e o
   * teto de dispersão, que é o que impede um CEP de cidade inteira virar pino.
   *
   * ⚠️ Só vale pro CEP que VEIO DO CADASTRO. CEP ADIVINHADO (ViaCEP, no caminho de
   * quem não tem CEP) mantém o veto: lá o nome da rua é a única evidência de que se
   * está no trecho certo, e foi exatamente isso que a auditoria de 27/07 provou.
   */
  cepDoCadastro?: boolean;
}

export interface CnefePino {
  lat: number;
  lng: number;
  /** `porta` = a casa · `rua` = a altura da rua (vizinho de número) · `cep` = o trecho
   *  de rua do CEP, sem número nenhum (endereço S/N). Quem exibe TEM que diferenciar:
   *  `cep` é ponto de conferência, não endereço provado. */
  precisao: 'porta' | 'rua' | 'cep';
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
    // 27/07 (caso Dona Maria, company 48) — token COLADO letra+dígito é separado:
    // "M55" → "m 55", "M22A" → "m 22 a". O IBGE escreve "AVENIDA M CINQUENTA E
    // CINCO"/"RUA M VINTE E DOIS A"; sem o split, cadastro "Av. M55, nº 2677"
    // não casava nem com a PORTA EXATA na base (12 recusas medidas, 4 eram isto).
    .flatMap((token) => {
      const letraDigito = /^([a-z]+?)(\d{1,4})([a-z]?)$/.exec(token);
      if (letraDigito) return [letraDigito[1], letraDigito[2], letraDigito[3]].filter(Boolean);
      // "22a" → "22 a" (ViaCEP escreve "Rua M 22A"; cadastro "M22A"; IBGE "M VINTE E
      // DOIS A" — os três têm que cair na MESMA forma "m 22 a").
      const digitoLetra = /^(\d{1,4})([a-z]{1,2})$/.exec(token);
      if (digitoLetra) return [digitoLetra[1], digitoLetra[2]];
      return [token];
    })
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
  // 27/07 — janela de 2 tokens (era 3): com 3, "Rua São João 123" pescava o número
  // da CASA como número da via. "av m 55"/"rua m 22 a" cabem em 2; casa não.
  for (let i = tipoIdx + 1; i < Math.min(tokens.length, tipoIdx + 3); i++) {
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
export function viasCompativeisCnefe(pedida: string | null | undefined, candidata: string | null | undefined): boolean {
  const a = normalizarViaNumeral(pedida);
  const b = normalizarViaNumeral(candidata);
  if (viasCompativeis(a, b)) return true;
  const viaA = viaTipoNumero(a);
  const viaB = viaTipoNumero(b);
  return viaA !== null && viaB !== null && viaA.tipo === viaB.tipo && viaA.numero === viaB.numero;
}

function coordValida(row: CnefeRow): row is CnefeRow & { lat: number; lng: number } {
  // A régua é UMA só (`pinoValido`, nucleo-geo.util) — esta era uma das 12 cópias.
  return pinoValido(row.lat, row.lng);
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

  // `cepDoCadastro` tira o VETO do nome (ver CnefeInput): o CEP já prova o trecho, e
  // o nome divergente é o defeito a corrigir, não o motivo pra desistir.
  const viaPedida = input.cepDoCadastro ? '' : String(input.endereco ?? '').trim();
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
  // Sem logradouro E sem CEP do cadastro não há prova nenhuma do trecho — segue null.
  // Com CEP do cadastro, o trecho está provado por ele: é a regra do dono ("se repetir
  // o CEP e diferir no número, está certinho"), e o vizinho continua limitado pelo
  // mesmo teto de numeração e de dispersão de sempre.
  if (!viaPedida && !input.cepDoCadastro) return null;

  let candidatos = (Array.isArray(rows) ? rows : [])
    .filter(coordValida)
    .filter((r) => typeof r.numero === 'number' && Number.isFinite(r.numero))
    .filter((r) => (input.cepDoCadastro ? true : viasCompativeisCnefe(viaPedida, r.logradouro)));
  if (!candidatos.length) return null;

  /* 🔴 UM CEP PODE TER DUAS RUAS — E SEM ISTO O VIZINHO PULA PRA OUTRA (medido).
     O CEP 13504363 tem 278 portas na RUA DEZENOVE e 10 na AVENIDA SESSENTA E QUATRO.
     Tirando o veto do nome (cepDoCadastro), o "vizinho mais próximo por numeração"
     do 864 virou o 916 da AVENIDA 64 — outra rua — e o cadastro seria reescrito com
     ela. Pino errado é pior que pino vazio, e cadastro reescrito errado é pior ainda.
     Então o CEP prova UMA rua: a DOMINANTE (a que tem mais portas nele). O vizinho só
     vale dentro dela; empate técnico entre duas ruas ⇒ null, que é "não sei". */
  if (input.cepDoCadastro) {
    /* O NOME AINDA TEM A PRIMEIRA PALAVRA — ele só perdeu o VETO. Quem está escrito
       certo continua curando pelo caminho de sempre, inclusive na rua MINORITÁRIA do
       CEP (sem isto, o cliente legítimo da AVENIDA 64 pararia de curar por causa da
       RUA DEZENOVE — o conserto viraria regressão). A dominante abaixo é o SOCORRO de
       quem digitou o nome errado, não o novo dono da decisão. */
    const peloNome = viaPedida
      ? candidatos.filter((r) => viasCompativeisCnefe(viaPedida, r.logradouro))
      : [];
    if (peloNome.length) candidatos = peloNome;
    else {
    const porLogradouro = new Map<string, typeof candidatos>();
    for (const r of candidatos) {
      const chave = String(r.logradouro ?? '').trim().toUpperCase();
      const lista = porLogradouro.get(chave);
      if (lista) lista.push(r);
      else porLogradouro.set(chave, [r]);
    }
    if (porLogradouro.size > 1) {
      const ordenadas = [...porLogradouro.values()].sort((a, b) => b.length - a.length);
      // Dominante de verdade: pelo menos o dobro da 2ª. Sem folga, não há dona.
      if (ordenadas[0].length < ordenadas[1].length * 2) return null;
      candidatos = ordenadas[0];
    }
    }
  }

  const vizinho = candidatos[0];
  if (Math.abs((vizinho.numero as number) - numeroPedido) > CNEFE_VIZINHO_DELTA_MAX) return null;

  const proximos = candidatos.slice(0, 5) as Array<CnefeRow & { lat: number; lng: number }>;
  if (!dispersaoOk(proximos, vizinho as { lat: number; lng: number }, CNEFE_DISPERSAO_RUA_M)) return null;

  return { lat: vizinho.lat as number, lng: vizinho.lng as number, precisao: 'rua', logradouro: vizinho.logradouro ?? null, municipio: vizinho.municipio ?? null };
}

/**
 * CEP — endereço SEM NÚMERO (01/08). Metade do país é S/N (posto, chácara, praça,
 * comércio, estrada) e até hoje esse endereço não tinha pino nenhum: o resolver exigia
 * número e devolvia null, e a tela cuspia "Falta o número da casa" num lugar que não
 * tem número. Aqui o pino sai do PRÓPRIO CEP — o CNEFE já guarda a linha do trecho
 * (inclusive com `numero` NULL) — e sai rotulado `precisao:'cep'`.
 *
 * Continua fail-closed no que importa: cadastro COM logradouro e nenhuma via compatível
 * → null (mesma régua do porta/rua); linhas espalhadas além do teto → null (CEP de
 * cidade inteira não vira pino). Puro e testável: quem lê o banco é `resolverCnefeCep`.
 */
export function escolherPinoCep(rows: CnefeRow[], input: CnefeInput): CnefePino | null {
  let candidatos = (Array.isArray(rows) ? rows : []).filter(coordValida);
  if (!candidatos.length) return null;

  // Mesma inversão de hierarquia do `escolherPinoPorta` (ver CnefeInput#cepDoCadastro).
  const viaPedida = input.cepDoCadastro ? '' : String(input.endereco ?? '').trim();
  if (viaPedida) {
    const compativeis = candidatos.filter((r) => viasCompativeisCnefe(viaPedida, r.logradouro));
    if (!compativeis.length) return null;
    candidatos = compativeis;
  }

  const centro = medoide(candidatos as Array<CnefeRow & { lat: number; lng: number }>);
  if (!dispersaoOk(candidatos as Array<{ lat: number; lng: number }>, centro, CNEFE_DISPERSAO_CEP_M)) return null;

  return { lat: centro.lat as number, lng: centro.lng as number, precisao: 'cep', logradouro: centro.logradouro ?? null, municipio: centro.municipio ?? null };
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

/**
 * 🔴 01/08 — O CAST QUE FAZIA A BASE INTEIRA SER INÚTIL.
 *
 * `cnefe_endereco.cep` é `character(8)` (bpchar). O Prisma manda parâmetro como TEXT,
 * e `bpchar = text` faz o Postgres converter a COLUNA — o que joga fora
 * `idx_cnefe_end_cep`/`idx_cnefe_end_cep_numero` e vira Parallel Seq Scan nas 23 milhões
 * de linhas. Medido em produção, a MESMA consulta:
 *
 *   `cep = $1`          → Parallel Seq Scan · **18.832 ms** (estourava o teto de 4 s
 *                          e o resolver devolvia null, calado, em TODA resolução)
 *   `cep = $1::bpchar`  → Bitmap Index Scan · **0,285 ms**
 *
 * Ou seja: desde a carga da base (27/07) o CNEFE nunca respondeu a tempo — o log só
 * dizia "consulta estourou 4000ms" e o cadastro seguia sem pino. Era ISSO que enchia o
 * contador "SEM MAPA" e fazia a rota entrar por texto com km e ETA errados.
 *
 * O cast é obrigatório em TODA comparação de `cep` daqui. Não remover.
 */
const CEP_PARAM = '$1::bpchar';

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

/* Exportada em 12/08 (busca da parada avulsa, PR12082026): a consulta de vias/
   portas do painel de busca fala com o MESMO banco `cnefe` e precisa das MESMAS
   leis (client único, connect pago uma vez, teto de consulta, cooldown só pra
   falha de banco). Duplicar isso no serviço da busca seria a 13ª régua do pino. */
export async function cnefeQuery(sql: string, params: unknown[], timeoutMs = CNEFE_QUERY_TIMEOUT_MS): Promise<any[]> {
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
        `WHERE cep = ${CEP_PARAM} AND numero = $2 AND lat IS NOT NULL AND lng IS NOT NULL LIMIT 200`,
      [cep, numero],
      timeoutMs,
    )) as CnefeRow[];
    const pinoPorta = escolherPinoPorta(porta, input);
    if (pinoPorta) return pinoPorta;

    // Fallback de RUA precisa de prova do trecho: o logradouro do cadastro OU o CEP
    // que o próprio dono digitou (ver escolherPinoRua e CnefeInput#cepDoCadastro).
    if (!String(input.endereco ?? '').trim() && !input.cepDoCadastro) return null;
    const rua = (await cnefeQuery(
      'SELECT logradouro, numero, lat, lng, nivel_geo, municipio FROM cnefe_endereco ' +
        `WHERE cep = ${CEP_PARAM} AND numero IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL ` +
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
 * Resolve CEP → pino do TRECHO DE RUA, sem número (01/08). Mesmo contrato best-effort
 * do `resolverCnefe`: nunca lança, UF sem carga marca pendente e devolve null.
 *
 * NÃO substitui o `resolverCnefe`: é o caminho de quem não TEM número (S/N). Quem tem
 * número continua entrando pela porta e só cai aqui se o CEP inteiro não resolver.
 */
export async function resolverCnefeCep(
  input: CnefeInput,
  opts?: { queryTimeoutMs?: number },
): Promise<CnefePino | null> {
  if (!cnefeHabilitado()) return null;
  const cep = normalizarCep8(input.cep);
  if (!cep) return null;
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

    // Sem filtro de `numero`: a linha do trecho (numero NULL) entra junto com as portas,
    // e o medoide escolhe um ponto que EXISTE — nunca uma média no meio do nada.
    const linhas = (await cnefeQuery(
      'SELECT logradouro, numero, lat, lng, nivel_geo, municipio FROM cnefe_endereco ' +
        `WHERE cep = ${CEP_PARAM} AND lat IS NOT NULL AND lng IS NOT NULL LIMIT ${CNEFE_CEP_LIMITE_LINHAS}`,
      [cep],
      timeoutMs,
    )) as CnefeRow[];
    return escolherPinoCep(linhas, input);
  } catch {
    return null;
  }
}

/**
 * 🔴 REVERSO: posição → CEP da porta mais próxima (10/08, ordem do dono: "o CEP vai
 * mandar em tudo"). É o que serve o botão "GPS" do cadastro (a pessoa está NA porta —
 * o fix do celular acha a porta do Censo do lado e o CEP dela é o CEP do lugar) e a
 * cura "só CEP" de quem tem pino provado e cadastro sem CEP.
 *
 * Best-effort como todo o resto: nunca lança; fora do raio ⇒ null ("não sei" honesto).
 * Consulta `cnefe_porta` por caixa de lat/lng (índice `idx_cnefe_porta_lat` — ver
 * backend/scripts/cnefe/agregados.sql) e confere a distância REAL por haversine.
 */
export const CNEFE_REVERSO_RAIO_M = 120;

export interface CnefeReversoAchado {
  cep: string;
  lat: number;
  lng: number;
  distM: number;
}

export async function resolverCnefeReverso(
  pos: { lat: number; lng: number } | null | undefined,
  opts?: { raioM?: number; queryTimeoutMs?: number },
): Promise<CnefeReversoAchado | null> {
  if (!cnefeHabilitado()) return null;
  if (!pos || !pinoValido(pos.lat, pos.lng)) return null;
  if (!queryOverride && !cnefeDatabaseUrl()) return null;
  const raioM = Math.max(10, Math.min(1000, opts?.raioM ?? CNEFE_REVERSO_RAIO_M));
  // graus por metro: latitude é constante; longitude encolhe com o cosseno.
  const dLat = raioM / 111_320;
  const dLng = raioM / (111_320 * Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180)));
  try {
    const rows = (await cnefeQuery(
      'SELECT cep, lat, lng FROM cnefe_porta ' +
        'WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4 AND cep IS NOT NULL ' +
        '  AND lat IS NOT NULL AND lng IS NOT NULL ' +
        'ORDER BY (lat-$5)*(lat-$5) + (lng-$6)*(lng-$6) ASC LIMIT 5',
      [pos.lat - dLat, pos.lat + dLat, pos.lng - dLng, pos.lng + dLng, pos.lat, pos.lng],
      opts?.queryTimeoutMs ?? CNEFE_QUERY_TIMEOUT_MS,
    )) as Array<{ cep: string | null; lat: number | null; lng: number | null }>;
    for (const r of rows) {
      const cep = normalizarCep8(r.cep);
      if (!cep || !pinoValido(r.lat, r.lng)) continue;
      const dist = distanciaM(pos, { lat: r.lat as number, lng: r.lng as number });
      if (dist > raioM) return null; // ordenado: o 1º válido longe demais encerra
      return { cep, lat: r.lat as number, lng: r.lng as number, distM: Math.round(dist) };
    }
    return null;
  } catch {
    return null;
  }
}

// ── QUAL PEDAÇO DO TEXTO É A RUA ────────────────────────────────────────────────
/**
 * Tipos de via POR EXTENSO. Nasceu no util de CEP (o ViaCEP guarda "Avenida 54 A" e
 * buscar "Av. 54a" devolve ZERO), mudou de casa em 09/08: a régua de "o que é via" é
 * a MESMA da porta direta, e as duas curas decidindo rua por cópias diferentes é
 * exatamente como o celular começou a discordar do computador.
 */
export const TIPO_VIA_EXTENSO: Record<string, string> = {
  av: 'avenida', avn: 'avenida', avd: 'avenida', avenida: 'avenida',
  r: 'rua', rua: 'rua',
  tv: 'travessa', trav: 'travessa', travessa: 'travessa',
  rod: 'rodovia', rodovia: 'rodovia',
  est: 'estrada', estr: 'estrada', estrada: 'estrada',
  al: 'alameda', alameda: 'alameda',
  pc: 'praca', pca: 'praca', praca: 'praca',
};

/**
 * Tipo de via GRUDADO no nome, seguido de número: "Avm19" = Av. M-19, "Ruam20a" =
 * Rua M-20A — o cadastro é digitado correndo, sem espaço. Só separa quando o token já
 * vem colado a um NÚMERO (o chamador garante isso), que é o que confina a regra a este
 * caso e impede o estrago óbvio: "Rua Rui Barbosa" não pode virar "rua r ui barbosa".
 * Prefixo de 2+ letras, sobra de 1-2 letras.
 */
export function separarTipoColado(token: string): string[] | null {
  if (token in TIPO_VIA_EXTENSO) return null;
  for (const tipo of ['travessa', 'avenida', 'alameda', 'estrada', 'rodovia', 'praca', 'trav', 'estr', 'rua', 'av', 'rod', 'est', 'pca', 'avn', 'avd', 'pc', 'tv', 'al']) {
    if (!token.startsWith(tipo)) continue;
    const resto = token.slice(tipo.length);
    if (resto.length >= 1 && resto.length <= 2 && /^[a-z]+$/.test(resto)) return [tipo, resto];
  }
  return null;
}

/** O trecho começa com tipo de via ("Rua ...", "Av. ...")? É o que separa logradouro
 *  de bairro num campo de texto livre. */
function pareceVia(trecho: string): boolean {
  const primeiro = normalizarTextoCnefe(trecho).replace(/[.]/g, '').split(/\s+/)[0] ?? '';
  if (primeiro in TIPO_VIA_EXTENSO) return true;
  const letraDigito = /^([a-z]+?)(\d{1,4})([a-z]?)$/.exec(primeiro);
  return !!letraDigito && (letraDigito[1] in TIPO_VIA_EXTENSO || separarTipoColado(letraDigito[1]) !== null);
}

/**
 * Só o LOGRADOURO, de um campo de texto livre. Pega o trecho que COMEÇA COM TIPO DE VIA,
 * não o primeiro — na base real metade dos endereços começa pelo BAIRRO ("Jd. Ipanema,
 * Rua M22, nº 601" tinha que dar "Rua M22", e dava "Jd. Ipanema", que não é rua nenhuma
 * e nunca ia achar CEP). Sem nenhum trecho com cara de via, devolve o primeiro (honesto:
 * é o que o cadastro tem) e a busca simplesmente não acha.
 */
export function logradouroDoCadastro(endereco: string | null | undefined): string {
  const bruto = String(endereco ?? '').trim();
  if (!bruto) return '';
  const trechos = bruto
    .split(/\s*[,;]\s*|\s+[-—–]\s+|\s+n[ºo°]\s*|\s+n[uú]mero\s+/i)
    .map((t) => String(t ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return trechos.find(pareceVia) ?? trechos[0] ?? '';
}

/* ── A PORTA DIRETA POR NOME DE RUA MORREU AQUI (10/08, ordem do dono) ─────────────
   "Sanitização por nome da rua: remover agora, sem vestígios — o CEP vai mandar em
   tudo." A resolução por (município, rua, número) — `resolverCnefePorta`,
   `escolherPortaDireta`, `canonVia`, `cepDaQuadra` — saiu inteira. O que resolve
   endereço agora é SÓ o CEP: (cep, número) → porta; cep → trecho; posição → CEP
   (`resolverCnefeReverso`). Cadastro sem CEP não se cura — se exige o CEP na entrada. */

/** Sem acento, minúsculo, espaço único — o mesmo `norm_cidade()` do banco `cnefe`. */
export function normalizarTextoCnefe(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
      `SELECT 1 FROM cnefe_endereco WHERE cep = ${CEP_PARAM} AND numero = $2 LIMIT 1`,
      ['01001000', 1],
      30000,
    );
  } catch {
    // best-effort: sem base/banco fora, o caminho normal segue cobrindo.
  }
}

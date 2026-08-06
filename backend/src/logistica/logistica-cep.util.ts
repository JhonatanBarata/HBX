/**
 * CONFERÊNCIA DE ROTA — checagem CEP × ENDEREÇO (26/07, ordem do dono).
 *
 * O problema que isto resolve: a conferência pintava TODA parada de amarelo por motivos
 * que são o estado NORMAL de cliente novo ("endereço nunca confirmado em campo", "cliente
 * nunca recebeu entrega aqui"). Nas duas rotas medidas em produção no dia 26/07, 100% das
 * paradas saíram pintadas (97/97 e 10/10, zero verdes) — alarme que toca em tudo não é
 * alarme. A ordem do dono: no momento da conferência o sistema SAI PROCURANDO os endereços,
 * confere CEP × endereço, e só grita quando REALMENTE não bate — aí sim "obrigatório
 * corrigir".
 *
 * ── FAIL-OPEN, AO CONTRÁRIO DO FREIO DO PINO ──────────────────────────────────────
 * `nucleo-geo.util.ts` (freio do geocode) é fail-CLOSED de propósito: na dúvida não grava
 * pino, porque pino errado é pior que pino vazio (Lei nº1). Aqui é o OPOSTO e por um motivo
 * concreto: este resultado vira um BLOQUEIO na cara do motorista. Um "CEP e endereço não
 * batem" falso trava a saída de uma rota que estava certa — custa mais que deixar passar um
 * CEP errado (que o geocode/GPS da primeira entrega ainda corrige depois). Então: só acusa
 * com PROVA (ViaCEP respondeu e diverge de verdade); qualquer dúvida — CEP ausente, CEP
 * inexistente, ViaCEP fora do ar, timeout, cadastro sem cidade/UF — vira SILÊNCIO.
 *
 * ── CUSTO ─────────────────────────────────────────────────────────────────────────
 * ViaCEP é gratuito e sem chave. CEP repete MUITO dentro de uma rota (mesmo bairro), então:
 * dedupe por CEP + cache em memória (24h — CEP praticamente não muda) + teto de
 * concorrência + orçamento total de tempo. Estourou o orçamento, o resto vira silêncio: a
 * conferência NUNCA fica mais lenta por causa desta checagem (Lei nº2, "zero lentidão
 * artificial").
 */

import { normalizeVia } from '../nucleo/nucleo-geo.util';
// 27/07 (caso Dona Maria) — a MESMA régua de via do resolver CNEFE, que entende
// numeral por extenso e token colado ("M22A" ↔ "Rua M 22A" ↔ "M VINTE E DOIS A").
// Régua velha aqui e nova lá = "CEP e endereço não batem" mentindo na conferência.
import { viasCompativeisCnefe } from '../nucleo/cnefe-resolver.util';

const VIACEP_URL = 'https://viacep.com.br/ws';
const VIACEP_TIMEOUT_MS = 2500;
/** Teto de CEPs consultados EM PARALELO — ViaCEP é gratuito, não se martela. */
const VIACEP_CONCORRENCIA = 6;
/** Orçamento total da checagem numa conferência. Estourou → o resto vira indeterminado. */
const VIACEP_ORCAMENTO_MS = 6000;
/** CEP não muda. 24h de cache derruba a quase zero o custo de rodar a mesma rota de novo. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5000;

export type CepVeredito = 'bate' | 'nao_bate' | 'indeterminado';

export interface EnderecoCadastrado {
  cep?: string | null;
  /** Texto composto ("Rua X, 123 - Centro") — no legado é onde o número mora. */
  endereco?: string | null;
  /** Coluna própria (LOGÍSTICA-MOBILE B3, dupla escrita). Legado = null. */
  numero?: string | null;
  /** Apartamento/bloco (06/08). Não entra em nenhuma regra de CEP — viaja junto porque
   *  é o mesmo endereço, e a régua de PORTA (endereco-porta.util) precisa dele. */
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

/** Resposta do ViaCEP (só os campos usados). `erro: true` = CEP inexistente. */
interface ViaCepPayload {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

/** Kill-switch de ops. LIGADO por default — feature entregue desligada, pro dono, é bug. */
function cepCheckHabilitado(): boolean {
  const v = String(process.env.HBX_CEP_CONFERENCIA_ENABLED ?? '').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

/** 8 dígitos ou null. Não aceita CEP "quase certo" — sem os 8 dígitos não há consulta. */
export function normalizarCep(valor: string | null | undefined): string | null {
  const digitos = String(valor ?? '').replace(/\D+/g, '');
  return digitos.length === 8 ? digitos : null;
}

/**
 * ENDEREÇO SEM NÚMERO (26/07, ordem do dono: "tem q conferir se tem número tbm, isso é
 * importante") — impeditivo, e o mais barato de corrigir: não depende de rede nenhuma,
 * é campo de cadastro.
 *
 * Regra: "tem número" = existe QUALQUER dígito em `numero` OU no texto composto
 * `endereco`. Os dois de propósito — `numero` é coluna NOVA (LOGÍSTICA-MOBILE B3, dupla
 * escrita); no legado ela é null e o número mora dentro de `endereco` ("Rua X, 123").
 * Olhar só `numero` acusaria a base legada INTEIRA — exatamente o alarme-que-toca-em-tudo
 * que esta frente veio matar.
 *
 * Variações reais de "sem número" (`s/n`, `sn`, `s.n.`, `-`, vazio) caem sozinhas na
 * regra: nenhuma tem dígito.
 *
 * Fail-open: cadastro sem endereço NENHUM não acusa "sem número" — quem não tem rua tem
 * outro problema (e `sem_pino` já cobre), e acusar aqui seria ruído.
 */
export function enderecoSemNumero(cadastro: EnderecoCadastrado): boolean {
  const temEndereco = Boolean(
    String(cadastro.endereco ?? '').trim() ||
      String(cadastro.cidade ?? '').trim() ||
      normalizarCep(cadastro.cep),
  );
  if (!temEndereco) return false;
  const temDigito = /\d/.test(String(cadastro.numero ?? '')) || /\d/.test(String(cadastro.endereco ?? ''));
  return !temDigito;
}

const DIACRITICOS_INICIO = 0x0300;
const DIACRITICOS_FIM = 0x036f;

/** Mesma normalização do freio do geocode (sem acento, minúsculo, espaço único). */
function normalizar(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < DIACRITICOS_INICIO || code > DIACRITICOS_FIM;
    })
    .join('')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ── cache de módulo ────────────────────────────────────────────────────────────────
interface CacheEntry {
  valor: ViaCepPayload | null;
  expiraEm: number;
}
const cache = new Map<string, CacheEntry>();

function cacheGet(cep: string): { hit: true; valor: ViaCepPayload | null } | { hit: false } {
  const entry = cache.get(cep);
  if (!entry) return { hit: false };
  if (entry.expiraEm < Date.now()) {
    cache.delete(cep);
    return { hit: false };
  }
  return { hit: true, valor: entry.valor };
}

function cacheSet(cep: string, valor: ViaCepPayload | null): void {
  // Teto simples: estourou, joga fora a entrada mais antiga (Map preserva ordem de
  // inserção). Não é LRU e não precisa ser — CEP de rota se repete no MESMO dia.
  if (cache.size >= CACHE_MAX) {
    const primeira = cache.keys().next();
    if (!primeira.done) cache.delete(primeira.value);
  }
  cache.set(cep, { valor, expiraEm: Date.now() + CACHE_TTL_MS });
}

/** Só pros testes: zera o cache entre casos. */
export function limparCacheCep(): void {
  cache.clear();
}

/** ViaCEP best-effort: NUNCA lança. null = não deu pra saber (rede, timeout, CEP inexistente). */
async function consultarViaCep(cep: string): Promise<ViaCepPayload | null> {
  const emCache = cacheGet(cep);
  if (emCache.hit) return emCache.valor;
  try {
    const res = await fetch(`${VIACEP_URL}/${cep}/json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Falha de REDE não entra no cache: o CEP pode estar certo e o ViaCEP fora do ar.
      return null;
    }
    const payload = (await res.json()) as ViaCepPayload;
    // `erro` marca CEP inexistente — resposta LEGÍTIMA e estável, vale cachear.
    const valor = payload && payload.erro ? null : payload;
    cacheSet(cep, valor);
    return valor;
  } catch {
    return null;
  }
}

/** R2 (27/07, rota rápida) — consulta AVULSA de um CEP (mesmo cache/timeout/never-throw
 *  do lote da conferência). null = CEP inexistente ou ViaCEP fora do ar. */
export interface CepConsultado {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}
export async function consultarCepPublico(cepRaw: string | null | undefined): Promise<CepConsultado | null> {
  const cep = normalizarCep(cepRaw);
  if (!cep) return null;
  const payload = await consultarViaCep(cep);
  if (!payload) return null;
  return {
    logradouro: String(payload.logradouro ?? '').trim(),
    bairro: String(payload.bairro ?? '').trim(),
    localidade: String(payload.localidade ?? '').trim(),
    uf: String(payload.uf ?? '').trim().toUpperCase(),
  };
}

// ── BUSCA REVERSA: endereço → CEP (27/07, ordem do dono) ──────────────────────────
/**
 * "Ela não tem CEP, mas o endereço está PERFEITO" — o buraco que fazia a sanitização
 * não ser funcional: a cura do pino (CNEFE) entra por (cep, número), então cadastro
 * completo SEM CEP caía em "Sem CEP e número" e nunca saía de vermelho, por mais certo
 * que estivesse. Com UF + cidade + logradouro o ViaCEP devolve o(s) CEP(s) daquela rua
 * e a cura segue o caminho normal — o CEP descoberto ainda é GRAVADO no cadastro, que
 * é o que "sanitizar" quer dizer: o furo some, não volta na próxima rota.
 *
 * Fail-CLOSED (ao contrário do resto deste arquivo): aqui o resultado vira ESCRITA de
 * cadastro e pino, não um aviso na tela — vale a mesma lei do freio do geocode (Lei nº1,
 * pino errado é pior que pino vazio). Só volta rua cuja CIDADE bate e cuja VIA bate pela
 * mesma régua do CNEFE; qualquer dúvida (rede fora, cidade divergente, rua ambígua)
 * devolve lista vazia e o cadastro segue como estava.
 */
/** Teto de CEPs devolvidos por rua — rua longa tem CEP por trecho; cada um é 1 tentativa
 *  no CNEFE, e é o CNEFE (fail-closed) que decide qual casa com o número da casa.
 *  16 porque avenida de cidade média passa de 30 trechos (medido: "Avenida 3" em Rio
 *  Claro devolve 14 CEPs compatíveis, "Rua 9" devolve 37). */
const VIACEP_BUSCA_MAX = 16;

/**
 * Tipos de via POR EXTENSO. O ViaCEP guarda "Avenida 54 A" e casa por trecho de texto:
 * buscar "Av. 54a" devolve ZERO — e o PONTO da abreviação chega a derrubar a rota da
 * API, que responde HTML no lugar de JSON. Medido em produção 27/07 nos cadastros reais
 * de Rio Claro: com abreviação, 0 de 5 clientes resolviam; por extenso, 13 seguidos.
 */
const TIPO_VIA_EXTENSO: Record<string, string> = {
  av: 'avenida', avn: 'avenida', avd: 'avenida', avenida: 'avenida',
  r: 'rua', rua: 'rua',
  tv: 'travessa', trav: 'travessa', travessa: 'travessa',
  rod: 'rodovia', rodovia: 'rodovia',
  est: 'estrada', estr: 'estrada', estrada: 'estrada',
  al: 'alameda', alameda: 'alameda',
  pc: 'praca', pca: 'praca', praca: 'praca',
};

export interface CepDaRua {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  /** O bairro deste trecho é o bairro do cadastro? É o desempate que decide QUAL pedaço
   *  de uma rua comprida é o do cliente. */
  bairroBate: boolean;
}

/** Palavras de TIPO de bairro — não identificam nada sozinhas ("Jardim", "Vila"...).
 *  O cadastro escreve "Jd. Santa Cruz" e o ViaCEP "Jardim Santa Cruz": comparar o texto
 *  inteiro nunca casa; comparar o NÚCLEO ("santa cruz") casa sempre. */
const TIPO_BAIRRO = new Set([
  'jardim', 'jd', 'vila', 'vl', 'parque', 'pq', 'conjunto', 'conj', 'habitacional',
  'residencial', 'res', 'chacara', 'chacaras', 'distrito', 'nucleo', 'bairro', 'setor',
  'cidade', 'centro', 'do', 'da', 'de', 'dos', 'das', 'e',
]);

/** Numeral ROMANO do bairro vira dígito: o Correio escreve "Jardim São Caetano II" e o
 *  cadastro "Jd. São Caetano 2" — sem isto o bairro nunca casa (caso Eudis, 27/07). */
const ROMANO: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
};

/** O núcleo do bairro, sem as palavras de tipo: "Jd. Santa Cruz" → ["santa","cruz"];
 *  "Jardim São Caetano II" → ["sao","caetano","2"]. */
function nucleoBairro(valor: string | null | undefined): string[] {
  return normalizar(valor)
    .replace(/[.,/\\-]/g, ' ')
    .split(/\s+/)
    .map((t) => ROMANO[t] ?? t)
    .filter((t) => (t.length > 1 || /^\d$/.test(t)) && !TIPO_BAIRRO.has(t));
}

/**
 * O cadastro DIZ um bairro? (coluna própria, ou um trecho do texto que não é a via nem
 * um número solto). É o que decide se o bairro pode ser EXIGIDO: quem informou bairro
 * tem direito a que ele mande; quem não informou só tem a rua.
 */
export function temBairroNoCadastro(cadastro: EnderecoCadastrado): boolean {
  if (String(cadastro.bairro ?? '').trim()) return true;
  const via = logradouroDoCadastro(cadastro.endereco);
  return String(cadastro.endereco ?? '')
    .split(/\s*[,;]\s*|\s+[-—–]\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .some((trecho) => trecho !== via && /[a-zà-ú]{3}/i.test(trecho));
}

const cacheBusca = new Map<string, { valor: ViaCepPayload[]; expiraEm: number }>();

/** Sem acento, minúsculo — só pra COMPARAR/BUSCAR, nunca pra gravar. */
function semAcento(valor: string | null | undefined): string {
  return normalizar(valor);
}

/** O trecho começa com tipo de via ("Rua ...", "Av. ...")? É o que separa logradouro
 *  de bairro num campo de texto livre. */
function pareceVia(trecho: string): boolean {
  const primeiro = semAcento(trecho).replace(/[.]/g, '').split(/\s+/)[0] ?? '';
  if (primeiro in TIPO_VIA_EXTENSO) return true;
  const letraDigito = /^([a-z]+?)(\d{1,4})([a-z]?)$/.exec(primeiro);
  return !!letraDigito && (letraDigito[1] in TIPO_VIA_EXTENSO || separarTipoColado(letraDigito[1]) !== null);
}

/**
 * Tipo de via GRUDADO no nome, seguido de número: "Avm19" = Av. M-19, "Ruam20a" =
 * Rua M-20A — o cadastro é digitado correndo, sem espaço. Só separa quando o token já
 * vem colado a um NÚMERO (o chamador garante isso), que é o que confina a regra a este
 * caso e impede o estrago óbvio: "Rua Rui Barbosa" não pode virar "rua r ui barbosa".
 * Prefixo de 2+ letras, sobra de 1-2 letras.
 */
function separarTipoColado(token: string): string[] | null {
  if (token in TIPO_VIA_EXTENSO) return null;
  for (const tipo of ['travessa', 'avenida', 'alameda', 'estrada', 'rodovia', 'praca', 'trav', 'estr', 'rua', 'av', 'rod', 'est', 'pca', 'avn', 'avd', 'pc', 'tv', 'al']) {
    if (!token.startsWith(tipo)) continue;
    const resto = token.slice(tipo.length);
    if (resto.length >= 1 && resto.length <= 2 && /^[a-z]+$/.test(resto)) return [tipo, resto];
  }
  return null;
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

/**
 * O termo que o ViaCEP entende, a partir da via do cadastro: pontuação vira espaço
 * (ponto derruba a rota da API), tipo abreviado vira EXTENSO e letra colada em número
 * se separa — "Av. 54a" → "avenida 54 a", "Rua M22" → "rua m 22", que é exatamente como
 * a base guarda ("Avenida 54 A", "Rua M 22"). A precisão fina não é feita aqui: quem
 * decide se a rua devolvida é a MESMA é `viasCompativeisCnefe`, régua de palavra inteira.
 */
export function termoBuscaVia(via: string | null | undefined): string {
  const tokens = semAcento(via)
    .replace(/[.,/\\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // "54a" → "54 a" e "M22" → "m 22": o ViaCEP separa, o cadastro cola.
    .flatMap((token) => {
      const letraDigito = /^([a-z]+?)(\d{1,4})([a-z]?)$/.exec(token);
      if (letraDigito) {
        // "Avm19" → av · m · 19 (tipo colado no nome); "Rua38" → rua · 38 (tipo inteiro).
        const cabeca = separarTipoColado(letraDigito[1]) ?? [letraDigito[1]];
        return [...cabeca, letraDigito[2], letraDigito[3]].filter(Boolean);
      }
      const digitoLetra = /^(\d{1,4})([a-z]{1,2})$/.exec(token);
      if (digitoLetra) return [digitoLetra[1], digitoLetra[2]];
      return [token];
    });
  if (tokens.length && tokens[0] in TIPO_VIA_EXTENSO) tokens[0] = TIPO_VIA_EXTENSO[tokens[0]];
  return tokens.join(' ').trim();
}

/** ViaCEP busca por rua (`/ws/UF/cidade/logradouro/json/`). Best-effort: NUNCA lança.
 *  Resposta legítima (inclusive lista vazia) entra no cache; falha de rede não. */
async function buscarViaCepPorRua(uf: string, cidade: string, via: string, chave: string): Promise<ViaCepPayload[]> {
  const cache = cacheBusca.get(chave);
  if (cache) {
    if (cache.expiraEm >= Date.now()) return cache.valor;
    cacheBusca.delete(chave);
  }
  try {
    const url = `${VIACEP_URL}/${uf}/${encodeURIComponent(cidade)}/${encodeURIComponent(via)}/json/`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const payload = await res.json();
    // Resposta de ERRO do ViaCEP (busca com mais de 50 resultados, campo curto) vem
    // como objeto, não array — trata como "não sei", sem cachear achado nenhum.
    const lista = Array.isArray(payload) ? (payload as ViaCepPayload[]) : [];
    if (cacheBusca.size >= CACHE_MAX) {
      const primeira = cacheBusca.keys().next();
      if (!primeira.done) cacheBusca.delete(primeira.value);
    }
    cacheBusca.set(chave, { valor: lista, expiraEm: Date.now() + CACHE_TTL_MS });
    return lista;
  } catch {
    return [];
  }
}

/** Zera os dois caches (consulta por CEP e busca por rua) entre casos de teste. */
export function limparCacheBuscaCep(): void {
  cacheBusca.clear();
}

/**
 * CEP(s) da rua do cadastro. Vazio = não deu pra provar (e aí nada é gravado).
 * Ordenado como o ViaCEP devolveu; quem escolhe o certo é o CNEFE, casando o NÚMERO
 * da casa — este util só entrega os candidatos com cidade e via provadas.
 */
export async function descobrirCepsPorEndereco(cadastro: EnderecoCadastrado): Promise<CepDaRua[]> {
  if (!cepCheckHabilitado()) return [];
  const uf = String(cadastro.uf ?? '').trim().toUpperCase();
  const cidade = String(cadastro.cidade ?? '').trim();
  const via = logradouroDoCadastro(cadastro.endereco);
  const termo = termoBuscaVia(via);
  // Mínimos do próprio ViaCEP: UF de 2 letras, cidade e logradouro com 3+ caracteres.
  if (!/^[A-Z]{2}$/.test(uf) || cidade.length < 3 || termo.length < 3) return [];

  const cidadeNorm = normalizar(cidade);
  const lista = await buscarViaCepPorRua(uf, cidade, termo, `${uf}|${cidadeNorm}|${termo}`);

  const vistos = new Set<string>();
  const saida: CepDaRua[] = [];
  for (const item of lista) {
    const cep = normalizarCep(item.cep);
    if (!cep || vistos.has(cep)) continue;
    // Cidade tem que bater (o ViaCEP casa nome de cidade por aproximação) e a via tem
    // que ser a MESMA rua — mesma régua do CNEFE, que entende "Rua 8" = "RUA OITO".
    if (normalizar(item.localidade) !== cidadeNorm) continue;
    if (!viasCompativeisCnefe(via, item.logradouro)) continue;
    vistos.add(cep);
    saida.push({
      cep,
      logradouro: String(item.logradouro ?? '').trim(),
      bairro: String(item.bairro ?? '').trim(),
      localidade: String(item.localidade ?? '').trim(),
      uf: String(item.uf ?? '').trim().toUpperCase(),
      bairroBate: false,
    });
  }
  // BAIRRO NA FRENTE (precisão, não capricho): rua comprida tem um CEP por TRECHO — "Rua
  // 15" em Rio Claro devolve 16. Quem tenta primeiro é o trecho do bairro do cadastro;
  // sem isso o pino sai no pedaço errado da MESMA rua, que é o erro mais difícil de o
  // entregador perceber. O bairro vem da coluna OU do texto do endereço (no legado ele
  // mora lá) e a comparação é por NÚCLEO — medido: comparando texto inteiro, "Jd. Santa
  // Cruz" nunca casava com "Jardim Santa Cruz" e o desempate simplesmente não existia.
  // Os DOIS lados passam pela mesma régua (romano → dígito, pontuação → espaço): o
  // Correio escreve "São Caetano II" e o cadastro "São Caetano 2" — comparar cru nunca
  // casa, e foi assim que o Eudis ganhou o CEP do Centro (auditoria do dono, 27/07).
  const textoCadastro = ` ${normalizar(`${cadastro.bairro ?? ''} ${cadastro.endereco ?? ''}`)
    .replace(/[.,/\\-]/g, ' ')
    .split(/\s+/)
    .map((t) => ROMANO[t] ?? t)
    .join(' ')} `;
  for (const c of saida) {
    const nucleo = nucleoBairro(c.bairro);
    c.bairroBate = nucleo.length > 0 && nucleo.every((t) => textoCadastro.includes(` ${t} `));
  }
  return saida.sort((a, b) => Number(b.bairroBate) - Number(a.bairroBate)).slice(0, VIACEP_BUSCA_MAX);
}

/**
 * O CEP consultado descreve o MESMO lugar do endereço cadastrado?
 *
 * Só devolve 'nao_bate' com prova, em ordem de força decrescente:
 *  1. UF diferente        — impossível ser o mesmo lugar.
 *  2. cidade diferente    — idem (é o caso clássico do CEP copiado de outro cliente).
 *  3. via incompatível    — só quando o CEP TEM logradouro (CEP de rua). CEP geral de
 *     cidade vem com logradouro vazio e não prova nada sobre a rua.
 *
 * Bairro NÃO entra: divergência de bairro é ruído conhecido do ViaCEP (limites e nomes
 * populares diferem do oficial) e não prova endereço errado.
 */
export function compararCepComEndereco(payload: ViaCepPayload | null, cadastro: EnderecoCadastrado): CepVeredito {
  if (!payload) return 'indeterminado';

  const ufCep = String(payload.uf ?? '').trim().toUpperCase();
  const ufCadastro = String(cadastro.uf ?? '').trim().toUpperCase();
  if (ufCep && /^[A-Z]{2}$/.test(ufCadastro) && ufCep !== ufCadastro) return 'nao_bate';

  const cidadeCep = normalizar(payload.localidade);
  const cidadeCadastro = normalizar(cadastro.cidade);
  if (cidadeCep && cidadeCadastro && cidadeCep !== cidadeCadastro) return 'nao_bate';

  const viaCep = normalizeVia(payload.logradouro);
  const viaCadastro = normalizeVia(cadastro.endereco);
  if (viaCep && viaCadastro && !viasCompativeisCnefe(cadastro.endereco, payload.logradouro)) return 'nao_bate';

  // Chegou aqui sem nada divergir: só é 'bate' se ALGO foi realmente comparado.
  const comparouAlgo = Boolean((ufCep && ufCadastro) || (cidadeCep && cidadeCadastro) || (viaCep && viaCadastro));
  return comparouAlgo ? 'bate' : 'indeterminado';
}

/**
 * Confere uma lista de endereços de uma vez. Devolve, na MESMA ordem da entrada, o
 * veredito de cada um. Dedupe por CEP, concorrência limitada e orçamento de tempo —
 * quem não couber no orçamento sai 'indeterminado' (silêncio), nunca erro.
 */
export async function conferirCepsEmLote(cadastros: EnderecoCadastrado[]): Promise<CepVeredito[]> {
  const vereditos: CepVeredito[] = cadastros.map(() => 'indeterminado');
  if (!cepCheckHabilitado()) return vereditos;

  // Só vale consultar quem tem CEP de 8 dígitos E tem com o que comparar (cidade ou UF ou
  // via). Sem nada no cadastro, o ViaCEP responderia pra nada.
  const alvos = new Map<string, number[]>();
  cadastros.forEach((cadastro, indice) => {
    const cep = normalizarCep(cadastro.cep);
    if (!cep) return;
    const temComparavel = Boolean(
      String(cadastro.cidade ?? '').trim() || String(cadastro.uf ?? '').trim() || String(cadastro.endereco ?? '').trim(),
    );
    if (!temComparavel) return;
    const lista = alvos.get(cep);
    if (lista) lista.push(indice);
    else alvos.set(cep, [indice]);
  });
  if (alvos.size === 0) return vereditos;

  const fim = Date.now() + VIACEP_ORCAMENTO_MS;
  const ceps = [...alvos.keys()];
  let proximo = 0;

  const trabalhador = async (): Promise<void> => {
    for (;;) {
      const i = proximo;
      proximo += 1;
      if (i >= ceps.length) return;
      // Orçamento estourado: para de consultar. O que sobrou fica indeterminado (silêncio)
      // — a conferência abre no tempo dela, com ou sem esta checagem.
      if (Date.now() >= fim) return;
      const cep = ceps[i];
      const payload = await consultarViaCep(cep);
      for (const indice of alvos.get(cep) ?? []) {
        vereditos[indice] = compararCepComEndereco(payload, cadastros[indice]);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(VIACEP_CONCORRENCIA, ceps.length) }, () => trabalhador()));
  return vereditos;
}

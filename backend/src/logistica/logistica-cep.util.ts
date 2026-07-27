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

import { normalizeVia, viasCompativeis } from '../nucleo/nucleo-geo.util';

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
  if (viaCep && viaCadastro && !viasCompativeis(viaCadastro, payload.logradouro)) return 'nao_bate';

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

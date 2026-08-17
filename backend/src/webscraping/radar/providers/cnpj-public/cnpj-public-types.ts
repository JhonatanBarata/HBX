import type { NormalizedSearchInput } from '../../shared/radar-types';
import type { WebscrapingContactResult } from '../../shared/radar-core-shared';

export type CnpjPublicCompanyRecord = {
  cnpj?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
  city?: string | null;
  state?: string | null;
  cnae?: string | null;
  cnaeDescription?: string | null;
  situacao?: string | null;
  porte?: string | null;
  matrizFilial?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  // Sócio-administrador do dump da RFB (coluna ownerName da CnpjPublicCompany) — opcional,
  // registro antigo sem ele continua válido.
  ownerName?: string | null;
  ownerQualification?: string | null;
  raw?: Record<string, any> | null;
};

export type CnpjPublicSearchInput = {
  normalized: NormalizedSearchInput;
  seeds?: Array<Record<string, any>>;
  limit?: number;
  records?: CnpjPublicCompanyRecord[];
};

/**
 * LOTE 2 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): a Receita passou a DRENAR a base
 * antes de a web entrar, e drenagem sem cursor é bug garantido (a fonte repetiria a MESMA
 * primeira página a cada lote, tudo viraria duplicata e o run morreria por lote vazio).
 *
 * O cursor tem DUAS FASES porque o SELECT do dump também tem: primeiro quem TEM canal de
 * contato (`with_contact`), depois o resto (`without_contact`) — cada fase com âncora própria,
 * porque a segunda usa outro WHERE e outra ordenação. `cnpj` é a âncora porque é a única
 * coluna `@unique` útil da CnpjPublicCompany (o `id` é cuid, sem ordem).
 */
export type CnpjPublicDrainPhase = 'with_contact' | 'without_contact';

export type CnpjPublicDrainCursor = {
  phase: CnpjPublicDrainPhase;
  cnpj: string | null;
};

/**
 * Página do dump. `rawCount` é o número de linhas que o Postgres devolveu ANTES do filtro fino
 * em memória — medir seca por `records.length` seria mentira: o matcher de segmento zera páginas
 * inteiras enquanto a base ainda tem milhões de linhas pra oferecer.
 *
 * `phase` (17/08) é a fase de ONDE ESTA PÁGINA VEIO, e não se deduz do `nextCursor`: numa página
 * curta o `nextCursor` já vem com a fase VIRADA. A fonte precisa da fase de origem pra re-ancorar
 * o cursor quando o provider para no meio da página (meta batida) — re-ancorar na fase errada
 * abandonaria o rabo da fase atual, que é exatamente o defeito que a `phase` fecha.
 */
export type CnpjPublicDatasetPage = {
  records: CnpjPublicCompanyRecord[];
  rawCount: number;
  phase: CnpjPublicDrainPhase;
  nextCursor: CnpjPublicDrainCursor | null;
  exhausted: boolean;
};

export type CnpjPublicProviderResult = {
  status: 'completed' | 'skipped' | 'partial_error';
  retryable: boolean;
  reason: string;
  foundCount: number;
  acceptedCount: number;
  rejectedCount: number;
  /**
   * ATÉ ONDE O PROVIDER PERCORREU a página (17/08 — a cura do "a drenagem joga fora a cauda da
   * página"): índice onde o laço parou, NÃO quantos aceitou. Registro rejeitado foi avaliado e
   * conta aqui; o que ficou depois do `break` do limite não conta e continua devendo.
   *
   * Existe porque o cursor da drenagem só pode andar até o último registro CONSUMIDO. Enquanto
   * o provider só sabia dizer `acceptedCount`, a fonte adivinhava "percorreu a página inteira" e
   * virava a página por cima do que ninguém tinha olhado — com página de 500 e meta 20, até 480
   * linhas viravam inalcançáveis no run.
   */
  consumedCount: number;
  results: WebscrapingContactResult[];
  issue?: {
    message: string;
    retryable: boolean;
    blocksDelivery: false;
  } | null;
};

/**
 * Celular legado (pré-nono-dígito) cadastrado na Receita/BrasilAPI: 10 dígitos, DDD +
 * assinante de 8 dígitos começando em 6-9 — norma Anatel manda inserir '9' após o DDD
 * (62 9261-7022 → 62 99261-7022). `isRealisticBrPhone` rejeita corretamente o formato
 * antigo (fixo não começa com 9), então o filtro mata pizzarias reais cujo único
 * defeito é o cadastro na Receita ser anterior à mudança. Fix na FONTE: só o caminho
 * cnpj_public/BrasilAPI passa por aqui — o legado de 10 dígitos SÓ é conhecido nesse
 * caminho; telefone vindo de scraping web NUNCA passa por esta função.
 */
export function normalizeLegacyBrCellphone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 10) return digits;
  const thirdDigit = digits[2];
  if (thirdDigit >= '6' && thirdDigit <= '9') {
    return `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return digits;
}

// Empresário Individual / MEI (natureza 2135) no dump da RFB vem com o CNPJ básico
// FORMATADO grudado na frente do nome da pessoa e SEM nome fantasia:
//   "61.847.418 JOSELMA DA SILVA FLORENTINO"  (cnpj 61847418000123)
// Como o card faz `name = nomeFantasia || razaoSocial`, o número aparece "antes do nome".
// O CNPJ já tem campo próprio no card/detalhe — então tira-se o prefixo do NOME, sem perder
// dado. É o formato do próprio dump (não erro de import), por isso só atinge um subconjunto.
const RFB_CNPJ_BASICO_PREFIX = /^\s*(\d{2}\.\d{3}\.\d{3})\s+(?=\S)/;

/**
 * Remove o prefixo de CNPJ básico da razão social de MEI/EI. Só age quando o prefixo (8
 * dígitos sem pontos) BATE com o CNPJ básico do registro (`cnpj.slice(0,8)`) e sobra um nome
 * com letra — nunca produz nome vazio/numérico nem mexe em razão legítima que só por acaso
 * comece com número. Sem CNPJ pra conferir, exige o padrão estrito + resto com letra.
 */
export function cleanRfbLegalName(razaoSocial: unknown, cnpj?: unknown): string {
  const raw = String(razaoSocial || '').trim();
  if (!raw) return raw;
  const match = raw.match(RFB_CNPJ_BASICO_PREFIX);
  if (!match) return raw;
  const prefixDigits = match[1].replace(/\D/g, '');
  const cnpjDigits = String(cnpj || '').replace(/\D/g, '');
  if (cnpjDigits.length >= 8 && prefixDigits !== cnpjDigits.slice(0, 8)) return raw;
  const rest = raw.slice(match[0].length).trim();
  if (!rest || !/\p{L}/u.test(rest)) return raw;
  return rest;
}

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
  phone2?: string | null;
  /** Fax cadastral da RFB tratado como terceiro candidato de telefone, nunca como WhatsApp. */
  fax?: string | null;
  faxDigits?: string | null;
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

export type CnpjPublicProviderResult = {
  status: 'completed' | 'skipped' | 'partial_error';
  retryable: boolean;
  reason: string;
  foundCount: number;
  acceptedCount: number;
  rejectedCount: number;
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

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

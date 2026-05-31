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

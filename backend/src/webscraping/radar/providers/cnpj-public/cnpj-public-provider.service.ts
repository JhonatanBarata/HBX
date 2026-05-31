import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../../shared/radar-core-shared';
import type { CnpjPublicCompanyRecord, CnpjPublicProviderResult, CnpjPublicSearchInput } from './cnpj-public-types';

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCnpj(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function isActiveCompany(record: CnpjPublicCompanyRecord) {
  const status = normalizeText(record.situacao || 'ativa');
  return !status || ['ativa', 'ativo', 'active'].includes(status);
}

function segmentMatches(record: CnpjPublicCompanyRecord, segment: unknown) {
  const requested = normalizeText(segment);
  if (!requested) return true;
  const haystack = normalizeText([
    record.nomeFantasia,
    record.razaoSocial,
    record.cnae,
    record.cnaeDescription,
  ].filter(Boolean).join(' '));
  const tokens = requested.split(/\s+/).filter((token) => token.length >= 4);
  const variants = tokens.flatMap((token) => (token.endsWith('s') ? [token, token.slice(0, -1)] : [token, `${token}s`]));
  return !variants.length || variants.some((token) => token.length >= 4 && haystack.includes(token));
}

function locationMatches(record: CnpjPublicCompanyRecord, city: unknown, state: unknown) {
  const requestedCity = normalizeText(city);
  const requestedState = String(state || '').trim().toUpperCase();
  const recordCity = normalizeText(record.city);
  const recordState = String(record.state || '').trim().toUpperCase();
  if (requestedCity && recordCity && requestedCity !== recordCity) return false;
  if (requestedState && recordState && requestedState !== recordState) return false;
  return true;
}

@Injectable()
export class CnpjPublicProviderService {
  async search(input: CnpjPublicSearchInput): Promise<CnpjPublicProviderResult> {
    const records = Array.isArray(input.records) ? input.records : [];
    if (!records.length) {
      return {
        status: 'skipped',
        retryable: false,
        reason: 'cnpj_public_provider_sem_base_configurada',
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        results: [],
      };
    }

    const limit = Math.max(1, Math.min(100, Number(input.limit || 20) || 20));
    const accepted: WebscrapingContactResult[] = [];
    let rejectedCount = 0;
    for (const record of records) {
      if (!isActiveCompany(record)) {
        rejectedCount += 1;
        continue;
      }
      if (!locationMatches(record, input.normalized.city, input.normalized.state)) {
        rejectedCount += 1;
        continue;
      }
      if (!segmentMatches(record, input.normalized.segment)) {
        rejectedCount += 1;
        continue;
      }
      const mapped = this.toContactResult(record, input.normalized);
      if (!mapped) {
        rejectedCount += 1;
        continue;
      }
      accepted.push(mapped);
      if (accepted.length >= limit) break;
    }

    return {
      status: 'completed',
      retryable: false,
      reason: accepted.length ? 'cnpj_public_records_normalizados' : 'cnpj_public_sem_registros_compativeis',
      foundCount: records.length,
      acceptedCount: accepted.length,
      rejectedCount,
      results: accepted,
    };
  }

  toContactResult(record: CnpjPublicCompanyRecord, normalized: { city?: string | null; state?: string | null; segment?: string | null }): WebscrapingContactResult | null {
    const cnpj = normalizeCnpj(record.cnpj);
    const name = String(record.nomeFantasia || record.razaoSocial || '').trim();
    if (!cnpj || !name) return null;
    const phoneDigits = normalizePhoneDigits(record.phone);
    return {
      placeId: `cnpj_public:${cnpj}`,
      name,
      legalName: record.razaoSocial || null,
      phone: record.phone || '',
      phoneDigits,
      rating: null,
      reviews: null,
      address: record.address || null,
      website: record.website || null,
      email: record.email || null,
      city: record.city || normalized.city || null,
      state: record.state || normalized.state || null,
      segment: normalized.segment || null,
      cnpj,
      cnae: record.cnae || null,
      cnaeDescription: record.cnaeDescription || null,
      companySize: record.porte || null,
      companyBranchType: record.matrizFilial || null,
      source: 'cnpj_public',
      sourceEngine: 'cnpj_public',
      evidenceJson: {
        cnpjPublic: {
          cnpj,
          situacao: record.situacao || 'ativa',
          cnae: record.cnae || null,
          cnaeDescription: record.cnaeDescription || null,
          porte: record.porte || null,
          matrizFilial: record.matrizFilial || null,
          raw: record.raw || null,
        },
      },
    } as any;
  }
}

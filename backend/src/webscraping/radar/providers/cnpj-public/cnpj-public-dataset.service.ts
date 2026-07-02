import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../../shared/radar-types';
import { normalizeLegacyBrCellphone } from './cnpj-public-types';
import type { CnpjPublicCompanyRecord } from './cnpj-public-types';

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function segmentTokenVariants(segment: unknown) {
  const tokens = normalizeText(segment).split(/\s+/).filter((token) => token.length >= 4);
  return Array.from(new Set(tokens.flatMap((token) => (token.endsWith('s') ? [token, token.slice(0, -1)] : [token, `${token}s`]))));
}

function parseRawJson(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

@Injectable()
export class CnpjPublicDatasetService {
  async fetchRecords(input: {
    prisma?: any;
    normalized: NormalizedSearchInput;
    limit?: number;
  }): Promise<CnpjPublicCompanyRecord[]> {
    const prisma = input.prisma;
    if (!prisma?.cnpjPublicCompany?.findMany) return [];

    const city = normalizeText(input.normalized?.city);
    const state = String(input.normalized?.state || '').trim().toUpperCase();
    const variants = segmentTokenVariants(input.normalized?.segment);
    // Segmento pode vir como código CNAE (4-7 dígitos, ex. "5611" ou "5611203") — com o dump
    // da RFB carregado, cidade×CNAE resolve direto no índice (normalizedCity, cnae).
    const cnaeCode = (normalizeText(input.normalized?.segment).match(/\b\d{4,7}\b/) || [])[0] || null;
    const take = Math.max(200, Math.min(2000, (Number(input.limit) || 20) * 25));

    const where: Record<string, any> = {};
    if (city) where.normalizedCity = city;
    if (state) where.state = state;
    const matchers: Array<Record<string, any>> = variants.map((token) => ({ searchText: { contains: token } }));
    if (cnaeCode) matchers.push({ cnae: { startsWith: cnaeCode } });
    if (matchers.length) where.OR = matchers;

    let rows: any[] = [];
    try {
      rows = await prisma.cnpjPublicCompany.findMany({
        where,
        take,
        orderBy: { updatedAt: 'desc' },
      });
    } catch {
      return [];
    }

    return (rows || []).map((row) => ({
      cnpj: row.cnpj || null,
      nomeFantasia: row.nomeFantasia || null,
      razaoSocial: row.razaoSocial || null,
      city: row.city || null,
      state: row.state || null,
      cnae: row.cnae || null,
      cnaeDescription: row.cnaeDescription || null,
      situacao: row.situacao || 'ativa',
      porte: row.porte || null,
      matrizFilial: row.matrizFilial || null,
      email: row.email || null,
      // Linha pode ter sido gravada com celular legado (10 dig, 3º dígito 6-9) antes deste
      // fix — normaliza na leitura pra nono-dígito atual da Anatel, na FONTE cnpj_public.
      phone: row.phone ? (normalizeLegacyBrCellphone(row.phone) || row.phone) : null,
      website: row.website || null,
      address: row.address || null,
      ownerName: row.ownerName || null,
      ownerQualification: row.ownerQualification || null,
      raw: parseRawJson(row.rawJson),
    }));
  }
}

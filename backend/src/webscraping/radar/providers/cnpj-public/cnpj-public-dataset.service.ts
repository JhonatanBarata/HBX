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
    if (!prisma?.cnpjPublicCompany?.findMany) {
      throw new Error('CnpjPublicCompany indisponível neste processo.');
    }

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

    // FURO PROVADO NA VPS (04/07 — 37.922 restaurantes SP, 97,6% COM telefone, mas o
    // motor recebia 199/200 SEM telefone → accepted=0 → "0 Receita/0 Fusão"): a carga do
    // dump é EM LOTE, então `updatedAt` é IDÊNTICO pra base inteira. `orderBy: updatedAt desc`
    // vira empate total e o Postgres, no empate, sobe justamente a minoria SEM contato — que
    // o gate mata como "Contato publico ausente" antes de virar card. A base tinha o telefone
    // o tempo todo; o SELECT do passo 2 da árvore-mestra é que servia o lixo.
    //
    // Correção na FONTE (não no gate): priorizar quem TEM canal de contato utilizável (a lane
    // grátis do cliente não vira card sem contato — RFB sem contato é trabalho da fábrica de
    // enriquecimento, não da vitrine imediata). `phoneShareCount asc` desempata pelo telefone
    // MENOS compartilhado (evita a linha do contador dividida por milhares de CNPJs). Só
    // completo o `take` com registros sem contato quando o nicho tem pouca cobertura, pra a
    // busca nunca voltar vazia.
    const hasContact: Array<Record<string, any>> = [
      { AND: [{ phone: { not: null } }, { phone: { not: '' } }] },
      { AND: [{ email: { not: null } }, { email: { not: '' } }] },
    ];
    const withContactWhere = { AND: [where, { OR: hasContact }] };
    const withoutContactWhere = { AND: [where, { NOT: { OR: hasContact } }] };

    let rows: any[] = [];
    try {
      rows = await prisma.cnpjPublicCompany.findMany({
        where: withContactWhere,
        take,
        orderBy: [{ phoneShareCount: 'asc' }, { openedAt: 'desc' }],
      });
      if (rows.length < take) {
        const fill = await prisma.cnpjPublicCompany.findMany({
          where: withoutContactWhere,
          take: take - rows.length,
          orderBy: { openedAt: 'desc' },
        });
        rows = rows.concat(fill || []);
      }
    } catch (error) {
      // Ausência real de linhas é `[]`; erro de delegate/schema precisa subir para a fonte
      // marcar partial_error. Silenciar aqui acionava discovery e fingia base vazia.
      throw new Error(`Falha ao consultar CnpjPublicCompany: ${String((error as any)?.message || error)}`);
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

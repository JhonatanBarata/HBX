import { Injectable } from '@nestjs/common';

export type IcpFingerprint = {
  companyId: number;
  wonCount: number;
  dominantSegments: string[];
  secondarySegments: string[];
  dominantCities: string[];
  secondaryCities: string[];
  computedAt: string;
};

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rankByFrequency(values: string[]): Array<{ value: string; count: number }> {
  const map = new Map<string, number>();
  for (const v of values) {
    if (v) map.set(v, (map.get(v) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

@Injectable()
export class IcpFingerprintService {
  async getFingerprint(prisma: any, companyId: number): Promise<IcpFingerprint | null> {
    const rows: any[] = await prisma?.vendasLead?.findMany?.({
      where: { companyId, saleStatus: 'sale_confirmed' },
      select: { segment: true, city: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }).catch(() => null) ?? [];

    if (!rows?.length) return null;

    const segments = rows.map((r) => normalizeText(r.segment)).filter(Boolean);
    const cities = rows.map((r) => normalizeText(r.city)).filter(Boolean);

    const segRanked = rankByFrequency(segments);
    const cityRanked = rankByFrequency(cities);

    const topSeg = segRanked[0]?.count ?? 0;
    const topCity = cityRanked[0]?.count ?? 0;

    return {
      companyId,
      wonCount: rows.length,
      dominantSegments: segRanked
        .filter((s) => s.count >= Math.max(1, topSeg * 0.6))
        .map((s) => s.value),
      secondarySegments: segRanked
        .filter((s) => s.count >= Math.max(1, topSeg * 0.25) && s.count < topSeg * 0.6)
        .map((s) => s.value),
      dominantCities: cityRanked
        .filter((c) => c.count >= Math.max(1, topCity * 0.6))
        .map((c) => c.value),
      secondaryCities: cityRanked
        .filter((c) => c.count >= Math.max(1, topCity * 0.25) && c.count < topCity * 0.6)
        .map((c) => c.value),
      computedAt: new Date().toISOString(),
    };
  }

  computeFit(
    lead: { normalizedSegment?: string | null; normalizedCity?: string | null },
    fingerprint: IcpFingerprint | null,
  ): number {
    if (!fingerprint || fingerprint.wonCount < 3) return 0;
    const seg = normalizeText(lead.normalizedSegment);
    const city = normalizeText(lead.normalizedCity);
    let score = 0;
    if (seg && fingerprint.dominantSegments.includes(seg)) score += 60;
    else if (seg && fingerprint.secondarySegments.includes(seg)) score += 30;
    if (city && fingerprint.dominantCities.includes(city)) score += 40;
    else if (city && fingerprint.secondaryCities.includes(city)) score += 20;
    return Math.min(100, score);
  }

  async getGemeosInsight(
    prisma: any,
    companyId: number,
    fingerprint: IcpFingerprint | null,
  ): Promise<{ dominantSegment: string | null; gemeos: number; comSinal: number } | null> {
    if (!fingerprint || !fingerprint.dominantSegments.length) return null;
    const dominantSeg = fingerprint.dominantSegments[0];
    if (!dominantSeg) return null;

    const PROTECTED = ['imported_to_vendas', 'sent_to_vendas', 'negative', 'complaint', 'denied', 'hidden'];
    const [gemeos, comSinal] = await Promise.all([
      prisma?.radarLeadPool?.count?.({
        where: {
          normalizedSegment: dominantSeg,
          status: 'clean',
          companyStates: { none: { companyId, status: { in: PROTECTED } } },
        },
      }).catch(() => 0) ?? 0,
      prisma?.radarLeadPool?.count?.({
        where: {
          normalizedSegment: dominantSeg,
          status: 'clean',
          opportunityScore: { gte: 55 },
          companyStates: { none: { companyId, status: { in: PROTECTED } } },
        },
      }).catch(() => 0) ?? 0,
    ]);

    return { dominantSegment: dominantSeg, gemeos: Number(gemeos), comSinal: Number(comSinal) };
  }

  async runHunterForCompany(
    prisma: any,
    companyId: number,
  ): Promise<{ found: number; segment: string | null; city: string | null }> {
    const fingerprint = await this.getFingerprint(prisma, companyId);
    if (!fingerprint || fingerprint.wonCount < 3) return { found: 0, segment: null, city: null };

    const seg = fingerprint.dominantSegments[0] ?? null;
    const city = fingerprint.dominantCities[0] ?? null;
    const PROTECTED = ['imported_to_vendas', 'sent_to_vendas', 'negative', 'complaint', 'denied', 'hidden'];

    const where: any = {
      status: 'clean',
      opportunityScore: { gte: 60 },
      companyStates: { none: { companyId, status: { in: PROTECTED } } },
    };
    if (seg) where.normalizedSegment = seg;
    if (city) where.normalizedCity = city;

    const count = await prisma?.radarLeadPool?.count?.({ where }).catch(() => 0) ?? 0;
    return { found: Number(count), segment: seg, city };
  }
}

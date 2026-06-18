export type LeadSignalsData = {
  signals: string[];
  diasAberto: number | null;
  situacaoCadastral: string | null;
  cnae: string | null;
  computedAt: string;
};

export function parseSignalsJson(value: unknown): LeadSignalsData {
  const empty: LeadSignalsData = {
    signals: [],
    diasAberto: null,
    situacaoCadastral: null,
    cnae: null,
    computedAt: '',
  };
  if (!value || typeof value !== 'string') return empty;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return empty;
    return {
      signals: Array.isArray(parsed.signals)
        ? parsed.signals.filter((s: unknown) => typeof s === 'string')
        : [],
      diasAberto: typeof parsed.diasAberto === 'number' ? parsed.diasAberto : null,
      situacaoCadastral: typeof parsed.situacaoCadastral === 'string' ? parsed.situacaoCadastral : null,
      cnae: typeof parsed.cnae === 'string' ? parsed.cnae : null,
      computedAt: typeof parsed.computedAt === 'string' ? parsed.computedAt : '',
    };
  } catch {
    return empty;
  }
}

export function deriveRowSignals(row: {
  websiteStatus?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: string | null;
  socialConfidence?: number | null;
  rating?: number | null;
  reviews?: number | null;
  signalsJson?: string | null;
}): string[] {
  const stored = parseSignalsJson(row.signalsJson);
  const signals = new Set<string>(stored.signals);

  if (String(row.websiteStatus || '').trim() === 'none') signals.add('sem_site');

  const hasSocial = Boolean(row.instagramUrl || row.facebookUrl);
  const socialWeak = ['weak', 'missing', 'unknown'].includes(String(row.socialStatus || '').trim());
  const lowConfidence = Number(row.socialConfidence ?? 100) < 40;
  if (hasSocial && (socialWeak || lowConfidence)) signals.add('instagram_parado');

  const rating = typeof row.rating === 'number' ? row.rating : null;
  const reviews = Number(row.reviews ?? 0);
  if (rating !== null && rating < 3.5 && reviews >= 20) signals.add('avaliacoes_em_queda');

  if (stored.signals.includes('recem_aberto') && reviews > 0 && reviews < 5) {
    signals.add('poucas_avaliacoes_novo');
  }

  return Array.from(signals);
}

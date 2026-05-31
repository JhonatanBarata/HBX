import {
  RADAR_SOCIAL_CATEGORY_TOKENS,
  normalizeLookupValue,
  socialHandleFromUrl,
  looksLikeThirdPartySocialProfile,
} from './radar-social-matching';
import type { RadarSocialCandidate, RadarSocialCandidateScore } from './radar-social-types';

function compact(value: unknown) {
  return normalizeLookupValue(String(value || '')).replace(/[^a-z0-9]+/g, '');
}

function normalizePhoneDigits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

function domainFrom(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function tokens(value: unknown) {
  return normalizeLookupValue(String(value || ''))
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export class RadarSocialCandidateScorer {
  score(lead: any, candidate: RadarSocialCandidate): RadarSocialCandidateScore {
    const url = candidate.url;
    if (!url) return this.rejected(candidate, 0, 'url_social_invalida');
    if (looksLikeThirdPartySocialProfile(url)) return this.rejected(candidate, 0, 'perfil_terceiro');
    const handle = socialHandleFromUrl(url);
    if (!handle || ['instagram', 'facebook', 'login', 'accounts', 'explore', 'tags', 'search', 'pages'].includes(handle)) {
      return this.rejected(candidate, 0, 'pagina_generica');
    }

    const evidence = normalizeLookupValue([
      candidate.rawText,
      candidate.result?.name,
      candidate.result?.title,
      candidate.result?.description,
      candidate.result?.snippet,
      candidate.result?.address,
      candidate.result?.city,
      candidate.result?.state,
      candidate.result?.sourceUrl,
      candidate.result?.website,
      url,
    ].filter(Boolean).join(' '));
    const evidenceCompact = compact(evidence);
    const leadName = normalizeLookupValue(lead?.name || lead?.companyName || '');
    const legalName = normalizeLookupValue(lead?.legalName || lead?.razaoSocial || lead?.companyLegalName || '');
    const leadSegment = normalizeLookupValue(lead?.segment || lead?.businessCategory || lead?.category || '');
    const leadTokens = tokens(leadName);
    const legalTokens = tokens(legalName);
    const segmentTokens = tokens(leadSegment);
    const strongTokens = leadTokens.filter((token) => token.length >= 4 && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token));
    const categoryTokens = [...leadTokens, ...segmentTokens].filter((token) => RADAR_SOCIAL_CATEGORY_TOKENS.has(token));
    const leadCity = normalizeLookupValue(lead?.city || '');
    const leadState = String(lead?.state || '').trim().toUpperCase();
    const resultCity = normalizeLookupValue(candidate.result?.city || '');
    const resultState = String(candidate.result?.state || '').trim().toUpperCase();
    const leadPhone = normalizePhoneDigits(lead?.phoneDigits || lead?.phone);
    const leadDomain = domainFrom(lead?.website);
    const leadAddressTokens = tokens(lead?.address || '').filter((token) => token.length >= 4).slice(0, 4);
    let score = 0;
    const reasons: string[] = [];

    if (leadCity && resultCity && resultCity !== leadCity) {
      score -= 40;
      reasons.push('cidade_conflitante');
    }
    if (leadState && resultState && resultState !== leadState) {
      score -= 40;
      reasons.push('uf_conflitante');
    }
    if (/guia|catalogo|lista|diretorio|marketplace|delivery|cardapio|tripadvisor|ifood|apontador/.test(evidence)) {
      score -= evidence.includes('marketplace') ? 80 : 60;
      reasons.push('fonte_generica');
    }

    const compactName = compact(leadName);
    if (compactName.length >= 6 && (handle.includes(compactName) || compactName.includes(handle) || evidenceCompact.includes(compactName))) {
      score += 35;
      reasons.push('nome');
    } else {
      const hits = strongTokens.filter((token) => handle.includes(compact(token)) || evidence.includes(token));
      if (hits.length >= 2) {
        score += 35;
        reasons.push('nome');
      } else if (hits.length === 1) {
        score += 25;
        reasons.push('nome');
      }
    }
    const legalHits = legalTokens.filter((token) => token.length >= 5 && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token) && (handle.includes(compact(token)) || evidence.includes(token)));
    if (legalHits.length >= 1 && !reasons.includes('nome')) {
      score += 25;
      reasons.push('razao_social');
    }
    if (leadCity && (evidence.includes(leadCity) || handle.includes(compact(leadCity)))) {
      score += 25;
      reasons.push('cidade');
    }
    if (leadState && evidence.includes(normalizeLookupValue(leadState))) {
      score += 5;
      reasons.push('uf');
    }
    if (leadPhone.length >= 10 && evidence.replace(/\D/g, '').includes(leadPhone)) {
      score += 20;
      reasons.push('telefone');
    }
    if (leadDomain && (evidence.includes(leadDomain) || evidenceCompact.includes(compact(leadDomain)))) {
      score += 20;
      reasons.push('dominio');
    }
    if (leadAddressTokens.some((token) => evidence.includes(token))) {
      score += 15;
      reasons.push('endereco');
    }
    if (categoryTokens.some((token) => handle.includes(compact(token)) || evidence.includes(token))) {
      score += 10;
      reasons.push('segmento');
    }
    if (strongTokens.some((token) => handle.includes(compact(token)))) {
      score += 10;
      reasons.push('handle');
    }
    if (String(candidate.result?.source || '').toLowerCase().includes('social')) {
      score += 5;
      reasons.push('fonte_social');
    }

    const confidence = Math.max(0, Math.min(100, score));
    if (confidence >= 75) {
      return { accepted: true, status: 'confirmed', confidence, reason: reasons.join('+') || 'perfil_confirmado', url, network: candidate.network, source: candidate.source };
    }
    if (confidence >= 60) {
      return { accepted: false, status: 'candidate_review', confidence, reason: reasons.join('+') || 'revisao_manual', url, network: candidate.network, source: candidate.source };
    }
    return this.rejected(candidate, confidence, reasons.join('+') || 'confianca_baixa');
  }

  private rejected(candidate: RadarSocialCandidate, confidence: number, reason: string): RadarSocialCandidateScore {
    return {
      accepted: false,
      status: 'rejected',
      confidence,
      reason,
      url: candidate.url,
      network: candidate.network,
      source: candidate.source,
    };
  }
}

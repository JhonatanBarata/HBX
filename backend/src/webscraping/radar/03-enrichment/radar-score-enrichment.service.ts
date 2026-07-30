import { Injectable, Optional } from '@nestjs/common';
import type { LeadQualityResult, WebscrapingContactResult } from '../../webscraping.service';
import { resolveLeadQualityV2FinalRankScore } from '../../lead-quality-v2-resolver';
import { radarDiscoveryEnginesOf, radarSourceLanesOf } from '../shared/radar-source-lanes';
import type { NormalizedSearchInput, RadarWebsiteStatus } from '../shared/radar-types';
import { RadarOpportunitySignalService, type RadarOpportunitySignalResult } from './radar-opportunity-signal.service';

export type RadarScoreEnrichmentHost = {
  parseMaybeJsonObject: (value: unknown) => Record<string, any>;
  inferWebsiteStatus: (value: string | null | undefined) => RadarWebsiteStatus;
  isLikelyValidBrPhone: (value: string | null | undefined) => boolean;
  isLikelyWhatsapp: (value: string | null | undefined) => boolean;
};

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

@Injectable()
export class RadarScoreEnrichmentService {
  private readonly opportunitySignalService: RadarOpportunitySignalService;

  constructor(@Optional() opportunitySignalService?: RadarOpportunitySignalService) {
    this.opportunitySignalService = opportunitySignalService || new RadarOpportunitySignalService();
  }

  buildOpportunitySignal(
    result: WebscrapingContactResult,
    input: Pick<NormalizedSearchInput, 'segment' | 'city' | 'state'>,
    host: RadarScoreEnrichmentHost,
  ): RadarOpportunitySignalResult {
    return this.opportunitySignalService.analyze(result, input, host);
  }

  buildOpportunityScore(result: WebscrapingContactResult, quality: LeadQualityResult | null | undefined, host: RadarScoreEnrichmentHost) {
    // CORREÇÃO 30/07 (DDD 19 "distribuidora de água": Sanofi unconfirmed 54 > JOBEMA água 49):
    // o cap por qualidade abaixo era CÓDIGO MORTO — os returns do V2 e do analisador de sinais
    // saíam ANTES dele, e todo lead enriquecido tem sinais (hasOpportunitySignalEvidence).
    // Resultado: `segment_unconfirmed` da trilha web exibia 54-84 livre e ranqueava acima de
    // água com CNAE confirmado. Agora TODO caminho passa pelo cap.
    // Isenção da lane Receita (rfb): o segmento já foi validado por CNAE na porta do provider
    // e razão social legitimamente não "fala" o segmento (mesma polaridade de
    // radar-quality-gate.service.ts `isCnpjPublic`) — sem a isenção, CALLEGARI/BELFANTE
    // (CNAE de água mineral, nome mudo → segmentMatch 45) seriam capados junto com o lixo,
    // e a decisão do dono é o oposto: CNAE confirmado VALE ponto.
    const rfbConfirmedLane = radarSourceLanesOf(radarDiscoveryEnginesOf(result as Record<string, any>)).has('rfb');
    const capByQuality = (value: number) => {
      if (!quality) return value;
      if (quality.status === 'generic_directory') return 0;
      if (rfbConfirmedLane) return value;
      if (quality.segmentMatchScore < 55) return Math.min(value, 25);
      if (quality.status !== undefined && quality.status !== 'approved' && quality.billable === false) return Math.min(value, 25);
      return value;
    };
    const qualityV2Score = resolveLeadQualityV2FinalRankScore(result);
    if (qualityV2Score !== null) return capByQuality(qualityV2Score);
    if (this.hasOpportunitySignalEvidence(result)) {
      const analysis = this.opportunitySignalService.analyze(result, { segment: (result as any).segment, city: (result as any).city, state: (result as any).state }, host);
      return capByQuality(analysis.opportunityScore);
    }
    const evidence = host.parseMaybeJsonObject((result as any).evidenceJson);
    const evidenceScore = safeInteger(evidence?.finalScore ?? evidence?.score);
    if (evidenceScore > 0) return capByQuality(Math.max(0, Math.min(100, evidenceScore)));
    const websiteStatus = host.inferWebsiteStatus(result.website);
    let score = 35;
    if (websiteStatus === 'present') score += 20;
    if (websiteStatus === 'social_only' || result.instagramUrl || result.facebookUrl) score += 18;
    if (websiteStatus === 'weak') score += 8;
    if ((result.reviews || 0) >= 50) score += 25;
    if (result.rating != null && result.rating >= 4.2) score += 15;
    if (host.isLikelyValidBrPhone(result.phoneDigits || result.phone)) score += 10;
    if (host.isLikelyWhatsapp(result.phoneDigits || result.phone)) score += 10;
    if (websiteStatus === 'none' && !result.instagramUrl && !result.facebookUrl) score -= 15;
    const engineScore = Math.max(0, Math.min(10, Math.trunc(Number(result.score || 0) / 10) || 0));
    score = Math.max(0, Math.min(100, score + engineScore));
    return capByQuality(score);
  }

  buildOpportunityReason(result: WebscrapingContactResult, input: NormalizedSearchInput, host: RadarScoreEnrichmentHost) {
    if (this.hasOpportunitySignalEvidence(result)) {
      return this.opportunitySignalService.analyze(result, input, host).opportunityReason;
    }
    const reasons: string[] = [];
    const websiteStatus = host.inferWebsiteStatus(result.website);
    if (result.rating != null && result.rating >= 4.2) reasons.push('boa reputacao no Google');
    if ((result.reviews || 0) >= 50) reasons.push('muitas avaliacoes');
    if (websiteStatus === 'none') reasons.push('nenhum website encontrado');
    if (websiteStatus === 'social_only') reasons.push('presenca limitada a rede social');
    if (websiteStatus === 'weak') reasons.push('website fraco ou pagina provisoria');
    if (host.isLikelyWhatsapp(result.phoneDigits || result.phone)) reasons.push('telefone com alta chance de WhatsApp');
    if (websiteStatus === 'present' && reasons.length < 2) reasons.push('site encontrado, mas ainda pode ser trabalhado pelo relacionamento');
    if (!reasons.length) reasons.push(`contato publico aderente a ${input.segment || 'prospeccao'}`);
    const sentence = reasons.slice(0, 3).join(', ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
  }

  private hasOpportunitySignalEvidence(result: WebscrapingContactResult) {
    const item = result as any;
    return Boolean(
      (Array.isArray(item.opportunitySignals) && item.opportunitySignals.length > 0)
      || item.websiteIntelligence
      || item.sourceEvidence
      || item.fieldEvidence
      || item.nextBestAction
      || item.pitchHint
    );
  }
}

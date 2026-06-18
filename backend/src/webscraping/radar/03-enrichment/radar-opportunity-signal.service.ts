import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';
import type { NormalizedSearchInput, RadarWebsiteStatus } from '../shared/radar-types';
import { deriveRowSignals } from './lead-signals.util';

export type RadarOpportunitySignalHost = {
  parseMaybeJsonObject: (value: unknown) => Record<string, any>;
  inferWebsiteStatus: (value: string | null | undefined) => RadarWebsiteStatus;
  isLikelyValidBrPhone: (value: string | null | undefined) => boolean;
  isLikelyWhatsapp: (value: string | null | undefined) => boolean;
};

export type RadarOpportunitySignalResult = {
  opportunitySignals: string[];
  opportunityReason: string;
  recommendedChannel: 'whatsapp' | 'email' | 'instagram' | 'facebook' | 'call' | 'review';
  opportunityScore: number;
  nextBestAction: string;
  pitchHint: string;
};

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function unique(...groups: Array<Array<string | null | undefined> | null | undefined>) {
  return Array.from(new Set(
    groups.flatMap((group) => group || []).map((value) => String(value || '').trim()).filter(Boolean),
  ));
}

function hasConfirmedSocial(candidate: any) {
  const status = normalizeText(candidate.socialStatus);
  return Boolean(candidate.instagramUrl || candidate.facebookUrl || ['found', 'confirmed', 'partial'].includes(status));
}

function hasWhatsapp(candidate: any, host: RadarOpportunitySignalHost) {
  const status = normalizeText(candidate.whatsappStatus || candidate.whatsappCheckStatus);
  return Boolean(
    candidate.whatsappUrl
    || ['confirmed', 'valid', 'available', 'probable'].includes(status)
    || host.isLikelyWhatsapp(candidate.phoneDigits || candidate.phone),
  );
}

function emailLocalPart(email: unknown) {
  return String(email || '').split('@')[0].toLowerCase().trim();
}

function extractEvidence(candidate: any, host: RadarOpportunitySignalHost) {
  return {
    rawJson: host.parseMaybeJsonObject(candidate.rawJson),
    evidenceJson: host.parseMaybeJsonObject(candidate.evidenceJson),
    enrichmentJson: host.parseMaybeJsonObject(candidate.enrichmentJson),
    sourceEvidence: host.parseMaybeJsonObject(candidate.sourceEvidence),
    fieldEvidence: host.parseMaybeJsonObject(candidate.fieldEvidence),
    websiteIntelligence: host.parseMaybeJsonObject(candidate.websiteIntelligence),
  };
}

function sourceEvidenceCount(value: unknown) {
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value as Record<string, any>).filter(Boolean).length;
}

@Injectable()
export class RadarOpportunitySignalService {
  analyze(
    candidate: WebscrapingContactResult,
    input: Pick<NormalizedSearchInput, 'segment' | 'city' | 'state'>,
    host: RadarOpportunitySignalHost,
  ): RadarOpportunitySignalResult {
    const item = candidate as any;
    const evidence = extractEvidence(item, host);
    const websiteIntelligence = {
      ...(evidence.websiteIntelligence || {}),
      ...(evidence.enrichmentJson?.websiteIntelligence || {}),
      ...(evidence.evidenceJson?.websiteIntelligence || {}),
    };
    const rawSignals = unique(
      Array.isArray(item.opportunitySignals) ? item.opportunitySignals : [],
      Array.isArray(websiteIntelligence.opportunitySignals) ? websiteIntelligence.opportunitySignals : [],
      Array.isArray(evidence.enrichmentJson?.signals?.opportunitySignals) ? evidence.enrichmentJson.signals.opportunitySignals : [],
      deriveRowSignals(item),
    );
    const websiteStatus = host.inferWebsiteStatus(item.website);
    const social = hasConfirmedSocial(item);
    const whatsapp = hasWhatsapp(item, host);
    const validPhone = host.isLikelyValidBrPhone(item.phoneDigits || item.phone);
    const hasEmail = Boolean(item.email);
    const signals = new Set(rawSignals);

    if (social && !whatsapp) signals.add('instagram_sem_whatsapp_claro');
    if (item.website && !whatsapp && !websiteIntelligence.hasChatWidget) signals.add('website_atendimento_fraco');
    if (validPhone && !whatsapp && !hasEmail && !social) signals.add('telefone_fixo_sem_canal_digital');
    if ((item.website || evidence.sourceEvidence?.google_textual || evidence.sourceEvidence?.hbx_engine) && !social) signals.add('google_website_sem_social');
    if (social && !whatsapp) signals.add('social_sem_link_atendimento');
    if (hasEmail && /^(contato|comercial|atendimento|financeiro|admin|adm|info|sac)$/.test(emailLocalPart(item.email))) signals.add('email_generico');
    if (websiteStatus === 'weak' || rawSignals.includes('site_fraco') || rawSignals.includes('site_antigo')) signals.add('site_fraco_antigo');
    if (!item.website && !social && !hasEmail && !whatsapp) signals.add('pouca_presenca_digital');
    if (sourceEvidenceCount(evidence.sourceEvidence) >= 2 && [whatsapp, hasEmail, social].filter(Boolean).length <= 1) {
      signals.add('multi_fonte_empresa_poucos_canais');
    }
    const socialConfidence = safeInteger(evidence.fieldEvidence?.social?.confidence || item.socialConfidence);
    if (social && (socialConfidence >= 70 || ['found', 'confirmed'].includes(normalizeText(item.socialStatus)))) {
      signals.add('social_confiavel_encontrado');
    }
    if (websiteIntelligence.hasContactForm || websiteIntelligence.hasBudgetIntent || rawSignals.includes('site_com_formulario') || rawSignals.includes('site_com_link_orcamento')) {
      signals.add('website_crawl_form_orcamento');
    }

    const opportunitySignals = Array.from(signals);
    const recommendedChannel = this.recommendChannel(item, { whatsapp, hasEmail, social, validPhone });
    const opportunityScore = this.score(item, {
      opportunitySignals,
      recommendedChannel,
      websiteStatus,
      whatsapp,
      hasEmail,
      social,
      validPhone,
      sourceCount: sourceEvidenceCount(evidence.sourceEvidence),
    });
    const nextBestAction = this.nextBestAction(recommendedChannel, opportunitySignals);
    return {
      opportunitySignals,
      opportunityReason: this.reason(opportunitySignals, input),
      recommendedChannel,
      opportunityScore,
      nextBestAction,
      pitchHint: this.pitchHint(opportunitySignals, recommendedChannel),
    };
  }

  private recommendChannel(
    candidate: any,
    signals: { whatsapp: boolean; hasEmail: boolean; social: boolean; validPhone: boolean },
  ): RadarOpportunitySignalResult['recommendedChannel'] {
    if (signals.whatsapp) return 'whatsapp';
    if (signals.hasEmail) return 'email';
    if (candidate.instagramUrl) return 'instagram';
    if (candidate.facebookUrl) return 'facebook';
    if (signals.validPhone) return 'call';
    return 'review';
  }

  private score(candidate: any, input: {
    opportunitySignals: string[];
    recommendedChannel: string;
    websiteStatus: RadarWebsiteStatus;
    whatsapp: boolean;
    hasEmail: boolean;
    social: boolean;
    validPhone: boolean;
    sourceCount: number;
  }) {
    let score = safeInteger(candidate.opportunityScore ?? candidate.score, 35);
    score += Math.min(20, input.opportunitySignals.length * 4);
    if (input.whatsapp) score += 18;
    else if (input.recommendedChannel === 'email') score += 12;
    else if (['instagram', 'facebook'].includes(input.recommendedChannel)) score += 10;
    else if (input.validPhone) score += 8;
    if (input.websiteStatus === 'present') score += 8;
    if (input.websiteStatus === 'weak') score += 5;
    if (input.social) score += 7;
    if (input.sourceCount >= 2) score += 8;
    if (input.opportunitySignals.includes('pouca_presenca_digital')) score -= 8;
    if (input.opportunitySignals.includes('recem_aberto')) score += 12;
    if (input.opportunitySignals.includes('contratando')) score += 10;
    if (input.opportunitySignals.includes('avaliacoes_em_queda')) score += 7;
    if (input.opportunitySignals.includes('poucas_avaliacoes_novo')) score += 5;
    if (input.opportunitySignals.includes('instagram_parado')) score += 4;
    if (input.opportunitySignals.includes('cnpj_baixado')) score -= 40;
    return clampScore(score);
  }

  private reason(signals: string[], input: Pick<NormalizedSearchInput, 'segment' | 'city' | 'state'>) {
    const labels: Record<string, string> = {
      instagram_sem_whatsapp_claro: 'tem rede social, mas o WhatsApp nao esta claro',
      website_atendimento_fraco: 'tem site, mas o caminho de atendimento parece fraco',
      telefone_fixo_sem_canal_digital: 'tem telefone, mas falta canal digital direto',
      google_website_sem_social: 'foi encontrada em fonte publica, mas sem social confiavel',
      social_sem_link_atendimento: 'tem social, mas sem link claro de atendimento',
      email_generico: 'usa email generico de contato',
      site_sem_whatsapp_claro: 'tem site, mas o WhatsApp nao esta claro',
      site_sem_formulario: 'tem site, mas nao demonstra formulario de captacao',
      site_com_link_orcamento: 'site indica link de orcamento',
      site_com_formulario: 'site indica formulario de contato',
      site_fraco_antigo: 'o site parece fraco ou antigo',
      pouca_presenca_digital: 'tem pouca presenca digital acionavel',
      multi_fonte_empresa_poucos_canais: 'multiplas fontes confirmam a empresa, mas poucos canais convertem',
      social_confiavel_encontrado: 'social confiavel encontrado',
      website_crawl_form_orcamento: 'site indica formulario ou pedido de orcamento',
      recem_aberto: 'abriu ha menos de 6 meses',
      sem_site: 'sem site identificado',
      instagram_parado: 'Instagram com engajamento fraco ou sem atualizacoes recentes',
      avaliacoes_em_queda: 'nota no Google abaixo de 3,5',
      poucas_avaliacoes_novo: 'negocio recente com poucas avaliacoes',
      contratando: 'expansao detectada — esta contratando',
      cnpj_baixado: 'CNPJ baixado ou inativo',
    };
    const picked = signals.map((signal) => labels[signal]).filter(Boolean).slice(0, 3);
    if (!picked.length) {
      const location = [input.city, input.state].filter(Boolean).join('/');
      return `Empresa aderente a ${input.segment || 'prospeccao'}${location ? ` em ${location}` : ''}.`;
    }
    const sentence = picked.join('; ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
  }

  private nextBestAction(channel: string, signals: string[]) {
    if (channel === 'whatsapp') return signals.includes('website_crawl_form_orcamento') ? 'enviar_whatsapp_com_orcamento' : 'chamar_no_whatsapp';
    if (channel === 'email') return 'enviar_email_curto_com_prova_de_oportunidade';
    if (channel === 'instagram') return 'abordar_instagram_com_link_de_atendimento';
    if (channel === 'facebook') return 'abordar_facebook_com_link_de_atendimento';
    if (channel === 'call') return 'ligar_validar_decisor_e_whatsapp';
    return 'revisar_e_completar_canal';
  }

  private pitchHint(signals: string[], channel: string) {
    if (signals.includes('recem_aberto')) {
      return 'Empresa recente em crescimento — ideal para oferecer presenca digital desde o comeco certo.';
    }
    if (signals.includes('avaliacoes_em_queda') || signals.includes('poucas_avaliacoes_novo')) {
      return 'A reputacao digital pode ser o ponto de dor — usar as avaliacoes como gancho comercial.';
    }
    if (signals.includes('instagram_sem_whatsapp_claro') || signals.includes('social_sem_link_atendimento')) {
      return 'Abrir conversa mostrando que a empresa ja atrai interesse, mas pode perder atendimento sem canal direto.';
    }
    if (signals.includes('website_atendimento_fraco') || signals.includes('website_crawl_form_orcamento')) {
      return 'Usar o site como gancho: existe intencao, mas o atendimento pode virar mais rapido no HBX.';
    }
    if (signals.includes('telefone_fixo_sem_canal_digital')) {
      return 'Validar decisor por ligacao e oferecer migracao do atendimento para WhatsApp.';
    }
    return channel === 'whatsapp'
      ? 'Comecar direto pelo canal mais acionavel com mensagem curta e contextual.'
      : 'Usar a evidencia encontrada como motivo comercial, sem depender de enriquecimento adicional.';
  }
}

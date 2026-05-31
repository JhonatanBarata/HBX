import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../../shared/radar-core-shared';
import type { VerticalSourceProviderResult, VerticalSourceRecord, VerticalSourceSearchInput } from './vertical-source-types';

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

function inferVertical(value: unknown) {
  const text = normalizeText(value);
  if (/restaurante|lanchonete|pizzaria|bar|hamburguer|delivery|marmitaria/.test(text)) return 'alimentacao';
  if (/clinica|medic|odont|estetica|psicolog|fisio/.test(text)) return 'clinicas';
  if (/imobiliaria|imoveis|corretor/.test(text)) return 'imobiliarias';
  if (/oficina|mecanica|auto|pneu|borracharia/.test(text)) return 'automotivo';
  if (/hotel|pousada|turismo|reserva/.test(text)) return 'hotelaria';
  if (/escola|curso|educacao|colegio/.test(text)) return 'educacao';
  if (/salao|barbearia|beleza|esmalteria|sobrancelha/.test(text)) return 'beleza';
  return '';
}

function normalizeWebsite(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (/(^|\.)?(ifood|aiqfome|ubereats|rappi|tripadvisor|booking|airbnb|doctoralia|boa-consulta|zapimoveis|vivareal|olx|guiamais|apontador|telelistas|solutudo|catalogo|facebook|instagram|google|maps)\./i.test(host)) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function matchesLocation(record: VerticalSourceRecord, city: unknown, state: unknown) {
  const requestedCity = normalizeText(city);
  const requestedState = String(state || '').trim().toUpperCase();
  const recordCity = normalizeText(record.city);
  const recordState = String(record.state || '').trim().toUpperCase();
  if (requestedCity && recordCity && requestedCity !== recordCity) return false;
  if (requestedState && recordState && requestedState !== recordState) return false;
  return true;
}

function matchesSegment(record: VerticalSourceRecord, segment: unknown) {
  const requested = normalizeText(segment);
  if (!requested) return true;
  const haystack = normalizeText([record.name, record.segment, record.description, record.vertical].filter(Boolean).join(' '));
  const tokens = requested.split(/\s+/).filter((token) => token.length >= 4);
  const variants = tokens.flatMap((token) => (token.endsWith('s') ? [token, token.slice(0, -1)] : [token, `${token}s`]));
  return !variants.length || variants.some((token) => token.length >= 4 && haystack.includes(token));
}

function matchesVertical(record: VerticalSourceRecord, strategies: Array<Record<string, any>> | undefined, segment: unknown) {
  const planned = new Set((strategies || []).map((item) => normalizeText(item?.vertical)).filter(Boolean));
  const recordVertical = normalizeText(record.vertical) || inferVertical([record.name, record.segment, record.description].join(' '));
  const requestedVertical = inferVertical(segment);
  if (planned.size > 0) return Boolean(recordVertical && planned.has(recordVertical));
  return !requestedVertical || !recordVertical || requestedVertical === recordVertical;
}

function confidenceFor(record: VerticalSourceRecord) {
  const sourceType = normalizeText(record.sourceType);
  if (sourceType === 'official_site') return 62;
  if (/portal|delivery|reserva|marketplace|directory|guia/.test(sourceType)) return 48;
  if (/instagram|facebook|social/.test(sourceType)) return 45;
  return 55;
}

function opportunityFor(vertical: string) {
  const signals: Record<string, { signal: string; reason: string; channel: string }> = {
    alimentacao: { signal: 'vertical_alimentacao_delivery', reason: 'Fonte vertical indica demanda de atendimento e pedido recorrente.', channel: 'whatsapp' },
    clinicas: { signal: 'vertical_clinicas_agenda', reason: 'Fonte vertical indica oportunidade de agenda e atendimento.', channel: 'whatsapp' },
    imobiliarias: { signal: 'vertical_imobiliarias_lead_imediato', reason: 'Fonte vertical indica lead de alta intencao comercial.', channel: 'whatsapp' },
    automotivo: { signal: 'vertical_automotivo_urgencia', reason: 'Fonte vertical indica contato com urgencia operacional.', channel: 'whatsapp' },
    hotelaria: { signal: 'vertical_hotelaria_reserva', reason: 'Fonte vertical indica oportunidade de reserva digital.', channel: 'email' },
    educacao: { signal: 'vertical_educacao_captacao', reason: 'Fonte vertical indica captacao recorrente de interessados.', channel: 'whatsapp' },
    beleza: { signal: 'vertical_beleza_agenda', reason: 'Fonte vertical indica atendimento por agenda.', channel: 'whatsapp' },
  };
  return signals[vertical] || { signal: 'vertical_source_discovery', reason: 'Fonte vertical encontrou evidencia complementar.', channel: 'whatsapp' };
}

@Injectable()
export class VerticalSourceProviderService {
  async search(input: VerticalSourceSearchInput): Promise<VerticalSourceProviderResult> {
    const records = Array.isArray(input.records) ? input.records : [];
    if (!records.length) {
      return {
        status: 'skipped',
        retryable: false,
        reason: 'vertical_source_provider_sem_base_configurada',
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
      if (!matchesLocation(record, input.normalized.city, input.normalized.state)) {
        rejectedCount += 1;
        continue;
      }
      if (!matchesVertical(record, input.strategies, input.normalized.segment) || !matchesSegment(record, input.normalized.segment)) {
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
      reason: accepted.length ? 'vertical_source_records_normalizados' : 'vertical_source_sem_registros_compativeis',
      foundCount: records.length,
      acceptedCount: accepted.length,
      rejectedCount,
      results: accepted,
    };
  }

  toContactResult(record: VerticalSourceRecord, normalized: { city?: string | null; state?: string | null; segment?: string | null }): WebscrapingContactResult | null {
    const name = String(record.name || '').trim();
    if (!name) return null;
    const vertical = normalizeText(record.vertical) || inferVertical([record.name, record.segment, normalized.segment].join(' ')) || 'geral';
    const phoneDigits = normalizePhoneDigits(record.phone);
    const ownWebsite = normalizeWebsite(record.website);
    const confidence = confidenceFor(record);
    const opportunity = opportunityFor(vertical);
    return {
      placeId: `vertical_source:${vertical}:${normalizeText(record.sourceName || record.sourceType || 'source')}:${normalizeText(name)}:${phoneDigits || normalizeText(record.city)}`,
      name,
      phone: record.phone || '',
      phoneDigits,
      rating: null,
      reviews: null,
      address: record.address || null,
      website: ownWebsite,
      email: record.email || null,
      city: record.city || normalized.city || null,
      state: record.state || normalized.state || null,
      segment: normalized.segment || record.segment || null,
      source: 'vertical_source',
      sourceEngine: 'vertical_source',
      sourceUrl: record.sourceUrl || null,
      socialStatus: record.instagramUrl || record.facebookUrl || record.whatsappUrl ? 'candidate_review' : undefined,
      verticalSource: vertical,
      verticalConfidence: confidence,
      opportunitySignals: [opportunity.signal],
      opportunityReason: opportunity.reason,
      recommendedChannel: opportunity.channel,
      evidenceJson: {
        verticalSource: {
          vertical,
          sourceType: record.sourceType || null,
          sourceName: record.sourceName || null,
          sourceUrl: record.sourceUrl || null,
          confidence,
          officialWebsiteCandidate: ownWebsite,
          socialCandidates: {
            instagramUrl: record.instagramUrl || null,
            facebookUrl: record.facebookUrl || null,
            whatsappUrl: record.whatsappUrl || null,
          },
          raw: record.raw || null,
        },
      },
    } as any;
  }
}

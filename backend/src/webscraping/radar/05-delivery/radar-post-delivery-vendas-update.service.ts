import { Injectable } from '@nestjs/common';
import type { SearchExecutionContext } from '../shared/radar-types';

export type RadarPostDeliveryVendasUpdateResult = {
  status: 'completed' | 'skipped' | 'partial_error';
  retryable: boolean;
  vendasLeadId: string | null;
  updatedFields: string[];
  timelineEvents: Array<{ eventType: string; title: string }>;
  reason?: string | null;
  error?: string | null;
};

function normalizeObject(raw: unknown): Record<string, any> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
}

function stringOrNull(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function usefulWhatsappStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  return status === 'confirmed' || status === 'probable' || status === 'valid' || status === 'available';
}

function buildDescription(payload: Record<string, any>) {
  return JSON.stringify({
    ...payload,
    postDeliveryUpdate: true,
    updatedAt: new Date().toISOString(),
  });
}

@Injectable()
export class RadarPostDeliveryVendasUpdateService {
  async resolveVendasLeadId(input: {
    prisma: any;
    context: SearchExecutionContext;
    row: any;
  }) {
    const state = Array.isArray(input.row?.companyStates) && input.row.companyStates.length ? input.row.companyStates[0] : null;
    const direct = stringOrNull(state?.vendasLeadId);
    if (direct) return direct;
    const saved = await input.prisma?.radarLeadCompanyState?.findUnique?.({
      where: {
        companyId_radarLeadId: {
          companyId: input.context.companyId,
          radarLeadId: String(input.row?.id || ''),
        },
      },
      select: { vendasLeadId: true },
    }).catch(() => null);
    return stringOrNull(saved?.vendasLeadId);
  }

  buildUpdatePlan(input: {
    currentLead?: any;
    row: any;
    data: Record<string, any>;
    compactEnrichment?: Record<string, any> | null;
    leadPlus?: any;
  }) {
    const current = normalizeObject(input.currentLead);
    const data = normalizeObject(input.data);
    const updateData: Record<string, any> = {};
    const updatedFields: string[] = [];
    const addIfMissing = (field: string, value: unknown) => {
      const next = stringOrNull(value);
      if (!next || stringOrNull(current[field])) return;
      updateData[field] = next;
      updatedFields.push(field);
    };
    addIfMissing('email', data.email);
    addIfMissing('website', data.website);
    addIfMissing('address', data.address);
    if (numberOrNull(data.rating) != null && (numberOrNull(current.rating) == null || Number(data.rating) > Number(current.rating || 0))) {
      updateData.rating = Number(data.rating);
      updatedFields.push('rating');
    }
    if (safeInteger(data.reviews) != null && safeInteger(data.reviews)! > Number(current.reviews || 0)) {
      updateData.reviews = safeInteger(data.reviews);
      updatedFields.push('reviews');
    }
    if (data.opportunityReason && !stringOrNull(current.shortNote)) {
      updateData.shortNote = String(data.opportunityReason).slice(0, 500);
      updatedFields.push('shortNote');
    }
    if ((data.nextBestAction || data.recommendedChannel) && !stringOrNull(current.nextAction)) {
      updateData.nextAction = String(data.nextBestAction || `abordar_via_${data.recommendedChannel}`).slice(0, 120);
      updatedFields.push('nextAction');
    }
    const timelineEvents = this.buildTimelineEvents({
      row: input.row,
      data,
      compactEnrichment: input.compactEnrichment || null,
      leadPlus: input.leadPlus || null,
      updatedFields,
    });
    return { updateData, updatedFields, timelineEvents };
  }

  async syncAfterRadarEnrichment(input: {
    prisma: any;
    context: SearchExecutionContext;
    row: any;
    data: Record<string, any>;
    enrichment?: any;
    leadPlus?: any;
    compactEnrichment?: Record<string, any> | null;
    now?: Date | string | null;
  }): Promise<RadarPostDeliveryVendasUpdateResult> {
    try {
      const vendasLeadId = await this.resolveVendasLeadId(input);
      if (!vendasLeadId) {
        return {
          status: 'skipped',
          retryable: false,
          vendasLeadId: null,
          updatedFields: [],
          timelineEvents: [],
          reason: 'vendas_lead_nao_vinculado',
        };
      }
      const currentLead = await input.prisma?.vendasLead?.findUnique?.({
        where: { id: vendasLeadId },
        select: {
          id: true,
          email: true,
          website: true,
          address: true,
          rating: true,
          reviews: true,
          shortNote: true,
          nextAction: true,
        },
      });
      const plan = this.buildUpdatePlan({
        currentLead,
        row: input.row,
        data: input.data,
        compactEnrichment: input.compactEnrichment,
        leadPlus: input.leadPlus,
      });
      if (Object.keys(plan.updateData).length) {
        await input.prisma.vendasLead.update({
          where: { id: vendasLeadId },
          data: plan.updateData,
        });
      }
      if (plan.timelineEvents.length) {
        await input.prisma.vendasLeadTimelineEvent.createMany({
          data: plan.timelineEvents.map((event) => ({
            leadId: vendasLeadId,
            eventType: event.eventType,
            title: event.title,
            description: event.description,
            sourceType: 'radar_enrichment',
            resultLabel: event.resultLabel || 'completed',
            createdByUserId: input.context.userId,
          })),
        });
      }
      return {
        status: 'completed',
        retryable: false,
        vendasLeadId,
        updatedFields: plan.updatedFields,
        timelineEvents: plan.timelineEvents.map((event) => ({ eventType: event.eventType, title: event.title })),
      };
    } catch (error) {
      return {
        status: 'partial_error',
        retryable: true,
        vendasLeadId: null,
        updatedFields: [],
        timelineEvents: [],
        error: String((error as any)?.message || error || 'Falha ao atualizar Vendas apos enriquecimento.'),
      };
    }
  }

  async recordEnrichmentStatus(input: {
    prisma: any;
    context: SearchExecutionContext;
    row: any;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    payload?: Record<string, any>;
  }): Promise<RadarPostDeliveryVendasUpdateResult> {
    try {
      const vendasLeadId = await this.resolveVendasLeadId(input);
      if (!vendasLeadId) {
        return {
          status: 'skipped',
          retryable: false,
          vendasLeadId: null,
          updatedFields: [],
          timelineEvents: [],
          reason: 'vendas_lead_nao_vinculado',
        };
      }
      const title = input.status === 'completed'
        ? 'Enriquecimento do Radar concluido'
        : input.status === 'failed'
          ? 'Enriquecimento do Radar revisado'
          : 'Enriquecimento do Radar em andamento';
      await input.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: vendasLeadId,
          eventType: 'radar_enrichment',
          title,
          description: buildDescription({
            enrichmentStatus: input.status,
            radarLeadId: input.row?.id || null,
            ...(input.payload || {}),
          }),
          sourceType: 'radar_enrichment',
          resultLabel: input.status,
          createdByUserId: input.context.userId,
        },
      });
      return {
        status: 'completed',
        retryable: false,
        vendasLeadId,
        updatedFields: [],
        timelineEvents: [{ eventType: 'radar_enrichment', title }],
      };
    } catch (error) {
      return {
        status: 'partial_error',
        retryable: true,
        vendasLeadId: null,
        updatedFields: [],
        timelineEvents: [],
        error: String((error as any)?.message || error || 'Falha ao registrar timeline de enriquecimento.'),
      };
    }
  }

  private buildTimelineEvents(input: {
    row: any;
    data: Record<string, any>;
    compactEnrichment?: Record<string, any> | null;
    leadPlus?: any;
    updatedFields: string[];
  }): Array<{ eventType: string; title: string; description: string; resultLabel?: string | null }> {
    const data = input.data;
    const base = {
      radarLeadId: input.row?.id || null,
      website: data.website || null,
      websiteStatus: data.websiteStatus || null,
      email: data.email || null,
      emailStatus: data.emailStatus || null,
      instagramUrl: data.instagramUrl || null,
      facebookUrl: data.facebookUrl || null,
      socialStatus: data.socialStatus || null,
      whatsappStatus: data.whatsappStatus || null,
      recommendedChannel: data.recommendedChannel || null,
      opportunityReason: data.opportunityReason || null,
      cnpj: stringOrNull(input.leadPlus?.cnpj),
      rating: data.rating ?? null,
      reviews: data.reviews ?? null,
      updatedFields: input.updatedFields,
      enrichment: input.compactEnrichment || null,
    };
    const events: Array<{ eventType: string; title: string; description: string; resultLabel?: string | null }> = [];
    const push = (eventType: string, title: string, payload: Record<string, any> = {}) => {
      events.push({
        eventType,
        title,
        description: buildDescription({ ...base, ...payload }),
        resultLabel: 'completed',
      });
    };
    if (data.instagramUrl || data.facebookUrl) push('radar_social_found', 'Redes encontradas pelo Radar');
    if (data.email) push('radar_email_found', 'Email encontrado pelo Radar');
    if (usefulWhatsappStatus(data.whatsappStatus)) push('radar_whatsapp_probable', 'WhatsApp provavel identificado pelo Radar');
    if (data.opportunityReason || data.recommendedChannel || data.nextBestAction) push('radar_opportunity_detected', 'Oportunidade detectada pelo Radar');
    if (data.website || data.websiteStatus || data.googleMapsUrl) push('radar_site_analyzed', 'Site analisado pelo Radar');
    if (input.updatedFields.length) push('radar_data_completed', 'Dados complementados pelo Radar');
    if (!events.length) push('radar_enrichment', 'Enriquecimento do Radar concluido');
    return events;
  }
}

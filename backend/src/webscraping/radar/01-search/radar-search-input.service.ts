import { Injectable } from '@nestjs/common';
import type { SearchContactsInput } from '../../webscraping.service';
import type { HbxTargetType, NormalizedRadarFilters, NormalizedSearchInput } from '../shared/radar-types';

export type RadarSearchInputHost = {
  normalizeRadarFilters: (input: any) => NormalizedRadarFilters;
  normalizeSearchInput: (input: SearchContactsInput) => NormalizedSearchInput;
  normalizeRadiusKm: (value: unknown) => number;
  normalizeCoordinate: (value: unknown) => number | null;
  getRequiredChannelCandidateWindow: (targetQuantity: number) => number;
};

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeInteger(value: unknown, fallback = 0) {
  const numeric = toNumberOrNull(value);
  if (numeric == null) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTargetType(value: unknown): HbxTargetType {
  const targetType = String(value || '').trim().toLowerCase();
  if (targetType === 'pf' || targetType === 'agenda_pf') return targetType;
  return 'pj';
}

@Injectable()
export class RadarSearchInputService {
  buildRadarFiltersFromNormalizedSearchInput(input: NormalizedSearchInput, host: RadarSearchInputHost): NormalizedRadarFilters {
    return host.normalizeRadarFilters({
      city: input.city,
      state: input.state,
      segment: input.segment,
      radiusKm: input.radiusKm,
      originLat: input.originLat,
      originLng: input.originLng,
      quantity: input.quantity,
      limit: host.getRequiredChannelCandidateWindow(input.quantity),
      engine: 'hbx',
      targetType: input.targetType,
      preferredChannels: input.preferredChannels,
      requiredChannels: input.requiredChannels,
      channelMatchMode: input.channelMatchMode,
      salesProfile: input.salesProfile,
    });
  }

  buildNormalizedSearchInputFromRadarFilters(filters: NormalizedRadarFilters, host: RadarSearchInputHost): NormalizedSearchInput {
    return host.normalizeSearchInput({
      city: filters.city,
      state: filters.state,
      segment: filters.segment,
      radiusKm: filters.radiusKm,
      originLat: filters.originLat,
      originLng: filters.originLng,
      quantity: filters.quantity,
      engine: 'hbx',
      targetType: filters.targetType,
      minRating: filters.minRating,
      minReviews: filters.minReviews,
      salesProfile: filters.salesProfile,
      preferredChannels: filters.preferredChannels,
      requiredChannels: filters.requiredChannels,
      channelMatchMode: filters.channelMatchMode,
      freshness: filters.freshness,
    });
  }

  buildRadarFiltersFromSearchRun(run: any, host: RadarSearchInputHost) {
    const metrics = parseJsonObject(run?.metricsJson);
    const channelFilters = parseJsonObject(metrics?.channelFilters || {});
    return host.normalizeRadarFilters({
      city: run?.city,
      state: run?.state,
      segment: run?.segment,
      radiusKm: host.normalizeRadiusKm(metrics?.radiusKm),
      originLat: host.normalizeCoordinate(metrics?.originLat),
      originLng: host.normalizeCoordinate(metrics?.originLng),
      scoreRange: metrics?.scoreRange || null,
      quantity: Math.max(1, safeInteger(run?.targetQuantity)),
      limit: Math.max(100, safeInteger(run?.targetQuantity) * 4),
      engine: 'hbx',
      targetType: normalizeTargetType(run?.targetType),
      validPhone: false,
      preferredChannels: channelFilters.preferredChannels,
      requiredChannels: channelFilters.requiredChannels,
      channelMatchMode: channelFilters.channelMatchMode,
      salesProfile: metrics?.salesProfile || null,
    });
  }
}

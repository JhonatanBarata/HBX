import { Injectable } from '@nestjs/common';
import type {
  RadarChannelFilter,
  RadarChannelMatchMode,
  WebscrapingSearchRunItemStatus,
  WebscrapingSearchRunStatus,
} from './radar-types';

function normalizeLookupValue(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class RadarSharedNormalizerService {
  isTerminalSearchRunStatus(status: string | null | undefined) {
    return ['completed', 'partial_error', 'completed_insufficient_results', 'failed', 'canceled'].includes(
      String(status || '').trim(),
    );
  }

  normalizeSearchRunStatus(status: unknown): WebscrapingSearchRunStatus {
    const normalized = String(status || '').trim();
    if (['queued', 'running', 'sleeping', 'completed', 'partial_error', 'completed_insufficient_results', 'failed', 'canceled'].includes(normalized)) {
      return normalized as WebscrapingSearchRunStatus;
    }
    return 'queued';
  }

  normalizeRunItemStatus(status: unknown): WebscrapingSearchRunItemStatus {
    const normalized = String(status || '').trim();
    if (['found', 'duplicate', 'skipped', 'invalid'].includes(normalized)) {
      return normalized as WebscrapingSearchRunItemStatus;
    }
    return 'found';
  }

  parseMaybeJsonObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  normalizeRadiusKm(value: unknown, maxRadiusKm: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(Math.max(Math.trunc(numeric), 0), maxRadiusKm);
  }

  normalizeCoordinate(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  normalizeRadarChannel(value: unknown): RadarChannelFilter | null {
    const normalized = normalizeLookupValue(String(value || ''));
    if (!normalized) return null;
    if (['whatsapp', 'zap', 'wpp'].includes(normalized)) return 'whatsapp';
    if (['instagram', 'insta'].includes(normalized)) return 'instagram';
    if (['email', 'e-mail', 'mail'].includes(normalized)) return 'email';
    if (['website', 'site', 'web', 'www'].includes(normalized)) return 'website';
    if (['phone', 'telefone', 'ligacao', 'call', 'celular'].includes(normalized)) return 'phone';
    if (['facebook', 'face', 'fb'].includes(normalized)) return 'facebook';
    return null;
  }

  normalizeRadarChannels(value: unknown): RadarChannelFilter[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => this.normalizeRadarChannel(item)).filter(Boolean) as RadarChannelFilter[])).slice(0, 6);
  }

  normalizeChannelMatchMode(value: unknown): RadarChannelMatchMode {
    const normalized = String(value || '').trim();
    if (normalized === 'any_required' || normalized === 'all_required') return normalized;
    return 'prefer';
  }

  normalizeFreshness(value: unknown): 'live' | 'database_first' | 'hybrid' {
    const normalized = String(value || '').trim();
    if (normalized === 'live') return 'live';
    if (normalized === 'database_first' || normalized === 'hybrid') return normalized;
    return 'hybrid';
  }
}

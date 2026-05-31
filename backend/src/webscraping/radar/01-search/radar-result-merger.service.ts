import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';

function normalizeLookupValue(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(raw: string | null | undefined) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeSource(source: string | null | undefined) {
  const normalized = String(source || '').trim();
  const aliases: Record<string, string> = {
    cnpj_public_stub: 'cnpj_public',
    local_directories_stub: 'local_directory',
  };
  return aliases[normalized] || normalized || 'unknown';
}

function normalizeWebsiteKey(value: string | null | undefined) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

function normalizeWebsiteDomain(value: string | null | undefined) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '';
  }
}

function isWeakSocialStatus(value: unknown) {
  return ['', 'missing', 'error', 'candidate_review', 'weak', 'pending', 'searching', 'skipped'].includes(
    String(value || '').trim().toLowerCase(),
  );
}

function socialStatusRank(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  const ranks: Record<string, number> = {
    found: 5,
    confirmed: 5,
    partial: 4,
    candidate_review: 3,
    weak: 2,
    pending: 1,
    searching: 1,
    missing: 0,
    skipped: 0,
    error: 0,
  };
  return ranks[status] ?? 0;
}

function whatsappStatusRank(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  const ranks: Record<string, number> = {
    confirmed: 5,
    valid: 5,
    available: 5,
    probable: 4,
    unverified: 3,
    pending: 1,
    missing: 0,
    invalid: 0,
    skipped: 0,
    error: 0,
  };
  return ranks[status] ?? 0;
}

function emailStatusRank(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  const ranks: Record<string, number> = {
    confirmed: 5,
    valid: 5,
    probable: 4,
    unverified: 3,
    missing: 0,
    invalid: 0,
    skipped: 0,
    error: 0,
  };
  return ranks[status] ?? 2;
}

function sourceBaseConfidence(source: string) {
  const normalized = normalizeSource(source);
  const ranks: Record<string, number> = {
    radar_database: 78,
    company_history: 76,
    hbx_engine: 74,
    global_cache: 68,
    website_crawl_light: 70,
    google_textual: 62,
    reprocess_missing_social: 64,
    reprocess_old_cards: 60,
    social_lookup: 78,
    cnpj_public: 58,
    local_directory: 42,
    vertical_source: 55,
  };
  return ranks[normalized] ?? 50;
}

function isOwnWebsite(value: unknown) {
  const domain = normalizeWebsiteDomain(String(value || ''));
  if (!domain) return false;
  return !/(^|\.)?(instagram|facebook|google|maps|linktr|bio\.link|ifood|tripadvisor|apontador|guiamais|catalogo|marketplace)/i.test(domain);
}

function firstPresent<T>(...values: T[]) {
  return values.find((value) => value != null && String(value).trim() !== '') ?? null;
}

type FieldEvidence = {
  value: string | null;
  source: string;
  confidence: number;
  status?: string | null;
  evidence?: Record<string, any> | string | null;
};

function currentEvidence(target: any, field: string, value: unknown): FieldEvidence | null {
  const evidence = target.fieldEvidence?.[field] || target[`${field}Evidence`];
  if (evidence?.value || evidence?.confidence != null) return evidence;
  const text = String(value || '').trim();
  if (!text) return null;
  return {
    value: text,
    source: normalizeSource(target.source || target.sourceEngine),
    confidence: sourceBaseConfidence(target.source || target.sourceEngine),
    status: null,
  };
}

function isBetterEvidence(current: FieldEvidence | null, incoming: FieldEvidence | null) {
  if (!incoming?.value) return false;
  if (!current?.value) return true;
  return Number(incoming.confidence || 0) > Number(current.confidence || 0);
}

@Injectable()
export class RadarResultMergerService {
  buildKeys(result: WebscrapingContactResult) {
    const name = normalizeLookupValue(result.name || '');
    const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
    const website = normalizeWebsiteKey(result.website);
    const domain = normalizeWebsiteDomain(result.website);
    const instagram = String(result.instagramUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const facebook = String(result.facebookUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const city = normalizeLookupValue(String((result as any).city || ''));
    const location = normalizeLookupValue(String(result.address || result.city || ''));
    return [
      result.placeId ? `place:${String(result.placeId).trim()}` : '',
      phone ? `phone:${phone}` : '',
      name && phone ? `name_phone:${name}:${phone}` : '',
      website ? `website:${website}` : '',
      domain ? `domain:${domain}` : '',
      instagram ? `instagram:${instagram}` : '',
      facebook ? `facebook:${facebook}` : '',
      name && city ? `name_city:${name}:${city}` : '',
      name && location ? `name_location:${name}:${location}` : '',
    ].filter(Boolean);
  }

  mergeSources(sources: Array<{ source: string; results: WebscrapingContactResult[] }>) {
    const seen = new Set<string>();
    const merged: WebscrapingContactResult[] = [];
    const counts: Record<string, number> = {};
    for (const source of sources) {
      counts[source.source] = 0;
      for (const result of source.results || []) {
        const keys = this.buildKeys(result);
        if (!keys.length) continue;
        const existing = merged.find((item) => this.buildKeys(item).some((key) => keys.includes(key)));
        if (existing) {
          this.mergeInto(existing, result, source.source);
          this.buildKeys(existing).forEach((key) => seen.add(key));
          continue;
        }
        keys.forEach((key) => seen.add(key));
        merged.push(this.withSource(result, source.source));
        counts[source.source] += 1;
      }
    }
    return { results: merged, counts };
  }

  shouldAppend(candidate: WebscrapingContactResult, existing: WebscrapingContactResult[], options: {
    requirePublicContact?: (candidate: WebscrapingContactResult) => boolean;
  } = {}) {
    if (options.requirePublicContact && !options.requirePublicContact(candidate)) return false;
    const seen = new Set(existing.flatMap((item) => this.buildKeys(item)));
    return !this.buildKeys(candidate).some((key) => seen.has(key));
  }

  private withSource(result: WebscrapingContactResult, source: string): WebscrapingContactResult {
    const fieldEvidence = this.buildFieldEvidence(result, source);
    return {
      ...result,
      source: result.source || source,
      sourceEngines: Array.from(new Set([
        ...(Array.isArray((result as any).sourceEngines) ? (result as any).sourceEngines : []),
        source,
      ].filter(Boolean))),
      sourceEvidence: {
        ...((result as any).sourceEvidence || {}),
        [source]: {
          placeId: result.placeId || null,
          phoneDigits: result.phoneDigits || null,
          website: result.website || null,
          instagramUrl: result.instagramUrl || null,
          facebookUrl: result.facebookUrl || null,
          email: result.email || null,
          address: result.address || null,
          cnpj: (result as any).cnpj || null,
          whatsappUrl: (result as any).whatsappUrl || null,
          whatsappStatus: (result as any).whatsappStatus || (result as any).whatsappCheckStatus || null,
          evidenceJson: (result as any).evidenceJson || null,
        },
      },
      fieldEvidence: {
        ...((result as any).fieldEvidence || {}),
        ...fieldEvidence,
      },
      phoneEvidence: (result as any).phoneEvidence || fieldEvidence.phone || null,
      websiteEvidence: (result as any).websiteEvidence || fieldEvidence.website || null,
      socialEvidence: (result as any).socialEvidence || fieldEvidence.social || null,
      emailEvidence: (result as any).emailEvidence || fieldEvidence.email || null,
      whatsappEvidence: (result as any).whatsappEvidence || fieldEvidence.whatsapp || null,
      cnpjEvidence: (result as any).cnpjEvidence || fieldEvidence.cnpj || null,
      addressEvidence: (result as any).addressEvidence || fieldEvidence.address || null,
    } as any;
  }

  private buildFieldEvidence(result: WebscrapingContactResult, source: string): Record<string, FieldEvidence> {
    const sourceName = normalizeSource(source || result.source || result.sourceEngine);
    const base = sourceBaseConfidence(sourceName);
    const evidenceJson = (result as any).evidenceJson || null;
    const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
    const socialValue = firstPresent(result.instagramUrl, result.facebookUrl) as string | null;
    const whatsappStatus = (result as any).whatsappStatus || (result as any).whatsappCheckStatus || null;
    const emailStatus = (result as any).emailStatus || null;
    const output: Record<string, FieldEvidence> = {};
    if (phoneDigits.length >= 10) {
      output.phone = {
        value: phoneDigits,
        source: sourceName,
        confidence: Math.min(100, base + (phoneDigits.length === 10 || phoneDigits.length === 11 ? 12 : 4)),
        status: null,
        evidence: evidenceJson,
      };
    }
    if (isOwnWebsite(result.website)) {
      output.website = {
        value: String(result.website || '').trim(),
        source: sourceName,
        confidence: Math.min(100, base + 10),
        status: 'own_website',
        evidence: evidenceJson,
      };
    }
    if (socialValue) {
      const rank = socialStatusRank((result as any).socialStatus);
      output.social = {
        value: socialValue,
        source: sourceName,
        confidence: Math.min(100, base + 8 + (rank * 4)),
        status: (result as any).socialStatus || null,
        evidence: evidenceJson,
      };
    }
    if (result.email) {
      const rank = emailStatusRank(emailStatus);
      output.email = {
        value: String(result.email).trim().toLowerCase(),
        source: sourceName,
        confidence: Math.min(100, base + 4 + (rank * 5)),
        status: emailStatus,
        evidence: evidenceJson,
      };
    }
    if (whatsappStatus || (result as any).whatsappUrl) {
      const rank = whatsappStatusRank(whatsappStatus);
      output.whatsapp = {
        value: String((result as any).whatsappUrl || result.phoneDigits || result.phone || whatsappStatus || '').trim(),
        source: sourceName,
        confidence: Math.min(100, base + (rank * 6)),
        status: whatsappStatus,
        evidence: evidenceJson,
      };
    }
    if ((result as any).cnpj) {
      output.cnpj = {
        value: String((result as any).cnpj).trim(),
        source: sourceName,
        confidence: Math.min(100, base + 10),
        status: null,
        evidence: evidenceJson,
      };
    }
    if (result.address && String(result.address).trim().length >= 8) {
      output.address = {
        value: String(result.address).trim(),
        source: sourceName,
        confidence: Math.min(100, base + (/\d/.test(String(result.address)) ? 8 : 2)),
        status: null,
        evidence: evidenceJson,
      };
    }
    return output;
  }

  private mergeInto(target: WebscrapingContactResult, incoming: WebscrapingContactResult, source: string) {
    const merged = this.withSource(incoming, source) as any;
    const targetAny = target as any;
    const incomingEvidence = merged.fieldEvidence || {};
    this.mergePhone(target, incoming, incomingEvidence.phone);
    this.mergeWebsite(target, incoming, incomingEvidence.website);
    this.mergeSocial(target, incoming, incomingEvidence.social);
    this.mergeEmail(target, incoming, incomingEvidence.email);
    this.mergeWhatsapp(target, incoming, incomingEvidence.whatsapp);
    this.mergeSimpleField(target, incoming, 'cnpj', incomingEvidence.cnpj);
    this.mergeSimpleField(target, incoming, 'address', incomingEvidence.address);
    this.mergeWebsiteIntelligence(target, incoming);
    target.source = target.source || incoming.source || source;
    targetAny.sourceEngines = Array.from(new Set([
      ...(Array.isArray(targetAny.sourceEngines) ? targetAny.sourceEngines : []),
      ...(Array.isArray(merged.sourceEngines) ? merged.sourceEngines : []),
      source,
    ].filter(Boolean)));
    targetAny.sourceEvidence = {
      ...(targetAny.sourceEvidence || {}),
      ...(merged.sourceEvidence || {}),
    };
    targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}) };
    this.syncEvidenceAliases(targetAny);
  }

  private mergePhone(target: WebscrapingContactResult, incoming: WebscrapingContactResult, incomingEvidence: FieldEvidence | null) {
    const targetAny = target as any;
    const current = currentEvidence(targetAny, 'phone', target.phoneDigits || target.phone);
    if (isBetterEvidence(current, incomingEvidence || null)) {
      target.phone = incoming.phone || incoming.phoneDigits || target.phone || '';
      target.phoneDigits = normalizePhoneDigits(incoming.phoneDigits || incoming.phone) || target.phoneDigits;
      targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}), phone: incomingEvidence };
      return;
    }
    target.phone = firstPresent(target.phone, incoming.phone) || '';
    target.phoneDigits = normalizePhoneDigits(firstPresent(target.phoneDigits, incoming.phoneDigits, incoming.phone) as string) || target.phoneDigits;
  }

  private mergeWebsite(target: WebscrapingContactResult, incoming: WebscrapingContactResult, incomingEvidence: FieldEvidence | null) {
    const targetAny = target as any;
    const current = currentEvidence(targetAny, 'website', target.website);
    if (isBetterEvidence(current, incomingEvidence || null) || (!isOwnWebsite(target.website) && isOwnWebsite(incoming.website))) {
      target.website = incoming.website || target.website;
      targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}), website: incomingEvidence };
    }
  }

  private mergeSocial(target: WebscrapingContactResult, incoming: WebscrapingContactResult, incomingEvidence: FieldEvidence | null) {
    const targetAny = target as any;
    const current = currentEvidence(targetAny, 'social', firstPresent(target.instagramUrl, target.facebookUrl));
    if (isBetterEvidence(current, incomingEvidence || null)) {
      target.instagramUrl = firstPresent(incoming.instagramUrl, target.instagramUrl) as any;
      target.facebookUrl = firstPresent(incoming.facebookUrl, target.facebookUrl) as any;
      targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}), social: incomingEvidence };
    } else {
      target.instagramUrl = firstPresent(target.instagramUrl, incoming.instagramUrl) as any;
      target.facebookUrl = firstPresent(target.facebookUrl, incoming.facebookUrl) as any;
    }
    if (socialStatusRank((incoming as any).socialStatus) > socialStatusRank(targetAny.socialStatus)) {
      targetAny.socialStatus = (incoming as any).socialStatus;
    } else if (isWeakSocialStatus(targetAny.socialStatus) && !isWeakSocialStatus((incoming as any).socialStatus)) {
      targetAny.socialStatus = (incoming as any).socialStatus;
    }
  }

  private mergeEmail(target: WebscrapingContactResult, incoming: WebscrapingContactResult, incomingEvidence: FieldEvidence | null) {
    const targetAny = target as any;
    const current = currentEvidence(targetAny, 'email', target.email);
    if (isBetterEvidence(current, incomingEvidence || null)) {
      target.email = incoming.email || target.email;
      targetAny.emailStatus = (incoming as any).emailStatus || targetAny.emailStatus;
      targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}), email: incomingEvidence };
    } else {
      target.email = firstPresent(target.email, incoming.email) as any;
    }
  }

  private mergeWhatsapp(target: WebscrapingContactResult, incoming: WebscrapingContactResult, incomingEvidence: FieldEvidence | null) {
    const targetAny = target as any;
    const current = currentEvidence(targetAny, 'whatsapp', targetAny.whatsappUrl || targetAny.whatsappStatus || target.phoneDigits || target.phone);
    if (isBetterEvidence(current, incomingEvidence || null)) {
      targetAny.whatsappUrl = (incoming as any).whatsappUrl || targetAny.whatsappUrl;
      targetAny.whatsappStatus = (incoming as any).whatsappStatus || (incoming as any).whatsappCheckStatus || targetAny.whatsappStatus;
      targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}), whatsapp: incomingEvidence };
    } else if (whatsappStatusRank((incoming as any).whatsappStatus || (incoming as any).whatsappCheckStatus) > whatsappStatusRank(targetAny.whatsappStatus)) {
      targetAny.whatsappStatus = (incoming as any).whatsappStatus || (incoming as any).whatsappCheckStatus;
    }
  }

  private mergeSimpleField(target: WebscrapingContactResult, incoming: WebscrapingContactResult, field: 'cnpj' | 'address', incomingEvidence: FieldEvidence | null) {
    const targetAny = target as any;
    const current = currentEvidence(targetAny, field, targetAny[field]);
    if (isBetterEvidence(current, incomingEvidence || null)) {
      targetAny[field] = (incoming as any)[field] || targetAny[field];
      targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}), [field]: incomingEvidence };
      return;
    }
    targetAny[field] = firstPresent(targetAny[field], (incoming as any)[field]) as any;
  }

  private mergeWebsiteIntelligence(target: WebscrapingContactResult, incoming: WebscrapingContactResult) {
    const targetAny = target as any;
    const incomingAny = incoming as any;
    const unique = (...groups: Array<string[] | undefined>) => Array.from(new Set(
      groups.flatMap((group) => group || []).map((value) => String(value || '').trim()).filter(Boolean),
    ));
    targetAny.opportunitySignals = unique(targetAny.opportunitySignals, incomingAny.opportunitySignals);
    targetAny.websiteIntelligence = {
      ...(targetAny.websiteIntelligence || {}),
      ...(incomingAny.websiteIntelligence || {}),
      opportunitySignals: unique(targetAny.websiteIntelligence?.opportunitySignals, incomingAny.websiteIntelligence?.opportunitySignals, targetAny.opportunitySignals),
      siteIssues: unique(targetAny.websiteIntelligence?.siteIssues, incomingAny.websiteIntelligence?.siteIssues),
      formLinks: unique(targetAny.websiteIntelligence?.formLinks, incomingAny.websiteIntelligence?.formLinks),
      budgetLinks: unique(targetAny.websiteIntelligence?.budgetLinks, incomingAny.websiteIntelligence?.budgetLinks),
      chatLinks: unique(targetAny.websiteIntelligence?.chatLinks, incomingAny.websiteIntelligence?.chatLinks),
      hasContactForm: Boolean(targetAny.websiteIntelligence?.hasContactForm || incomingAny.websiteIntelligence?.hasContactForm),
      hasBudgetIntent: Boolean(targetAny.websiteIntelligence?.hasBudgetIntent || incomingAny.websiteIntelligence?.hasBudgetIntent),
      hasChatWidget: Boolean(targetAny.websiteIntelligence?.hasChatWidget || incomingAny.websiteIntelligence?.hasChatWidget),
    };
    targetAny.opportunityReason = firstPresent(targetAny.opportunityReason, incomingAny.opportunityReason) as any;
    targetAny.recommendedChannel = firstPresent(targetAny.recommendedChannel, incomingAny.recommendedChannel) as any;
    targetAny.opportunityScore = firstPresent(targetAny.opportunityScore, incomingAny.opportunityScore) as any;
    targetAny.nextBestAction = firstPresent(targetAny.nextBestAction, incomingAny.nextBestAction) as any;
    targetAny.pitchHint = firstPresent(targetAny.pitchHint, incomingAny.pitchHint) as any;
  }

  private syncEvidenceAliases(target: any) {
    target.phoneEvidence = target.fieldEvidence?.phone || target.phoneEvidence || null;
    target.websiteEvidence = target.fieldEvidence?.website || target.websiteEvidence || null;
    target.socialEvidence = target.fieldEvidence?.social || target.socialEvidence || null;
    target.emailEvidence = target.fieldEvidence?.email || target.emailEvidence || null;
    target.whatsappEvidence = target.fieldEvidence?.whatsapp || target.whatsappEvidence || null;
    target.cnpjEvidence = target.fieldEvidence?.cnpj || target.cnpjEvidence || null;
    target.addressEvidence = target.fieldEvidence?.address || target.addressEvidence || null;
  }
}

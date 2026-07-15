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

function normalizeCnpjDigits(raw: unknown) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : '';
}

/**
 * Chave canônica de telefone: BR celular tem DDD(2) + 9 + número(8) = 11 dígitos;
 * o mesmo aparelho pode ser capturado sem o 9º dígito (10 dígitos, DDD+8).
 * Gera as variantes com/sem 9 (só quando plausível: DDD válido e 3º dígito after DDD == '9')
 * e, se vier com DDI 55, também gera a forma sem DDI — assim `5588912345678`,
 * `558812345678`, `88912345678` e `8812345678` colidem na MESMA chave canônica.
 */
function phoneCanonicalVariants(raw: string | null | undefined): string[] {
  let digits = normalizePhoneDigits(raw);
  if (!digits) return [];
  // remove DDI 55 quando o restante já parece um nacional válido (10 ou 11 dígitos)
  if (digits.length > 11 && digits.startsWith('55')) {
    const withoutDdi = digits.slice(2);
    if (withoutDdi.length === 10 || withoutDdi.length === 11) digits = withoutDdi;
  }
  const variants = new Set<string>();
  if (digits.length === 11 && digits[2] === '9') {
    variants.add(digits);
    variants.add(digits.slice(0, 2) + digits.slice(3)); // remove o 9º dígito
  } else if (digits.length === 10) {
    variants.add(digits);
    variants.add(digits.slice(0, 2) + '9' + digits.slice(2)); // injeta o 9º dígito
  } else {
    variants.add(digits);
  }
  return Array.from(variants);
}

/** Chave canônica única (determinística) representando o telefone, independente do formato capturado. */
function phoneCanonicalKey(raw: string | null | undefined): string {
  const variants = phoneCanonicalVariants(raw);
  if (!variants.length) return '';
  // menor variante (10 dígitos, sem o 9º) como representante estável da chave
  return variants.slice().sort((a, b) => a.length - b.length)[0];
}

/** Primeira palavra "significativa" do nome normalizado — desempate barato pra fone compartilhado. */
function firstNameToken(name: string | null | undefined): string {
  const normalized = normalizeLookupValue(name);
  const stopwords = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos']);
  const tokens = normalized.split(' ').filter((token) => token && !stopwords.has(token));
  return tokens[0] || '';
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

function canConfirmWhatsappFromSource(source: string | null | undefined) {
  const normalized = normalizeSource(source);
  return ['webwhats', 'webwhats_check', 'whatsapp_check', 'radar_database', 'company_history'].includes(normalized);
}

function safeWhatsappStatusForSource(status: unknown, source: string | null | undefined, currentStatus?: unknown) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized !== 'confirmed') return normalized;
  if (String(currentStatus || '').trim().toLowerCase() === 'confirmed') return 'confirmed';
  return canConfirmWhatsappFromSource(source) ? 'confirmed' : 'unverified';
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
    google_textual: 62,
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
  /**
   * Hierarquia de chave canônica (ordem = prioridade, mas TODAS convivem no array —
   * o match acontece por interseção, então qualquer nível que bater já funde):
   *   1. CNPJ (14 dígitos) — chave absoluta, funde mesmo com nome/fone divergentes.
   *   2. placeId — quando a fonte já dedupe (Google/Places).
   *   3. phoneDigits canônico (equivalente com/sem 9º dígito).
   *   4. website/domínio.
   *   5. instagram/facebook.
   *   6. nome normalizado + cidade/endereço (conservador: igualdade exata pós-normalização).
   */
  buildKeys(result: WebscrapingContactResult) {
    const name = normalizeLookupValue(result.name || '');
    const cnpj = normalizeCnpjDigits((result as any).cnpj);
    const phone = phoneCanonicalKey(result.phoneDigits || result.phone);
    const website = normalizeWebsiteKey(result.website);
    const domain = normalizeWebsiteDomain(result.website);
    const instagram = String(result.instagramUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const facebook = String(result.facebookUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const city = normalizeLookupValue(String((result as any).city || ''));
    const location = normalizeLookupValue(String(result.address || result.city || ''));
    return [
      cnpj ? `cnpj:${cnpj}` : '',
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

  /**
   * Guarda anti-falso-positivo: quando o ÚNICO motivo de match é telefone (sem CNPJ, sem
   * website/domínio, sem social, sem nome+cidade), o fone pode ser genérico/compartilhado
   * (linha de galeria, shopping, central de terceiros). Nesse caso exige desempate barato:
   * a primeira palavra do nome normalizado precisa bater. Qualquer outra chave (CNPJ,
   * website, nome+cidade) já é evidência forte o bastante e dispensa esse desempate.
   */
  private isSafeMatch(candidateKeys: string[], existingKeys: string[], matchedKeys: string[], candidate: WebscrapingContactResult, existing: WebscrapingContactResult) {
    const strongKinds = ['cnpj:', 'place:', 'website:', 'domain:', 'instagram:', 'facebook:', 'name_city:', 'name_location:', 'name_phone:'];
    const hasStrongMatch = matchedKeys.some((key) => strongKinds.some((kind) => key.startsWith(kind)));
    if (hasStrongMatch) return true;
    const onlyPhoneMatch = matchedKeys.every((key) => key.startsWith('phone:'));
    if (!onlyPhoneMatch) return true;
    const candidateToken = firstNameToken(candidate.name);
    const existingToken = firstNameToken(existing.name);
    if (!candidateToken || !existingToken) return true; // sem nome pra comparar, não bloqueia (conservador)
    return candidateToken === existingToken;
  }

  mergeSources(sources: Array<{ source: string; results: WebscrapingContactResult[] }>) {
    const merged: WebscrapingContactResult[] = [];
    const counts: Record<string, number> = {};
    for (const source of sources) {
      counts[source.source] = 0;
      for (const result of source.results || []) {
        const keys = this.buildKeys(result);
        if (!keys.length) continue;
        let existing: WebscrapingContactResult | undefined;
        let matchedKeys: string[] = [];
        for (const item of merged) {
          const itemKeys = this.buildKeys(item);
          const overlap = itemKeys.filter((key) => keys.includes(key));
          if (!overlap.length) continue;
          if (!this.isSafeMatch(keys, itemKeys, overlap, result, item)) continue;
          existing = item;
          matchedKeys = overlap;
          break;
        }
        if (existing) {
          this.mergeInto(existing, result, source.source);
          continue;
        }
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
    const candidateKeys = this.buildKeys(candidate);
    for (const item of existing) {
      const itemKeys = this.buildKeys(item);
      const overlap = itemKeys.filter((key) => candidateKeys.includes(key));
      if (overlap.length && this.isSafeMatch(candidateKeys, itemKeys, overlap, candidate, item)) return false;
    }
    return true;
  }

  private withSource(result: WebscrapingContactResult, source: string): WebscrapingContactResult {
    const sourceName = normalizeSource(source || result.source || result.sourceEngine);
    const whatsappStatus = safeWhatsappStatusForSource((result as any).whatsappStatus || (result as any).whatsappCheckStatus, sourceName);
    const safeResult = {
      ...result,
      ...(whatsappStatus ? { whatsappStatus, whatsappCheckStatus: whatsappStatus } : {}),
    } as WebscrapingContactResult;
    const fieldEvidence = this.buildFieldEvidence(safeResult, sourceName);
    return {
      ...safeResult,
      source: safeResult.source || source,
      sourceEngines: Array.from(new Set([
        ...(Array.isArray((safeResult as any).sourceEngines) ? (safeResult as any).sourceEngines : []),
        source,
      ].filter(Boolean))),
      sourceEvidence: {
        ...((safeResult as any).sourceEvidence || {}),
        [source]: {
          placeId: safeResult.placeId || null,
          phoneDigits: safeResult.phoneDigits || null,
          website: safeResult.website || null,
          instagramUrl: safeResult.instagramUrl || null,
          facebookUrl: safeResult.facebookUrl || null,
          email: safeResult.email || null,
          address: safeResult.address || null,
          cnpj: (safeResult as any).cnpj || null,
          whatsappUrl: (safeResult as any).whatsappUrl || null,
          whatsappStatus,
          evidenceJson: (safeResult as any).evidenceJson || null,
        },
      },
      fieldEvidence: {
        ...((safeResult as any).fieldEvidence || {}),
        ...fieldEvidence,
      },
      phoneEvidence: (safeResult as any).phoneEvidence || fieldEvidence.phone || null,
      websiteEvidence: (safeResult as any).websiteEvidence || fieldEvidence.website || null,
      socialEvidence: (safeResult as any).socialEvidence || fieldEvidence.social || null,
      emailEvidence: (safeResult as any).emailEvidence || fieldEvidence.email || null,
      whatsappEvidence: (safeResult as any).whatsappEvidence || fieldEvidence.whatsapp || null,
      cnpjEvidence: (safeResult as any).cnpjEvidence || fieldEvidence.cnpj || null,
      addressEvidence: (safeResult as any).addressEvidence || fieldEvidence.address || null,
    } as any;
  }

  private buildFieldEvidence(result: WebscrapingContactResult, source: string): Record<string, FieldEvidence> {
    const sourceName = normalizeSource(source || result.source || result.sourceEngine);
    const base = sourceBaseConfidence(sourceName);
    const evidenceJson = (result as any).evidenceJson || null;
    const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
    const socialValue = firstPresent(result.instagramUrl, result.facebookUrl) as string | null;
    const whatsappStatus = safeWhatsappStatusForSource((result as any).whatsappStatus || (result as any).whatsappCheckStatus, sourceName);
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
    this.mergeWhatsapp(target, incoming, incomingEvidence.whatsapp, source);
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

  private mergeWhatsapp(target: WebscrapingContactResult, incoming: WebscrapingContactResult, incomingEvidence: FieldEvidence | null, source: string) {
    const targetAny = target as any;
    const current = currentEvidence(targetAny, 'whatsapp', targetAny.whatsappUrl || targetAny.whatsappStatus || target.phoneDigits || target.phone);
    const incomingStatus = safeWhatsappStatusForSource(
      (incoming as any).whatsappStatus || (incoming as any).whatsappCheckStatus,
      source || (incoming as any).source || (incoming as any).sourceEngine,
      targetAny.whatsappStatus,
    );
    if (isBetterEvidence(current, incomingEvidence || null)) {
      targetAny.whatsappUrl = (incoming as any).whatsappUrl || targetAny.whatsappUrl;
      targetAny.whatsappStatus = incomingStatus || targetAny.whatsappStatus;
      targetAny.whatsappCheckStatus = incomingStatus || targetAny.whatsappCheckStatus || targetAny.whatsappStatus;
      targetAny.fieldEvidence = { ...(targetAny.fieldEvidence || {}), whatsapp: incomingEvidence };
    } else if (whatsappStatusRank(incomingStatus) > whatsappStatusRank(targetAny.whatsappStatus)) {
      targetAny.whatsappStatus = incomingStatus;
      targetAny.whatsappCheckStatus = incomingStatus || targetAny.whatsappCheckStatus;
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

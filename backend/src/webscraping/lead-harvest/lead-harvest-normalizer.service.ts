import { Injectable } from '@nestjs/common';
import type {
  EmailHarvestCandidate,
  HarvestImportBatch,
  HarvestNormalizationResult,
  HarvestValidationIssue,
  LeadHarvestCandidate,
  LeadHarvestNormalizeOptions,
} from './lead-harvest.types';
import {
  compactHarvestText,
  getHarvestEmailBlockReason,
  hasHarvestEvidence,
  normalizeEmailHarvestStatus,
  normalizeHarvestConfidence,
  normalizeHarvestDomain,
  normalizeHarvestEmail,
  normalizeHarvestPersistedSourceMode,
  normalizeHarvestPhone,
  normalizeHarvestSourceMode,
  normalizeHarvestSourceRisk,
  normalizeHarvestUrl,
  normalizeHarvestWebsite,
  normalizeLeadHarvestEmailStatus,
  nullableHarvestText,
  requiredHarvestIssue,
  sanitizeHarvestObject,
} from './lead-harvest.validators';

type HarvestImportBatchInput = Omit<Partial<HarvestImportBatch>, 'leads' | 'emails'> & Record<string, any> & {
  leads?: Array<Record<string, any>>;
  emails?: Array<Record<string, any>>;
};

@Injectable()
export class LeadHarvestNormalizerService {
  normalizeEmailCandidate(
    input: Partial<EmailHarvestCandidate> & Record<string, any>,
    options: LeadHarvestNormalizeOptions = {},
  ): HarvestNormalizationResult<EmailHarvestCandidate> {
    const externalId = compactHarvestText(input?.externalId, 160);
    const batchId = compactHarvestText(input?.batchId || options.batchId, 160);
    const sourceMode = normalizeHarvestPersistedSourceMode(
      normalizeHarvestSourceMode(input?.sourceMode || options.sourceMode, 'production'),
      options.persistedImport,
    );
    const provider = compactHarvestText(input?.provider || input?.sourceProvider, 120);
    const sourceUrl = normalizeHarvestUrl(input?.sourceUrl);
    const emailIssue = getHarvestEmailBlockReason(input?.email);
    const email = normalizeHarvestEmail(input?.email);
    const blocked = emailIssue?.code === 'blocked_domain';
    const status = normalizeEmailHarvestStatus(input?.status, Boolean(email), blocked);
    const evidence = sanitizeHarvestObject(input?.evidence);
    const errors: HarvestValidationIssue[] = [];

    if (!externalId) errors.push(requiredHarvestIssue('missing_external_id', 'externalId', 'Informe o ID externo do item.'));
    if (!email && !blocked) errors.push(emailIssue ? { ...emailIssue, externalId } : requiredHarvestIssue('invalid_email', 'email', 'E-mail ausente ou invalido.', externalId));
    if (blocked && emailIssue) errors.push({ ...emailIssue, externalId });
    if (!provider) errors.push(requiredHarvestIssue('missing_provider', 'provider', 'Informe o provider de origem.', externalId));
    if (!sourceUrl) errors.push(requiredHarvestIssue('missing_source_url', 'sourceUrl', 'Informe a URL de origem do e-mail.', externalId));
    if (!hasHarvestEvidence(evidence)) errors.push(requiredHarvestIssue('missing_evidence', 'evidence', 'Informe evidencia de onde o e-mail saiu.', externalId));

    const value: EmailHarvestCandidate = {
      externalId,
      ...(batchId ? { batchId } : {}),
      placeId: nullableHarvestText(input?.placeId, 180),
      email,
      domain: normalizeHarvestDomain(input?.domain || email || input?.website),
      companyName: nullableHarvestText(input?.companyName || input?.name, 300),
      city: nullableHarvestText(input?.city, 120),
      state: nullableHarvestText(input?.state, 2)?.toUpperCase() || null,
      segment: nullableHarvestText(input?.segment, 180),
      website: normalizeHarvestWebsite(input?.website),
      sourceUrl,
      confidence: normalizeHarvestConfidence(input?.confidence, status === 'probable' ? 45 : 80),
      status,
      provider,
      sourceMode,
      evidence,
    };

    if (errors.length) return { ok: false, errors, value };
    return { ok: true, value, warnings: [] };
  }

  normalizeLeadCandidate(
    input: Partial<LeadHarvestCandidate> & Record<string, any>,
    options: LeadHarvestNormalizeOptions = {},
  ): HarvestNormalizationResult<LeadHarvestCandidate> {
    const externalId = compactHarvestText(input?.externalId, 160);
    const batchId = compactHarvestText(input?.batchId || options.batchId, 160);
    const name = compactHarvestText(input?.name || input?.companyName, 300);
    const sourceMode = normalizeHarvestPersistedSourceMode(
      normalizeHarvestSourceMode(input?.sourceMode || options.sourceMode, 'production'),
      options.persistedImport,
    );
    const sourceProvider = compactHarvestText(input?.sourceProvider || input?.provider, 120);
    const sourceUrl = normalizeHarvestUrl(input?.sourceUrl);
    const emailIssue = input?.email ? getHarvestEmailBlockReason(input.email) : null;
    const email = emailIssue ? '' : normalizeHarvestEmail(input?.email);
    const evidence = sanitizeHarvestObject(input?.evidence);
    const raw = sanitizeHarvestObject(input?.raw);
    const errors: HarvestValidationIssue[] = [];

    if (!externalId) errors.push(requiredHarvestIssue('missing_external_id', 'externalId', 'Informe o ID externo do item.'));
    if (!name) errors.push(requiredHarvestIssue('missing_name', 'name', 'Informe o nome da empresa ou lead.', externalId));
    if (!sourceProvider) errors.push(requiredHarvestIssue('missing_provider', 'sourceProvider', 'Informe o provider de origem.', externalId));
    if (!sourceUrl) errors.push(requiredHarvestIssue('missing_source_url', 'sourceUrl', 'Informe a URL de origem do card.', externalId));
    if (emailIssue?.code === 'blocked_domain') errors.push({ ...emailIssue, externalId });

    const phone = normalizeHarvestPhone(input?.phone);
    const phone2 = normalizeHarvestPhone(input?.phone2);
    const phone3 = normalizeHarvestPhone(input?.phone3);
    const whatsapp = normalizeHarvestPhone(input?.whatsapp);
    const value: LeadHarvestCandidate = {
      externalId,
      ...(batchId ? { batchId } : {}),
      placeId: nullableHarvestText(input?.placeId, 180),
      name,
      city: nullableHarvestText(input?.city, 120),
      state: nullableHarvestText(input?.state, 2)?.toUpperCase() || null,
      segment: nullableHarvestText(input?.segment, 180),
      website: normalizeHarvestWebsite(input?.website),
      phone,
      phone2: phone2 && phone2 !== phone ? phone2 : null,
      phone3: phone3 && phone3 !== phone && phone3 !== phone2 ? phone3 : null,
      whatsapp,
      email: email || null,
      emailStatus: normalizeLeadHarvestEmailStatus(input?.emailStatus, Boolean(email)),
      emailConfidence: email ? normalizeHarvestConfidence(input?.emailConfidence, 70) : undefined,
      instagramUrl: normalizeHarvestWebsite(input?.instagramUrl),
      facebookUrl: normalizeHarvestWebsite(input?.facebookUrl),
      sourceUrl,
      sourceProvider,
      sourceMode,
      sourceRisk: normalizeHarvestSourceRisk(sourceMode, input?.sourceRisk),
      evidence,
      raw,
    };

    if (errors.length) return { ok: false, errors, value };
    return { ok: true, value, warnings: [] };
  }

  normalizeBatch(
    input: HarvestImportBatchInput,
    options: LeadHarvestNormalizeOptions = {},
  ): HarvestNormalizationResult<HarvestImportBatch> {
    const batchId = compactHarvestText(input?.batchId || options.batchId, 160);
    const sourceMode = normalizeHarvestPersistedSourceMode(
      normalizeHarvestSourceMode(input?.sourceMode || options.sourceMode, 'production'),
      options.persistedImport,
    );
    const sourceName = compactHarvestText(input?.sourceName, 160);
    const createdAt = this.normalizeCreatedAt(input?.createdAt);
    const errors: HarvestValidationIssue[] = [];

    if (!batchId) errors.push(requiredHarvestIssue('missing_batch_id', 'batchId', 'Informe o ID do batch.'));
    if (!sourceName) errors.push(requiredHarvestIssue('missing_source_name', 'sourceName', 'Informe o nome da fonte do batch.'));

    const leads: LeadHarvestCandidate[] = [];
    for (const lead of Array.isArray(input?.leads) ? input.leads : []) {
      const normalized = this.normalizeLeadCandidate(lead, { ...options, batchId, sourceMode });
      if (normalized.ok) leads.push(normalized.value);
      else if ('errors' in normalized) errors.push(...normalized.errors);
    }

    const emails: EmailHarvestCandidate[] = [];
    for (const email of Array.isArray(input?.emails) ? input.emails : []) {
      const normalized = this.normalizeEmailCandidate(email, { ...options, batchId, sourceMode });
      if (normalized.ok) emails.push(normalized.value);
      else if ('errors' in normalized) errors.push(...normalized.errors);
    }

    const providers = Array.from(new Set([
      ...(Array.isArray(input?.providers) ? input.providers : []),
      ...leads.map((lead) => lead.sourceProvider),
      ...emails.map((email) => email.provider),
    ].map((provider) => compactHarvestText(provider, 120)).filter(Boolean)));

    const value: HarvestImportBatch = {
      batchId,
      sourceMode,
      sourceName,
      createdAt,
      requestedBy: nullableHarvestText(input?.requestedBy, 160),
      city: nullableHarvestText(input?.city, 120),
      state: nullableHarvestText(input?.state, 2)?.toUpperCase() || null,
      segment: nullableHarvestText(input?.segment, 180),
      targetEmails: input?.targetEmails == null ? null : Math.max(0, Math.trunc(Number(input.targetEmails) || 0)),
      providers,
      leads,
      emails,
      stats: this.normalizeStats(input?.stats),
    };

    if (errors.length) return { ok: false, errors, value };
    return { ok: true, value, warnings: [] };
  }

  private normalizeCreatedAt(value: unknown) {
    const raw = compactHarvestText(value, 80);
    const date = raw ? new Date(raw) : new Date();
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  private normalizeStats(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const stats: Record<string, number> = {};
    for (const [key, rawValue] of Object.entries(value as Record<string, any>)) {
      const normalizedKey = compactHarvestText(key, 80);
      if (!normalizedKey) continue;
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) stats[normalizedKey] = Math.max(0, Math.trunc(parsed));
    }
    return Object.keys(stats).length ? stats : undefined;
  }
}

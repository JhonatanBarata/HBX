import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeLookupValue } from '../radar/04-socials/radar-social-matching';
import { LeadContactWriteService } from '../radar/persistence/lead-contact-write.service';
import { LeadHarvestNormalizerService } from './lead-harvest-normalizer.service';
import type {
  EmailHarvestCandidate,
  HarvestImportBatch,
  HarvestImportResult,
  HarvestSourceMode,
  HarvestValidationIssue,
  LeadHarvestCandidate,
} from './lead-harvest.types';
import {
  compactHarvestText,
  normalizeHarvestDomain,
  normalizeHarvestPhone,
  normalizeHarvestUrl,
  sanitizeHarvestObject,
} from './lead-harvest.validators';

type PreparedHarvestItem = {
  externalId: string;
  kind: 'lead' | 'email';
  placeId: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  normalizedPhone2: string | null;
  normalizedWhatsapp: string | null;
  normalizedDomain: string | null;
  normalizedCompanyCityState: string | null;
  companyName: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  website: string | null;
  sourceUrl: string;
  sourceProvider: string;
  sourceMode: HarvestSourceMode;
  emailStatus: 'confirmed' | 'probable' | 'missing' | 'invalid';
  emailSource: string | null;
  confidence: number;
  status: 'accepted' | 'rejected' | 'duplicate' | 'negative' | 'opt_out';
  rejectReason: string | null;
  importedRadarLeadId: string | null;
  payload: Record<string, any>;
};

const NEGATIVE_RADAR_STATUSES = ['denied', 'complaint', 'hidden', 'rejected', 'negative', 'discarded', 'opt_out', 'do_not_contact', 'no_answer', 'no_whatsapp', 'invalid_whatsapp'];
const OPTOUT_EMAIL_STATUSES = ['opted_out', 'do_not_contact'];
const SUPPORTED_SCHEMA_VERSIONS = new Set(['', '1', 'v1', 'lead-harvest.v1', 'hbx-harvest.v1']);
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|jwt|password|secret|token|api[_-]?key|credential|session)/i;
const HEAVY_HTML_KEY_PATTERN = /(^html$|rawhtml|bodyhtml|pagehtml|htmlcontent|raw_html|page_html)/i;

@Injectable()
export class LeadHarvestImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: LeadHarvestNormalizerService,
    @Optional() private readonly leadContactWrite?: LeadContactWriteService,
  ) {}

  private getLeadContactWrite(): LeadContactWriteService {
    return this.leadContactWrite || new LeadContactWriteService();
  }

  async importBatchForUser(user: any, body: Record<string, any>) {
    this.assertAdminOrMaster(user);
    await this.assertPersistenceAvailable();
    this.assertSafeImportPayload(body);

    const batchMeta = this.normalizeBatchMetadata(body);
    const existing = await (this.prisma as any).harvestImportBatch.findUnique({
      where: { batchId: batchMeta.batchId },
    }).catch(() => null);
    if (existing?.id) {
      throw new ConflictException('Batch de harvest ja recebido.');
    }

    const preparedItems = await this.prepareItems(body, batchMeta);
    const context = this.resolveUserContext(user);
    await this.persistAcceptedItemsToRadar(preparedItems, batchMeta, context);
    const receivedCount = (Array.isArray(body?.leads) ? body.leads.length : 0) + (Array.isArray(body?.emails) ? body.emails.length : 0);
    const counts = this.countItems(preparedItems, receivedCount);
    const result = this.buildImportResult(batchMeta.batchId, preparedItems, counts);
    const batchStatus = this.resolveBatchStatus(counts);

    const savedBatch = await (this.prisma as any).harvestImportBatch.create({
      data: {
        batchId: batchMeta.batchId,
        companyId: context.companyId,
        requestedByUserId: context.userId,
        sourceMode: batchMeta.sourceMode,
        sourceName: batchMeta.sourceName,
        requestedBy: batchMeta.requestedBy,
        city: batchMeta.city,
        state: batchMeta.state,
        segment: batchMeta.segment,
        targetEmails: batchMeta.targetEmails,
        providersJson: JSON.stringify(batchMeta.providers),
        statsJson: batchMeta.stats ? JSON.stringify(batchMeta.stats) : null,
        status: batchStatus,
        receivedCount: counts.received,
        acceptedCount: counts.accepted,
        rejectedCount: counts.rejected,
        duplicateCount: counts.duplicates,
        negativeCount: counts.negatives,
        optOutCount: counts.optOuts,
        resultJson: JSON.stringify(result),
      },
    });

    for (const item of preparedItems) {
      await (this.prisma as any).harvestImportItem.create({
        data: {
          importBatchId: savedBatch.id,
          externalId: item.externalId,
          kind: item.kind,
          normalizedEmail: item.normalizedEmail,
          normalizedPhone: item.normalizedPhone,
          normalizedDomain: item.normalizedDomain,
          companyName: item.companyName,
          website: item.website,
          sourceUrl: item.sourceUrl || '',
          sourceProvider: item.sourceProvider || 'unknown',
          confidence: item.confidence,
          status: item.status,
          rejectReason: item.rejectReason,
          payloadJson: JSON.stringify(item.payload),
          importedRadarLeadId: item.importedRadarLeadId,
          importedVendasLeadId: null,
        },
      });
    }

    return {
      id: savedBatch.id,
      batchId: savedBatch.batchId,
      status: batchStatus,
      counts,
      result,
    };
  }

  async getImportForUser(user: any, idOrBatchId: string) {
    this.assertAdminOrMaster(user);
    await this.assertPersistenceAvailable();
    const id = compactHarvestText(idOrBatchId, 200);
    if (!id) throw new BadRequestException('Informe o ID da importacao.');
    const context = this.resolveUserContext(user);
    const where: any = {
      OR: [{ id }, { batchId: id }],
    };
    if (!context.isMaster && context.companyId) where.companyId = context.companyId;
    const batch = await (this.prisma as any).harvestImportBatch.findFirst({
      where,
      include: { items: { orderBy: { createdAt: 'asc' } } },
    }).catch(() => null);
    if (!batch) throw new NotFoundException('Importacao de harvest nao encontrada.');
    return this.serializeBatch(batch);
  }

  private normalizeBatchMetadata(body: Record<string, any>) {
    const schemaVersion = compactHarvestText(body?.schemaVersion || body?.schema || body?.contractVersion, 80).toLowerCase();
    if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
      throw new BadRequestException({
        message: 'Versao de schema de Lead Harvest nao suportada.',
        reason: 'unsupported_schema_version',
        schemaVersion,
      });
    }
    const result = this.normalizer.normalizeBatch({
      ...body,
      leads: [],
      emails: [],
    }, { persistedImport: true });
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Batch de harvest invalido.',
        errors: 'errors' in result ? result.errors : [],
      });
    }
    return result.value;
  }

  private async prepareItems(body: Record<string, any>, batch: HarvestImportBatch) {
    const items: PreparedHarvestItem[] = [];
    const seenIdentityKeys = new Set<string>();
    const leads = Array.isArray(body?.leads) ? body.leads : [];
    for (const [index, rawLead] of leads.entries()) {
      const normalized = this.normalizer.normalizeLeadCandidate(rawLead || {}, {
        batchId: batch.batchId,
        sourceMode: batch.sourceMode as HarvestSourceMode,
      });
      if (normalized.ok) {
        items.push(this.classifyInBatchDuplicate(await this.classifyAcceptedItem(this.buildLeadItem(normalized.value, batch)), seenIdentityKeys));
      } else {
        items.push(this.buildRejectedItem('lead', rawLead, index, 'errors' in normalized ? normalized.errors : []));
      }
    }

    const emails = Array.isArray(body?.emails) ? body.emails : [];
    for (const [index, rawEmail] of emails.entries()) {
      const normalized = this.normalizer.normalizeEmailCandidate(rawEmail || {}, {
        batchId: batch.batchId,
        sourceMode: batch.sourceMode as HarvestSourceMode,
      });
      if (normalized.ok) {
        items.push(this.classifyInBatchDuplicate(await this.classifyAcceptedItem(this.buildEmailItem(normalized.value, batch)), seenIdentityKeys));
      } else {
        items.push(this.buildRejectedItem('email', rawEmail, index, 'errors' in normalized ? normalized.errors : []));
      }
    }
    return items;
  }

  private buildLeadItem(lead: LeadHarvestCandidate, batch: HarvestImportBatch): PreparedHarvestItem {
    const city = lead.city || batch.city || null;
    const state = lead.state || batch.state || null;
    const segment = lead.segment || batch.segment || null;
    const phone = normalizeHarvestPhone(lead.phone);
    const phone2 = normalizeHarvestPhone(lead.phone2);
    const whatsapp = normalizeHarvestPhone(lead.whatsapp);
    const emailStatus = this.normalizeImportedEmailStatus(lead.emailStatus, Boolean(lead.email), lead.emailConfidence);
    return {
      externalId: lead.externalId,
      kind: 'lead',
      placeId: compactHarvestText(lead.placeId, 180) || null,
      normalizedEmail: lead.email || null,
      normalizedPhone: phone || whatsapp,
      normalizedPhone2: phone2 && phone2 !== (phone || whatsapp) ? phone2 : null,
      normalizedWhatsapp: whatsapp,
      normalizedDomain: normalizeHarvestDomain(lead.website || lead.email || lead.sourceUrl) || null,
      normalizedCompanyCityState: this.companyCityStateKey(lead.name, city, state),
      companyName: lead.name,
      city,
      state,
      segment,
      website: lead.website || null,
      sourceUrl: lead.sourceUrl,
      sourceProvider: lead.sourceProvider,
      sourceMode: lead.sourceMode,
      emailStatus,
      emailSource: lead.email ? 'website' : null,
      confidence: lead.emailConfidence || 0,
      status: 'accepted',
      rejectReason: null,
      importedRadarLeadId: null,
      payload: sanitizeHarvestObject(lead),
    };
  }

  private buildEmailItem(email: EmailHarvestCandidate, batch: HarvestImportBatch): PreparedHarvestItem {
    const city = email.city || batch.city || null;
    const state = email.state || batch.state || null;
    const segment = email.segment || batch.segment || null;
    return {
      externalId: email.externalId,
      kind: 'email',
      placeId: compactHarvestText(email.placeId, 180) || null,
      normalizedEmail: email.email,
      normalizedPhone: null,
      normalizedPhone2: null,
      normalizedWhatsapp: null,
      normalizedDomain: email.domain || normalizeHarvestDomain(email.email || email.website) || null,
      normalizedCompanyCityState: this.companyCityStateKey(email.companyName, city, state),
      companyName: email.companyName || null,
      city,
      state,
      segment,
      website: email.website || null,
      sourceUrl: email.sourceUrl,
      sourceProvider: email.provider,
      sourceMode: email.sourceMode,
      emailStatus: this.normalizeImportedEmailStatus(email.status, true, email.confidence),
      emailSource: 'website',
      confidence: email.confidence,
      status: 'accepted',
      rejectReason: null,
      importedRadarLeadId: null,
      payload: sanitizeHarvestObject(email),
    };
  }

  private buildRejectedItem(kind: 'lead' | 'email', raw: any, index: number, errors: HarvestValidationIssue[]): PreparedHarvestItem {
    const externalId = compactHarvestText(raw?.externalId, 160) || `${kind}-rejected-${index + 1}`;
    const sourceUrl = normalizeHarvestUrl(raw?.sourceUrl);
    const reason = this.standardRejectReasonFromIssues(errors, kind);
    const city = compactHarvestText(raw?.city, 120) || null;
    const state = compactHarvestText(raw?.state, 2).toUpperCase() || null;
    const companyName = compactHarvestText(raw?.name || raw?.companyName, 300) || null;
    const phone = normalizeHarvestPhone(raw?.phone);
    const phone2 = normalizeHarvestPhone(raw?.phone2);
    const whatsapp = normalizeHarvestPhone(raw?.whatsapp);
    return {
      externalId,
      kind,
      placeId: compactHarvestText(raw?.placeId, 180) || null,
      normalizedEmail: null,
      normalizedPhone: phone || whatsapp,
      normalizedPhone2: phone2 && phone2 !== (phone || whatsapp) ? phone2 : null,
      normalizedWhatsapp: whatsapp,
      normalizedDomain: normalizeHarvestDomain(raw?.domain || raw?.website || raw?.email) || null,
      normalizedCompanyCityState: this.companyCityStateKey(companyName, city, state),
      companyName,
      city,
      state,
      segment: compactHarvestText(raw?.segment, 180) || null,
      website: normalizeHarvestUrl(raw?.website) || null,
      sourceUrl,
      sourceProvider: compactHarvestText(raw?.sourceProvider || raw?.provider, 120) || 'unknown',
      sourceMode: 'production',
      emailStatus: 'invalid',
      emailSource: null,
      confidence: 0,
      status: 'rejected',
      rejectReason: reason,
      importedRadarLeadId: null,
      payload: {
        externalId,
        kind,
        errors,
        raw: sanitizeHarvestObject(raw),
      },
    };
  }

  private async classifyAcceptedItem(item: PreparedHarvestItem): Promise<PreparedHarvestItem> {
    const importRuleRejection = this.resolveImportRuleRejection(item);
    if (importRuleRejection) {
      return { ...item, status: 'rejected', rejectReason: importRuleRejection };
    }
    if (item.normalizedEmail && await this.hasOptOut(item.normalizedEmail)) {
      return { ...item, status: 'opt_out', rejectReason: 'opt_out' };
    }
    if (await this.hasNegativeHistory(item)) {
      return { ...item, status: 'negative', rejectReason: 'negative_history' };
    }
    const duplicateReason = await this.findDuplicateReason(item);
    if (duplicateReason) {
      return { ...item, status: 'duplicate', rejectReason: duplicateReason };
    }
    return item;
  }

  private classifyInBatchDuplicate(item: PreparedHarvestItem, seenIdentityKeys: Set<string>) {
    if (item.status !== 'accepted') return item;
    const keys = this.itemIdentityKeys(item);
    const duplicatedKey = keys.find((identity) => seenIdentityKeys.has(identity.key));
    if (duplicatedKey) {
      return { ...item, status: 'duplicate' as const, rejectReason: duplicatedKey.reason };
    }
    keys.forEach((identity) => seenIdentityKeys.add(identity.key));
    return item;
  }

  private itemIdentityKeys(item: PreparedHarvestItem) {
    return [
      item.normalizedEmail ? { key: `email:${item.normalizedEmail}`, reason: 'duplicate_email' } : null,
      item.normalizedPhone ? { key: `phone:${item.normalizedPhone}`, reason: 'duplicate_phone' } : null,
      item.normalizedWhatsapp ? { key: `whatsapp:${item.normalizedWhatsapp}`, reason: 'duplicate_phone' } : null,
      item.placeId ? { key: `place:${item.placeId}`, reason: 'duplicate_company_city' } : null,
      item.normalizedDomain ? { key: `domain:${item.normalizedDomain}`, reason: 'duplicate_company_city' } : null,
      item.normalizedCompanyCityState ? { key: `company:${item.normalizedCompanyCityState}`, reason: 'duplicate_company_city' } : null,
    ].filter(Boolean) as Array<{ key: string; reason: string }>;
  }

  private resolveImportRuleRejection(item: PreparedHarvestItem) {
    if (!item.sourceUrl) return 'missing_source_url';
    if (!item.companyName) return 'missing_company_name';
    if (item.kind === 'email' && (!item.normalizedEmail || item.emailStatus === 'invalid')) return 'invalid_email';
    if (item.normalizedEmail && item.emailStatus === 'invalid') return 'invalid_email';
    if (!item.normalizedEmail && !item.normalizedPhone && !item.normalizedWhatsapp && !item.website && !item.placeId) {
      return 'low_identity_confidence';
    }
    if (this.isGenericSourceOnly(item)) return 'generic_source_only';
    return null;
  }

  private isGenericSourceOnly(item: PreparedHarvestItem) {
    const provider = normalizeLookupValue(item.sourceProvider);
    const sourceDomain = normalizeHarvestDomain(item.sourceUrl);
    const websiteDomain = normalizeHarvestDomain(item.website);
    const emailDomain = item.normalizedEmail ? normalizeHarvestDomain(item.normalizedEmail) : '';
    const sourceMatchesOfficial = Boolean(sourceDomain && (sourceDomain === websiteDomain || sourceDomain === emailDomain));
    const genericProvider = /directory|diretorio|diret[oó]rio|catalog|guia|social_probe|facebook|instagram|linktree|generic/i.test(provider);
    return genericProvider && !item.website && !sourceMatchesOfficial;
  }

  private companyCityStateKey(companyName: unknown, city: unknown, state: unknown) {
    const nameKey = normalizeLookupValue(compactHarvestText(companyName, 300));
    const cityKey = normalizeLookupValue(compactHarvestText(city, 120));
    const stateKey = compactHarvestText(state, 2).toUpperCase();
    return nameKey && cityKey && stateKey ? `${nameKey}|${cityKey}|${stateKey}` : null;
  }

  private standardRejectReasonFromIssues(errors: HarvestValidationIssue[], kind: 'lead' | 'email') {
    const codes = new Set(errors.map((error) => error.code));
    if (codes.has('blocked_domain')) return 'blocked_email_domain';
    if (codes.has('invalid_email') || codes.has('missing_email')) return 'invalid_email';
    if (codes.has('missing_source_url')) return 'missing_source_url';
    if (codes.has('missing_name')) return 'missing_company_name';
    if (kind === 'email' && codes.has('missing_external_id')) return 'low_identity_confidence';
    if (codes.has('missing_provider') || codes.has('missing_evidence') || codes.has('missing_external_id')) return 'low_identity_confidence';
    return 'low_identity_confidence';
  }

  private normalizeImportedEmailStatus(value: unknown, hasEmail: boolean, confidence?: number | null): PreparedHarvestItem['emailStatus'] {
    const status = String(value || '').trim().toLowerCase();
    if (!hasEmail) return 'missing';
    if (status === 'invalid' || status === 'blocked_domain') return 'invalid';
    if (status === 'probable') return 'probable';
    if (status === 'confirmed' || status === 'public_found' || status === 'found_on_site') return 'confirmed';
    return Number(confidence || 0) >= 75 ? 'confirmed' : 'probable';
  }

  private async persistAcceptedItemsToRadar(
    items: PreparedHarvestItem[],
    batch: HarvestImportBatch,
    context: ReturnType<LeadHarvestImportService['resolveUserContext']>,
  ) {
    for (const item of items) {
      if (item.status !== 'accepted') continue;
      const duplicateReason = await this.findDuplicateReason(item);
      if (duplicateReason) {
        item.status = 'duplicate';
        item.rejectReason = duplicateReason;
        continue;
      }
      const data = this.buildRadarLeadPoolCreateData(item, batch, context);
      try {
        const row = await (this.prisma as any).radarLeadPool.create({ data });
        item.importedRadarLeadId = row?.id || null;
        // Escrita dupla ADITIVA em LeadContact (Sprint 5 MOTOR-RFB-FILA): contato importado
        // pelo harvest vira linha consultável/exportável com origem e confiança do batch.
        // Best-effort: falha aqui nunca reprova o item importado.
        if (row?.id) {
          const isRfb = /cnpj[_-](?:base|public)|receita/i.test(`${item.sourceProvider} ${item.sourceUrl}`);
          const contacts = [
            ...(item.normalizedEmail ? [{ kind: 'email' as const, value: item.normalizedEmail, source: isRfb ? 'rfb_email' : 'lead_harvest_import', confidence: isRfb ? 100 : item.confidence || 50 }] : []),
            ...(item.normalizedPhone ? [{ kind: 'phone' as const, value: item.normalizedPhone, source: isRfb ? 'rfb_primary' : 'lead_harvest_import', confidence: isRfb ? 100 : item.confidence || 50, rank: 1 }] : []),
            ...(item.normalizedPhone2 ? [{ kind: 'phone' as const, value: item.normalizedPhone2, source: isRfb ? 'rfb_secondary' : 'lead_harvest_import', confidence: isRfb ? 100 : item.confidence || 50, rank: 2 }] : []),
            ...(item.normalizedWhatsapp && item.normalizedWhatsapp !== item.normalizedPhone
              ? [{ kind: 'whatsapp' as const, value: item.normalizedWhatsapp, source: 'lead_harvest_import', confidence: item.confidence || 50 }]
              : []),
          ];
          if (contacts.length) {
            await this.getLeadContactWrite().writeContacts(this.prisma, row.id, contacts).catch(() => null);
          }
        }
      } catch {
        const reason = await this.findDuplicateReason(item);
        item.status = 'duplicate';
        item.rejectReason = reason || 'duplicate_company_city';
      }
    }
  }

  private buildRadarLeadPoolCreateData(
    item: PreparedHarvestItem,
    batch: HarvestImportBatch,
    context: ReturnType<LeadHarvestImportService['resolveUserContext']>,
  ) {
    const now = new Date();
    const sourceEngine = this.resolveImportedSourceEngine(batch);
    const sourceRisk = batch.sourceMode === 'production' ? 'official' : 'experimental';
    const city = item.city || batch.city || null;
    const state = (item.state || batch.state || '').toUpperCase() || null;
    const segment = item.segment || batch.segment || null;
    const phoneDigits = item.normalizedPhone || item.normalizedWhatsapp || null;
    const opportunityScore = this.calculateInitialImportScore(item);
    const evidence = {
      importBatchId: batch.batchId,
      externalId: item.externalId,
      kind: item.kind,
      sourceMode: batch.sourceMode,
      sourceRisk,
      sourceProvider: item.sourceProvider,
      sourceUrl: item.sourceUrl,
      evidence: item.payload?.evidence || null,
    };
    const enrichment = {
      source: 'lead_harvest_import',
      sourceMode: batch.sourceMode,
      sourceRisk,
      batch: {
        batchId: batch.batchId,
        sourceName: batch.sourceName,
        providers: batch.providers,
      },
      item: {
        externalId: item.externalId,
        kind: item.kind,
        confidence: item.confidence,
        emailStatus: item.emailStatus,
        emailConfidence: item.confidence,
      },
      evidence,
    };
    return {
      companyId: context.companyId,
      ownerCompanyId: null,
      placeId: item.placeId || null,
      name: item.companyName || 'Empresa importada',
      phone: phoneDigits,
      phoneDigits,
      ddd: this.extractDdd(phoneDigits),
      city,
      state,
      normalizedCity: normalizeLookupValue(city || ''),
      segment,
      normalizedSegment: normalizeLookupValue(segment || ''),
      website: item.website,
      websiteStatus: item.website ? 'present' : 'unknown',
      email: item.normalizedEmail,
      emailStatus: item.emailStatus,
      emailSource: item.emailSource || 'public_source',
      emailConfidence: item.confidence,
      source: item.sourceProvider || batch.sourceName,
      sourceEngine,
      sourceUrl: item.sourceUrl,
      sourceEngines: JSON.stringify([sourceEngine, item.sourceProvider].filter(Boolean)),
      evidenceJson: JSON.stringify(evidence),
      enrichmentJson: JSON.stringify(enrichment),
      enrichmentScore: opportunityScore,
      enrichmentConfidence: item.confidence,
      enrichmentVersion: 'lead_harvest_import_v1',
      recommendedChannel: item.normalizedEmail ? 'email' : phoneDigits ? 'whatsapp' : 'review',
      opportunityScore,
      opportunityReason: 'Importado com validacao segura do Lead Harvest.',
      status: 'clean',
      metadataJson: JSON.stringify({
        source: 'lead_harvest_import',
        batchId: batch.batchId,
        externalId: item.externalId,
        noVendasImport: true,
        phones: [item.normalizedPhone, item.normalizedPhone2].filter(Boolean),
        emails: [item.normalizedEmail].filter(Boolean),
      }),
      firstSeenAt: now,
      lastSeenAt: now,
    };
  }

  private calculateInitialImportScore(item: PreparedHarvestItem) {
    let score = 25;
    if (item.emailStatus === 'confirmed') score += 35;
    else if (item.emailStatus === 'probable') score += 25;
    if (item.normalizedPhone || item.normalizedWhatsapp) score += 10;
    if (item.website) score += 10;
    if (item.normalizedCompanyCityState) score += 10;
    return Math.max(0, Math.min(100, score));
  }

  private resolveImportedSourceEngine(batch: HarvestImportBatch) {
    return batch.sourceMode === 'imported_lab' || batch.sourceMode === 'local_lab'
      ? 'imported_local_lab'
      : 'imported_official_api';
  }

  private extractDdd(phoneDigits: string | null | undefined) {
    const digits = String(phoneDigits || '').replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(0, 2);
    return null;
  }

  private async hasOptOut(email: string) {
    return Boolean(await (this.prisma as any).commercialEmailMessageLog?.findFirst?.({
      where: { recipientEmail: email, status: { in: OPTOUT_EMAIL_STATUSES } },
      select: { id: true },
    }).catch(() => null));
  }

  private async hasNegativeHistory(item: PreparedHarvestItem) {
    const or: any[] = [];
    if (item.normalizedEmail) or.push({ email: item.normalizedEmail });
    if (item.normalizedPhone) or.push({ phoneDigits: item.normalizedPhone });
    if (item.normalizedWhatsapp) or.push({ phoneDigits: item.normalizedWhatsapp });
    if (item.website) or.push({ website: item.website });
    if (item.placeId) or.push({ placeId: item.placeId });
    if (item.companyName && item.normalizedCompanyCityState) {
      or.push({
        name: item.companyName,
        normalizedCity: normalizeLookupValue(item.city || ''),
        state: item.state || '',
      });
    }
    if (!or.length) return false;
    return Boolean(await (this.prisma as any).radarLeadPool?.findFirst?.({
      where: {
        OR: or,
        status: { in: NEGATIVE_RADAR_STATUSES },
      },
      select: { id: true },
    }).catch(() => null));
  }

  private async findDuplicateReason(item: PreparedHarvestItem) {
    if (item.normalizedEmail && await this.existsHarvestImport({ normalizedEmail: item.normalizedEmail })) return 'duplicate_email';
    if (item.normalizedPhone && await this.existsHarvestImport({ normalizedPhone: item.normalizedPhone })) return 'duplicate_phone';
    if (item.normalizedWhatsapp && await this.existsHarvestImport({ normalizedPhone: item.normalizedWhatsapp })) return 'duplicate_phone';
    if (item.normalizedDomain && await this.existsHarvestImport({ normalizedDomain: item.normalizedDomain })) return 'duplicate_company_city';

    if (item.normalizedEmail && await this.existsRadarLead({ email: item.normalizedEmail })) return 'duplicate_email';
    if (item.normalizedPhone && await this.existsRadarLead({ phoneDigits: item.normalizedPhone })) return 'duplicate_phone';
    if (item.normalizedWhatsapp && await this.existsRadarLead({ phoneDigits: item.normalizedWhatsapp })) return 'duplicate_phone';
    if (item.placeId && await this.existsRadarLead({ placeId: item.placeId })) return 'duplicate_company_city';
    if (item.website && await this.existsRadarLead({ website: item.website })) return 'duplicate_company_city';
    if (
      item.companyName
      && item.normalizedCompanyCityState
      && await this.existsRadarLead({
        name: item.companyName,
        normalizedCity: normalizeLookupValue(item.city || ''),
        state: item.state || '',
      })
    ) {
      return 'duplicate_company_city';
    }
    return null;
  }

  private async existsHarvestImport(where: Record<string, any>) {
    const existingImport = await (this.prisma as any).harvestImportItem.findFirst({
      where: {
        ...where,
        status: { in: ['accepted', 'duplicate'] },
      },
      select: { id: true },
    }).catch(() => null);
    return Boolean(existingImport?.id);
  }

  private async existsRadarLead(where: Record<string, any>) {
    const existingRadar = await (this.prisma as any).radarLeadPool?.findFirst?.({
      where: {
        ...where,
        status: { notIn: NEGATIVE_RADAR_STATUSES },
      },
      select: { id: true },
    }).catch(() => null);
    return Boolean(existingRadar?.id);
  }

  private countItems(items: PreparedHarvestItem[], receivedCount: number) {
    return {
      received: receivedCount,
      accepted: items.filter((item) => item.status === 'accepted').length,
      rejected: items.filter((item) => item.status === 'rejected').length,
      duplicates: items.filter((item) => item.status === 'duplicate').length,
      negatives: items.filter((item) => item.status === 'negative').length,
      optOuts: items.filter((item) => item.status === 'opt_out').length,
    };
  }

  private buildImportResult(batchId: string, items: PreparedHarvestItem[], counts: ReturnType<LeadHarvestImportService['countItems']>): HarvestImportResult {
    return {
      batchId,
      accepted: counts.accepted,
      rejected: counts.rejected,
      duplicates: counts.duplicates,
      negatives: counts.negatives,
      optOuts: counts.optOuts,
      importedLeadIds: items
        .map((item) => item.importedRadarLeadId)
        .filter(Boolean) as string[],
      rejectedItems: items
        .filter((item) => item.status !== 'accepted')
        .map((item) => ({
          externalId: item.externalId,
          reason: item.rejectReason || item.status,
        })),
    };
  }

  private resolveBatchStatus(counts: ReturnType<LeadHarvestImportService['countItems']>) {
    if (counts.accepted <= 0) return 'rejected';
    if (counts.rejected || counts.duplicates || counts.negatives || counts.optOuts) return 'partial';
    return 'imported';
  }

  private serializeBatch(batch: any) {
    const result = this.parseJson(batch?.resultJson);
    return {
      id: batch.id,
      batchId: batch.batchId,
      sourceMode: batch.sourceMode,
      sourceName: batch.sourceName,
      requestedBy: batch.requestedBy,
      city: batch.city,
      state: batch.state,
      segment: batch.segment,
      targetEmails: batch.targetEmails,
      providers: this.parseJsonArray(batch.providersJson),
      stats: this.parseJson(batch.statsJson),
      status: batch.status,
      counts: {
        received: batch.receivedCount,
        accepted: batch.acceptedCount,
        rejected: batch.rejectedCount,
        duplicates: batch.duplicateCount,
        negatives: batch.negativeCount,
        optOuts: batch.optOutCount,
      },
      result,
      items: Array.isArray(batch.items)
        ? batch.items.map((item: any) => ({
            id: item.id,
            externalId: item.externalId,
            kind: item.kind,
            normalizedEmail: item.normalizedEmail,
            normalizedPhone: item.normalizedPhone,
            normalizedDomain: item.normalizedDomain,
            companyName: item.companyName,
            website: item.website,
            sourceUrl: item.sourceUrl,
            sourceProvider: item.sourceProvider,
            confidence: item.confidence,
            status: item.status,
            rejectReason: item.rejectReason,
            importedRadarLeadId: item.importedRadarLeadId,
            importedVendasLeadId: item.importedVendasLeadId,
            payload: this.parseJson(item.payloadJson),
            createdAt: item.createdAt,
          }))
        : [],
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }

  private resolveUserContext(user: any) {
    const isMaster = Boolean(user?.isSystemMaster);
    return {
      isMaster,
      userId: Number(user?.id || 0) || null,
      companyId: Number(user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || user?.company?.id || 0) || null,
    };
  }

  private assertAdminOrMaster(user: any) {
    const role = String(user?.role || '').trim().toUpperCase();
    if (Boolean(user?.isSystemMaster) || role === 'ADMIN') return;
    throw new ForbiddenException('Apenas MASTER ou ADMIN pode importar Lead Harvest.');
  }

  private async assertPersistenceAvailable() {
    if (typeof (this.prisma as any).hasTable === 'function') {
      const [hasBatch, hasItem] = await Promise.all([
        (this.prisma as any).hasTable('HarvestImportBatch').catch(() => false),
        (this.prisma as any).hasTable('HarvestImportItem').catch(() => false),
      ]);
      if (!hasBatch || !hasItem) {
        throw new ServiceUnavailableException('Tabelas de Lead Harvest indisponiveis.');
      }
    }
    if (!(this.prisma as any).harvestImportBatch || !(this.prisma as any).harvestImportItem || !(this.prisma as any).radarLeadPool?.create) {
      throw new ServiceUnavailableException('Persistencia de Lead Harvest indisponivel.');
    }
  }

  private assertSafeImportPayload(value: unknown) {
    const size = Buffer.byteLength(JSON.stringify(value || {}), 'utf8');
    if (size > 512_000) {
      throw new BadRequestException('Payload de harvest muito grande.');
    }
    const unsafe = this.findUnsafePayloadPath(value);
    if (unsafe) {
      throw new BadRequestException({
        message: 'Payload de harvest contem campo nao permitido.',
        reason: 'unsafe_payload',
        path: unsafe,
      });
    }
  }

  private findUnsafePayloadPath(value: unknown, path = '$', depth = 0): string | null {
    if (!value || typeof value !== 'object' || depth > 8) return null;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const found = this.findUnsafePayloadPath(value[index], `${path}[${index}]`, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const [key, rawValue] of Object.entries(value as Record<string, any>)) {
      const currentPath = `${path}.${key}`;
      if (SENSITIVE_KEY_PATTERN.test(key)) return currentPath;
      if (typeof rawValue === 'string' && HEAVY_HTML_KEY_PATTERN.test(key) && rawValue.length > 5_000) return currentPath;
      const found = this.findUnsafePayloadPath(rawValue, currentPath, depth + 1);
      if (found) return found;
    }
    return null;
  }

  private parseJson(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private parseJsonArray(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

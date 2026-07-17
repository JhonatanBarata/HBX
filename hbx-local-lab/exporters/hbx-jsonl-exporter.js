'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { compactText, normalizeDomain, normalizeEmail, normalizePhoneDigits, normalizeUrl } = require('../extractors/email.extractor');

function jsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function normalizeState(value) {
  return compactText(value, 2).toUpperCase() || null;
}

function normalizeEvidence(item) {
  const id = compactText(item && item.id, 80);
  const sourceUrl = normalizeUrl(item && item.sourceUrl);
  const contentHash = String(item && item.contentHash || '').trim().toLowerCase();
  const capturedMs = Date.parse(String(item && item.capturedAt || ''));
  if (!id || !sourceUrl || !/^[a-f0-9]{64}$/.test(contentHash) || !Number.isFinite(capturedMs)) return null;
  return {
    id,
    sourceUrl,
    provider: compactText(item.provider || 'site_crawl', 80),
    pageType: compactText(item.pageType || 'other', 40),
    capturedAt: new Date(capturedMs).toISOString(),
    contentHash,
    excerpt: compactText(item.excerpt, 480),
  };
}

function normalizeLeadContact(contact) {
  const kind = String(contact && contact.kind || '').trim().toLowerCase();
  if (!['email', 'phone', 'whatsapp', 'instagram', 'facebook'].includes(kind)) return null;
  const value = kind === 'email'
    ? normalizeEmail(contact.value)
    : (kind === 'phone' || kind === 'whatsapp')
      ? normalizePhoneDigits(contact.value)
      : normalizeUrl(contact.value);
  if (!value) return null;
  return {
    kind,
    value,
    valueNormalized: value,
    sourceUrl: normalizeUrl(contact.sourceUrl) || null,
    evidenceId: compactText(contact.evidenceId, 80) || null,
    confidence: Number.isFinite(Number(contact.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(contact.confidence)))) : 0,
    officialDomainMatch: Boolean(contact.officialDomainMatch),
    ...(kind === 'whatsapp' && contact.whatsappConfirmed === true && contact.verification === 'official_whatsapp_link'
      ? { whatsappConfirmed: true, verification: 'official_whatsapp_link' }
      : {}),
  };
}

function normalizeLead(lead, batchId, job) {
  const name = compactText(lead.name || lead.companyName, 300);
  const sourceUrl = normalizeUrl(lead.sourceUrl || lead.website);
  if (!name || !sourceUrl) return null;
  const email = normalizeEmail(lead.email);
  return {
    externalId: compactText(lead.externalId, 180) || `lead:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    batchId,
    name,
    city: compactText(lead.city || job.city, 120) || null,
    state: normalizeState(lead.state || job.state),
    segment: compactText(lead.segment || job.segment, 180) || null,
    website: normalizeUrl(lead.website) || null,
    phone: normalizePhoneDigits(lead.phone) || null,
    whatsapp: normalizePhoneDigits(lead.whatsapp) || null,
    email: email || null,
    emailStatus: email ? lead.emailStatus || 'probable' : 'missing',
    emailConfidence: Number.isFinite(Number(lead.emailConfidence)) ? Math.max(0, Math.min(100, Math.round(Number(lead.emailConfidence)))) : undefined,
    // Multi-contato 1/2/3 — o provider já junta até 3 e-mails/telefones (por confiança); o export
    // só carregava `email`/`phone` SINGULAR → o consumidor (enricher do Owner) recebia 1 e-mail e
    // ZERO telefone (ele lê `emails[]`/`phones[]`, não os singulares). Agora exporta os arrays + CNPJ
    // do rodapé. Fallback p/ o singular quando o provider não trouxe array.
    emails: Array.isArray(lead.emails)
      ? lead.emails.map((e) => normalizeEmail(e)).filter(Boolean).slice(0, 3)
      : (email ? [email] : []),
    phones: Array.isArray(lead.phones)
      ? lead.phones.map((p) => normalizePhoneDigits(p)).filter((p) => p && (p.length === 10 || p.length === 11)).slice(0, 3)
      : (normalizePhoneDigits(lead.phone) ? [normalizePhoneDigits(lead.phone)] : []),
    cnpj: String(lead.cnpj || '').replace(/\D/g, '').slice(0, 14) || null,
    instagramUrl: normalizeUrl(lead.instagramUrl) || null,
    facebookUrl: normalizeUrl(lead.facebookUrl) || null,
    sourceUrl,
    sourceProvider: compactText(lead.sourceProvider || 'local_lab', 120),
    sourceMode: 'local_lab',
    sourceRisk: 'experimental',
    evidence: {
      items: Array.isArray(lead?.evidence?.items) ? lead.evidence.items.map(normalizeEvidence).filter(Boolean) : [],
      emailsFound: Math.max(0, Math.trunc(Number(lead?.evidence?.emailsFound || 0))),
    },
    contacts: Array.isArray(lead.contacts) ? lead.contacts.map(normalizeLeadContact).filter(Boolean) : [],
    raw: lead.raw && typeof lead.raw === 'object' ? lead.raw : {},
  };
}

function normalizeEmailCandidate(email, batchId) {
  const normalizedEmail = normalizeEmail(email.email);
  const sourceUrl = normalizeUrl(email.sourceUrl);
  if (!normalizedEmail || !sourceUrl) return null;
  return {
    externalId: compactText(email.externalId, 180) || `email:${normalizedEmail}`,
    batchId,
    email: normalizedEmail,
    domain: normalizeDomain(email.domain || normalizedEmail) || null,
    companyName: compactText(email.companyName, 300) || null,
    website: normalizeUrl(email.website) || null,
    sourceUrl,
    confidence: Number.isFinite(Number(email.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(email.confidence)))) : 0,
    status: ['public_found', 'probable', 'invalid', 'blocked_domain'].includes(String(email.status || ''))
      ? email.status
      : 'probable',
    provider: compactText(email.provider || 'local_lab', 120),
    sourceMode: 'local_lab',
    evidence: email.evidence && typeof email.evidence === 'object' ? email.evidence : {},
  };
}

function dedupeLeads(leads) {
  const seen = new Set();
  return leads.filter((lead) => {
    const key = [
      lead.email ? `email:${lead.email}` : '',
      lead.phone ? `phone:${lead.phone}` : '',
      lead.website ? `domain:${normalizeDomain(lead.website)}` : '',
      `namecity:${String(lead.name || '').toLowerCase()}|${String(lead.city || '').toLowerCase()}`,
    ].filter(Boolean).find((item) => !item.endsWith(':'));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEmails(emails) {
  const seen = new Set();
  return emails.filter((email) => {
    const key = email.email || `${email.domain}:${email.sourceUrl}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEvidence(evidence) {
  const seen = new Set();
  return evidence.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildBatchExport(job, input = {}) {
  const batchId = job.batchId || `local-lab-${job.id}`;
  const leads = dedupeLeads((input.leads || []).map((lead) => normalizeLead(lead, batchId, job)).filter(Boolean));
  const emails = dedupeEmails((input.emails || []).map((email) => normalizeEmailCandidate(email, batchId)).filter(Boolean));
  const evidence = dedupeEvidence([
    ...(Array.isArray(input.evidence) ? input.evidence : []),
    ...(Array.isArray(input.leads) ? input.leads.flatMap((lead) => Array.isArray(lead?.evidence?.items) ? lead.evidence.items : []) : []),
  ].map(normalizeEvidence).filter(Boolean));
  const providers = Array.from(new Set([
    ...(Array.isArray(job.providers) ? job.providers : []),
    ...leads.map((lead) => lead.sourceProvider),
    ...emails.map((email) => email.provider),
  ].filter(Boolean)));
  const stats = {
    ...(input.stats || {}),
    leads: leads.length,
    emails: emails.length,
  };
  const manifest = {
    batchId,
    sourceMode: 'local_lab',
    sourceName: 'HBX Local Lab',
    createdAt: new Date(job.createdAt || Date.now()).toISOString(),
    requestedBy: job.requestedBy || null,
    city: job.city || null,
    state: normalizeState(job.state),
    segment: job.segment || null,
    targetEmails: Number.isFinite(Number(job.targetEmails)) ? Math.trunc(Number(job.targetEmails)) : null,
    providers,
    stats,
  };
  return {
    manifest,
    batch: {
      ...manifest,
      leads,
      emails,
      evidence,
    },
    leads,
    emails,
    evidence,
    leadsJsonl: leads.map(jsonLine).join(''),
    emailsJsonl: emails.map(jsonLine).join(''),
    evidenceJsonl: evidence.map(jsonLine).join(''),
  };
}

async function writeBatchExport(job, input, outputDir) {
  const exported = buildBatchExport(job, input);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'batch-manifest.json'), JSON.stringify(exported.manifest, null, 2));
  await fs.writeFile(path.join(outputDir, 'leads.jsonl'), exported.leadsJsonl);
  await fs.writeFile(path.join(outputDir, 'emails.jsonl'), exported.emailsJsonl);
  await fs.writeFile(path.join(outputDir, 'evidence.jsonl'), exported.evidenceJsonl);
  return {
    ...exported,
    files: {
      manifest: path.join(outputDir, 'batch-manifest.json'),
      leads: path.join(outputDir, 'leads.jsonl'),
      emails: path.join(outputDir, 'emails.jsonl'),
      evidence: path.join(outputDir, 'evidence.jsonl'),
    },
  };
}

module.exports = {
  buildBatchExport,
  writeBatchExport,
};

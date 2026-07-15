import { gateLeadContacts, type LeadContactCandidate, type LeadContactKind } from './lead-contact-gate';
import { normalizePhoneDigits } from '../shared/radar-core-shared';

function asObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function values(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function uniqueValues(items: string[], normalize: (value: string) => string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const key = normalize(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function buildRankedRadarContacts(input: {
  primaryEmail?: unknown;
  primaryPhone?: unknown;
  evidenceJson?: unknown;
  existingMetadataJson?: unknown;
  sourceEngine?: unknown;
  emailConfidence?: unknown;
}): { emails: string[]; phones: string[]; candidates: LeadContactCandidate[] } {
  const evidence = asObject(input.evidenceJson);
  const extracted = asObject(evidence.extractedFields);
  const metadata = asObject(input.existingMetadataJson);
  const primaryEmail = String(input.primaryEmail || '').trim();
  const primaryPhone = String(input.primaryPhone || '').trim();
  const sourceEngine = String(input.sourceEngine || 'radar').trim() || 'radar';

  const extractedEmails = values(extracted.emails);
  const extractedPhones = [
    ...values(extracted.phones),
    ...values(extracted.phoneDigits),
    ...values(extracted.whatsappPhoneDigits),
  ];
  const existingEmails = values(metadata.emails);
  const existingPhones = values(metadata.phones);

  const emailValues = uniqueValues(
    [primaryEmail, ...extractedEmails, ...existingEmails].filter(Boolean),
    (value) => value.toLowerCase(),
  );
  const phoneValues = uniqueValues(
    [primaryPhone, ...extractedPhones, ...existingPhones].filter(Boolean),
    (value) => normalizePhoneDigits(value),
  );

  const extractedEmailKeys = new Set(extractedEmails.map((value) => value.toLowerCase()));
  const extractedPhoneKeys = new Set(extractedPhones.map((value) => normalizePhoneDigits(value)));
  const candidatesBeforeGate: LeadContactCandidate[] = [
    ...emailValues.map((value, index) => ({
      kind: 'email' as const,
      value,
      rank: index + 1,
      source: index === 0 && primaryEmail && value.toLowerCase() === primaryEmail.toLowerCase()
        ? sourceEngine
        : extractedEmailKeys.has(value.toLowerCase()) ? 'website_crawl_light' : 'metadata_existing',
      confidence: index === 0 && primaryEmail && value.toLowerCase() === primaryEmail.toLowerCase()
        ? Math.max(0, Math.min(100, Math.trunc(Number(input.emailConfidence) || 60)))
        : extractedEmailKeys.has(value.toLowerCase()) ? 70 : 60,
    })),
    ...phoneValues.map((value, index) => ({
      kind: 'phone' as const,
      value,
      rank: index + 1,
      source: index === 0 && primaryPhone && normalizePhoneDigits(value) === normalizePhoneDigits(primaryPhone)
        ? sourceEngine
        : extractedPhoneKeys.has(normalizePhoneDigits(value)) ? 'website_crawl_light' : 'metadata_existing',
      confidence: index === 0 && primaryPhone && normalizePhoneDigits(value) === normalizePhoneDigits(primaryPhone) ? 75 : 70,
    })),
  ];

  // Metadata e Vendas recebem exatamente o mesmo conjunto aprovado que LeadContact. O limite
  // e o rank são aplicados DEPOIS do gate: ruído no topo não consome vaga nem deixa rank furado.
  const approved = gateLeadContacts(candidatesBeforeGate).approved;
  const finalize = (kind: LeadContactKind): LeadContactCandidate[] => {
    const seen = new Set<string>();
    const output: LeadContactCandidate[] = [];
    for (const contact of approved) {
      if (contact.kind !== kind || seen.has(contact.valueNormalized)) continue;
      seen.add(contact.valueNormalized);
      output.push({
        kind: contact.kind,
        value: contact.valueNormalized,
        source: contact.source,
        confidence: contact.confidence,
        rank: output.length + 1,
      });
      if (output.length >= 3) break;
    }
    return output;
  };
  const emailCandidates = finalize('email');
  const phoneCandidates = finalize('phone');
  const emails = emailCandidates.map((contact) => contact.value);
  const phones = phoneCandidates.map((contact) => contact.value);
  const candidates = [...emailCandidates, ...phoneCandidates];

  return { emails, phones, candidates };
}

import type { LeadContactRecord } from "@/components/hbx/lead-contact-list";
import { formatBrPhone, onlyDigits } from "@/lib/br-phone";

export type LeadContactSummaryInput = {
  phone?: string | null;
  email?: string | null;
  phones?: string[] | null;
  emails?: string[] | null;
  phoneContacts?: LeadContactRecord[] | null;
  emailContacts?: LeadContactRecord[] | null;
  sourceType?: string | null;
  primarySource?: string | null;
  sourceHistoryId?: string | null;
  radarOrigin?: boolean | null;
  contactAccessGranted?: boolean | null;
};

export function summarizeLeadContacts(lead: LeadContactSummaryInput) {
  const sources = [lead.sourceType, lead.primarySource]
    .map(value => String(value || "").trim().toLowerCase());
  const radarOrigin = lead.radarOrigin === true
    || /^radar:[^:\s]+$/i.test(String(lead.sourceHistoryId || "").trim())
    || sources.some(source => ["radar", "webscraping", "radar_quarantined"].includes(source));
  if (radarOrigin && lead.contactAccessGranted !== true) {
    return { primary: "—", extra: 0, total: 0 };
  }
  const phoneCandidates = [
    lead.phone,
    ...(lead.phoneContacts || []).slice().sort((a, b) => Number(a.rank || 99) - Number(b.rank || 99)).map(contact => contact.value || contact.valueNormalized),
    ...(lead.phones || []),
  ];
  const emailCandidates = [
    lead.email,
    ...(lead.emailContacts || []).slice().sort((a, b) => Number(a.rank || 99) - Number(b.rank || 99)).map(contact => contact.value || contact.valueNormalized),
    ...(lead.emails || []),
  ];
  const seenPhones = new Set<string>();
  const phones = phoneCandidates.filter((value): value is string => {
    const digits = onlyDigits(value || "");
    if (!digits || seenPhones.has(digits)) return false;
    seenPhones.add(digits);
    return true;
  }).slice(0, 3);
  const seenEmails = new Set<string>();
  const emails = emailCandidates.filter((value): value is string => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized || seenEmails.has(normalized)) return false;
    seenEmails.add(normalized);
    return true;
  }).slice(0, 3);
  const total = phones.length + emails.length;
  const primary = phones[0] ? (formatBrPhone(phones[0]) || phones[0]) : emails[0] || "—";
  return { primary, extra: Math.max(0, total - 1), total };
}

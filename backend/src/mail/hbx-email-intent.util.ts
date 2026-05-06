export const HBX_PRESENTATION_EMAIL_INTENT = 'SEND_HBX_PRESENTATION_EMAIL' as const;

export type HbxPresentationEmailIntent = {
  intent: typeof HBX_PRESENTATION_EMAIL_INTENT | null;
  confidence: number;
  extractedEmail: string | null;
  extractedEmails: string[];
  invalidEmailCandidates: string[];
  needsEmail: boolean;
};

const VALID_EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_CANDIDATE_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi;
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;

const businessFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stripEmailBoundary(value: string) {
  return String(value || '').replace(/^[<([{"'`]+/, '').replace(/[>)\]},;:"'`.!?]+$/, '').trim();
}

export function normalizeHbxEmail(value: unknown) {
  const email = stripEmailBoundary(String(value || '')).toLowerCase();
  return email || null;
}

export function isValidHbxEmail(value: unknown) {
  const email = normalizeHbxEmail(value);
  if (!email || email.length > 254) return false;
  if (email.includes('..')) return false;
  if (!VALID_EMAIL_REGEX.test(email)) return false;
  const domain = email.split('@')[1] || '';
  return domain
    .split('.')
    .every((part) => Boolean(part) && !part.startsWith('-') && !part.endsWith('-'));
}

export function extractHbxEmails(text: unknown) {
  const raw = String(text || '').match(EMAIL_REGEX) || [];
  return dedupe(raw.map((value) => normalizeHbxEmail(value) || '').filter((value) => isValidHbxEmail(value)));
}

export function extractInvalidHbxEmailCandidates(text: unknown) {
  const raw = String(text || '').match(EMAIL_CANDIDATE_REGEX) || [];
  const valid = new Set(extractHbxEmails(text));
  return dedupe(
    raw
      .map((value) => normalizeHbxEmail(value) || '')
      .filter((value) => value && !valid.has(value) && !isValidHbxEmail(value)),
  );
}

function normalizeIntentText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/e[\s-]*mail/g, 'email')
    .replace(/[^a-z0-9@._%+\-\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(normalizedText: string, values: string[]) {
  return values.some((value) => normalizedText.includes(normalizeIntentText(value)));
}

export function detectHbxPresentationEmailIntent(text: unknown): HbxPresentationEmailIntent {
  const normalized = normalizeIntentText(text);
  const extractedEmails = extractHbxEmails(text);
  const invalidEmailCandidates = extractInvalidHbxEmailCandidates(text);
  const hasEmailWord = /\bemail\b/.test(normalized);
  const hasSendVerb = /\b(manda|mandar|envia|enviar|encaminha|encaminhar|receber|recebo)\b/.test(normalized);
  const hasPresentationWord = /\b(apresentacao|ppt|pptx|material|proposta)\b/.test(normalized);
  const directIntent = containsAny(normalized, [
    'manda no email',
    'manda no meu email',
    'envia por email',
    'enviar por email',
    'pode enviar por email',
    'pode mandar por email',
    'me envia por email',
    'me manda por email',
    'me manda a apresentacao',
    'me envia a apresentacao',
    'quero receber no email',
    'quero receber por email',
    'meu email e',
    'email',
    'encaminha para',
    'encaminhar para',
  ]);
  const hasValidEmail = extractedEmails.length > 0;
  const hasInvalidEmail = invalidEmailCandidates.length > 0;
  const detected =
    directIntent ||
    (hasValidEmail && hasSendVerb) ||
    (hasEmailWord && (hasSendVerb || hasPresentationWord || normalized.includes('quero receber'))) ||
    (hasPresentationWord && hasSendVerb);

  if (!detected) {
    return {
      intent: null,
      confidence: 0,
      extractedEmail: null,
      extractedEmails: [],
      invalidEmailCandidates: [],
      needsEmail: false,
    };
  }

  return {
    intent: HBX_PRESENTATION_EMAIL_INTENT,
    confidence: hasValidEmail ? 0.92 : hasInvalidEmail ? 0.76 : 0.78,
    extractedEmail: extractedEmails[0] || null,
    extractedEmails,
    invalidEmailCandidates,
    needsEmail: !hasValidEmail,
  };
}

function getBusinessDateParts(date: Date) {
  const values: Record<string, number> = {};
  for (const part of businessFormatter.formatToParts(date)) {
    if (part.type === 'literal') continue;
    values[part.type] = Number(part.value);
  }
  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = values.hour === 24 ? 0 : values.hour;
  const minute = values.minute || 0;
  const second = values.second || 0;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function getBusinessTimeZoneOffsetMs(date: Date) {
  const parts = getBusinessDateParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function makeBusinessDate(year: number, month: number, day: number, hour: number, minute: number) {
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getBusinessTimeZoneOffsetMs(new Date(utcGuess));
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
  }
  return new Date(utcGuess);
}

function isBusinessDay(parts: ReturnType<typeof getBusinessDateParts>) {
  return parts.weekday >= 1 && parts.weekday <= 5;
}

function nextBusinessStart(date: Date) {
  let parts = getBusinessDateParts(date);
  let cursor = date;
  if (isBusinessDay(parts) && parts.hour < BUSINESS_START_HOUR) {
    return makeBusinessDate(parts.year, parts.month, parts.day, BUSINESS_START_HOUR, 0);
  }
  if (isBusinessDay(parts) && parts.hour < BUSINESS_END_HOUR) {
    return cursor;
  }
  do {
    cursor = makeBusinessDate(parts.year, parts.month, parts.day + 1, BUSINESS_START_HOUR, 0);
    parts = getBusinessDateParts(cursor);
  } while (!isBusinessDay(parts));
  return cursor;
}

export function addBusinessHours(dateInput: Date | string, hoursInput: number) {
  let remainingMinutes = Math.max(0, Math.round(Number(hoursInput || 0) * 60));
  let cursor = nextBusinessStart(dateInput instanceof Date ? dateInput : new Date(dateInput));
  if (!Number.isFinite(cursor.getTime())) cursor = nextBusinessStart(new Date());

  while (remainingMinutes > 0) {
    cursor = nextBusinessStart(cursor);
    const parts = getBusinessDateParts(cursor);
    const end = makeBusinessDate(parts.year, parts.month, parts.day, BUSINESS_END_HOUR, 0);
    const availableMinutes = Math.max(0, Math.floor((end.getTime() - cursor.getTime()) / 60000));
    if (remainingMinutes <= availableMinutes) {
      return new Date(cursor.getTime() + remainingMinutes * 60000);
    }
    remainingMinutes -= availableMinutes;
    cursor = makeBusinessDate(parts.year, parts.month, parts.day + 1, BUSINESS_START_HOUR, 0);
  }

  return cursor;
}

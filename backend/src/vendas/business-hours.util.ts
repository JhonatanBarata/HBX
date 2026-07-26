// S5 LEAD-CENTRICO (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/05-agenda-slots.md) —
// regras de horário comercial COLHIDAS de vendas-automation.service.ts (funções privadas
// getBusinessDateParts/getBusinessTimeZoneOffsetMs/makeBusinessDate/parseTimeOnDate/
// isBusinessDay/moveToBusinessDay/isInsideWorkingHours/normalizeTime, hoje amarradas ao
// shape `campaign` da VendasAutomationCampaign). Este arquivo é uma cópia INTENCIONAL,
// pura e exportável, parametrizada por `{ workingHoursStart, workingHoursEnd }` em vez de
// `campaign` — usada pelo serviço de slots (agenda-disparo.service.ts) e pelo runner da
// cadência (cadencia.service.ts). O arquivo original NÃO foi tocado (ordem do dono:
// colher, não reescrever nem apagar — o motor antigo morre só no S7).

export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const businessTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export interface BusinessWindow {
  workingHoursStart: string; // HH:MM
  workingHoursEnd: string; // HH:MM
}

export function normalizeTimeHHMM(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : fallback;
}

export function getBusinessDateParts(date: Date) {
  const values: Record<string, number> = {};
  for (const part of businessTimeFormatter.formatToParts(date)) {
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

export function getBusinessTimeZoneOffsetMs(date: Date) {
  const parts = getBusinessDateParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function makeBusinessDate(year: number, month: number, day: number, hour: number, minute: number) {
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getBusinessTimeZoneOffsetMs(new Date(utcGuess));
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
  }
  return new Date(utcGuess);
}

export function parseTimeOnDate(date: Date, hhmm: string, fallback = '08:00') {
  const [hourRaw, minuteRaw] = normalizeTimeHHMM(hhmm, fallback).split(':');
  const parts = getBusinessDateParts(date);
  return makeBusinessDate(parts.year, parts.month, parts.day, Number(hourRaw), Number(minuteRaw));
}

// Dias úteis são FIXOS seg-sex (weekday 1..5) — não configurável, mesmo comportamento
// do motor antigo (isBusinessDay em vendas-automation.service.ts).
export function isBusinessDay(date: Date) {
  const day = getBusinessDateParts(date).weekday;
  return day >= 1 && day <= 5;
}

export function addBusinessCalendarDays(date: Date, days: number) {
  const parts = getBusinessDateParts(date);
  return makeBusinessDate(parts.year, parts.month, parts.day + days, parts.hour, parts.minute);
}

export function moveToBusinessDay(date: Date) {
  const next = new Date(date);
  while (!isBusinessDay(next)) {
    const moved = addBusinessCalendarDays(next, 1);
    next.setTime(moved.getTime());
  }
  return next;
}

export function isInsideWorkingHours(date: Date, window: BusinessWindow) {
  if (!isBusinessDay(date)) return false;
  const start = parseTimeOnDate(date, window.workingHoursStart, '08:00');
  const end = parseTimeOnDate(date, window.workingHoursEnd, '18:00');
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

// Clampa `date` pra dentro da janela: fora de dia útil ou antes do início -> primeiro
// horário livre do próximo dia útil válido; depois do fim -> início do próximo dia útil.
// Mesmo algoritmo de moveToWorkingWindow (vendas-automation.service.ts), parametrizado.
export function moveIntoWorkingWindow(date: Date, window: BusinessWindow): Date {
  if (!isBusinessDay(date)) {
    return parseTimeOnDate(moveToBusinessDay(date), window.workingHoursStart, '08:00');
  }
  const start = parseTimeOnDate(date, window.workingHoursStart, '08:00');
  const end = parseTimeOnDate(date, window.workingHoursEnd, '18:00');
  if (date.getTime() < start.getTime()) return start;
  if (date.getTime() <= end.getTime()) return date;
  const nextDay = addBusinessCalendarDays(date, 1);
  return parseTimeOnDate(moveToBusinessDay(nextDay), window.workingHoursStart, '08:00');
}

export function dayKeyOf(date: Date): string {
  const parts = getBusinessDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

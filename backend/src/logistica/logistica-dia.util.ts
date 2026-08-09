import { BadRequestException } from '@nestjs/common';

/**
 * DIA CIVIL DE SÃO PAULO — os 3 helpers de data que o módulo LOGÍSTICA inteiro usa.
 *
 * Moravam em `logistica-occurrence.service.ts` (o gerador V1, apagado na faxina
 * F1 de 09/08 — 9/9 empresas rodam a Agenda V2, o V1 era ramo morto). O motor
 * morreu; estas funções NÃO, porque a lei que elas carregam continua valendo:
 *
 * 🔴 LEI (26/07, incidente "o app parou de gerar rota", company 48): data de
 * operação é dia CIVIL DE SÃO PAULO, explicitamente — nunca herdada do fuso do
 * processo. O MESMO código roda no Windows do dono (-03) e num container UTC, e
 * os dois têm que decidir o MESMO dia. Usar método LOCAL do Date
 * (`setHours`/`getDay`/`getFullYear`) dá "meia-noite de quem está rodando": em
 * UTC isso é 21h do dia ANTERIOR em Brasília. Foi assim que as paradas nasceram
 * 3h antes da janela que as busca, ficaram invisíveis, e cada clique em "Montar
 * rota" materializou um lote novo (98 + 73 + 7 = 178 entregas órfãs) enquanto a
 * tela dizia "Nenhuma parada foi encontrada para a rota de hoje".
 */

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function dateParts(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new BadRequestException('Data inválida. Use YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new BadRequestException('Data de calendário inválida.');
  }
  return { year, month, day };
}

/** Soma N dias CIVIS a "YYYY-MM-DD" (a conta é feita em UTC pra não escorregar). */
export function addCivilDays(dateKey: string, amount: number): string {
  const { year, month, day } = dateParts(dateKey);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

/** Dia da semana ISO (1=segunda … 7=domingo) de "YYYY-MM-DD". */
export function isoWeekdayForDate(dateKey: string): number {
  const { year, month, day } = dateParts(dateKey);
  const js = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Data civil "YYYY-MM-DD" em São Paulo — independente do fuso do processo. */
export function saoPauloDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

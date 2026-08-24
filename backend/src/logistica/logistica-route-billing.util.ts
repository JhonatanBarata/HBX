import { BadRequestException } from '@nestjs/common';

/**
 * ROTA v2 (10/08, "PICAR A PONTE" — refundação da cobrança) — o que sobrou de
 * ÚTIL da máquina velha de billing (logistica-route-billing.service.ts,
 * MORTA nesta onda: prepareRoute/beginInitialization/activateRoute/
 * abortPreparedRoute/failInitialization, os claims por bloco e o reconciliador
 * de estorno inteiro foram embora). `canonicalRouteDate` é pura e usada por
 * mais de 10 arquivos fora do billing (agenda, admin, controller, estoque,
 * modelo de rota, aviso...) — migrou pra cá pra esses consumidores não
 * precisarem importar de um arquivo que não existe mais.
 *
 * `LogisticaRouteMode` também mora aqui: é o tipo do campo `mode` de
 * `LogisticaRoute` (ESSENTIAL | TRACKED) — continua vivo porque ainda decide
 * se a rota tem sessão de RASTREAMENTO (GPS), só que agora DESACOPLADO de
 * cobrança: no modelo novo, todo nível com plano (BASIC/ADVANCED/FULL) é rota
 * ILIMITADA (o limite é de ASSENTO, não de bloco/entrega cobrada) e o nível
 * CREDITO paga o DIA — nenhum dos dois cobra mais por bloco Essencial nem por
 * entrega Rastreada.
 * 24/08/2026 — toda rota NOVA nasce TRACKED (a escolha de modo morreu);
 * ESSENTIAL sobrevive só congelado em rota antiga.
 */
export type LogisticaRouteMode = 'ESSENTIAL' | 'TRACKED';

export function canonicalRouteDate(value?: string | null, now = new Date()): string {
  const raw = String(value || '').trim();
  if (raw) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) throw new BadRequestException('Data da rota inválida. Use YYYY-MM-DD.');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const test = new Date(Date.UTC(year, month - 1, day));
    if (
      test.getUTCFullYear() === year &&
      test.getUTCMonth() === month - 1 &&
      test.getUTCDate() === day
    ) {
      return raw;
    }
    throw new BadRequestException('Data da rota inválida.');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Mês civil "YYYY-MM" de São Paulo — migrou de
 * logistica-tracked-billing.service.ts (morto na ROTA v2) porque
 * `logistica-tracking-bonus.service.ts` (feature VIVA, bônus de performance
 * do motorista — nada a ver com a máquina de cobrança) também precisa dela.
 */
export function saoPauloMonth(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}`;
}

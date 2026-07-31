/**
 * Fronteira de DIA no fuso do dono, não no fuso do container.
 *
 * Armadilha já paga (teste-verde-no-meu-fuso-nao-vale): o container roda UTC e o
 * dono vive em -03 — "hoje" calculado com getHours() do servidor mostra o dia
 * errado das 21h à meia-noite. Aqui o fuso é EXPLÍCITO: o Intl devolve as partes
 * em America/Sao_Paulo e a conversão volta para o instante UTC correspondente.
 */

const TZ = 'America/Sao_Paulo';

const FORMATADOR = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partes(ref: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const parte of FORMATADOR.formatToParts(ref)) {
    if (parte.type === 'literal') continue;
    out[parte.type] = Number(parte.value);
  }
  // 24 = meia-noite em alguns runtimes com hour12:false.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Quanto o relógio local está adiantado em relação ao UTC, no instante dado. */
function deslocamentoMs(ref: Date): number {
  const p = partes(ref);
  const comoSeFosseUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoSeFosseUtc - Math.floor(ref.getTime() / 1000) * 1000;
}

/** Instante UTC das 00:00 locais do dia de `ref` (+/- `deltaDias`). */
export function inicioDoDia(ref: Date, deltaDias = 0): Date {
  const deslocamento = deslocamentoMs(ref);
  const local = new Date(ref.getTime() + deslocamento);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() + deltaDias);
  // Segunda passada: o deslocamento pode mudar no dia-alvo (horário de verão).
  const tentativa = new Date(local.getTime() - deslocamento);
  return new Date(local.getTime() - deslocamentoMs(tentativa));
}

/** Instante UTC das 00:00 locais do primeiro dia do mês de `ref`. */
export function inicioDoMes(ref: Date): Date {
  const p = partes(ref);
  const diaDoMes = p.day;
  return inicioDoDia(ref, 1 - diaDoMes);
}

/** Janela [00:00, 24:00) local do dia de `ref` (+/- `deltaDias`). */
export function janelaDoDia(ref: Date, deltaDias = 0): { gte: Date; lt: Date } {
  return { gte: inicioDoDia(ref, deltaDias), lt: inicioDoDia(ref, deltaDias + 1) };
}

/** "HH:mm" local. */
export function horaLocal(ref: Date): string {
  const p = partes(ref);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "31/07" local — data curta para rótulos de painel. */
export function diaCurtoLocal(ref: Date): string {
  const p = partes(ref);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
}

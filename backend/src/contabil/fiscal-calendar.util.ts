// ===========================================================================
// CONTABIL S2 — utilitário de datas do calendário fiscal (puro, sem I/O).
// Regra: vencimento que cai em sábado/domingo/feriado nacional antecipa pro
// dia útil ANTERIOR (padrão Simples Nacional/Receita Federal).
//
// LIMITAÇÃO CONHECIDA: só cobre feriados nacionais FIXOS (data igual todo
// ano). Feriados MÓVEIS (Carnaval, Sexta-Santa, Corpus Christi) NÃO estão
// aqui — na prática o vencimento do Simples raramente cai numa dessas datas
// (dia 15/20), e quando cair o pior caso é "não antecipar" (a data mostrada
// fica 1 dia depois do que seria o ideal) — nunca ATRASA de verdade porque a
// Receita também posterga esses casos. Aceitável para o S2; se algum dia
// virar problema real, a correção é plugar uma lib de feriado móvel aqui.
// ===========================================================================

/** 'MM-DD' → feriados nacionais fixos (Brasil). */
const FERIADOS_NACIONAIS_FIXOS = new Set<string>([
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25', // Natal
]);

function toMonthDay(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/** Sábado (6) ou domingo (0) em UTC. */
export function isFimDeSemana(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

/** Feriado nacional FIXO (ver limitação de feriado móvel no topo do arquivo). */
export function isFeriadoNacionalFixo(date: Date): boolean {
  return FERIADOS_NACIONAIS_FIXOS.has(toMonthDay(date));
}

export function isDiaUtil(date: Date): boolean {
  return !isFimDeSemana(date) && !isFeriadoNacionalFixo(date);
}

/**
 * Constrói uma data UTC (meia-noite) a partir de ano/mês(1-12)/dia — evita
 * drift de timezone local do Node.
 */
export function dataUtc(ano: number, mesUm12: number, dia: number): Date {
  return new Date(Date.UTC(ano, mesUm12 - 1, dia));
}

/**
 * Antecipa a data pro dia útil ANTERIOR enquanto cair em fim de semana ou
 * feriado nacional fixo. Data já útil retorna inalterada.
 */
export function antecipaParaDiaUtilAnterior(date: Date): Date {
  let d = new Date(date.getTime());
  while (!isDiaUtil(d)) {
    d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }
  return d;
}

/** 'YYYY-MM' → { ano, mes(1-12) }. Lança se malformado. */
export function parseCompetencia(competencia: string): { ano: number; mes: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
  if (!m) throw new Error(`competencia inválida: '${competencia}' (esperado 'YYYY-MM')`);
  return { ano: Number(m[1]), mes: Number(m[2]) };
}

/** Vencimento no dia `dia` da competência 'YYYY-MM', já antecipado se preciso. */
export function vencimentoDaCompetencia(competencia: string, dia: number): Date {
  const { ano, mes } = parseCompetencia(competencia);
  const bruta = dataUtc(ano, mes, dia);
  return antecipaParaDiaUtilAnterior(bruta);
}

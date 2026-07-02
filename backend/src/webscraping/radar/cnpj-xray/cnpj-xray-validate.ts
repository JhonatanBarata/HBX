/**
 * Validação de CNPJ (DV mod-11) do RAIO-X EM LOTE (HOT-04, 02/07).
 *
 * Funções puras, sem dependência de Nest/Prisma — o endpoint cola até 10k linhas e precisa
 * separar rápido (síncrono) o que é um CNPJ de verdade do que é lixo colado (linha vazia,
 * CPF, texto, número errado) ANTES de gastar qualquer lookup (local ou BrasilAPI).
 */

const WEIGHTS_12 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_13 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function calcDigit(digits: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) sum += Number(digits[i]) * weights[i];
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Normaliza qualquer texto colado (com/sem máscara) pra 14 dígitos — ou string vazia se não der. */
export function normalizeCnpjDigits(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * DV mod-11 real (não só tamanho): rejeita sequência repetida (00000000000000, 11111111111111...)
 * e dígito verificador incorreto — o mesmo algoritmo público da Receita.
 */
export function isValidCnpjDv(digits: string): boolean {
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const d1 = calcDigit(digits.slice(0, 12), WEIGHTS_12);
  if (d1 !== Number(digits[12])) return false;
  const d2 = calcDigit(digits.slice(0, 13), WEIGHTS_13);
  if (d2 !== Number(digits[13])) return false;
  return true;
}

export type CnpjXrayValidationRow = { raw: string; cnpj: string };
export type CnpjXrayInvalidRow = { raw: string; reason: 'vazio' | 'tamanho_invalido' | 'dv_invalido' | 'duplicado' };

export type CnpjXrayValidationReport = {
  valid: CnpjXrayValidationRow[];
  invalid: CnpjXrayInvalidRow[];
};

/**
 * Parseia o textarea colado (1 CNPJ/linha, com ou sem máscara), valida DV mod-11, dedup por
 * dígitos. Ordem de saída estável (ordem de chegada) — o relatório de invalidez preserva o
 * texto ORIGINAL da linha (o dono precisa ver o que ele colou, não só os dígitos).
 */
export function parseAndValidateCnpjBatch(lines: string[], maxItems = 10_000): CnpjXrayValidationReport {
  const valid: CnpjXrayValidationRow[] = [];
  const invalid: CnpjXrayInvalidRow[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines.slice(0, maxItems)) {
    const raw = String(rawLine ?? '').trim();
    if (!raw) continue; // linha em branco não conta como "inválida" — é só espaçamento do textarea
    const digits = normalizeCnpjDigits(raw);
    if (!digits) { invalid.push({ raw, reason: 'vazio' }); continue; }
    if (digits.length !== 14) { invalid.push({ raw, reason: 'tamanho_invalido' }); continue; }
    if (!isValidCnpjDv(digits)) { invalid.push({ raw, reason: 'dv_invalido' }); continue; }
    if (seen.has(digits)) { invalid.push({ raw, reason: 'duplicado' }); continue; }
    seen.add(digits);
    valid.push({ raw, cnpj: digits });
  }

  return { valid, invalid };
}

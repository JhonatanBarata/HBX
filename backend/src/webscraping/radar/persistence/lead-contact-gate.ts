import { normalizeLegacyBrCellphone } from '../providers/cnpj-public/cnpj-public-types';

/**
 * GATE ANTI-ALUCINAÇÃO do caminho de gravação de contato (Sprint 5 MOTOR-RFB-FILA, 02/07).
 *
 * Regra do dono: extração por LLM só entra em produção COM este gate — vendedor ligando em
 * número fabricado é saldo negativo. O gate roda em TODO contato que vai pra tabela
 * LeadContact (não só nos vindos de IA): contato reprovado NÃO grava, e a reprovação nunca
 * derruba o fluxo que descobriu o contato (quem chama decide o que logar).
 *
 * Duas camadas independentes:
 *  1. FORMATO (sempre): telefone = DDD válido (plano Anatel) + regra-do-9 + blocklist de
 *     número-placeholder; e-mail = sintaxe + blocklist de domínio-exemplo.
 *  2. PROVENIÊNCIA (obrigatória quando `sourceText` é passado — caminho LLM SEMPRE passa):
 *     o valor tem que existir LITERALMENTE na fonte crawleada. Telefone compara por
 *     sequência de dígitos (tolerante a separador e ao nono-dígito legado), e-mail por
 *     substring case-insensitive, nome do dono por substring sem acento/caixa.
 *
 * Funções puras, sem dependência de Nest/Prisma — testáveis isoladas e reutilizáveis
 * (o benchmark G3 do scratchpad espelha exatamente estas regras).
 */

// shape único (não união discriminada): o tsconfig do backend não liga strictNullChecks,
// então narrowing por `ok` não funciona — campos opcionais evitam falso erro de tipo.
export type ContactGateVerdict = { ok: boolean; normalized?: string; reason?: string };

/** DDDs em uso no plano de numeração da Anatel (não existe DDD 20, 23, 25, 26, 29, 30, 36, 39...). */
const VALID_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Domínios de exemplo/placeholder/plataforma que nunca são contato real do negócio. */
const EMAIL_DOMAIN_BLOCKLIST_PATTERN = /(^|\.)(example|exemplo|teste|test|dominio|seudominio|seusite|sentry|wixpress|sentry-next)\./;

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeForLiteralMatch(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Telefone BR: 10/11 dígitos (aceita e remove prefixo país 55), DDD válido, regra-do-9
 * (11 dígitos → 3º dígito 9; 10 dígitos → fixo com 3º dígito 2-5; celular legado de 10
 * dígitos é normalizado pro formato atual ANTES da checagem) e blocklist de placeholder
 * (assinante todo repetido ou sequência).
 */
export function validateBrPhoneContact(raw: unknown): ContactGateVerdict {
  let digits = onlyDigits(raw);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  digits = normalizeLegacyBrCellphone(digits);
  if (digits.length !== 10 && digits.length !== 11) return { ok: false, reason: 'tamanho_invalido' };
  if (!VALID_DDDS.has(digits.slice(0, 2))) return { ok: false, reason: 'ddd_invalido' };
  if (digits.length === 11 && digits[2] !== '9') return { ok: false, reason: 'regra_do_9' };
  if (digits.length === 10 && !/^[2-5]$/.test(digits[2])) return { ok: false, reason: 'fixo_invalido' };
  const subscriber = digits.slice(2);
  // celular: o placeholder clássico esconde a sequência DEPOIS do 9 ("9 1234-5678") —
  // testa o assinante inteiro E a cauda de 8 dígitos após o nono dígito.
  const tails = digits.length === 11 ? [subscriber, subscriber.slice(1)] : [subscriber];
  for (const tail of tails) {
    if (/^(\d)\1+$/.test(tail)) return { ok: false, reason: 'blocklist_repetido' };
    if ('01234567890123456789'.includes(tail) || '98765432109876543210'.includes(tail)) {
      return { ok: false, reason: 'blocklist_sequencia' };
    }
  }
  return { ok: true, normalized: digits };
}

export function validateEmailContact(raw: unknown): ContactGateVerdict {
  const email = String(raw || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return { ok: false, reason: 'sintaxe_invalida' };
  const domain = email.slice(email.indexOf('@') + 1);
  if (EMAIL_DOMAIN_BLOCKLIST_PATTERN.test(`.${domain}`)) return { ok: false, reason: 'blocklist_dominio' };
  // ruído clássico de crawl: "logo@2x.png" e afins capturados por regex frouxa
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email)) return { ok: false, reason: 'ruido_asset' };
  return { ok: true, normalized: email };
}

/**
 * Sequências de dígitos da fonte, colapsando separadores típicos de telefone entre dígitos
 * — "(85) 3222-1100" vira "8532221100". Sequências independentes NÃO se emendam (evita que
 * um telefone alucinado "exista" atravessando dois números vizinhos).
 */
function digitRunsFromSource(sourceText: string): string[] {
  const runs: string[] = [];
  let current = '';
  const text = String(sourceText || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\d/.test(ch)) { current += ch; continue; }
    if (current && /[\s().\-/+]/.test(ch)) {
      let j = i;
      while (j < text.length && /[\s().\-/+]/.test(text[j])) j += 1;
      if (j < text.length && /\d/.test(text[j])) continue;
    }
    if (current) runs.push(current);
    current = '';
  }
  if (current) runs.push(current);
  return runs;
}

/** Telefone existe literalmente na fonte? Tolera prefixo 55 e a variante sem/nono-dígito legado. */
export function phoneExistsInSource(phone: unknown, sourceText: string): boolean {
  const digits = onlyDigits(phone);
  if (!digits) return false;
  const noCountry = (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
    ? digits.slice(2)
    : digits;
  const variants = new Set([digits, noCountry]);
  if (noCountry.length === 11 && noCountry[2] === '9') variants.add(noCountry.slice(0, 2) + noCountry.slice(3));
  if (noCountry.length === 10 && /[6-9]/.test(noCountry[2])) variants.add(`${noCountry.slice(0, 2)}9${noCountry.slice(2)}`);
  const runs = digitRunsFromSource(sourceText);
  for (const variant of variants) {
    if (variant && runs.some((run) => run.includes(variant))) return true;
  }
  return false;
}

export function emailExistsInSource(email: unknown, sourceText: string): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  return Boolean(normalized) && String(sourceText || '').toLowerCase().includes(normalized);
}

/** Nome do dono tem que existir LITERALMENTE na fonte (sem acento/caixa) — regra dura da tarefa. */
export function ownerNameExistsInSource(name: unknown, sourceText: string): boolean {
  const normalized = normalizeForLiteralMatch(name);
  return normalized.length >= 4 && normalizeForLiteralMatch(sourceText).includes(normalized);
}

export type LeadContactKind = 'email' | 'phone' | 'whatsapp' | 'instagram' | 'facebook';

export type LeadContactCandidate = {
  kind: LeadContactKind;
  value: string;
  /** obrigatório — origem canônica (`rfb_*`, `website_crawl`, `hbx_engine` ou fonte social explícita) */
  source: string;
  /** obrigatório — 0..100 */
  confidence: number;
  rank?: number;
};

export type LeadContactGateResult = {
  approved: Array<LeadContactCandidate & { valueNormalized: string }>;
  rejected: Array<{ kind: LeadContactKind; value: string; reason: string }>;
};

/**
 * Aplica o gate a um lote de candidatos. `sourceText` liga a camada de proveniência
 * (telefone/e-mail precisam existir literalmente na fonte) — o caminho LLM SEMPRE passa a fonte.
 */
export function gateLeadContacts(
  candidates: LeadContactCandidate[],
  options: { sourceText?: string | null } = {},
): LeadContactGateResult {
  const approved: LeadContactGateResult['approved'] = [];
  const rejected: LeadContactGateResult['rejected'] = [];
  const sourceText = String(options.sourceText || '');

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const value = String(candidate?.value || '').trim();
    if (!value || !candidate?.kind) continue;

    if (candidate.kind === 'phone' || candidate.kind === 'whatsapp') {
      const verdict = validateBrPhoneContact(value);
      if (!verdict.ok || !verdict.normalized) { rejected.push({ kind: candidate.kind, value, reason: verdict.reason || 'invalido' }); continue; }
      if (sourceText && !phoneExistsInSource(value, sourceText)) {
        rejected.push({ kind: candidate.kind, value, reason: 'nao_literal_na_fonte' });
        continue;
      }
      approved.push({ ...candidate, value, valueNormalized: verdict.normalized });
      continue;
    }

    if (candidate.kind === 'email') {
      const verdict = validateEmailContact(value);
      if (!verdict.ok || !verdict.normalized) { rejected.push({ kind: candidate.kind, value, reason: verdict.reason || 'invalido' }); continue; }
      if (sourceText && !emailExistsInSource(verdict.normalized, sourceText)) {
        rejected.push({ kind: candidate.kind, value, reason: 'nao_literal_na_fonte' });
        continue;
      }
      approved.push({ ...candidate, value, valueNormalized: verdict.normalized });
      continue;
    }

    // instagram/facebook: URL plausível da própria rede (sem gate de proveniência — vêm de
    // matching próprio com score; LLM não extrai social neste sprint).
    const normalized = value.toLowerCase();
    const expectedHost = candidate.kind === 'instagram' ? /instagram\.com/ : /facebook\.com|fb\.com/;
    if (!expectedHost.test(normalized)) {
      rejected.push({ kind: candidate.kind, value, reason: 'url_incompativel' });
      continue;
    }
    approved.push({ ...candidate, value, valueNormalized: normalized });
  }

  return { approved, rejected };
}

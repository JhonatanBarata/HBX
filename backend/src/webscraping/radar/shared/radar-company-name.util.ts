// LOTE 5 da faxina da busca (PR17082026 — "uma empresa = um card"). A lei ÚNICA de nome de
// empresa do Radar mora aqui, e não como função privada de um service, porque o mesmo nome é
// julgado em dois lugares (fusão canônica RFB×web e chaves do merge).
//
// O FURO QUE ISTO CONSERTA: o `fused=0` do RINAGUA não era acento — `normalizeLookupValue`
// (radar-result-merger.service.ts:4) já derruba acento, então "Rinágua" e "RINAGUA" viram os dois
// `rinagua`. O que matava o match era o SUFIXO SOCIETÁRIO + a PONTUAÇÃO: "RINAGUA LTDA." virava
// `rinagua ltda.` (o regex de lá só colapsa espaço, não tira o ponto) e a comparação é igualdade
// EXATA. Aqui todo caractere não-alfanumérico vira espaço e o rabo societário sai.
//
// O QUE NÃO SAI, DE PROPÓSITO (decisão do dono, plano seção LOTE 5): 'comercio', 'industria',
// 'distribuidora', 'servicos'. No ramo do dono quase toda razão social é "X COMERCIO DE AGUAS
// LTDA" — remover essas palavras colaria empresa ERRADA. Por isso a lista abaixo é prima, mas
// deliberadamente mais curta, da `LEGAL_AND_GENERIC_TOKENS` de vendas-cnpj-fallback.ts:37 (lá o
// objetivo é RANQUEAR match da Receita, aqui é FUNDIR card — falso positivo custa card errado).
// `RADAR_SOCIAL_STOP_TOKENS` (radar-core-shared.ts) também não serve: tem 'comercio' e não tem
// me/mei/epp/sa. Radar não importa de `vendas/` (fase não depende de módulo comercial).

/** Sufixo societário — a única coisa que o Radar tira do nome pra achar o núcleo da empresa. */
const COMPANY_LEGAL_SUFFIX_TOKENS = new Set([
  'ltda', 'limitada', 'me', 'mei', 'eireli', 'epp', 'sa', 'ss', 'cia', 'companhia', 'sociedade',
]);

/**
 * Saneamento base: sem acento, sem caixa, TODA pontuação vira espaço. As duas trocas de "s a"/"s s"
 * existem porque "S/A" e "S.A." chegam aqui já quebrados em dois tokens pela regra da pontuação.
 */
function normalizeCompanyText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bs\s+a\b/g, 'sa')
    .replace(/\bs\s+s\b/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Núcleo do nome da empresa: "RINAGUA LTDA." e "Rinágua" viram os dois `rinagua`.
 * Só o RABO da razão social é tratado como sufixo — "Cia do Chocolate" continua
 * `cia do chocolate`, porque ali 'cia' é nome de fantasia, não tipo societário.
 */
export function normalizeCompanyName(value: string | null | undefined): string {
  const base = normalizeCompanyText(value);
  if (!base) return '';
  const tokens = base.split(' ');
  while (tokens.length > 1 && COMPANY_LEGAL_SUFFIX_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  const core = tokens.join(' ').trim();
  // Nome que era SÓ sufixo ("LTDA.") nunca pode virar chave vazia — chave vazia funde com tudo.
  return core || base;
}

/**
 * O núcleo só pode ser JUIZ de fusão quando sobrou nome de verdade: pelo menos um token que não
 * seja sufixo societário e 4+ caracteres. Sem essa trava, dois cadastros chamados "LTDA." (ou
 * "ME") viravam a mesma empresa na hora de casar Receita com web.
 */
export function isDistinctiveCompanyNameCore(core: string | null | undefined): boolean {
  const value = String(core || '').trim();
  if (!value) return false;
  const tokens = value.split(' ').filter(Boolean);
  if (!tokens.some((token) => !COMPANY_LEGAL_SUFFIX_TOKENS.has(token))) return false;
  return value.replace(/\s+/g, '').length >= 4;
}

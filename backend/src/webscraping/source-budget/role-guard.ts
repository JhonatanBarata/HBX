/**
 * TRAVA FÍSICA ANTI-PAGO (LEI Nº1 do dono, F2 fábrica de enriquecimento, 02/07).
 *
 * "localhost NUNCA acessa fonte paga." Não é uma preferência de env que alguém pode inverter
 * sem querer — é uma trava em CÓDIGO. Quando `HBX_ROLE=local`, qualquer tentativa de consumir
 * uma fonte PAGA (brave / google_places) é RECUSADA aqui, ANTES de tocar a API — mesmo
 * que uma chave paga tenha vazado pro `.env` local por engano.
 *
 * Camadas de defesa (cinto + suspensório):
 *   1. (esta trava) recusa em código se HBX_ROLE=local — belt independente de env de chave.
 *   2. remoção das chaves pagas do `.env` LOCAL + backup `.env.bak-f2` — se a chave não existe,
 *      nem a trava precisa disparar. (feito fora daqui, no host.)
 *
 * O papel PADRÃO é 'local' quando `HBX_ROLE` está AUSENTE/desconhecido — fail-safe: na dúvida,
 * NÃO gasta. Só o VPS declara explicitamente `HBX_ROLE=vps` (ou `production`/`server`) pra liberar
 * o reforço pago (Lei nº2: pago = só reforço, só VPS, só pós-score).
 */

export type PaidSourceName = 'brave' | 'google_places';

const VPS_ROLES = new Set(['vps', 'production', 'prod', 'server']);

/** Papel bruto declarado no ambiente (minúsculo, trim). Vazio quando ausente. */
export function currentRole(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.HBX_ROLE ?? '').trim().toLowerCase();
}

/**
 * true = este processo é LOCAL (localhost do dono) → fontes pagas PROIBIDAS.
 * Fail-safe: qualquer valor que não seja explicitamente um papel de VPS = local.
 */
export function isLocalRole(env: NodeJS.ProcessEnv = process.env): boolean {
  const role = currentRole(env);
  if (!role) return true; // ausente = local (na dúvida, não gasta)
  return !VPS_ROLES.has(role);
}

/** true = fonte paga LIBERADA neste processo (só quando o papel é explicitamente VPS). */
export function paidSourcesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isLocalRole(env);
}

/**
 * Erro DEDICADO da trava — permite log/telemetria distinguir "recusa da trava" de qualquer
 * outra falha de rede. O `paidSource` no nome deixa a prova de R$0 auto-explicativa no log.
 */
export class PaidSourceBlockedByRoleError extends Error {
  readonly paidSource: PaidSourceName;
  readonly role: string;
  constructor(paidSource: PaidSourceName, role: string) {
    super(`[role-guard] HBX_ROLE=${role || '(ausente→local)'} — fonte paga "${paidSource}" RECUSADA em localhost (Lei nº1). Zero tentativa paga.`);
    this.name = 'PaidSourceBlockedByRoleError';
    this.paidSource = paidSource;
    this.role = role;
  }
}

/**
 * Porta única de decisão: `false` = NÃO pode chamar a fonte paga (papel local).
 * Chamadores que degradam gracioso (devolvem []) usam este boolean; quem precisa de prova
 * dura levanta `assertPaidSourceAllowed`.
 */
export function canUsePaidSource(_source: PaidSourceName, env: NodeJS.ProcessEnv = process.env): boolean {
  return paidSourcesAllowed(env);
}

/** Levanta `PaidSourceBlockedByRoleError` quando o papel é local. Prova dura pra teste/telemetria. */
export function assertPaidSourceAllowed(source: PaidSourceName, env: NodeJS.ProcessEnv = process.env): void {
  if (!paidSourcesAllowed(env)) {
    throw new PaidSourceBlockedByRoleError(source, currentRole(env));
  }
}

// throttle de log da recusa — 1x/min por fonte, mesmo padrão do source-governor.
const blockedLoggedAt = new Map<string, number>();

/**
 * Log da recusa (throttled). Serve de EVIDÊNCIA viva da trava no aceite ("log da trava provando
 * zero tentativa paga"). Best-effort — nunca lança.
 */
export function logRoleBlocked(source: PaidSourceName, env: NodeJS.ProcessEnv = process.env): void {
  const now = Date.now();
  const last = blockedLoggedAt.get(source) || 0;
  if (now - last < 60_000) return;
  blockedLoggedAt.set(source, now);
  // eslint-disable-next-line no-console
  console.warn(`[role-guard] HBX_ROLE=${currentRole(env) || '(ausente→local)'} — RECUSA fonte paga "${source}" (Lei nº1: localhost R$0). Nenhuma chamada paga disparada.`);
}

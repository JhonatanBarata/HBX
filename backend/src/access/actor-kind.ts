// RBAC Sprint 3 — FONTE ÚNICA do papel hierárquico ("actor kind").
//
// "Gerente" NÃO é role no banco: é `role=ADMIN` + `canViewBilling=false`
// (schema.prisma). A derivação vivia copiada em 3 lugares (team-policy.service
// `isGerente`, inbox.service `isGerenteUser`, profile.controller `resolveUserKind`),
// hoje idênticos — o risco era a 4ª cópia escrita diferente. Aqui é o único lugar.
//
// Vocabulário (nível de negócio, PT):
//   master   → suporte HBX (isSystemMaster). Anti-spoof: SÓ a flag, nunca o role.
//   dono     → ADMIN/USERMASTER que vê cobrança (canViewBilling !== false).
//   gerente  → ADMIN/USERMASTER sem cobrança (canViewBilling === false).
//   vendedor → USER (funcionário comum).
//   user     → qualquer outro.
//
// USERMASTER (dono do tenant) = ADMIN para todos os efeitos hierárquicos — o dono
// loga como role USERMASTER (não ADMIN, não platform-master). O gap que jogava
// USERMASTER em 'user' zerava o funil dele; corrigido+publicado 03/07 (c9289db8).
// Anti-spoof preservado: USERMASTER NUNCA vira 'master' (só a flag isSystemMaster).

export type ActorKind = 'master' | 'dono' | 'gerente' | 'vendedor' | 'user';

export type ActorKindUserLike = {
  role?: string | null;
  isSystemMaster?: boolean | null;
  canViewBilling?: boolean | null;
} | null | undefined;

function normalizeRole(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

/**
 * Deriva o papel hierárquico do usuário. Ordem é semântica-crítica:
 * master é avaliado PRIMEIRO (a flag `isSystemMaster` manda, não o role) —
 * assim USERMASTER sem a flag jamais vira master (anti-spoof).
 */
export function resolveActorKind(user: ActorKindUserLike): ActorKind {
  if (Boolean(user?.isSystemMaster)) return 'master';
  const role = normalizeRole(user?.role);
  // USERMASTER (dono do tenant) = ADMIN: mesmo tratamento hierárquico (fix c9289db8).
  if (role === 'ADMIN' || role === 'USERMASTER') return user?.canViewBilling === false ? 'gerente' : 'dono';
  if (role === 'USER') return 'vendedor';
  return 'user';
}

/** Atalho: é GERENTE (ADMIN sem cobrança, nunca master). */
export function isGerenteActor(user: ActorKindUserLike): boolean {
  return resolveActorKind(user) === 'gerente';
}

/** Atalho: é DONO ou MASTER (a "cúpula" que enxerga cobrança/vínculo HBX). */
export function isBillingOwnerActor(user: ActorKindUserLike): boolean {
  const kind = resolveActorKind(user);
  return kind === 'master' || kind === 'dono';
}

/** Atalho: é master OU qualquer ADMIN (dono ou gerente) — o "eixo administrativo". */
export function isAdminTierActor(user: ActorKindUserLike): boolean {
  const kind = resolveActorKind(user);
  return kind === 'master' || kind === 'dono' || kind === 'gerente';
}

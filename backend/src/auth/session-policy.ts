// Teto existe contra vazamento de sessão, não pode ser menor que o nº real de
// aparelhos/janelas do dono: 4 causava auto-despejo (session_limit_reached) em
// uso legítimo multi-dispositivo (celular + múltiplas janelas/perfis de Chrome +
// app) — caso real 20/07.
export const MAX_ADMIN_WEB_SESSIONS = 10;
export const MAX_MOBILE_DEVICES_PER_USER = 4;

export function allowsAdminMultiSession(user: { role?: unknown; isSystemMaster?: unknown } | null | undefined) {
  if (Boolean(user?.isSystemMaster)) return true;
  const role = String(user?.role || '').trim().toUpperCase();
  return role === 'ADMIN' || role === 'USERMASTER';
}

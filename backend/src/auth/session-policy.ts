export const MAX_ADMIN_WEB_SESSIONS = 4;
export const MAX_MOBILE_DEVICES_PER_USER = 4;

export function allowsAdminMultiSession(user: { role?: unknown; isSystemMaster?: unknown } | null | undefined) {
  if (Boolean(user?.isSystemMaster)) return true;
  const role = String(user?.role || '').trim().toUpperCase();
  return role === 'ADMIN' || role === 'USERMASTER';
}

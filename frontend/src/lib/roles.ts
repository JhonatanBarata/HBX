// Papel do usuário — FONTE ÚNICA no frontend (consolidação 03/07/2026).
//
// Contexto do bug: o dono loga como USERMASTER (dono/admin do TENANT, um
// SUPERSET de ADMIN). A lógica de papel estava espalhada em cópias divergentes
// (`role === 'ADMIN' || isSystemMaster`) que EXCLUÍAM o USERMASTER — ele caía
// no vão e às vezes era tratado como vendedor/órfão (via "carteira cheia",
// privilégios de admin sumindo).
//
// Contrato do backend (sanitizeUser / /profile/current-user): `userKind` é o
// sinal canônico e vale um de {'system_master','admin','seller','user'}. O
// USERMASTER passa a vir como `userKind: 'admin'`. Preferir SEMPRE `userKind`
// a `role` para decisões de papel na UI.
//
// REGRA FINAL (dono, 03/07): USERMASTER = admin NORMAL, idêntico a
// role==='ADMIN'. Sem "admin ilimitado mágico" — este helper é PURO
// reconhecimento de papel. Limites operacionais por vendedor são configurados
// pelo admin; saldo de créditos pertence à empresa.
//
// IMPORTANTE — separação de conceitos:
//  - tenant-admin  (isTenantAdmin)  = dono/admin da EMPRESA (inclui USERMASTER
//    e o system_master). O único "limite" que ele não vê é o de VENDEDOR
//    (carteira/cap por pessoa) — porque admin não É vendedor, não por exceção.
//  - platform-master (isSystemMaster) = o dono da PLATAFORMA HBX. Continua
//    gated SÓ por `user.isSystemMaster` (ex.: menu /master). NÃO usar
//    isTenantAdmin no lugar de isSystemMaster — um USERMASTER de tenant é
//    tenant-admin mas NÃO é platform-master.
//
// isCompanySeller existe apenas para carteira, escopo e limites operacionais do
// vendedor. Não deve criar diferença de produto por plano.

// Shape mínimo — cada tela tem seu próprio tipo de user; aceitamos o subconjunto.
export type RoleUser = {
  userKind?: string | null;
  role?: string | null;
  isSystemMaster?: boolean | null;
} | null | undefined;

function kindOf(user: RoleUser): string {
  return String(user?.userKind || "").toLowerCase();
}

/**
 * Admin do TENANT (dono/admin da empresa). Regra canônica do dono:
 *   userKind==='admin' || userKind==='system_master' || isSystemMaster.
 *
 * Inclui o USERMASTER (que vem como userKind==='admin' pós-fix do backend) e o
 * platform-master. Fallback defensivo por `role` cobre o intervalo em que o
 * backend ainda não tiver propagado userKind='admin' (USERMASTER/ADMIN).
 */
export function isTenantAdmin(user: RoleUser): boolean {
  if (!user) return false;
  if (user.isSystemMaster) return true;
  const kind = kindOf(user);
  if (kind === "admin" || kind === "system_master") return true;
  // Fallback por role (compat): USERMASTER e ADMIN são tenant-admin.
  const role = String(user.role || "").toUpperCase();
  return role === "ADMIN" || role === "USERMASTER";
}

/**
 * Vendedor comum da empresa (carteira/limite/escopo de vendedor).
 * Canônico: userKind==='seller'. Um admin/master NUNCA é seller (isTenantAdmin
 * curto-circuita antes). O fallback por role==='USER' cobre o intervalo em que
 * o backend ainda não tiver propagado userKind='seller' — sem re-capturar o
 * USERMASTER (já barrado acima por isTenantAdmin).
 */
export function isCompanySeller(user: RoleUser): boolean {
  if (!user) return false;
  if (isTenantAdmin(user)) return false;
  const kind = kindOf(user);
  if (kind === "seller") return true;
  return String(user.role || "").toUpperCase() === "USER";
}

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type TeamAccessMap } from './team-access-catalog';
import {
  ensureUserTeamPolicyForUser,
  parseTeamPolicyAccessMap,
  parseTeamPolicyModuleAccessMap,
  serializeTeamPolicyModuleAndAccessRows,
} from './team-policy-persistence';

export const OPERATIONAL_CAPABILITIES = ['SELLER', 'DRIVER'] as const;
export type OperationalCapability = (typeof OPERATIONAL_CAPABILITIES)[number];
export type OperationalWorkspace = 'vendas' | 'entregas';

export const OPERATIONAL_ACCESS_KEY: Record<OperationalCapability, string> = {
  SELLER: 'workspace.vendas.access',
  DRIVER: 'workspace.entregas.access',
};

export type OperationalAccessProjection = {
  operationalCapabilities: OperationalCapability[];
  defaultWorkspace: OperationalWorkspace;
  workspaceHome: '/vendas' | '/entrega';
};

function normalizeRole(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function defaultCapabilitiesForUser(user: any): OperationalCapability[] {
  const role = normalizeRole(user?.role);
  if (user?.isSystemMaster || role === 'ADMIN' || role === 'USERMASTER') {
    return ['SELLER', 'DRIVER'];
  }
  // Compatibilidade fail-safe com a base anterior: USER significava vendedor.
  return role === 'USER' ? ['SELLER'] : ['SELLER'];
}

export function normalizeOperationalCapabilities(
  value: unknown,
  options?: { allowEmpty?: boolean },
): OperationalCapability[] {
  const rows = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const normalized = Array.from(new Set(rows.map((item) => String(item || '').trim().toUpperCase())))
    .filter((item): item is OperationalCapability => (OPERATIONAL_CAPABILITIES as readonly string[]).includes(item));
  const hasInvalid = rows.some((item) => {
    const candidate = String(item || '').trim().toUpperCase();
    return candidate && !(OPERATIONAL_CAPABILITIES as readonly string[]).includes(candidate);
  });
  if (hasInvalid) throw new BadRequestException('Perfil operacional invalido. Use SELLER, DRIVER ou ambos.');
  if (!options?.allowEmpty && normalized.length === 0) {
    throw new BadRequestException('Escolha Vendedor, Entregador ou Ambos.');
  }
  return OPERATIONAL_CAPABILITIES.filter((capability) => normalized.includes(capability));
}

export function projectOperationalCapabilities(
  user: any,
  accessMap?: TeamAccessMap | Map<string, boolean> | null,
): OperationalAccessProjection {
  const defaults = defaultCapabilitiesForUser(user);
  const read = (capability: OperationalCapability) => {
    const key = OPERATIONAL_ACCESS_KEY[capability];
    if (accessMap instanceof Map) {
      return accessMap.has(key) ? Boolean(accessMap.get(key)) : defaults.includes(capability);
    }
    if (accessMap && Object.prototype.hasOwnProperty.call(accessMap, key)) {
      return Boolean(accessMap[key]);
    }
    return defaults.includes(capability);
  };
  const operationalCapabilities = OPERATIONAL_CAPABILITIES.filter(read);
  // Uma policy inconsistente sem workspace nao ganha acesso por fallback. O
  // destino neutro fica em Vendas, mas os guards continuam negando os dois.
  const defaultWorkspace: OperationalWorkspace = operationalCapabilities.includes('SELLER')
    ? 'vendas'
    : 'entregas';
  return {
    operationalCapabilities,
    defaultWorkspace,
    workspaceHome: defaultWorkspace === 'entregas' ? '/entrega' : '/vendas',
  };
}

export function projectOperationalCapabilitiesFromStoredPolicy(user: any, modulesJson?: unknown) {
  const accessMap = Object.fromEntries(parseTeamPolicyAccessMap(modulesJson).entries());
  return projectOperationalCapabilities(user, accessMap);
}

export async function resolveOperationalAccessProjection(prisma: any, user: any) {
  const userId = Math.trunc(Number(user?.id || 0));
  if (!userId || !prisma?.userTeamPolicy?.findUnique) {
    return projectOperationalCapabilities(user);
  }
  // Nao reutiliza loadUserTeamPolicyRuntime porque esse leitor legado degrada
  // erro de banco para policy ausente. Em autorizacao operacional precisamos
  // distinguir: linha ausente = compat USER vendedor; falha de leitura = erro,
  // nunca concessao silenciosa.
  const policy = await prisma.userTeamPolicy.findUnique({
    where: { userId },
    select: { modulesJson: true },
  });
  return projectOperationalCapabilitiesFromStoredPolicy(user, policy?.modulesJson);
}

export async function resolveOperationalCapabilities(prisma: any, user: any) {
  const projection = await resolveOperationalAccessProjection(prisma, user);
  return projection.operationalCapabilities;
}

export async function assertOperationalCapability(
  prisma: any,
  user: any,
  capability: OperationalCapability,
  message = 'Acesso bloqueado pelo perfil operacional da equipe.',
) {
  const projection = await resolveOperationalAccessProjection(prisma, user);
  if (!projection.operationalCapabilities.includes(capability)) {
    throw new ForbiddenException(message);
  }
  return projection;
}

export async function setUserOperationalCapabilities(
  prisma: any,
  userIdRaw: unknown,
  value: unknown,
  options?: { source?: string; actorUserId?: number | null },
) {
  const userId = Math.trunc(Number(userIdRaw || 0));
  if (!userId) throw new BadRequestException('Usuario invalido.');
  const operationalCapabilities = normalizeOperationalCapabilities(value);
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, role: true, isSystemMaster: true },
  });
  if (!target) throw new BadRequestException('Usuario nao encontrado.');
  await ensureUserTeamPolicyForUser(prisma, userId, {
    source: options?.source || 'operational_profile_update',
    overwrite: false,
  });
  const policy = await prisma.userTeamPolicy.findUnique({
    where: { userId },
    select: { modulesJson: true },
  });
  if (!policy) throw new BadRequestException('Politica de equipe nao encontrada.');

  const modules = Array.from(parseTeamPolicyModuleAccessMap(policy.modulesJson).entries())
    .map(([key, allowed]) => ({ key, allowed }));
  const access: TeamAccessMap = Object.fromEntries(parseTeamPolicyAccessMap(policy.modulesJson).entries());
  for (const capability of OPERATIONAL_CAPABILITIES) {
    access[OPERATIONAL_ACCESS_KEY[capability]] = operationalCapabilities.includes(capability);
  }
  await prisma.userTeamPolicy.update({
    where: { userId },
    data: {
      modulesJson: serializeTeamPolicyModuleAndAccessRows({ modules, access }),
      source: String(options?.source || 'operational_profile_update').slice(0, 120),
    },
  });
  if (prisma.teamPolicyAuditLog?.create) {
    await prisma.teamPolicyAuditLog.create({
      data: {
        actorUserId: Math.trunc(Number(options?.actorUserId || 0)) || null,
        companyId: Math.trunc(Number(target.companyId || 0)) || null,
        targetUserId: userId,
        action: 'OPERATIONAL_CAPABILITIES_UPDATED',
        severity: 'INFO',
        route: '/users/:id/profile',
        metadata: JSON.stringify({ operationalCapabilities }),
      },
    }).catch(() => null);
  }
  return projectOperationalCapabilities(target, access);
}

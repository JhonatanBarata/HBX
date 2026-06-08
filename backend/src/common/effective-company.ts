import { BadRequestException } from '@nestjs/common';

export type EffectiveCompanyMode =
  | 'user_company'
  | 'master_assumed_company'
  | 'master_explicit_company'
  | 'unresolved';

export type EffectiveCompanyUnresolvedReason =
  | 'invalid_explicit_company_id'
  | 'explicit_company_not_allowed'
  | 'missing_user_company'
  | 'missing_company_context';

export type EffectiveCompanyResolution = {
  companyId: number | null;
  mode: EffectiveCompanyMode;
  isSystemMaster: boolean;
  reason: EffectiveCompanyUnresolvedReason | null;
  masterContext: any | null;
};

export type EffectiveCompanyOptions = {
  explicitCompanyId?: unknown;
  allowMasterExplicitCompany?: boolean;
  errorMessage?: string;
};

function valueWasProvided(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function normalizeEffectiveCompanyId(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const companyId = Math.trunc(parsed);
  return companyId > 0 ? companyId : null;
}

function getUserFromRequestLike(reqOrUser: any) {
  return reqOrUser?.user ? reqOrUser.user : reqOrUser;
}

function unresolved(
  input: {
    isSystemMaster: boolean;
    masterContext: any | null;
    reason: EffectiveCompanyUnresolvedReason;
  },
): EffectiveCompanyResolution {
  return {
    companyId: null,
    mode: 'unresolved',
    isSystemMaster: input.isSystemMaster,
    reason: input.reason,
    masterContext: input.masterContext,
  };
}

export function resolveEffectiveCompanyContext(
  reqOrUser: any,
  options: EffectiveCompanyOptions = {},
): EffectiveCompanyResolution {
  const user = getUserFromRequestLike(reqOrUser);
  const isSystemMaster = Boolean(user?.isSystemMaster);
  const masterContext = user?.masterContext || null;
  const userCompanyId = normalizeEffectiveCompanyId(user?.companyId ?? user?.company?.id);
  const explicitCompanyProvided = valueWasProvided(options.explicitCompanyId);
  const explicitCompanyId = normalizeEffectiveCompanyId(options.explicitCompanyId);

  if (isSystemMaster && explicitCompanyProvided) {
    if (options.allowMasterExplicitCompany === false) {
      return unresolved({ isSystemMaster, masterContext, reason: 'explicit_company_not_allowed' });
    }
    if (!explicitCompanyId) {
      return unresolved({ isSystemMaster, masterContext, reason: 'invalid_explicit_company_id' });
    }
    return {
      companyId: explicitCompanyId,
      mode: 'master_explicit_company',
      isSystemMaster,
      reason: null,
      masterContext,
    };
  }

  if (isSystemMaster) {
    const assumedCompanyId = masterContext?.active
      ? normalizeEffectiveCompanyId(masterContext.companyId)
      : null;
    if (assumedCompanyId) {
      return {
        companyId: assumedCompanyId,
        mode: 'master_assumed_company',
        isSystemMaster,
        reason: null,
        masterContext,
      };
    }

    return unresolved({ isSystemMaster, masterContext, reason: 'missing_company_context' });
  }

  if (userCompanyId) {
    return {
      companyId: userCompanyId,
      mode: 'user_company',
      isSystemMaster,
      reason: null,
      masterContext,
    };
  }

  return unresolved({ isSystemMaster, masterContext, reason: 'missing_user_company' });
}

export function requireEffectiveCompanyContext(
  reqOrUser: any,
  options: EffectiveCompanyOptions = {},
): EffectiveCompanyResolution {
  const resolved = resolveEffectiveCompanyContext(reqOrUser, options);
  if (resolved.companyId) return resolved;

  if (resolved.reason === 'invalid_explicit_company_id') {
    throw new BadRequestException('Empresa informada invalida para este contexto.');
  }
  if (resolved.reason === 'explicit_company_not_allowed') {
    throw new BadRequestException('Empresa explicita nao e permitida para este contexto.');
  }

  throw new BadRequestException(options.errorMessage || 'Nenhuma empresa operacional selecionada para este contexto.');
}

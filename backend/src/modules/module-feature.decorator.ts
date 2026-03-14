import { SetMetadata } from '@nestjs/common';

export const MODULE_ACCESS_KEY = 'module_access_key';

export type ModuleAccessMetadata = string | string[];

export const ModuleAccess = (...moduleKeys: string[]) => {
  const normalized = (moduleKeys || []).map((key) => String(key || '').trim().toLowerCase()).filter(Boolean);
  if (normalized.length <= 1) return SetMetadata(MODULE_ACCESS_KEY, normalized[0] || null);
  return SetMetadata(MODULE_ACCESS_KEY, normalized);
};

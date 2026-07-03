import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MASTER_GLOBAL_INTEGRATIONS_KEY, getMasterGlobalIntegrationConfig } from '../modules/master-global-integrations.util';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';

type ThemePreferenceScope = 'company' | 'system' | 'user';
type ThemePreferenceThemeId = 'shadcn';

type ThemePreferenceConfig = {
  selection?: {
    themeId?: ThemePreferenceThemeId;
    mode?: 'dark' | 'light';
  };
  appearance?: {
    brand?: string;
    buttonPrimary?: string;
    buttonSecondary?: string;
    buttonSuccess?: string;
    buttonAccent?: string;
    selectionAccent?: string;
    menuActive?: string;
    menuInactive?: string;
    menuDisabled?: string;
  };
  appearanceByTheme?: Partial<Record<ThemePreferenceThemeId, ThemePreferenceConfig['appearance']>>;
  motion?: {
    transitionStyle?: 'liquid-glass' | 'micro-interactions' | 'scroll-storytelling';
  };
};

const THEME_IDS: ReadonlySet<ThemePreferenceThemeId> = new Set(['shadcn']);
const THEME_ID_LIST: ThemePreferenceThemeId[] = ['shadcn'];
const THEME_MODES = new Set(['dark', 'light']);
const MOTION_STYLES = new Set(['liquid-glass', 'micro-interactions', 'scroll-storytelling']);
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function isThemePreferenceThemeId(value: string): value is ThemePreferenceThemeId {
  return THEME_IDS.has(value as ThemePreferenceThemeId);
}

function hasConfigEntries(value: ThemePreferenceConfig | null | undefined) {
  if (!value) return false;
  return Boolean(
    (value.selection && Object.keys(value.selection).length > 0) ||
      (value.appearance && Object.keys(value.appearance).length > 0) ||
      (value.appearanceByTheme && Object.keys(value.appearanceByTheme).length > 0) ||
      (value.motion && Object.keys(value.motion).length > 0),
  );
}

function mergeThemeConfigs(
  base?: ThemePreferenceConfig | null,
  patch?: ThemePreferenceConfig | null,
): ThemePreferenceConfig | null {
  const merged: ThemePreferenceConfig = {};

  if (base?.selection || patch?.selection) {
    merged.selection = {
      ...(base?.selection || {}),
      ...(patch?.selection || {}),
    };
    if (!Object.keys(merged.selection).length) delete merged.selection;
  }

  if (base?.appearance || patch?.appearance) {
    merged.appearance = {
      ...(base?.appearance || {}),
      ...(patch?.appearance || {}),
    };
    if (!Object.keys(merged.appearance).length) delete merged.appearance;
  }

  if (base?.appearanceByTheme || patch?.appearanceByTheme) {
    merged.appearanceByTheme = {};

    THEME_ID_LIST.forEach((themeId) => {
      const baseAppearance = base?.appearanceByTheme?.[themeId];
      const patchAppearance = patch?.appearanceByTheme?.[themeId];
      const nextAppearance = {
        ...(baseAppearance || {}),
        ...(patchAppearance || {}),
      };

      if (Object.keys(nextAppearance).length > 0) {
        merged.appearanceByTheme![themeId] = nextAppearance;
      }
    });

    if (!Object.keys(merged.appearanceByTheme).length) delete merged.appearanceByTheme;
  }

  if (base?.motion || patch?.motion) {
    merged.motion = {
      ...(base?.motion || {}),
      ...(patch?.motion || {}),
    };
    if (!Object.keys(merged.motion).length) delete merged.motion;
  }

  return hasConfigEntries(merged) ? merged : null;
}

function normalizeThemeConfig(input: any): ThemePreferenceConfig | null {
  if (!input || typeof input !== 'object') return null;

  const normalized: ThemePreferenceConfig = {};
  const selectionInput = input.selection && typeof input.selection === 'object' ? input.selection : null;
  const appearanceInput = input.appearance && typeof input.appearance === 'object' ? input.appearance : null;
  const appearanceByThemeInput =
    input.appearanceByTheme && typeof input.appearanceByTheme === 'object' ? input.appearanceByTheme : null;
  const motionInput = input.motion && typeof input.motion === 'object' ? input.motion : null;

  if (selectionInput) {
    const themeId = normalizeText(selectionInput.themeId)?.toLowerCase();
    const mode = normalizeText(selectionInput.mode)?.toLowerCase();
    if (themeId && isThemePreferenceThemeId(themeId)) {
      normalized.selection = {
        ...(normalized.selection || {}),
        themeId,
      };
    }
    if (mode && THEME_MODES.has(mode)) {
      normalized.selection = {
        ...(normalized.selection || {}),
        mode: mode as ThemePreferenceConfig['selection']['mode'],
      };
    }
  }

  if (appearanceInput) {
    const nextAppearance = Object.entries(appearanceInput).reduce<Record<string, string>>((acc, [key, value]) => {
      const color = normalizeText(value);
      if (!color || !HEX_COLOR_PATTERN.test(color)) return acc;
      acc[key] = color.toUpperCase();
      return acc;
    }, {});

    if (Object.keys(nextAppearance).length > 0) {
      normalized.appearance = nextAppearance as ThemePreferenceConfig['appearance'];
    }
  }

  if (appearanceByThemeInput) {
    const nextAppearanceByTheme: NonNullable<ThemePreferenceConfig['appearanceByTheme']> = {};

    THEME_ID_LIST.forEach((themeId) => {
      const themeAppearanceInput = appearanceByThemeInput[themeId];
      if (!themeAppearanceInput || typeof themeAppearanceInput !== 'object') return;

      const nextAppearance = Object.entries(themeAppearanceInput).reduce<Record<string, string>>((acc, [key, value]) => {
        const color = normalizeText(value);
        if (!color || !HEX_COLOR_PATTERN.test(color)) return acc;
        acc[key] = color.toUpperCase();
        return acc;
      }, {});

      if (Object.keys(nextAppearance).length > 0) {
        nextAppearanceByTheme[themeId] = nextAppearance as ThemePreferenceConfig['appearance'];
      }
    });

    if (Object.keys(nextAppearanceByTheme).length > 0) {
      normalized.appearanceByTheme = nextAppearanceByTheme;
    }
  }

  if (motionInput) {
    const transitionStyle = normalizeText(motionInput.transitionStyle)?.toLowerCase();
    if (transitionStyle && MOTION_STYLES.has(transitionStyle)) {
      normalized.motion = {
        transitionStyle: transitionStyle as ThemePreferenceConfig['motion']['transitionStyle'],
      };
    }
  }

  return hasConfigEntries(normalized) ? normalized : null;
}

function parseStoredThemeConfig(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;

  try {
    return normalizeThemeConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

@Injectable()
export class ThemePreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  private async ensureRuntime() {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await getMasterGlobalIntegrationConfig(this.prisma);
  }

  private async requireUser(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('Usuario invalido');
    }
    return user;
  }

  private async readUserThemeConfig(userId: number) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ themePreferenceConfig: string | null }>>(
      'SELECT "themePreferenceConfig" FROM "User" WHERE "id" = $1 LIMIT 1',
      userId,
    );
    return parseStoredThemeConfig(rows?.[0]?.themePreferenceConfig);
  }

  private async readCompanyThemeConfig(companyId: number) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ themePreferenceConfig: string | null }>>(
      'SELECT "themePreferenceConfig" FROM "Company" WHERE "id" = $1 LIMIT 1',
      companyId,
    );
    return parseStoredThemeConfig(rows?.[0]?.themePreferenceConfig);
  }

  private async readSystemThemeConfig() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ themePreferenceConfig: string | null }>>(
      'SELECT "themePreferenceConfig" FROM "MasterGlobalIntegrationConfig" WHERE "key" = $1 LIMIT 1',
      MASTER_GLOBAL_INTEGRATIONS_KEY,
    );
    return parseStoredThemeConfig(rows?.[0]?.themePreferenceConfig);
  }

  private async writeUserThemeConfig(userId: number, config: ThemePreferenceConfig | null) {
    await this.prisma.$executeRawUnsafe(
      'UPDATE "User" SET "themePreferenceConfig" = $1 WHERE "id" = $2',
      config ? JSON.stringify(config) : null,
      userId,
    );
  }

  private async writeCompanyThemeConfig(companyId: number, config: ThemePreferenceConfig | null) {
    await this.prisma.$executeRawUnsafe(
      'UPDATE "Company" SET "themePreferenceConfig" = $1 WHERE "id" = $2',
      config ? JSON.stringify(config) : null,
      companyId,
    );
  }

  private async writeSystemThemeConfig(config: ThemePreferenceConfig | null) {
    await this.prisma.$executeRawUnsafe(
      'UPDATE "MasterGlobalIntegrationConfig" SET "themePreferenceConfig" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = $2',
      config ? JSON.stringify(config) : null,
      MASTER_GLOBAL_INTEGRATIONS_KEY,
    );
  }

  async getThemePreferencesForUser(userId: number) {
    await this.ensureRuntime();
    const user = await this.requireUser(userId);
    const userScope = await this.readUserThemeConfig(userId);
    const companyScope = user.companyId ? await this.readCompanyThemeConfig(Number(user.companyId)) : null;
    const systemScope = await this.readSystemThemeConfig();

    return {
      scopes: {
        system: systemScope,
        company: companyScope,
        user: userScope,
      },
      resolved: mergeThemeConfigs(mergeThemeConfigs(systemScope, companyScope), userScope),
      permissions: {
        canEditCompany:
          Boolean(user.companyId) &&
          (Boolean(user.isSystemMaster) || ['ADMIN', 'USERMASTER'].includes(String(user.role || '').trim().toUpperCase())),
        canEditSystem: Boolean(user.isSystemMaster),
        companyId: user.companyId ?? null,
        isAuthenticated: true,
      },
    };
  }

  async updateThemePreferencesForUser(
    userId: number,
    input: { scope?: string; config?: ThemePreferenceConfig; reset?: boolean },
  ) {
    await this.ensureRuntime();
    const user = await this.requireUser(userId);
    const scope = String(input?.scope || '').trim().toLowerCase() as ThemePreferenceScope;

    if (!['company', 'system', 'user'].includes(scope)) {
      throw new BadRequestException('scope deve ser user, company ou system');
    }

    if (scope === 'system' && !user.isSystemMaster) {
      throw new ForbiddenException('Somente o master pode alterar o padrão do sistema');
    }

    if (
      scope === 'company' &&
      !(Boolean(user.isSystemMaster) || ['ADMIN', 'USERMASTER'].includes(String(user.role || '').trim().toUpperCase()))
    ) {
      throw new ForbiddenException('Somente administradores podem alterar o padrão da empresa');
    }

    if (scope === 'company' && !user.companyId) {
      throw new BadRequestException('Usuario sem empresa vinculada');
    }

    const current = await this.getThemePreferencesForUser(userId);
    const normalizedPatch = normalizeThemeConfig(input?.config);
    const nextConfig = input?.reset
      ? null
      : mergeThemeConfigs(current.scopes[scope] || null, normalizedPatch);

    if (!input?.reset && !nextConfig) {
      throw new BadRequestException('Nenhuma preferencia valida foi informada');
    }

    if (scope === 'user') {
      await this.writeUserThemeConfig(userId, nextConfig);
    }

    if (scope === 'company') {
      await this.writeCompanyThemeConfig(Number(user.companyId), nextConfig);
    }

    if (scope === 'system') {
      await this.writeSystemThemeConfig(nextConfig);
    }

    return this.getThemePreferencesForUser(userId);
  }
}

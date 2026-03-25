"use client";

export type PresentationPageOverride = {
  sectionLabel?: string;
  title?: string;
  description?: string;
};

export type PresentationModuleOverride = {
  label?: string;
  shortLabel?: string;
  description?: string;
};

export type PresentationConfig = {
  version: 1;
  tenantId: string;
  updatedAt: string;
  updatedBy?: string;
  layout: {
    navWidth: number;
    heroMinHeight: number;
    workspaceHeight: number;
  };
  nav: {
    eyebrow: string;
    title: string;
  };
  pages: Record<string, PresentationPageOverride>;
  modules: Record<string, PresentationModuleOverride>;
};

const STORAGE_NAMESPACE = "hbx.presentation.v1";

function normalizeKeyPart(value: string) {
  return encodeURIComponent(String(value || "default").trim().toLowerCase() || "default");
}

function cloneConfig(config: PresentationConfig): PresentationConfig {
  return JSON.parse(JSON.stringify(config)) as PresentationConfig;
}

export function buildPresentationStorageKey(tenantId: string) {
  return `${STORAGE_NAMESPACE}:global:${normalizeKeyPart(tenantId)}`;
}

export function createDefaultPresentationConfig(tenantId: string): PresentationConfig {
  return {
    version: 1,
    tenantId,
    updatedAt: new Date(0).toISOString(),
    layout: {
      navWidth: 292,
      heroMinHeight: 132,
      workspaceHeight: 0,
    },
    nav: {
      eyebrow: "Módulos",
      title: "Navegação principal",
    },
    pages: {},
    modules: {},
  };
}

export function readPresentationConfig(tenantId: string): PresentationConfig {
  if (typeof window === "undefined") return createDefaultPresentationConfig(tenantId);

  try {
    const raw = window.localStorage.getItem(buildPresentationStorageKey(tenantId));
    if (!raw) return createDefaultPresentationConfig(tenantId);

    const parsed = JSON.parse(raw) as Partial<PresentationConfig>;
    const base = createDefaultPresentationConfig(tenantId);

    return {
      ...base,
      ...parsed,
      version: 1,
      tenantId,
      layout: {
        ...base.layout,
        ...(parsed.layout || {}),
      },
      nav: {
        ...base.nav,
        ...(parsed.nav || {}),
      },
      pages: {
        ...base.pages,
        ...(parsed.pages || {}),
      },
      modules: {
        ...base.modules,
        ...(parsed.modules || {}),
      },
    };
  } catch {
    return createDefaultPresentationConfig(tenantId);
  }
}

export function savePresentationConfig(config: PresentationConfig) {
  if (typeof window === "undefined") return config;

  const record: PresentationConfig = {
    ...cloneConfig(config),
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(
    buildPresentationStorageKey(record.tenantId),
    JSON.stringify(record),
  );
  return record;
}

export function clearPresentationConfig(tenantId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(buildPresentationStorageKey(tenantId));
}

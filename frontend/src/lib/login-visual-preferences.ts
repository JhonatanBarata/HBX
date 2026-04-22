import { ACTIVE_THEME_USER_STORAGE_KEY } from "./theme-preferences";

export const LOGIN_VIDEO_PREFERENCE_STORAGE_KEY = "hbx:login-video-enabled";
export const LOGIN_VIDEO_PREFERENCE_EVENT = "hbx:login-video-preference-change";

function normalizeUserId(userId?: string | number | null) {
  return String(userId || "").trim();
}

function buildScopedKey(baseKey: string, userId?: string | number | null) {
  const normalizedUserId = normalizeUserId(userId);
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
}

function getActiveVisualStorageUser(userId?: string | number | null) {
  if (typeof window === "undefined") {
    return normalizeUserId(userId);
  }

  const explicit = normalizeUserId(userId);
  if (explicit) {
    return explicit;
  }

  try {
    return normalizeUserId(localStorage.getItem(ACTIVE_THEME_USER_STORAGE_KEY));
  } catch {
    return "";
  }
}

function parseStoredBoolean(value: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

export function readStoredLoginVideoEnabled(userId?: string | number | null) {
  if (typeof window === "undefined") {
    return false;
  }

  const scopedUserId = getActiveVisualStorageUser(userId);

  try {
    const storedValue =
      localStorage.getItem(buildScopedKey(LOGIN_VIDEO_PREFERENCE_STORAGE_KEY, scopedUserId)) ||
      localStorage.getItem(LOGIN_VIDEO_PREFERENCE_STORAGE_KEY);

    if (storedValue === null) {
      return false;
    }

    return parseStoredBoolean(storedValue);
  } catch {
    return false;
  }
}

export function persistLoginVideoEnabled(enabled: boolean, userId?: string | number | null) {
  if (typeof window === "undefined") {
    return;
  }

  const scopedUserId = getActiveVisualStorageUser(userId);
  const serialized = enabled ? "true" : "false";

  try {
    localStorage.setItem(LOGIN_VIDEO_PREFERENCE_STORAGE_KEY, serialized);

    if (scopedUserId) {
      localStorage.setItem(buildScopedKey(LOGIN_VIDEO_PREFERENCE_STORAGE_KEY, scopedUserId), serialized);
    }

    window.dispatchEvent(
      new CustomEvent(LOGIN_VIDEO_PREFERENCE_EVENT, {
        detail: {
          enabled,
          userId: scopedUserId,
        },
      }),
    );
  } catch {
    // ignore storage errors
  }
}
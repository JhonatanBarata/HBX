module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[project]/src/components/PageTransition.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PageTransition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
"use client";
;
;
function PageTransition({ children }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "route-transition",
        children: children
    }, pathname, false, {
        fileName: "[project]/src/components/PageTransition.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "apiFetch",
    ()=>apiFetch,
    "clearToken",
    ()=>clearToken,
    "getToken",
    ()=>getToken,
    "setToken",
    ()=>setToken
]);
"use client";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
function isApiErrorPayload(value) {
    return Boolean(value) && typeof value === "object";
}
function getToken() {
    if ("TURBOPACK compile-time truthy", 1) return null;
    //TURBOPACK unreachable
    ;
}
function setToken(token) {
    localStorage.setItem("token", token);
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
function clearToken() {
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("accessToken");
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
function parseErrorMessage(data) {
    if (!data) return "Erro";
    if (!isApiErrorPayload(data)) return "Erro";
    if (typeof data.message === "string") return data.message;
    if (Array.isArray(data.message)) return data.message.join(", ");
    if (typeof data.error === "string") return data.error;
    return "Erro";
}
function dispatchTechAssistantApiError(detail) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
async function apiFetch(path, init) {
    const url = path.startsWith("http") ? path : `${API_URL}${path}`;
    const token = getToken();
    const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type") && init?.body && !isFormData) {
        headers.set("Content-Type", "application/json");
    }
    if (!init?.skipAuth && token) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(url, {
        ...init,
        headers
    });
    let data = null;
    const text = await res.text();
    if (text) {
        try {
            data = JSON.parse(text);
        } catch  {
            data = text;
        }
    }
    if (!res.ok) {
        const message = typeof data === "string" ? data : parseErrorMessage(data);
        dispatchTechAssistantApiError({
            path,
            url,
            method: String(init?.method || "GET").toUpperCase(),
            status: res.status,
            message,
            response: typeof data === "string" ? data.slice(0, 1200) : JSON.stringify(data ?? null).slice(0, 1200),
            at: new Date().toISOString()
        });
        throw new Error(message);
    }
    return data;
}
}),
"[project]/src/lib/theme-palettes.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HBX_THEME_IDS",
    ()=>HBX_THEME_IDS,
    "HBX_THEME_MODES",
    ()=>HBX_THEME_MODES,
    "HBX_THEME_PALETTES",
    ()=>HBX_THEME_PALETTES,
    "isHbxThemeId",
    ()=>isHbxThemeId,
    "isHbxThemeMode",
    ()=>isHbxThemeMode
]);
const HBX_THEME_IDS = [
    "blue",
    "green",
    "grey",
    "pink"
];
const HBX_THEME_MODES = [
    "light",
    "dark"
];
const HBX_THEME_PALETTES = {
    blue: {
        label: "Blue",
        shortLabel: "BL",
        light: {
            brand: "#2563eb",
            brandStrong: "#163ea8",
            brandSoft: "#dbeafe",
            brandContrast: "#f8fbff",
            background: "#eef4fb",
            backgroundAlt: "#dfe9f6",
            surface: "#ffffff",
            surfaceSoft: "#f7faff",
            surfaceRaised: "#edf4ff",
            foreground: "#0f172a",
            foregroundSoft: "#1e293b",
            muted: "#526071",
            line: "#d6e0ee",
            success: "#0f8a6f",
            warning: "#d97706",
            danger: "#c2410c",
            info: "#2563eb",
            shadow: "#10284d",
            overlay: "rgba(6, 23, 47, 0.18)"
        },
        dark: {
            brand: "#6ea8ff",
            brandStrong: "#3a7df0",
            brandSoft: "#10284f",
            brandContrast: "#08111d",
            background: "#07101c",
            backgroundAlt: "#0b1726",
            surface: "#101c2d",
            surfaceSoft: "#162437",
            surfaceRaised: "#1a2d44",
            foreground: "#eff6ff",
            foregroundSoft: "#d6e5fb",
            muted: "#9eb1ca",
            line: "#243a57",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#7dd3fc",
            shadow: "#020817",
            overlay: "rgba(2, 8, 23, 0.52)"
        }
    },
    green: {
        label: "Green",
        shortLabel: "GN",
        light: {
            brand: "#0f9f73",
            brandStrong: "#0e6f58",
            brandSoft: "#d1fae5",
            brandContrast: "#f7fffb",
            background: "#edf8f3",
            backgroundAlt: "#deefe7",
            surface: "#ffffff",
            surfaceSoft: "#f5fffa",
            surfaceRaised: "#ecfaf3",
            foreground: "#10211d",
            foregroundSoft: "#1f3733",
            muted: "#537069",
            line: "#d3e7de",
            success: "#0f9f73",
            warning: "#ca8a04",
            danger: "#c2410c",
            info: "#0f766e",
            shadow: "#0b2f29",
            overlay: "rgba(7, 34, 29, 0.18)"
        },
        dark: {
            brand: "#3dd5aa",
            brandStrong: "#1fa17d",
            brandSoft: "#08352d",
            brandContrast: "#031610",
            background: "#061411",
            backgroundAlt: "#0a1d19",
            surface: "#10231f",
            surfaceSoft: "#17312c",
            surfaceRaised: "#1a3a35",
            foreground: "#ecfdf6",
            foregroundSoft: "#cdeee3",
            muted: "#98bbb1",
            line: "#21463f",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#67e8f9",
            shadow: "#020d0b",
            overlay: "rgba(2, 13, 11, 0.54)"
        }
    },
    grey: {
        label: "Grey",
        shortLabel: "GY",
        light: {
            brand: "#475569",
            brandStrong: "#1f2937",
            brandSoft: "#e2e8f0",
            brandContrast: "#f8fafc",
            background: "#f2f4f8",
            backgroundAlt: "#e6ebf1",
            surface: "#ffffff",
            surfaceSoft: "#f8fafc",
            surfaceRaised: "#eef2f6",
            foreground: "#111827",
            foregroundSoft: "#273244",
            muted: "#5b6678",
            line: "#d8dee7",
            success: "#0f8a6f",
            warning: "#c47a09",
            danger: "#c2410c",
            info: "#475569",
            shadow: "#18202d",
            overlay: "rgba(17, 24, 39, 0.18)"
        },
        dark: {
            brand: "#c3cedd",
            brandStrong: "#94a3b8",
            brandSoft: "#273243",
            brandContrast: "#0f172a",
            background: "#0b1016",
            backgroundAlt: "#121a24",
            surface: "#171f2b",
            surfaceSoft: "#1d2734",
            surfaceRaised: "#253244",
            foreground: "#f3f6fb",
            foregroundSoft: "#d6dde8",
            muted: "#9eacbd",
            line: "#2a394b",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#93c5fd",
            shadow: "#030712",
            overlay: "rgba(3, 7, 18, 0.56)"
        }
    },
    pink: {
        label: "Pink",
        shortLabel: "PK",
        light: {
            brand: "#db2777",
            brandStrong: "#a21c57",
            brandSoft: "#fce7f3",
            brandContrast: "#fff7fb",
            background: "#fff2f8",
            backgroundAlt: "#fde5f0",
            surface: "#ffffff",
            surfaceSoft: "#fff7fb",
            surfaceRaised: "#fff0f7",
            foreground: "#311225",
            foregroundSoft: "#4c203a",
            muted: "#7b4d67",
            line: "#f0d3e2",
            success: "#0f8a6f",
            warning: "#d97706",
            danger: "#e11d48",
            info: "#c026d3",
            shadow: "#43162e",
            overlay: "rgba(49, 18, 37, 0.18)"
        },
        dark: {
            brand: "#ff8fcb",
            brandStrong: "#f472b6",
            brandSoft: "#471230",
            brandContrast: "#210613",
            background: "#170713",
            backgroundAlt: "#220b1a",
            surface: "#2b1022",
            surfaceSoft: "#37142c",
            surfaceRaised: "#431735",
            foreground: "#fff1f8",
            foregroundSoft: "#ffd6e9",
            muted: "#ddb2c9",
            line: "#5d2749",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#f9a8d4",
            shadow: "#12040d",
            overlay: "rgba(18, 4, 13, 0.56)"
        }
    }
};
function isHbxThemeId(value) {
    return HBX_THEME_IDS.includes(value);
}
function isHbxThemeMode(value) {
    return HBX_THEME_MODES.includes(value);
}
}),
"[project]/src/lib/design-tokens.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_THEME_SELECTION",
    ()=>DEFAULT_THEME_SELECTION,
    "applyThemeSelectionToDocument",
    ()=>applyThemeSelectionToDocument
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-palettes.ts [app-ssr] (ecmascript)");
;
const DEFAULT_THEME_SELECTION = {
    themeId: "blue",
    mode: "light"
};
function hexToRgb(hex) {
    const normalized = hex.replace("#", "");
    const safeHex = normalized.length === 3 ? normalized.split("").map((part)=>`${part}${part}`).join("") : normalized.padEnd(6, "0").slice(0, 6);
    return {
        r: Number.parseInt(safeHex.slice(0, 2), 16),
        g: Number.parseInt(safeHex.slice(2, 4), 16),
        b: Number.parseInt(safeHex.slice(4, 6), 16)
    };
}
function withAlpha(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
function applyThemeSelectionToDocument(selection) {
    if (typeof document === "undefined") return;
    const palette = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][selection.themeId][selection.mode];
    const root = document.documentElement;
    root.setAttribute("data-theme", selection.themeId);
    root.setAttribute("data-theme-mode", selection.mode);
    root.style.colorScheme = selection.mode;
    const variables = {
        "--brand": palette.brand,
        "--brand-solid": palette.brandStrong,
        "--brand-soft": palette.brandSoft,
        "--brand-contrast": palette.brandContrast,
        "--background": palette.background,
        "--background-alt": palette.backgroundAlt,
        "--surface": palette.surface,
        "--surface-soft": palette.surfaceSoft,
        "--surface-raised": palette.surfaceRaised,
        "--foreground": palette.foreground,
        "--foreground-soft": palette.foregroundSoft,
        "--muted": palette.muted,
        "--line": palette.line,
        "--success": palette.success,
        "--warning": palette.warning,
        "--danger": palette.danger,
        "--info": palette.info,
        "--overlay": palette.overlay,
        "--shadow-xs": `0 10px 22px -18px ${withAlpha(palette.shadow, 0.3)}`,
        "--shadow-sm": `0 18px 40px -24px ${withAlpha(palette.shadow, 0.34)}`,
        "--shadow-md": `0 28px 64px -30px ${withAlpha(palette.shadow, 0.42)}`,
        "--shadow-lg": `0 42px 96px -36px ${withAlpha(palette.shadow, 0.48)}`,
        "--shadow-inset": `inset 0 1px 0 ${selection.mode === "light" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.06)"}`,
        "--panel-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.12 : 0.18),
        "--hero-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.2 : 0.24)
    };
    Object.entries(variables).forEach(([name, value])=>{
        root.style.setProperty(name, value);
    });
}
}),
"[project]/src/lib/theme-preferences.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ACTIVE_THEME_USER_STORAGE_KEY",
    ()=>ACTIVE_THEME_USER_STORAGE_KEY,
    "HBX_THEME_ID_STORAGE_KEY",
    ()=>HBX_THEME_ID_STORAGE_KEY,
    "HBX_THEME_MODE_STORAGE_KEY",
    ()=>HBX_THEME_MODE_STORAGE_KEY,
    "persistThemeSelection",
    ()=>persistThemeSelection,
    "readStoredThemeSelection",
    ()=>readStoredThemeSelection,
    "setActiveThemeUser",
    ()=>setActiveThemeUser
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/design-tokens.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-palettes.ts [app-ssr] (ecmascript)");
;
;
const ACTIVE_THEME_USER_STORAGE_KEY = "hbx:active-user-id";
const HBX_THEME_ID_STORAGE_KEY = "hbx:theme-id";
const HBX_THEME_MODE_STORAGE_KEY = "hbx:theme-mode";
function normalizeUserId(userId) {
    return String(userId || "").trim();
}
function buildScopedKey(baseKey, userId) {
    const normalizedUserId = normalizeUserId(userId);
    return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
}
function mapLegacyThemeId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "primary") return "blue";
    if (normalized === "secondary") return "green";
    if (normalized === "neutral" || normalized === "slate") return "grey";
    if (normalized === "pink") return "pink";
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEFAULT_THEME_SELECTION"].themeId;
}
function resolveStoredThemeId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isHbxThemeId"])(normalized) ? normalized : mapLegacyThemeId(value);
}
function resolveStoredThemeMode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isHbxThemeMode"])(normalized) ? normalized : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEFAULT_THEME_SELECTION"].mode;
}
function getActiveThemeStorageUser(userId) {
    if ("TURBOPACK compile-time truthy", 1) return normalizeUserId(userId);
    //TURBOPACK unreachable
    ;
    const explicit = undefined;
}
function setActiveThemeUser(userId) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function readStoredThemeSelection(userId) {
    if ("TURBOPACK compile-time truthy", 1) return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEFAULT_THEME_SELECTION"];
    //TURBOPACK unreachable
    ;
    const scopedUserId = undefined;
}
function persistThemeSelection(selection, userId) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
    const scopedUserId = undefined;
}
}),
"[project]/src/components/ThemeSwitcher.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThemeSwitcher
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/design-tokens.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-palettes.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-preferences.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
function ThemeSwitcher({ storageUserId }) {
    const [selection, setSelection] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useState(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["readStoredThemeSelection"])(storageUserId));
    function commitTheme(nextThemeId, explicitMode) {
        const nextSelection = {
            themeId: nextThemeId,
            mode: explicitMode ?? (selection.themeId === nextThemeId && selection.mode === "light" ? "dark" : "light")
        };
        setSelection(nextSelection);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyThemeSelectionToDocument"])(nextSelection);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["persistThemeSelection"])(nextSelection, storageUserId);
    }
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useEffect(()=>{
        const nextSelection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["readStoredThemeSelection"])(storageUserId);
        setSelection(nextSelection);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyThemeSelectionToDocument"])(nextSelection);
    }, [
        storageUserId
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "theme-switcher-wrap",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "theme-switcher__meta",
                "aria-hidden": "true",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "theme-switcher__label",
                        children: "Tema visual"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "theme-switcher__mode",
                        children: selection.mode === "dark" ? "Dark" : "Light"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 43,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                lineNumber: 41,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "theme-switcher",
                role: "group",
                "aria-label": "Tema visual",
                children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_IDS"].map((themeId)=>{
                    const palette = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][themeId][selection.mode];
                    const active = selection.themeId === themeId;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>commitTheme(themeId),
                        className: `theme-chip ${active ? "is-selected" : ""} ${active && selection.mode === "dark" ? "is-dark" : ""}`,
                        "aria-pressed": active,
                        title: active ? `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][themeId].label} ${selection.mode === "dark" ? "Dark" : "Light"}` : `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][themeId].label} Light`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "theme-chip__swatch",
                                style: {
                                    background: `linear-gradient(135deg, ${palette.brand}, ${palette.brandStrong})`
                                },
                                "aria-hidden": "true"
                            }, void 0, false, {
                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                lineNumber: 66,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][themeId].label
                            }, void 0, false, {
                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                lineNumber: 73,
                                columnNumber: 15
                            }, this)
                        ]
                    }, themeId, true, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 52,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ThemeSwitcher.tsx",
        lineNumber: 40,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/ModuleNav.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "heroTab": "ModuleNav-module__gFNEqG__heroTab",
  "heroTabActive": "ModuleNav-module__gFNEqG__heroTabActive",
  "heroTabGroup": "ModuleNav-module__gFNEqG__heroTabGroup",
  "moduleNavContainer": "ModuleNav-module__gFNEqG__moduleNavContainer",
  "moduleNavHeader": "ModuleNav-module__gFNEqG__moduleNavHeader",
  "moduleNavWrap": "ModuleNav-module__gFNEqG__moduleNavWrap",
  "navScrollBtn": "ModuleNav-module__gFNEqG__navScrollBtn",
});
}),
"[project]/src/components/ModuleNav.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ModuleNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/ModuleNav.module.css [app-ssr] (css module)");
"use client";
;
;
;
;
;
;
function ModuleNav({ inHeader = false }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const authenticated = Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])());
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [userRole, setUserRole] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isSystemMaster, setIsSystemMaster] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const navScrollRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const [canScrollLeft, setCanScrollLeft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [canScrollRight, setCanScrollRight] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    // Keep CSS var for topbar total height in sync with the actual header height.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const root = document.documentElement;
        const topbar = document.querySelector('.app-topbar');
        if (!topbar || !root) return;
        const setVar = ()=>{
            const rect = topbar.getBoundingClientRect();
            // use the header's full rendered height (px)
            root.style.setProperty('--topbar-total-height', `${Math.ceil(rect.height)}px`);
        };
        setVar();
        // observe size changes to the header (e.g., when "Intensidade" control grows it)
        let ro = null;
        try {
            ro = new ResizeObserver(setVar);
            ro.observe(topbar);
        } catch (e) {
            // ResizeObserver may not exist in some older environments; fallback to window resize
            window.addEventListener('resize', setVar);
        }
        return ()=>{
            if (ro) ro.disconnect();
            window.removeEventListener('resize', setVar);
        };
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let mounted = true;
        if (!authenticated) return;
        (async ()=>{
            try {
                const [myModules, profile] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])('/modules/me'),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])('/profile/current-user').catch(()=>null)
                ]);
                if (!mounted) return;
                setModules(myModules || []);
                setUserRole(String(profile?.role || null));
                setIsSystemMaster(Boolean(profile?.isSystemMaster));
            } catch (e) {
            // ignore
            }
        })();
        return ()=>{
            mounted = false;
        };
    }, [
        authenticated
    ]);
    function updateScrollButtons() {
        const el = navScrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const el = navScrollRef.current;
        if (!el) return;
        const stableEl = el;
        updateScrollButtons();
        const onScroll = ()=>updateScrollButtons();
        window.addEventListener('resize', updateScrollButtons);
        stableEl.addEventListener('scroll', onScroll);
        // add pointer drag-to-scroll when rendered in header for touch/drag UX
        let isDown = false;
        let startX = 0;
        let scrollStart = 0;
        function onPointerDown(e) {
            isDown = true;
            e.target.setPointerCapture?.(e.pointerId);
            startX = e.clientX;
            scrollStart = stableEl.scrollLeft;
            stableEl.classList.add('dragging');
        }
        function onPointerMove(e) {
            if (!isDown) return;
            const dx = startX - e.clientX;
            stableEl.scrollLeft = scrollStart + dx;
            updateScrollButtons();
        }
        function onPointerUp(e) {
            isDown = false;
            stableEl.classList.remove('dragging');
            try {
                e.target.releasePointerCapture?.(e.pointerId);
            } catch (err) {}
        }
        if (inHeader) {
            stableEl.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        }
        return ()=>{
            window.removeEventListener('resize', updateScrollButtons);
            stableEl.removeEventListener('scroll', onScroll);
            if (inHeader) {
                stableEl.removeEventListener('pointerdown', onPointerDown);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            }
        };
    }, [
        navScrollRef.current
    ]);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Set((modules || []).filter((m)=>m.accessible).map((m)=>m.key)), [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const items = [
            {
                href: "/dashboard",
                label: "Menu",
                matcher: (r)=>r === "/dashboard"
            },
            {
                href: "/dashboard/inbox",
                label: "Atendimento",
                matcher: (r)=>r.startsWith('/dashboard/inbox') || r.startsWith('/dashboard/auto-replies') || r.startsWith('/dashboard/messages'),
                moduleKey: 'atendimento'
            },
            {
                href: "/dashboard/gerencial",
                label: "Gerencial",
                matcher: (r)=>r.startsWith('/dashboard/gerencial'),
                adminOnly: true,
                moduleKey: 'gerencial'
            },
            {
                href: "/hbx-recovery",
                label: "Recovery",
                matcher: (r)=>r.startsWith('/hbx-recovery'),
                moduleKey: 'hbx_recovery'
            },
            {
                href: "/dashboard/webscraping",
                label: "Webscraping",
                matcher: (r)=>r.startsWith('/dashboard/webscraping'),
                moduleKey: 'webscraping'
            },
            {
                href: "/dashboard/website",
                label: "Website",
                matcher: (r)=>r.startsWith('/dashboard/website'),
                moduleKey: 'website'
            },
            {
                href: "/dashboard/importacoes/followup-global",
                label: "Follow Up",
                matcher: (r)=>r.startsWith('/dashboard/importacoes/followup-global') || r.startsWith('/dashboard/importacoes/historico') || r.startsWith('/dashboard/importacoes/novo'),
                moduleKey: 'follow_up_internacional'
            },
            {
                href: "/dashboard/importacoes/cadastros",
                label: "Cadastros",
                matcher: (r)=>r.startsWith('/dashboard/importacoes/cadastros'),
                moduleKey: 'cadastros'
            },
            {
                href: "/dashboard/master",
                label: "Master",
                matcher: (r)=>r.startsWith('/dashboard/master'),
                adminOnly: true,
                moduleKey: 'master'
            }
        ];
        // If modules haven't loaded yet (modules length === 0), show the full nav
        const showAllUntilLoaded = Array.isArray(modules) && modules.length === 0;
        return items.filter((item)=>{
            if (!showAllUntilLoaded) {
                if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
                if (!item.adminOnly) return true;
                if (item.href === "/dashboard/master") return isSystemMaster;
                return String(userRole || "").toUpperCase() === "ADMIN";
            }
            // modules not loaded yet: show everything (helps initial render)
            return true;
        });
    }, [
        accessibleModules,
        userRole,
        isSystemMaster
    ]);
    // Always render the module navigation so it appears on all pages.
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: [
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavWrap,
            inHeader ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavHeader : ''
        ].filter(Boolean).join(' '),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavContainer,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].navScrollBtn,
                    "aria-hidden": !canScrollLeft,
                    style: {
                        display: canScrollLeft ? 'flex' : 'none'
                    },
                    onClick: ()=>{
                        const el = navScrollRef.current;
                        if (el) el.scrollBy({
                            left: -220,
                            behavior: 'smooth'
                        });
                    },
                    children: "‹"
                }, void 0, false, {
                    fileName: "[project]/src/components/ModuleNav.tsx",
                    lineNumber: 166,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTabGroup,
                    role: "tablist",
                    "aria-label": "Navegacao de modulos",
                    ref: navScrollRef,
                    children: navItems.map((item)=>{
                        const active = item.matcher(pathname || '');
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: item.href,
                            className: active ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTab,
                            "aria-current": active ? 'page' : undefined,
                            children: item.label
                        }, item.href, false, {
                            fileName: "[project]/src/components/ModuleNav.tsx",
                            lineNumber: 188,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/src/components/ModuleNav.tsx",
                    lineNumber: 179,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].navScrollBtn,
                    "aria-hidden": !canScrollRight,
                    style: {
                        display: canScrollRight ? 'flex' : 'none'
                    },
                    onClick: ()=>{
                        const el = navScrollRef.current;
                        if (el) el.scrollBy({
                            left: 220,
                            behavior: 'smooth'
                        });
                    },
                    children: "›"
                }, void 0, false, {
                    fileName: "[project]/src/components/ModuleNav.tsx",
                    lineNumber: 200,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/ModuleNav.tsx",
            lineNumber: 165,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/ModuleNav.tsx",
        lineNumber: 164,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/TechAssistantGlobalDrawer.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "assistantBody": "TechAssistantGlobalDrawer-module__vEhz_G__assistantBody",
  "assistantHeader": "TechAssistantGlobalDrawer-module__vEhz_G__assistantHeader",
  "assistantLauncher": "TechAssistantGlobalDrawer-module__vEhz_G__assistantLauncher",
  "assistantShell": "TechAssistantGlobalDrawer-module__vEhz_G__assistantShell",
  "badgeRow": "TechAssistantGlobalDrawer-module__vEhz_G__badgeRow",
  "cardEyebrow": "TechAssistantGlobalDrawer-module__vEhz_G__cardEyebrow",
  "cardHeader": "TechAssistantGlobalDrawer-module__vEhz_G__cardHeader",
  "cardText": "TechAssistantGlobalDrawer-module__vEhz_G__cardText",
  "contextCard": "TechAssistantGlobalDrawer-module__vEhz_G__contextCard",
  "fieldGridTwo": "TechAssistantGlobalDrawer-module__vEhz_G__fieldGridTwo",
  "formCard": "TechAssistantGlobalDrawer-module__vEhz_G__formCard",
  "headerActions": "TechAssistantGlobalDrawer-module__vEhz_G__headerActions",
  "headerEyebrow": "TechAssistantGlobalDrawer-module__vEhz_G__headerEyebrow",
  "headerMeta": "TechAssistantGlobalDrawer-module__vEhz_G__headerMeta",
  "headerRow": "TechAssistantGlobalDrawer-module__vEhz_G__headerRow",
  "headerTitle": "TechAssistantGlobalDrawer-module__vEhz_G__headerTitle",
  "historyButton": "TechAssistantGlobalDrawer-module__vEhz_G__historyButton",
  "historyCard": "TechAssistantGlobalDrawer-module__vEhz_G__historyCard",
  "historyList": "TechAssistantGlobalDrawer-module__vEhz_G__historyList",
  "inlineActions": "TechAssistantGlobalDrawer-module__vEhz_G__inlineActions",
  "listBlock": "TechAssistantGlobalDrawer-module__vEhz_G__listBlock",
  "missingBox": "TechAssistantGlobalDrawer-module__vEhz_G__missingBox",
  "mutedText": "TechAssistantGlobalDrawer-module__vEhz_G__mutedText",
  "operationCard": "TechAssistantGlobalDrawer-module__vEhz_G__operationCard",
  "promptCard": "TechAssistantGlobalDrawer-module__vEhz_G__promptCard",
  "promptPreview": "TechAssistantGlobalDrawer-module__vEhz_G__promptPreview",
  "providerTab": "TechAssistantGlobalDrawer-module__vEhz_G__providerTab",
  "providerTabActive": "TechAssistantGlobalDrawer-module__vEhz_G__providerTabActive",
  "providerTabs": "TechAssistantGlobalDrawer-module__vEhz_G__providerTabs",
  "questionBox": "TechAssistantGlobalDrawer-module__vEhz_G__questionBox",
  "resultCard": "TechAssistantGlobalDrawer-module__vEhz_G__resultCard",
  "scoreBadge": "TechAssistantGlobalDrawer-module__vEhz_G__scoreBadge",
  "scoredanger": "TechAssistantGlobalDrawer-module__vEhz_G__scoredanger",
  "scoresuccess": "TechAssistantGlobalDrawer-module__vEhz_G__scoresuccess",
  "scorewarning": "TechAssistantGlobalDrawer-module__vEhz_G__scorewarning",
  "sectionStack": "TechAssistantGlobalDrawer-module__vEhz_G__sectionStack",
  "warningBox": "TechAssistantGlobalDrawer-module__vEhz_G__warningBox",
});
}),
"[project]/src/components/TechAssistantGlobalDrawer.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TechAssistantGlobalDrawer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-dom.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/TechAssistantGlobalDrawer.module.css [app-ssr] (css module)");
"use client";
;
;
;
;
;
;
;
function deriveModuleFromPath(pathname) {
    if (pathname.startsWith("/dashboard/inbox")) return "atendimento";
    if (pathname.startsWith("/dashboard/website")) return "website";
    if (pathname.startsWith("/dashboard/master")) return "master";
    if (pathname.startsWith("/dashboard/webscraping")) return "webscraping";
    if (pathname.startsWith("/dashboard/gerencial")) return "gerencial";
    if (pathname.startsWith("/dashboard/importacoes")) return "follow_up_internacional";
    if (pathname.startsWith("/hbx-recovery")) return "hbx_recovery";
    if (pathname.startsWith("/dashboard")) return "dashboard";
    return "fora_dashboard";
}
function inferEnvironment(hostname) {
    const normalized = String(hostname || "").trim().toLowerCase();
    if (!normalized) return "desconhecido";
    if (normalized === "localhost" || normalized === "127.0.0.1" || normalized.endsWith(".local")) {
        return "localhost";
    }
    if (/hml|homolog|staging|stage|qa/.test(normalized)) {
        return "homologacao";
    }
    return "producao";
}
function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function formatUnknown(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value);
    } catch  {
        return fallback;
    }
}
function clipText(value, max = 320) {
    const normalized = compactText(value);
    if (!normalized) return "";
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}
function toSignal(kind, message, meta) {
    return {
        id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        message: clipText(message, 360),
        meta: clipText(meta || "", 360) || undefined,
        at: new Date().toISOString()
    };
}
const MODULE_PROMPT_HINTS = {
    atendimento: [
        "Considere tabs, conversa selecionada, rota para Recovery, bloqueio manual e editor do bot.",
        "Se houver preview apertado ou fluxo confuso, diferencie problema de layout, UX e backend."
    ],
    hbx_recovery: [
        "Considere fila de interacoes, drawer do cliente, automacao, templates Meta e bot do Recovery.",
        "Se houver problema em cobranca, diferencie fluxo visual, regra de negocio e operacao humana."
    ],
    website: [
        "Considere SEO, renderizacao, CMS, formulario e publicacao da pagina."
    ],
    webscraping: [
        "Considere fila, parsing, origem dos dados e estabilidade do scraping."
    ],
    master: [
        "Considere permissao MASTER, contexto assumido e impacto cross-modulo."
    ]
};
const ANALYSIS_GUIDES = {
    manual: {
        title: "Relato manual guiado",
        description: "Bom para bugs funcionais, confusao de fluxo e comportamento inesperado.",
        goal: "Descrever claramente o que esta acontecendo e o que deveria acontecer.",
        questions: [
            "Qual acao voce fez imediatamente antes do problema aparecer?",
            "O que a tela mostrou de diferente do esperado?",
            "Isso acontece sempre ou so em um caso especifico?",
            "Existe impacto em dados, permissao, layout ou salvamento?"
        ],
        technicalPlaceholder: "Cole erro do console, payload, stacktrace, JSON, HTML ou observacoes tecnicas.",
        draftPlaceholder: "Se quiser, escreva aqui um rascunho de prompt que o assistente vai fortalecer."
    },
    page_analysis: {
        title: "Leitura da pagina atual",
        description: "Ideal para revisar UX, estrutura da tela, espaco, hierarquia visual e fluxo.",
        goal: "Traduzir o contexto da pagina atual em um pedido claro para o chat.",
        questions: [
            "Qual parte da pagina esta mais confusa ou fraca?",
            "O problema e visual, funcional ou dos dois?",
            "O que deveria ficar mais simples para o usuario?",
            "Existe um trecho apertado, escondido ou repetitivo?"
        ],
        technicalPlaceholder: "Cole HTML, classes CSS, medidas de viewport, logs de render ou requests da pagina.",
        draftPlaceholder: "Escreva a melhoria que voce imagina, mesmo que ainda esteja vaga."
    },
    error_analysis: {
        title: "Diagnostico de erro",
        description: "Foco em stacktrace, response ruim, erro de auth, timeout, build ou falha de regra.",
        goal: "Chegar num ponto de falha bem definido antes de chamar o Codex.",
        questions: [
            "Qual e a primeira mensagem de erro real?",
            "Em que rota e em qual clique isso acontece?",
            "O erro vem do frontend, backend ou integracao?",
            "Qual resposta ou stacktrace confirma esse comportamento?"
        ],
        technicalPlaceholder: "Cole console error, stacktrace backend, JSON de request/response, status code, timeout, trace Prisma etc.",
        draftPlaceholder: "Se ja tiver um prompt de erro, cole aqui para revisao."
    },
    ctrl_u: {
        title: "Inspecao de HTML/markup",
        description: "Ajuda a diagnosticar renderizacao, hydration e DOM inesperado.",
        goal: "Extrair sinais do HTML e ligar isso ao componente/rota corretos.",
        questions: [
            "O markup gerado bate com a interface esperada?",
            "Ha elemento faltando, duplicado ou com classe errada?",
            "O problema acontece so apos hidratar no client?",
            "Existe diferenca entre o HTML servido e o HTML apos interacao?"
        ],
        technicalPlaceholder: "Cole o trecho de HTML/Ctrl+U, DOM inspecionado ou descricao do elemento com problema.",
        draftPlaceholder: "Escreva o que voce quer que o chat analise nesse HTML."
    },
    codex_prompt: {
        title: "Gerador de prompt para Codex",
        description: "Monta um pedido tecnico mais objetivo, com restricoes, contexto e arquivos provaveis.",
        goal: "Entregar um prompt claro e acionavel para implementacao.",
        questions: [
            "Qual e o objetivo tecnico exato da mudanca?",
            "Quais partes nao podem ser quebradas?",
            "Que tipo de patch voce espera: pequeno, medio ou estrutural?",
            "Existe contexto de backend, frontend ou ambos?"
        ],
        technicalPlaceholder: "Cole arquivos suspeitos, erros, payloads, constraints e regras de negocio relevantes.",
        draftPlaceholder: "Cole seu prompt bruto para o assistente deixar melhor."
    },
    prompt_review: {
        title: "Revisao de prompt",
        description: "Usado quando voce ja escreveu um prompt mas quer deixa-lo mais forte.",
        goal: "Reduzir ambiguidade, lacunas e escopo ruim.",
        questions: [
            "O prompt ja explica comportamento atual e esperado?",
            "Ele indica arquivos ou areas suspeitas?",
            "Ele limita bem o escopo?",
            "Ele pede validacao no final?"
        ],
        technicalPlaceholder: "Cole tudo que o prompt nao explica bem: logs, telas, erro e contexto.",
        draftPlaceholder: "Cole aqui o prompt atual para revisao."
    },
    pre_publish_checklist: {
        title: "Checklist antes de publicar",
        description: "Ajuda a montar um pacote seguro antes de build, deploy ou validacao em producao.",
        goal: "Organizar risco, checagens e impacto antes da mudanca.",
        questions: [
            "Qual fluxo critico nao pode quebrar?",
            "Quais telas, APIs e migrations serao tocadas?",
            "Qual validacao minima voce precisa fazer antes de publicar?",
            "Existe risco em auth, banco, payment ou master?"
        ],
        technicalPlaceholder: "Cole diff esperado, risco, endpoints tocados, ambientes, migrations e pontos sensiveis.",
        draftPlaceholder: "Escreva o plano ou checklist inicial, se tiver."
    }
};
function buildBriefingAssessment(input) {
    let score = 0;
    const missing = [];
    if (compactText(input.route)) score += 10;
    else missing.push("rota atual");
    if (compactText(input.moduleKey) && input.moduleKey !== "fora_dashboard") score += 10;
    else missing.push("modulo");
    if (compactText(input.activeCompanyName || "")) score += 8;
    else missing.push("empresa ativa");
    if (compactText(input.message)) score += 24;
    else missing.push("descricao objetiva do problema");
    if (compactText(input.currentBehavior)) score += 18;
    else missing.push("comportamento atual");
    if (compactText(input.expectedBehavior)) score += 18;
    else missing.push("comportamento esperado");
    if (compactText(input.technicalContent)) score += 12;
    else missing.push("evidencia tecnica ou log");
    if (compactText(input.promptDraft)) score += 8;
    if (score >= 78) return {
        score,
        label: "Briefing forte",
        tone: "success",
        missing
    };
    if (score >= 48) return {
        score,
        label: "Briefing medio",
        tone: "warning",
        missing
    };
    return {
        score,
        label: "Briefing fraco",
        tone: "danger",
        missing
    };
}
function buildContextSnapshot(input) {
    return [
        "CONTEXTO AUTOMATICO",
        `Rota: ${input.route || "-"}`,
        `Modulo: ${input.moduleKey || "-"}`,
        `Empresa ativa: ${input.activeCompanyName || "MASTER puro"}`,
        `Modo: ${input.operationMode || "-"}`,
        `Ambiente inferido: ${input.environment || "desconhecido"}`,
        `Viewport: ${input.viewport || "desconhecido"}`,
        `Data da analise: ${new Date().toLocaleString("pt-BR")}`
    ].join("\n");
}
function buildExternalPrompt(target, input) {
    const providerName = target === "chatgpt" ? "ChatGPT" : target === "gemini" ? "Gemini" : "Codex";
    const externalModeInstructions = target === "codex" ? [
        "Atue como um agente tecnico focado em patch objetivo.",
        "Nao invente contexto que nao foi informado.",
        "Se faltar informacao critica, liste as lacunas antes de propor mudanca.",
        "Prefira passos concretos, arquivos provaveis e validacoes finais."
    ] : [
        `Voce e meu afinador tecnico antes de eu chamar o Codex. Quero usar este chat (${providerName}) para estreitar o problema.`,
        "Sua primeira resposta deve fazer ate 5 perguntas curtas e objetivas, sem tentar resolver tudo de uma vez.",
        "Nao invente arquitetura nem arquivos; use apenas o contexto informado.",
        "Depois das perguntas, monte um resumo estruturado com problema, comportamento atual, esperado, causa provavel, areas suspeitas e pedido final para o Codex."
    ];
    const sections = [
        `OBJETIVO DO CHAT (${providerName.toUpperCase()})`,
        input.guide.goal,
        "",
        "INSTRUCOES",
        ...externalModeInstructions.map((line, index)=>`${index + 1}. ${line}`),
        "",
        "CONTEXTO",
        `Tipo de analise: ${input.analysisType}`,
        `Rota: ${input.route || "-"}`,
        `Modulo: ${input.moduleKey || "-"}`,
        `Empresa ativa: ${input.activeCompanyName || "MASTER puro"}`,
        `Modo de operacao: ${input.operationMode || "-"}`,
        `Ambiente: ${input.environment || "desconhecido"}`,
        `Viewport: ${input.viewport || "desconhecido"}`,
        `Contexto da pagina: ${input.pageContextSummary || "Nao capturado"}`,
        "",
        "PROBLEMA",
        input.message || "Nao informado",
        "",
        "COMPORTAMENTO ATUAL",
        input.currentBehavior || "Nao informado",
        "",
        "COMPORTAMENTO ESPERADO",
        input.expectedBehavior || "Nao informado"
    ];
    if (compactText(input.technicalContent)) {
        sections.push("", "EVIDENCIA TECNICA", input.technicalContent);
    }
    if (compactText(input.runtimeSignalSummary)) {
        sections.push("", "SINAIS AUTOMATICOS DO FRONTEND", input.runtimeSignalSummary);
    }
    if (input.moduleHints.length) {
        sections.push("", "FOCO DO MODULO", ...input.moduleHints.map((item, index)=>`${index + 1}. ${item}`));
    }
    if (compactText(input.promptDraft)) {
        sections.push("", "RASCUNHO/PROMPT ATUAL", input.promptDraft);
    }
    sections.push("", "PERGUNTAS GUIA QUE JA QUERO COBRIR", ...input.guide.questions.map((question, index)=>`${index + 1}. ${question}`));
    if (target === "codex") {
        sections.push("", "SAIDA ESPERADA", "Entregue um plano curto, arquivos provaveis, patch sugerido e validacoes finais. Evite refatoracao ampla sem necessidade.");
    } else {
        sections.push("", "SAIDA ESPERADA DEPOIS DAS PERGUNTAS", "1. Resumo do problema", "2. Hipotese mais provavel", "3. Areas/arquivos suspeitos", "4. O que eu devo pedir ao Codex", "5. Prompt final pronto para o Codex");
    }
    return sections.join("\n");
}
function TechAssistantGlobalDrawer({ isSystemMaster, masterContext }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [minimized, setMinimized] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [copyStatus, setCopyStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [message, setMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [technicalContent, setTechnicalContent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [analysisType, setAnalysisType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("manual");
    const [environment, setEnvironment] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("desconhecido");
    const [expectedBehavior, setExpectedBehavior] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [currentBehavior, setCurrentBehavior] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [promptDraft, setPromptDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [viewport, setViewport] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("desconhecido");
    const [promptTarget, setPromptTarget] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("chatgpt");
    const [pageContext, setPageContext] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [runtimeSignals, setRuntimeSignals] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [result, setResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [history, setHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [historyVisible, setHistoryVisible] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showAdvanced, setShowAdvanced] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showPromptPreview, setShowPromptPreview] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [historyRouteFilter, setHistoryRouteFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [historyAnalysisTypeFilter, setHistoryAnalysisTypeFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [operationAction, setOperationAction] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("reprocessar_evento_teste");
    const [operationDetails, setOperationDetails] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [operationConfirmationText, setOperationConfirmationText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [operationResult, setOperationResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const moduleKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>deriveModuleFromPath(pathname || ""), [
        pathname
    ]);
    const operationMode = masterContext?.active ? "empresa_assumida" : "master_puro";
    const activeCompanyName = masterContext?.companyName || null;
    const selectedGuide = ANALYSIS_GUIDES[analysisType] || ANALYSIS_GUIDES.manual;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setMounted(true);
        const updateRuntimeDetails = ()=>{
            if ("TURBOPACK compile-time truthy", 1) return;
            //TURBOPACK unreachable
            ;
        };
        updateRuntimeDetails();
        window.addEventListener("resize", updateRuntimeDetails);
        return ()=>window.removeEventListener("resize", updateRuntimeDetails);
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const pushSignal = undefined;
        const handlePageContext = undefined;
        const handleApiError = undefined;
        const handleWindowError = undefined;
        const handlePromiseError = undefined;
        const originalConsoleError = undefined;
    }, []);
    const briefingAssessment = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>buildBriefingAssessment({
            route: pathname || "",
            moduleKey,
            activeCompanyName,
            message,
            currentBehavior,
            expectedBehavior,
            technicalContent,
            promptDraft
        }), [
        activeCompanyName,
        currentBehavior,
        expectedBehavior,
        message,
        moduleKey,
        pathname,
        promptDraft,
        technicalContent
    ]);
    const contextSnapshot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>buildContextSnapshot({
            route: pathname || "",
            moduleKey,
            activeCompanyName,
            operationMode,
            environment,
            viewport
        }), [
        activeCompanyName,
        environment,
        moduleKey,
        operationMode,
        pathname,
        viewport
    ]);
    const currentModuleHints = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>MODULE_PROMPT_HINTS[pageContext?.moduleKey || moduleKey] || [], [
        moduleKey,
        pageContext?.moduleKey
    ]);
    const pageContextSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!pageContext) return "";
        const tags = (pageContext.tags || []).filter(Boolean).join(", ");
        const details = Object.entries(pageContext.details || {}).slice(0, 8).map(([key, value])=>`${key}: ${formatUnknown(value)}`).join(" | ");
        return [
            pageContext.summary,
            tags ? `Tags: ${tags}` : "",
            details
        ].filter(Boolean).join(" | ");
    }, [
        pageContext
    ]);
    const runtimeSignalSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>runtimeSignals.slice(0, 5).map((signal)=>[
                signal.kind.toUpperCase(),
                signal.message,
                signal.meta ? `meta: ${signal.meta}` : ""
            ].filter(Boolean).join(" | ")).join("\n"), [
        runtimeSignals
    ]);
    const externalPrompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>buildExternalPrompt(promptTarget, {
            guide: selectedGuide,
            analysisType,
            route: pathname || "",
            moduleKey,
            activeCompanyName,
            operationMode,
            environment,
            viewport,
            message,
            currentBehavior,
            expectedBehavior,
            technicalContent,
            promptDraft,
            pageContextSummary,
            runtimeSignalSummary,
            moduleHints: currentModuleHints
        }), [
        activeCompanyName,
        analysisType,
        currentBehavior,
        environment,
        expectedBehavior,
        message,
        moduleKey,
        operationMode,
        pathname,
        pageContextSummary,
        promptDraft,
        promptTarget,
        currentModuleHints,
        runtimeSignalSummary,
        selectedGuide,
        technicalContent,
        viewport
    ]);
    if (!isSystemMaster || !mounted) return null;
    async function copyText(text, successMessage) {
        try {
            await navigator.clipboard.writeText(text);
            setCopyStatus(successMessage);
        } catch  {
            setCopyStatus("Nao foi possivel copiar automaticamente.");
        }
    }
    async function runAnalysis() {
        setLoading(true);
        setError(null);
        setCopyStatus(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/tech-assistant/analyze", {
                method: "POST",
                body: JSON.stringify({
                    analysisType,
                    environment,
                    route: pathname || "",
                    module: moduleKey,
                    activeCompanyName,
                    operationMode,
                    message,
                    technicalContent: [
                        technicalContent,
                        pageContextSummary && `Contexto da pagina:\n${pageContextSummary}`
                    ].filter(Boolean).join("\n\n"),
                    expectedBehavior,
                    currentBehavior,
                    promptDraft,
                    consoleError: runtimeSignals.filter((signal)=>signal.kind === "console" || signal.kind === "window" || signal.kind === "promise").map((signal)=>`${signal.kind.toUpperCase()}: ${signal.message}${signal.meta ? ` | ${signal.meta}` : ""}`).join("\n"),
                    apiError: runtimeSignals.filter((signal)=>signal.kind === "api").map((signal)=>`${signal.message}${signal.meta ? ` | ${signal.meta}` : ""}`).join("\n")
                })
            });
            setResult(payload.response);
            setHistory((current)=>[
                    {
                        id: payload.interactionId,
                        createdAt: new Date().toISOString(),
                        title: payload.response.title,
                        response: payload.response
                    },
                    ...current
                ].slice(0, 20));
        } catch (analysisError) {
            const message = analysisError instanceof Error ? analysisError.message : "Falha ao executar análise.";
            setError(message);
        } finally{
            setLoading(false);
        }
    }
    async function loadHistory() {
        setError(null);
        try {
            const params = new URLSearchParams();
            if (masterContext?.companyId) params.set("companyId", String(masterContext.companyId));
            if (moduleKey) params.set("module", moduleKey);
            if (historyRouteFilter.trim()) params.set("route", historyRouteFilter.trim());
            if (historyAnalysisTypeFilter.trim()) params.set("analysisType", historyAnalysisTypeFilter.trim());
            const rows = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/tech-assistant/history?${params.toString()}`);
            setHistory(Array.isArray(rows) ? rows : []);
            setHistoryVisible(true);
        } catch (historyError) {
            const message = historyError instanceof Error ? historyError.message : "Falha ao carregar histórico.";
            setError(message);
        }
    }
    function clearSession() {
        setResult(null);
        setMessage("");
        setTechnicalContent("");
        setExpectedBehavior("");
        setCurrentBehavior("");
        setPromptDraft("");
        setRuntimeSignals([]);
        setError(null);
        setCopyStatus(null);
        setOperationResult(null);
        setShowPromptPreview(false);
    }
    async function confirmSensitiveOperation() {
        setError(null);
        setOperationResult(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/tech-assistant/operation/confirm-action", {
                method: "POST",
                body: JSON.stringify({
                    action: operationAction,
                    details: operationDetails,
                    confirmationText: operationConfirmationText
                })
            });
            setOperationResult(payload.message || "Confirmacao registrada com sucesso.");
            setOperationConfirmationText("");
        } catch (operationError) {
            const message = operationError instanceof Error ? operationError.message : "Falha ao confirmar operacao sensivel.";
            setError(message);
        }
    }
    const promptPreviewLabel = promptTarget === "chatgpt" ? "ChatGPT" : promptTarget === "gemini" ? "Gemini" : "Codex";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createPortal"])(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: `btn btn-primary btn-sm ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].assistantLauncher}`,
                onClick: ()=>{
                    setOpen(true);
                    setMinimized(false);
                },
                children: "Assistente Tecnico"
            }, void 0, false, {
                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                lineNumber: 775,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: `panel ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].assistantShell}`,
                "data-open": open,
                "data-minimized": minimized,
                "aria-hidden": !open,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].assistantHeader,
                        style: {
                            borderBottom: minimized ? "none" : "1px solid var(--line)"
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerRow,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerEyebrow,
                                            children: "Assistente global MASTER"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 798,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerTitle,
                                            children: "Afinador tecnico sem API externa"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 799,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerMeta,
                                            children: [
                                                "Rota: ",
                                                pathname || "-",
                                                " | Modulo: ",
                                                moduleKey,
                                                " | Modo: ",
                                                operationMode
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 800,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerMeta,
                                            children: [
                                                "Empresa ativa: ",
                                                activeCompanyName || "MASTER puro",
                                                " | Ambiente: ",
                                                environment
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 803,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 797,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            onClick: ()=>setMinimized((value)=>!value),
                                            children: minimized ? "Expandir" : "Minimizar"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 808,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            onClick: ()=>setOpen(false),
                                            children: "Fechar"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 815,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 807,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                            lineNumber: 796,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                        lineNumber: 792,
                        columnNumber: 9
                    }, this),
                    !minimized ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].assistantBody,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionStack,
                            children: [
                                error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "alert alert-error",
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 825,
                                    columnNumber: 24
                                }, this) : null,
                                copyStatus ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "alert alert-info",
                                    children: copyStatus
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 826,
                                    columnNumber: 29
                                }, this) : null,
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Problema da pagina atual"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 831,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "Digite aqui o que esta acontecendo"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 832,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 830,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scoreBadge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"][`score${briefingAssessment.tone}`]}`,
                                                    children: [
                                                        briefingAssessment.label,
                                                        " · ",
                                                        briefingAssessment.score,
                                                        "/100"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 834,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 829,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: "O contexto da tela ja foi capturado automaticamente. Aqui voce pode focar so em descrever o problema desta pagina, sem montar um prompt inteiro."
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 839,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeRow,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-brand",
                                                    children: moduleKey
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 845,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-neutral",
                                                    children: operationMode
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 846,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-neutral",
                                                    children: environment
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 847,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-neutral",
                                                    children: viewport
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 848,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 844,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: pageContext?.summary || "Contexto automatico da tela"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 852,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                "Rota atual: ",
                                                                pathname || "-"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 854,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                "Empresa ativa: ",
                                                                activeCompanyName || "MASTER puro"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 855,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                "Tipo de ajuda atual: ",
                                                                selectedGuide.title
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 856,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 853,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 851,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "Descricao do problema",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 5,
                                                    value: message,
                                                    onChange: (event)=>setMessage(event.target.value),
                                                    placeholder: "Ex.: estou na aba Messages do Recovery e nao entendi por que a tela nao mostra onde editar a mensagem. Descreva o que voce fez, onde travou e o impacto."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 862,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 860,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "O que deveria acontecer? (opcional)",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 3,
                                                    value: expectedBehavior,
                                                    onChange: (event)=>setExpectedBehavior(event.target.value),
                                                    placeholder: "Ex.: eu queria um fluxo mais claro, com o campo certo visivel e menos informacoes na tela."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 873,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 871,
                                            columnNumber: 17
                                        }, this),
                                        briefingAssessment.missing.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].missingBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Se quiser deixar a analise melhor, voce ainda pode complementar com:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 884,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: briefingAssessment.missing.slice(0, 4).map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: item
                                                        }, item, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 887,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 885,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 883,
                                            columnNumber: 19
                                        }, this) : null,
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-primary btn-sm",
                                                    onClick: ()=>{
                                                        setPromptTarget("chatgpt");
                                                        void copyText(buildExternalPrompt("chatgpt", {
                                                            guide: selectedGuide,
                                                            analysisType,
                                                            route: pathname || "",
                                                            moduleKey,
                                                            activeCompanyName,
                                                            operationMode,
                                                            environment,
                                                            viewport,
                                                            message,
                                                            currentBehavior,
                                                            expectedBehavior,
                                                            technicalContent,
                                                            promptDraft,
                                                            pageContextSummary,
                                                            runtimeSignalSummary,
                                                            moduleHints: currentModuleHints
                                                        }), "Prompt para ChatGPT copiado.");
                                                    },
                                                    children: "Copiar para ChatGPT"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 894,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>{
                                                        setPromptTarget("gemini");
                                                        void copyText(buildExternalPrompt("gemini", {
                                                            guide: selectedGuide,
                                                            analysisType,
                                                            route: pathname || "",
                                                            moduleKey,
                                                            activeCompanyName,
                                                            operationMode,
                                                            environment,
                                                            viewport,
                                                            message,
                                                            currentBehavior,
                                                            expectedBehavior,
                                                            technicalContent,
                                                            promptDraft,
                                                            pageContextSummary,
                                                            runtimeSignalSummary,
                                                            moduleHints: currentModuleHints
                                                        }), "Prompt para Gemini copiado.");
                                                    },
                                                    children: "Copiar para Gemini"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 924,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>{
                                                        setPromptTarget("codex");
                                                        void copyText(buildExternalPrompt("codex", {
                                                            guide: selectedGuide,
                                                            analysisType,
                                                            route: pathname || "",
                                                            moduleKey,
                                                            activeCompanyName,
                                                            operationMode,
                                                            environment,
                                                            viewport,
                                                            message,
                                                            currentBehavior,
                                                            expectedBehavior,
                                                            technicalContent,
                                                            promptDraft,
                                                            pageContextSummary,
                                                            runtimeSignalSummary,
                                                            moduleHints: currentModuleHints
                                                        }), "Prompt para Codex copiado.");
                                                    },
                                                    children: "Copiar para Codex"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 954,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-primary btn-sm",
                                                    onClick: runAnalysis,
                                                    disabled: loading,
                                                    children: loading ? "Analisando..." : "Executar analise HBX"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 984,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 893,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>setShowAdvanced((value)=>!value),
                                                    children: showAdvanced ? "Esconder detalhes" : "Mostrar detalhes"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 990,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>setShowPromptPreview((value)=>!value),
                                                    children: showPromptPreview ? `Esconder pacote ${promptPreviewLabel}` : `Ver pacote ${promptPreviewLabel}`
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 997,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: clearSession,
                                                    children: "Limpar sessao"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1004,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>{
                                                        if (historyVisible) {
                                                            setHistoryVisible(false);
                                                            return;
                                                        }
                                                        void loadHistory();
                                                    },
                                                    children: historyVisible ? "Ocultar historico" : "Ver historico"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1007,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                    href: "/dashboard/master/assistente-tecnico",
                                                    className: "btn btn-secondary btn-sm",
                                                    children: "Abrir central avancada"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1020,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 989,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 828,
                                    columnNumber: 15
                                }, this),
                                showAdvanced ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].contextCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Detalhes opcionais"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1030,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "Contexto, sinais tecnicos e ajustes finos"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1031,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1029,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-neutral",
                                                    children: selectedGuide.goal
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1033,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1028,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: "Abra esta area quando quiser aprofundar a analise, anexar evidencias ou ajustar o pacote que sera enviado ao ChatGPT, Gemini ou Codex."
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1036,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldGridTwo,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Tipo de analise",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: analysisType,
                                                            onChange: (event)=>setAnalysisType(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "manual",
                                                                    children: "Mensagem manual"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1049,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "page_analysis",
                                                                    children: "Analisar pagina atual"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1050,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "error_analysis",
                                                                    children: "Analisar erro"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1051,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "ctrl_u",
                                                                    children: "Ctrl+U / HTML"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1052,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "codex_prompt",
                                                                    children: "Gerar prompt para Codex"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1053,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "prompt_review",
                                                                    children: "Revisar prompt"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1054,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "pre_publish_checklist",
                                                                    children: "Checklist"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1055,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1044,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1042,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Ambiente",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: environment,
                                                            onChange: (event)=>setEnvironment(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "localhost",
                                                                    children: "localhost"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1066,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "homologacao",
                                                                    children: "homologacao"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1067,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "producao",
                                                                    children: "producao"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1068,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "desconhecido",
                                                                    children: "desconhecido"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1069,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1061,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1059,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1041,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Perguntas que o chat deve afunilar"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1075,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: selectedGuide.questions.map((question)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: question
                                                        }, question, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1078,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1076,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1074,
                                            columnNumber: 19
                                        }, this),
                                        pageContext ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Contexto da pagina"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1085,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: [
                                                        (pageContext.tags || []).slice(0, 6).map((tag)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                                children: tag
                                                            }, tag, false, {
                                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                lineNumber: 1088,
                                                                columnNumber: 27
                                                            }, this)),
                                                        Object.entries(pageContext.details || {}).slice(0, 8).map(([key, value])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                                children: [
                                                                    key,
                                                                    ": ",
                                                                    formatUnknown(value)
                                                                ]
                                                            }, key, true, {
                                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                lineNumber: 1093,
                                                                columnNumber: 29
                                                            }, this))
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1086,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1084,
                                            columnNumber: 21
                                        }, this) : null,
                                        runtimeSignals.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].warningBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Sinais automaticos recentes"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1103,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: runtimeSignals.slice(0, 5).map((signal)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                signal.kind.toUpperCase(),
                                                                ": ",
                                                                signal.message,
                                                                signal.meta ? ` | ${signal.meta}` : ""
                                                            ]
                                                        }, signal.id, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1106,
                                                            columnNumber: 27
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1104,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1102,
                                            columnNumber: 21
                                        }, this) : null,
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldGridTwo,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Comportamento atual",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                            className: "field",
                                                            rows: 4,
                                                            value: currentBehavior,
                                                            onChange: (event)=>setCurrentBehavior(event.target.value),
                                                            placeholder: "Ex.: ao salvar, a tela corta o preview e o usuario perde visibilidade dos botoes."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1118,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1116,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Comportamento esperado",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                            className: "field",
                                                            rows: 4,
                                                            value: expectedBehavior,
                                                            onChange: (event)=>setExpectedBehavior(event.target.value),
                                                            placeholder: "Ex.: editor deve usar melhor a tela, mostrar preview sem corte e manter responsividade."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1129,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1127,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1115,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "Evidencia tecnica",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 5,
                                                    value: technicalContent,
                                                    onChange: (event)=>setTechnicalContent(event.target.value),
                                                    placeholder: selectedGuide.technicalPlaceholder
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1141,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1139,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "Rascunho / prompt atual",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 4,
                                                    value: promptDraft,
                                                    onChange: (event)=>setPromptDraft(event.target.value),
                                                    placeholder: selectedGuide.draftPlaceholder
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1152,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1150,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>copyText(contextSnapshot, "Contexto automatico copiado."),
                                                    children: "Copiar contexto"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1162,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>copyText(externalPrompt, `Prompt ${promptPreviewLabel} copiado.`),
                                                    children: "Copiar prompt atual"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1169,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1161,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 1027,
                                    columnNumber: 17
                                }, this) : null,
                                showPromptPreview ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].promptCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Prompt pronto"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1184,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: [
                                                                "Pacote local para ",
                                                                promptPreviewLabel
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1185,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1183,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].providerTabs,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: promptTarget === "chatgpt" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].providerTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].providerTab,
                                                            onClick: ()=>setPromptTarget("chatgpt"),
                                                            children: "ChatGPT"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1188,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: promptTarget === "gemini" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].providerTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].providerTab,
                                                            onClick: ()=>setPromptTarget("gemini"),
                                                            children: "Gemini"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1195,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: promptTarget === "codex" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].providerTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].providerTab,
                                                            onClick: ()=>setPromptTarget("codex"),
                                                            children: "Codex"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1202,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1187,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1182,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: "Cole este pacote no chat escolhido. Para ChatGPT/Gemini, ele ja pede perguntas curtas antes de tentar resolver. Para Codex, ele sai mais objetivo para patch."
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1212,
                                            columnNumber: 17
                                        }, this),
                                        currentModuleHints.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Foco sugerido para este modulo"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1219,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: currentModuleHints.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: item
                                                        }, item, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1222,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1220,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1218,
                                            columnNumber: 19
                                        }, this) : null,
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].promptPreview,
                                            children: externalPrompt
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1228,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-secondary btn-sm",
                                                onClick: ()=>copyText(externalPrompt, `Prompt ${promptPreviewLabel} copiado.`),
                                                children: [
                                                    "Copiar pacote ",
                                                    promptPreviewLabel
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                lineNumber: 1231,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1230,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 1181,
                                    columnNumber: 17
                                }, this) : null,
                                showAdvanced ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].operationCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                        children: "Operacao sensivel"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                        lineNumber: 1246,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Registro manual com confirmacao obrigatoria"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                        lineNumber: 1247,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                lineNumber: 1245,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1244,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Acao sensivel",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: operationAction,
                                                            onChange: (event)=>setOperationAction(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "reprocessar_evento_teste",
                                                                    children: "Reprocessar evento de teste"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1258,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "validar_canal_em_producao",
                                                                    children: "Validar canal em producao"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1259,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "operacao_manual_controlada",
                                                                    children: "Operacao manual controlada"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1260,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1253,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1251,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Detalhes",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                            className: "field",
                                                            rows: 2,
                                                            value: operationDetails,
                                                            onChange: (event)=>setOperationDetails(event.target.value),
                                                            placeholder: "Descreva o motivo da acao sensivel."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1266,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1264,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Digite CONFIRMAR",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            value: operationConfirmationText,
                                                            onChange: (event)=>setOperationConfirmationText(event.target.value),
                                                            placeholder: "CONFIRMAR"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1277,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1275,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex gap-2",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        className: "btn btn-danger btn-sm",
                                                        onClick: confirmSensitiveOperation,
                                                        children: "Registrar confirmacao"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                        lineNumber: 1286,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1285,
                                                    columnNumber: 19
                                                }, this),
                                                operationResult ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].mutedText,
                                                    children: operationResult
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1290,
                                                    columnNumber: 38
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1250,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 1243,
                                    columnNumber: 17
                                }, this) : null,
                                result ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].resultCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Analise HBX"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1299,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: result.title
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1300,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1298,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-neutral",
                                                    children: result.providerLabel
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1302,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1297,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Resumo:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1304,
                                                    columnNumber: 48
                                                }, this),
                                                " ",
                                                result.blocks.summary
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1304,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Causa provavel:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1305,
                                                    columnNumber: 48
                                                }, this),
                                                " ",
                                                result.blocks.probableCause
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1305,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Risco:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1306,
                                                    columnNumber: 48
                                                }, this),
                                                " ",
                                                result.blocks.risk
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1306,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Confianca:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1307,
                                                    columnNumber: 48
                                                }, this),
                                                " ",
                                                result.diagnostic.confidence
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1307,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Proxima acao:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1308,
                                                    columnNumber: 48
                                                }, this),
                                                " ",
                                                result.diagnostic.nextAction
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1308,
                                            columnNumber: 17
                                        }, this),
                                        result.blocks.checkNow?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].listBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Conferir agora"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1312,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: result.blocks.checkNow.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: item
                                                        }, `${item}-${index}`, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1315,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1313,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1311,
                                            columnNumber: 19
                                        }, this) : null,
                                        result.nextActions?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].listBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Proximos passos"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1323,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: result.nextActions.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: item
                                                        }, `${item}-${index}`, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1326,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1324,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1322,
                                            columnNumber: 19
                                        }, this) : null,
                                        result.warnings?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].warningBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Alertas"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1334,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: result.warnings.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: item
                                                        }, `${item}-${index}`, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1337,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1335,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1333,
                                            columnNumber: 19
                                        }, this) : null,
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-secondary btn-sm",
                                                onClick: ()=>copyText(result.revisedPrompt?.trim() || result.blocks.codexPrompt, "Prompt de saida HBX copiado."),
                                                children: "Copiar prompt HBX"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                lineNumber: 1344,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1343,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 1296,
                                    columnNumber: 15
                                }, this) : null,
                                historyVisible ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                        children: "Historico recente"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                        lineNumber: 1364,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Reusar diagnosticos anteriores"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                        lineNumber: 1365,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                lineNumber: 1363,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1362,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldGridTwo,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Filtro por rota",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            value: historyRouteFilter,
                                                            onChange: (event)=>setHistoryRouteFilter(event.target.value),
                                                            placeholder: "/dashboard/inbox"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1371,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1369,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Filtro por tipo",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: historyAnalysisTypeFilter,
                                                            onChange: (event)=>setHistoryAnalysisTypeFilter(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "",
                                                                    children: "Todos"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1385,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "manual",
                                                                    children: "manual"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1386,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "page_analysis",
                                                                    children: "page_analysis"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1387,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "error_analysis",
                                                                    children: "error_analysis"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1388,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "ctrl_u",
                                                                    children: "ctrl_u"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1389,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "codex_prompt",
                                                                    children: "codex_prompt"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1390,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "prompt_review",
                                                                    children: "prompt_review"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1391,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "pre_publish_checklist",
                                                                    children: "pre_publish_checklist"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1392,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1380,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1378,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1368,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-secondary btn-sm",
                                                onClick: loadHistory,
                                                children: "Aplicar filtros"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                lineNumber: 1397,
                                                columnNumber: 21
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1396,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyList,
                                            children: history.length ? history.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyButton,
                                                    onClick: ()=>setResult(item.response),
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: item.title || "Analise"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1409,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: [
                                                                item.analysisType || "manual",
                                                                " ·",
                                                                " ",
                                                                new Date(item.createdAt).toLocaleString("pt-BR")
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1410,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, item.id, true, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1403,
                                                    columnNumber: 21
                                                }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].mutedText,
                                                children: "Sem historico."
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                lineNumber: 1415,
                                                columnNumber: 24
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1401,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 1361,
                                    columnNumber: 15
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                            lineNumber: 824,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                        lineNumber: 823,
                        columnNumber: 11
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                lineNumber: 786,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true), document.body);
}
}),
"[project]/src/components/TopBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TopBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-preferences.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ThemeSwitcher.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ModuleNav.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/TechAssistantGlobalDrawer.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
const RECOVERY_HUMAN_QUEUE_EVENT = "hbx-recovery-human-queue";
const ATENDIMENTO_HUMAN_QUEUE_EVENT = "atendimento-human-queue";
const RECOVERY_QUEUE_STORAGE_KEY = "hbxRecoveryPendingHumanCount";
const ATENDIMENTO_QUEUE_STORAGE_KEY = "atendimentoPendingHumanCount";
const hiddenRoutes = new Set([
    "/login",
    "/register",
    "/reset-password"
]);
function extractEntryNumberLabel(metadata) {
    const endpointLabel = String(metadata?.whatsappEntryEndpointLabel || "").trim();
    const displayNumber = String(metadata?.whatsappEntryDisplayNumber || "").trim();
    if (endpointLabel && displayNumber) return `${endpointLabel} (${displayNumber})`;
    if (endpointLabel) return endpointLabel;
    if (displayNumber) return displayNumber;
    return null;
}
function formatInboxPreview(conversation) {
    const latestMessage = conversation.messages?.[0];
    const content = String(latestMessage?.content || "").trim();
    if (content) return content;
    return "Nova mensagem aguardando resposta.";
}
function TopBar() {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const userMenuRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [authenticated, setAuthenticated] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [curPass, setCurPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [newPass, setNewPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [changing, setChanging] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [changeMsg, setChangeMsg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [whatsAppHealth, setWhatsAppHealth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("yellow");
    const [whatsAppHealthLabel, setWhatsAppHealthLabel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("WhatsApp status: sem validacao");
    const [recoveryPendingHumanCount, setRecoveryPendingHumanCount] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [atendimentoPendingHumanCount, setAtendimentoPendingHumanCount] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [incomingPopup, setIncomingPopup] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [masterContextModalOpen, setMasterContextModalOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [masterContextActionBusy, setMasterContextActionBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [masterContextMessage, setMasterContextMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [masterCompanyOptions, setMasterCompanyOptions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [selectedMasterCompanyId, setSelectedMasterCompanyId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [masterContextReason, setMasterContextReason] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const navScrollRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [canScrollLeft, setCanScrollLeft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [canScrollRight, setCanScrollRight] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const recoveryLastSeenRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const recoveryHumanQueueRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const recoveryAlertReadyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const atendimentoLastSeenRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const atendimentoAlertReadyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const audioContextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioArmedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    function updateScrollButtons() {
        const el = navScrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    }
    function playIncomingAlertTone() {
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const AudioContextCtor = undefined;
        const audioContext = undefined;
        const now = undefined;
        const oscillator = undefined;
        const gain = undefined;
    }
    function presentIncomingPopup(nextPopup) {
        setIncomingPopup((current)=>{
            if (current && current.id === nextPopup.id && new Date(current.lastAt).getTime() >= new Date(nextPopup.lastAt).getTime()) {
                return current;
            }
            return nextPopup;
        });
        playIncomingAlertTone();
    }
    const showWorkspaceNav = pathname.startsWith("/dashboard") || pathname.startsWith("/hbx-recovery");
    const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
    const isSystemMaster = Boolean(user?.isSystemMaster);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return new Set((modules || []).filter((m)=>m.accessible).map((m)=>m.key));
    }, [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const items = [
            {
                href: "/dashboard",
                label: "Menu",
                matcher: (route)=>route === "/dashboard"
            },
            {
                href: "/dashboard/inbox",
                label: "Atendimento",
                matcher: (route)=>route.startsWith("/dashboard/inbox") || route.startsWith("/dashboard/auto-replies") || route.startsWith("/dashboard/messages"),
                moduleKey: 'atendimento'
            },
            {
                href: "/dashboard/gerencial",
                label: "Gerencial",
                matcher: (route)=>route.startsWith("/dashboard/gerencial"),
                adminOnly: true,
                moduleKey: 'gerencial'
            },
            {
                href: "/hbx-recovery",
                label: "Recovery",
                matcher: (route)=>route.startsWith("/hbx-recovery"),
                moduleKey: "hbx_recovery"
            },
            {
                href: "/dashboard/webscraping",
                label: "Webscraping",
                matcher: (route)=>route.startsWith("/dashboard/webscraping"),
                moduleKey: 'webscraping'
            },
            {
                href: "/dashboard/website",
                label: "Website",
                matcher: (route)=>route.startsWith("/dashboard/website"),
                moduleKey: "website"
            },
            {
                href: "/dashboard/importacoes/followup-global",
                label: "Follow Up",
                matcher: (route)=>route.startsWith("/dashboard/importacoes/followup-global") || route.startsWith("/dashboard/importacoes/historico") || route.startsWith("/dashboard/importacoes/novo"),
                moduleKey: "follow_up_internacional"
            },
            {
                href: "/dashboard/importacoes/cadastros",
                label: "Cadastros",
                matcher: (route)=>route.startsWith("/dashboard/importacoes/cadastros"),
                moduleKey: "cadastros"
            },
            {
                href: "/dashboard/master",
                label: "Master",
                matcher: (route)=>route.startsWith("/dashboard/master"),
                adminOnly: true,
                moduleKey: 'master'
            }
        ];
        return items.filter((item)=>{
            if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
            if (!item.adminOnly) return true;
            if (item.href === '/dashboard/master') return isSystemMaster;
            return isAdmin;
        });
    }, [
        accessibleModules,
        isAdmin,
        isSystemMaster
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        function refreshAuthState() {
            setAuthenticated(Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])()));
        }
        refreshAuthState();
        window.addEventListener("auth-change", refreshAuthState);
        window.addEventListener("storage", refreshAuthState);
        return ()=>{
            window.removeEventListener("auth-change", refreshAuthState);
            window.removeEventListener("storage", refreshAuthState);
        };
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const armAudio = undefined;
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!authenticated) {
            setUser(null);
            setWhatsAppHealth("yellow");
            setWhatsAppHealthLabel("WhatsApp status: sem validacao");
            setRecoveryPendingHumanCount(0);
            setAtendimentoPendingHumanCount(0);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setActiveThemeUser"])(null);
            return;
        }
        let mounted = true;
        async function loadUser() {
            try {
                const [profile, myModules] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
                ]);
                if (mounted) {
                    setUser(profile);
                    setModules(myModules || []);
                }
            } catch  {
                if (mounted) {
                    setUser(null);
                    setModules([]);
                }
            }
        }
        loadUser();
        return ()=>{
            mounted = false;
        };
    }, [
        authenticated
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setActiveThemeUser"])(user?.id ?? null);
    }, [
        user?.id
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!authenticated || !user) return;
        if (user.isSystemMaster || !user.company?.id) return;
        let mounted = true;
        const applyStatus = (payload, failed = false)=>{
            if (!mounted) return;
            if (failed || !payload) {
                setWhatsAppHealth("red");
                setWhatsAppHealthLabel("WhatsApp status: erro");
                return;
            }
            const normalized = String(payload.status || "").trim().toUpperCase();
            if (normalized === "CONNECTED" && payload.connected) {
                setWhatsAppHealth("green");
                setWhatsAppHealthLabel("WhatsApp status: conectado");
                return;
            }
            if (normalized === "ERROR") {
                setWhatsAppHealth("red");
                setWhatsAppHealthLabel("WhatsApp status: erro");
                return;
            }
            setWhatsAppHealth("yellow");
            setWhatsAppHealthLabel("WhatsApp status: desconectado");
        };
        const loadStatus = async ()=>{
            try {
                const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/companies/me/whatsapp-status");
                applyStatus(payload, false);
            } catch  {
                applyStatus(null, true);
            }
        };
        loadStatus();
        const timer = window.setInterval(loadStatus, 30000);
        return ()=>{
            mounted = false;
            window.clearInterval(timer);
        };
    }, [
        authenticated,
        user?.id,
        user?.company?.id,
        user?.isSystemMaster
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!authenticated) {
            setRecoveryPendingHumanCount(0);
            setAtendimentoPendingHumanCount(0);
            return;
        }
        const applyCount = (setter, value)=>{
            const next = Number(value);
            setter(Number.isFinite(next) ? Math.max(0, Math.trunc(next)) : 0);
        };
        const readStoredCount = ()=>{
            try {
                applyCount(setRecoveryPendingHumanCount, window.localStorage.getItem(RECOVERY_QUEUE_STORAGE_KEY) || 0);
                applyCount(setAtendimentoPendingHumanCount, window.localStorage.getItem(ATENDIMENTO_QUEUE_STORAGE_KEY) || 0);
            } catch  {
                applyCount(setRecoveryPendingHumanCount, 0);
                applyCount(setAtendimentoPendingHumanCount, 0);
            }
        };
        const handleRecoveryQueueEvent = (event)=>{
            applyCount(setRecoveryPendingHumanCount, event.detail?.count ?? 0);
        };
        const handleAtendimentoQueueEvent = (event)=>{
            applyCount(setAtendimentoPendingHumanCount, event.detail?.count ?? 0);
        };
        readStoredCount();
        window.addEventListener(RECOVERY_HUMAN_QUEUE_EVENT, handleRecoveryQueueEvent);
        window.addEventListener(ATENDIMENTO_HUMAN_QUEUE_EVENT, handleAtendimentoQueueEvent);
        window.addEventListener("storage", readStoredCount);
        return ()=>{
            window.removeEventListener(RECOVERY_HUMAN_QUEUE_EVENT, handleRecoveryQueueEvent);
            window.removeEventListener(ATENDIMENTO_HUMAN_QUEUE_EVENT, handleAtendimentoQueueEvent);
            window.removeEventListener("storage", readStoredCount);
        };
    }, [
        authenticated
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!authenticated || !user || user.isSystemMaster || !user.company?.id) {
            recoveryLastSeenRef.current = new Map();
            recoveryHumanQueueRef.current = new Map();
            recoveryAlertReadyRef.current = false;
            atendimentoLastSeenRef.current = new Map();
            atendimentoAlertReadyRef.current = false;
            setIncomingPopup(null);
            return;
        }
        let cancelled = false;
        const pollIncomingAlerts = async ()=>{
            const popupCandidates = [];
            if (accessibleModules.has("hbx_recovery")) {
                try {
                    const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/hbx-recovery/interactions?queue=all");
                    if (cancelled) return;
                    setRecoveryPendingHumanCount(Number.isFinite(Number(payload?.pendingHumanCount)) ? Math.max(0, Math.trunc(Number(payload?.pendingHumanCount))) : 0);
                    const previousLastSeen = recoveryLastSeenRef.current;
                    const previousHumanQueue = recoveryHumanQueueRef.current;
                    const nextLastSeen = new Map();
                    const nextHumanQueue = new Map();
                    for (const item of Array.isArray(payload?.conversations) ? payload.conversations : []){
                        nextLastSeen.set(item.conversationId, item.lastAt);
                        nextHumanQueue.set(item.conversationId, Boolean(item.humanQueue));
                        const previousTimestamp = previousLastSeen.get(item.conversationId);
                        const previousQueued = previousHumanQueue.get(item.conversationId);
                        const isInbound = String(item.lastDirection || "").trim().toUpperCase() === "INBOUND";
                        const requiresHumanAttention = Boolean(item.humanQueue || item.humanAssigned);
                        const becameHumanQueue = Boolean(item.humanQueue) && previousQueued !== true;
                        const hasNewInbound = Boolean(previousTimestamp && isInbound && new Date(item.lastAt).getTime() > new Date(previousTimestamp).getTime());
                        const isNewConversation = !previousTimestamp && isInbound && requiresHumanAttention;
                        if (recoveryAlertReadyRef.current && !item.isClosed && !item.isBlocked && (becameHumanQueue || hasNewInbound || isNewConversation)) {
                            popupCandidates.push({
                                id: `recovery:${item.conversationId}:${item.lastAt}:${becameHumanQueue ? "human_queue" : "new_message"}`,
                                moduleLabel: "Recovery",
                                attentionLabel: becameHumanQueue ? "Fila humana" : "Nova mensagem",
                                customerLabel: item.customerName || item.customerWhatsapp || "Cliente Recovery",
                                contactPhone: item.customerWhatsapp || item.conversationWhatsapp || "-",
                                entryNumberLabel: extractEntryNumberLabel(item.metadata),
                                preview: String(item.lastMessage || "").trim() || (becameHumanQueue ? "Cliente solicitou atendimento humano." : "Nova mensagem aguardando resposta no Recovery."),
                                href: "/hbx-recovery",
                                lastAt: item.lastAt
                            });
                        }
                    }
                    recoveryLastSeenRef.current = nextLastSeen;
                    recoveryHumanQueueRef.current = nextHumanQueue;
                    recoveryAlertReadyRef.current = true;
                } catch  {
                // keep local counters when polling fails
                }
            } else {
                setRecoveryPendingHumanCount(0);
                recoveryLastSeenRef.current = new Map();
                recoveryHumanQueueRef.current = new Map();
                recoveryAlertReadyRef.current = false;
            }
            if (accessibleModules.has("atendimento")) {
                try {
                    const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/conversations");
                    if (cancelled) return;
                    const rows = Array.isArray(payload) ? payload : [];
                    const pendingRows = rows.filter((conversation)=>conversation.routeTarget === "atendimento" && !conversation.isBlocked && (conversation.status === "new" || conversation.status === "open"));
                    setAtendimentoPendingHumanCount(pendingRows.length);
                    const previousLastSeen = atendimentoLastSeenRef.current;
                    const nextLastSeen = new Map();
                    for (const conversation of pendingRows){
                        const latestMessage = conversation.messages?.[0];
                        const lastAt = String(latestMessage?.createdAt || conversation.updatedAt || "");
                        if (!lastAt) continue;
                        nextLastSeen.set(conversation.id, lastAt);
                        const previousTimestamp = previousLastSeen.get(conversation.id);
                        const isInbound = String(latestMessage?.direction || "").trim().toLowerCase() === "inbound";
                        const hasNewInbound = Boolean(previousTimestamp && isInbound && new Date(lastAt).getTime() > new Date(previousTimestamp).getTime());
                        const isNewConversation = !previousTimestamp && isInbound;
                        if (atendimentoAlertReadyRef.current && (hasNewInbound || isNewConversation)) {
                            popupCandidates.push({
                                id: `atendimento:${conversation.id}:${lastAt}`,
                                moduleLabel: "Atendimento",
                                attentionLabel: conversation.status === "open" ? "Fila humana" : "Nova mensagem",
                                customerLabel: conversation.customer.name || conversation.customer.phone || "Cliente",
                                contactPhone: conversation.customer.phone || "-",
                                entryNumberLabel: extractEntryNumberLabel(conversation.metadata),
                                preview: formatInboxPreview(conversation),
                                href: "/dashboard/inbox",
                                lastAt
                            });
                        }
                    }
                    atendimentoLastSeenRef.current = nextLastSeen;
                    atendimentoAlertReadyRef.current = true;
                } catch  {
                // keep local counters when polling fails
                }
            } else {
                setAtendimentoPendingHumanCount(0);
                atendimentoLastSeenRef.current = new Map();
                atendimentoAlertReadyRef.current = false;
            }
            const newestPopup = [
                ...popupCandidates
            ].sort((left, right)=>new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime())[0];
            if (newestPopup) {
                presentIncomingPopup(newestPopup);
            }
        };
        void pollIncomingAlerts();
        const timer = window.setInterval(()=>{
            void pollIncomingAlerts();
        }, 15000);
        return ()=>{
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [
        authenticated,
        accessibleModules,
        user
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setOpen(false);
    }, [
        pathname
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        // initialize scroll button visibility after items load
        const el = navScrollRef.current;
        if (!el) return;
        const onResize = ()=>updateScrollButtons();
        updateScrollButtons();
        window.addEventListener('resize', onResize);
        el.addEventListener('transitionend', updateScrollButtons);
        return ()=>{
            window.removeEventListener('resize', onResize);
            el.removeEventListener('transitionend', updateScrollButtons);
        };
    }, [
        navItems.length
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        function handleOutsideClick(event) {
            if (!userMenuRef.current) return;
            if (!(event.target instanceof Node)) return;
            if (!userMenuRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return ()=>{
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, []);
    function handleLogout() {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearToken"])();
        setAuthenticated(false);
        setUser(null);
        router.push("/login");
    }
    async function openMasterContextModal() {
        setMasterContextMessage(null);
        setMasterContextModalOpen(true);
        if (masterCompanyOptions.length) return;
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/master/companies");
            const normalized = (Array.isArray(payload) ? payload : []).map((item)=>({
                    id: Number(item?.id || 0),
                    name: String(item?.name || `Empresa ${item?.id || ""}`),
                    isActive: Boolean(item?.isActive),
                    paymentStatus: String(item?.paymentStatus || "PENDING")
                })).filter((item)=>item.id > 0);
            setMasterCompanyOptions(normalized);
            if (normalized[0] && !selectedMasterCompanyId) {
                setSelectedMasterCompanyId(String(normalized[0].id));
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao carregar empresas.";
            setMasterContextMessage(message);
        }
    }
    async function assumeMasterContext() {
        const companyId = Number(selectedMasterCompanyId || 0);
        if (!companyId) {
            setMasterContextMessage("Selecione uma empresa para assumir contexto.");
            return;
        }
        setMasterContextActionBusy(true);
        setMasterContextMessage(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/master-context/assume", {
                method: "POST",
                body: JSON.stringify({
                    companyId,
                    reason: masterContextReason || undefined
                })
            });
            const [profile, myModules] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
            ]);
            setUser(profile);
            setModules(myModules || []);
            setMasterContextModalOpen(false);
            setMasterContextReason("");
            // reload to ensure all modules and routes update for the new context
            window.location.reload();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao assumir contexto da empresa.";
            setMasterContextMessage(message);
        } finally{
            setMasterContextActionBusy(false);
        }
    }
    async function exitMasterContext() {
        setMasterContextActionBusy(true);
        setMasterContextMessage(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/master-context/exit", {
                method: "POST",
                body: JSON.stringify({
                    reason: "manual_exit"
                })
            });
            const [profile, myModules] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
            ]);
            setUser(profile);
            setModules(myModules || []);
            setMasterContextModalOpen(false);
            setMasterContextReason("");
            // reload to refresh available modules after exiting context
            window.location.reload();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao sair do contexto assumido.";
            setMasterContextMessage(message);
        } finally{
            setMasterContextActionBusy(false);
        }
    }
    async function handlePasswordSubmit(event) {
        event.preventDefault();
        setChanging(true);
        setChangeMsg(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/password", {
                method: "PATCH",
                body: JSON.stringify({
                    currentPassword: curPass,
                    newPassword: newPass
                })
            });
            setChangeMsg("Senha atualizada com sucesso.");
            setCurPass("");
            setNewPass("");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao atualizar senha.";
            setChangeMsg(message);
        } finally{
            setChanging(false);
        }
    }
    const pendingHumanCount = recoveryPendingHumanCount + atendimentoPendingHumanCount;
    const queueLabel = pendingHumanCount > 0 ? `Atendimento: ${atendimentoPendingHumanCount} | Recovery: ${recoveryPendingHumanCount}` : null;
    if (hiddenRoutes.has(pathname)) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "app-topbar",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "app-topbar__frame",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "app-topbar__inner",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "app-topbar__left",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: authenticated ? "/dashboard" : "/login",
                                    className: "app-brand",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-brand__mark",
                                            children: "HB"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 805,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-brand__body",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-brand__text",
                                                    children: "HBX Control Center"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 807,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-brand__context",
                                                    children: authenticated ? user?.isSystemMaster ? user.masterContext?.active ? `MASTER em ${user.masterContext.companyName || "Empresa"}` : "MASTER GLOBAL" : user?.company?.name || "Operacao sem empresa" : "Plataforma operacional HBX"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 808,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 806,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 804,
                                    columnNumber: 13
                                }, this),
                                authenticated && user && !user.isSystemMaster && user.company?.id ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "app-topbar__signals",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `wa-health-wrap ${atendimentoPendingHumanCount > 0 ? "wa-health-wrap--alert" : ""}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `wa-health wa-health--${whatsAppHealth}`,
                                                    title: `Atendimento: ${atendimentoPendingHumanCount}`,
                                                    "aria-label": `Atendimento: ${atendimentoPendingHumanCount}`,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                        viewBox: "0 0 24 24",
                                                        "aria-hidden": "true",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                            d: "M19.1 4.9A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 19.1 4.9Zm-7.1 15.4a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.2c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1-.1.2-.5.7-.6.8-.1.1-.2.1-.4 0s-.9-.3-1.7-1a6.4 6.4 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.3.2-.3c.1-.1.1-.3 0-.4L10.4 8c-.1-.2-.3-.2-.4-.2h-.4c-.1 0-.4.1-.5.3-.2.2-.7.7-.7 1.6 0 1 .7 1.9.8 2 .1.1 1.3 2 3.2 2.8.5.2.9.4 1.2.5.5.1 1 .1 1.4.1.4-.1 1.2-.5 1.4-1 .2-.6.2-1 .1-1.1 0-.1-.2-.1-.4-.2Z"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 829,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TopBar.tsx",
                                                        lineNumber: 828,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 823,
                                                    columnNumber: 19
                                                }, this),
                                                atendimentoPendingHumanCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "wa-health__queue-badge",
                                                    "aria-hidden": "true",
                                                    children: atendimentoPendingHumanCount
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 833,
                                                    columnNumber: 21
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 822,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `wa-health-wrap ${recoveryPendingHumanCount > 0 ? "wa-health-wrap--alert" : ""}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `wa-health wa-health--${whatsAppHealth}`,
                                                    title: `Recovery: ${recoveryPendingHumanCount}`,
                                                    "aria-label": `Recovery: ${recoveryPendingHumanCount}`,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                        viewBox: "0 0 24 24",
                                                        "aria-hidden": "true",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                            d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 14.5V18h-2v-1.5A4 4 0 1 1 13 16.5z"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 846,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TopBar.tsx",
                                                        lineNumber: 845,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 840,
                                                    columnNumber: 19
                                                }, this),
                                                recoveryPendingHumanCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "wa-health__queue-badge",
                                                    "aria-hidden": "true",
                                                    children: recoveryPendingHumanCount
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 850,
                                                    columnNumber: 21
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 839,
                                            columnNumber: 17
                                        }, this),
                                        queueLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-topbar__queueLabel",
                                            children: queueLabel
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 856,
                                            columnNumber: 31
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 821,
                                    columnNumber: 15
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 803,
                            columnNumber: 11
                        }, this),
                        authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "app-topbar__center",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                inHeader: true
                            }, void 0, false, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 863,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 862,
                            columnNumber: 13
                        }, this) : null,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "app-topbar__right",
                            children: [
                                authenticated && user?.isSystemMaster ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: openMasterContextModal,
                                    children: "Contexto"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 869,
                                    columnNumber: 15
                                }, this) : null,
                                authenticated && user?.isSystemMaster && user.masterContext?.active ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: exitMasterContext,
                                    disabled: masterContextActionBusy,
                                    children: "Sair contexto"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 874,
                                    columnNumber: 15
                                }, this) : null,
                                authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    storageUserId: user?.id ?? null
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 883,
                                    columnNumber: 30
                                }, this) : null,
                                user ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    ref: userMenuRef,
                                    className: "app-user",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "app-user__trigger",
                                            onClick: ()=>setOpen((value)=>!value),
                                            "aria-expanded": open,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-user__avatar",
                                                    children: user.username ? user.username.charAt(0).toUpperCase() : "U"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 892,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-user__meta",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "app-user__name",
                                                            children: user.username
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 896,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "app-user__company",
                                                            children: user.isSystemMaster ? user.masterContext?.active ? `MASTER em ${user.masterContext.companyName || "Empresa"}` : "MASTER" : user.company?.name ?? "Sem empresa"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 897,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 895,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 886,
                                            columnNumber: 15
                                        }, this),
                                        open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "app-user__menu",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "app-user__menu-title",
                                                    children: "Editar senha"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 909,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                                    onSubmit: handlePasswordSubmit,
                                                    className: "app-user__form",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            type: "password",
                                                            placeholder: "Senha atual",
                                                            value: curPass,
                                                            onChange: (event)=>setCurPass(event.target.value),
                                                            className: "field"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 911,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            type: "password",
                                                            placeholder: "Nova senha (min. 4)",
                                                            value: newPass,
                                                            onChange: (event)=>setNewPass(event.target.value),
                                                            className: "field"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 918,
                                                            columnNumber: 21
                                                        }, this),
                                                        changeMsg ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-(--muted) leading-5",
                                                            children: changeMsg
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 926,
                                                            columnNumber: 23
                                                        }, this) : null,
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "app-user__menu-actions",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "submit",
                                                                    className: "btn btn-primary btn-sm",
                                                                    disabled: changing || newPass.length < 4,
                                                                    children: changing ? "Salvando..." : "Salvar senha"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                                    lineNumber: 929,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    className: "btn btn-secondary btn-sm",
                                                                    onClick: ()=>setOpen(false),
                                                                    children: "Fechar"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                                    lineNumber: 936,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 928,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 910,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 908,
                                            columnNumber: 17
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 885,
                                    columnNumber: 13
                                }, this) : null,
                                authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: handleLogout,
                                    className: "btn btn-secondary btn-sm",
                                    children: "Sair"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 951,
                                    columnNumber: 13
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/login",
                                    className: "btn btn-secondary btn-sm",
                                    children: "Entrar"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 955,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 867,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/TopBar.tsx",
                    lineNumber: 802,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 801,
                columnNumber: 7
            }, this),
            incomingPopup ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed right-4 top-19 z-90 w-[min(360px,calc(100vw-2rem))] rounded-[18px] border border-(--line) bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start justify-between gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-[11px] uppercase tracking-[0.18em] text-[#0b4a7a]",
                                        children: incomingPopup.moduleLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/TopBar.tsx",
                                        lineNumber: 966,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-sm font-semibold text-slate-900",
                                        children: incomingPopup.attentionLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/TopBar.tsx",
                                        lineNumber: 969,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-sm text-slate-700",
                                        children: incomingPopup.customerLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/TopBar.tsx",
                                        lineNumber: 972,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 965,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-secondary btn-sm",
                                onClick: ()=>setIncomingPopup(null),
                                children: "Fechar"
                            }, void 0, false, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 976,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 964,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-3 space-y-1 text-xs text-slate-600",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                children: [
                                    "Contato: ",
                                    incomingPopup.contactPhone
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 986,
                                columnNumber: 13
                            }, this),
                            incomingPopup.entryNumberLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                children: [
                                    "Recebido em: ",
                                    incomingPopup.entryNumberLabel
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 988,
                                columnNumber: 15
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 985,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700",
                        children: incomingPopup.preview
                    }, void 0, false, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 992,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-3 flex gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: incomingPopup.href,
                                className: "btn btn-primary btn-sm",
                                onClick: ()=>setIncomingPopup(null),
                                children: "Abrir modulo"
                            }, void 0, false, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 997,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-secondary btn-sm",
                                onClick: ()=>setIncomingPopup(null),
                                children: "Dispensar"
                            }, void 0, false, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 1004,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 996,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 963,
                columnNumber: 9
            }, this) : null,
            masterContextModalOpen && authenticated && user?.isSystemMaster ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    position: "fixed",
                    inset: 0,
                    zIndex: 150,
                    background: "rgba(6, 19, 38, 0.42)",
                    display: "grid",
                    placeItems: "center",
                    padding: "16px"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "panel",
                    style: {
                        width: "min(620px, 100%)",
                        padding: 16
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-start justify-between gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs uppercase tracking-[0.12em] text-muted",
                                            children: "Suporte interno MASTER"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1030,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "mt-1 text-lg font-semibold",
                                            children: "Assumir contexto da empresa"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1031,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1029,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: ()=>setMasterContextModalOpen(false),
                                    children: "Fechar"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1033,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 1028,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-4 grid gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "grid gap-1 text-sm",
                                    children: [
                                        "Empresa",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            className: "field",
                                            value: selectedMasterCompanyId,
                                            onChange: (event)=>setSelectedMasterCompanyId(event.target.value),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "",
                                                    children: "Selecione..."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 1046,
                                                    columnNumber: 19
                                                }, this),
                                                masterCompanyOptions.map((company)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: String(company.id),
                                                        children: [
                                                            company.name,
                                                            " | ",
                                                            company.isActive ? "ativa" : "inativa",
                                                            " | ",
                                                            company.paymentStatus
                                                        ]
                                                    }, company.id, true, {
                                                        fileName: "[project]/src/components/TopBar.tsx",
                                                        lineNumber: 1048,
                                                        columnNumber: 21
                                                    }, this))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1041,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1039,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "grid gap-1 text-sm",
                                    children: [
                                        "Motivo (opcional)",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                            className: "field",
                                            rows: 3,
                                            value: masterContextReason,
                                            onChange: (event)=>setMasterContextReason(event.target.value),
                                            placeholder: "Ex.: diagnostico de webhook Meta para empresa X"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1057,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1055,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-primary btn-sm",
                                            onClick: assumeMasterContext,
                                            disabled: masterContextActionBusy,
                                            children: masterContextActionBusy ? "Aplicando..." : "Assumir contexto"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1067,
                                            columnNumber: 17
                                        }, this),
                                        user.masterContext?.active ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            onClick: exitMasterContext,
                                            disabled: masterContextActionBusy,
                                            children: "Sair do contexto atual"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1076,
                                            columnNumber: 19
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1066,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 1038,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/TopBar.tsx",
                    lineNumber: 1027,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 1016,
                columnNumber: 9
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                isSystemMaster: Boolean(user?.isSystemMaster),
                masterContext: user?.masterContext || null
            }, void 0, false, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 1091,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/TopBar.tsx",
        lineNumber: 800,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/ThemeInit.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThemeInit
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/design-tokens.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-preferences.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function ThemeInit() {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyThemeSelectionToDocument"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["readStoredThemeSelection"])());
        const syncTheme = (event)=>{
            if (event.key && !event.key.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_ID_STORAGE_KEY"]) && !event.key.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_THEME_MODE_STORAGE_KEY"]) && event.key !== "theme" && event.key !== "theme-mode") {
                return;
            }
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyThemeSelectionToDocument"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["readStoredThemeSelection"])());
        };
        window.addEventListener("storage", syncTheme);
        return ()=>{
            window.removeEventListener("storage", syncTheme);
        };
    }, []);
    return null;
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__910795e2._.js.map
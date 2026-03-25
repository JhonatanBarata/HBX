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
"[project]/frontend/src/components/PageTransition.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PageTransition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/navigation.js [app-ssr] (ecmascript)");
"use client";
;
;
function PageTransition({ children }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "route-transition",
        children: children
    }, pathname, false, {
        fileName: "[project]/frontend/src/components/PageTransition.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
}),
"[project]/frontend/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
        throw new Error(message);
    }
    return data;
}
}),
"[project]/frontend/src/lib/hbx-window-system.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HBX_INTENSITY_DEFAULT",
    ()=>HBX_INTENSITY_DEFAULT,
    "HBX_WINDOW_STANDARD",
    ()=>HBX_WINDOW_STANDARD,
    "buildHbxIntensityStorageKey",
    ()=>buildHbxIntensityStorageKey,
    "isHbxWindowStandardResizeHandle",
    ()=>isHbxWindowStandardResizeHandle
]);
const HBX_WINDOW_STANDARD = {
    version: "2026-03-14",
    owner: "HBX Recovery",
    designIntent: "module-standard",
    resizeHandles: [
        "n",
        "s",
        "e",
        "w",
        "ne",
        "nw",
        "se",
        "sw"
    ],
    minimumSize: {
        width: 280,
        height: 220
    },
    borderRadius: 22,
    borderColor: "color-mix(in srgb, var(--line) 88%, white)",
    background: "radial-gradient(circle at top left, rgba(255,255,255,0.92), transparent 42%), linear-gradient(180deg, #ffffff, #f8fbff 72%, #f3f7fb)",
    shadow: {
        whiteHalo: "0 0 0 10px rgba(255, 255, 255, 1), 0 0 38px 14px rgba(255, 255, 255, 1)",
        depth: "0 34px 80px -36px rgba(15, 23, 42, 0.72), 0 22px 42px -28px rgba(15, 23, 42, 0.46)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.92)"
    },
    motion: {
        enterMs: 240,
        exitMs: 170,
        enterEasing: "cubic-bezier(0.22, 1, 0.36, 1)",
        exitEasing: "cubic-bezier(0.4, 0, 1, 1)",
        enterFrom: {
            opacity: 0,
            translateY: 16,
            scale: 0.988,
            blur: 8
        },
        exitTo: {
            opacity: 0,
            translateY: -10,
            scale: 0.992,
            blur: 6
        }
    },
    organizer: {
        compactCardsPerRowMin: 6,
        darkBackdrop: "rgba(9, 15, 27, 0.58)",
        showGripButton: true
    },
    preview: {
        renderMode: "portal-fixed",
        zIndex: 90,
        keepAboveWorkspace: true
    }
};
const HBX_INTENSITY_DEFAULT = 0;
function buildHbxIntensityStorageKey(userId) {
    const suffix = String(userId || "anonymous").trim() || "anonymous";
    return `hbx:intensity:${suffix}`;
}
function isHbxWindowStandardResizeHandle(value) {
    return HBX_WINDOW_STANDARD.resizeHandles.includes(value);
}
}),
"[project]/frontend/src/lib/theme-preferences.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ACTIVE_THEME_USER_STORAGE_KEY",
    ()=>ACTIVE_THEME_USER_STORAGE_KEY,
    "DEFAULT_THEME_STRENGTH",
    ()=>DEFAULT_THEME_STRENGTH,
    "clampThemeStrength",
    ()=>clampThemeStrength,
    "persistThemeStrength",
    ()=>persistThemeStrength,
    "readStoredThemeStrength",
    ()=>readStoredThemeStrength,
    "setActiveThemeUser",
    ()=>setActiveThemeUser
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$hbx$2d$window$2d$system$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/lib/hbx-window-system.ts [app-ssr] (ecmascript)");
;
const ACTIVE_THEME_USER_STORAGE_KEY = "hbx:active-user-id";
const DEFAULT_THEME_STRENGTH = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$hbx$2d$window$2d$system$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HBX_INTENSITY_DEFAULT"];
function clampThemeStrength(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return DEFAULT_THEME_STRENGTH;
    return Math.max(0, Math.min(100, Math.round(numericValue)));
}
function setActiveThemeUser(userId) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function readStoredThemeStrength() {
    if ("TURBOPACK compile-time truthy", 1) return DEFAULT_THEME_STRENGTH;
    //TURBOPACK unreachable
    ;
}
function persistThemeStrength(value, userId) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
    const safeStrength = undefined;
}
}),
"[project]/frontend/src/components/ThemeSwitcher.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThemeSwitcher
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const options = [
    {
        id: "primary",
        label: "Corporate"
    },
    {
        id: "secondary",
        label: "Ocean"
    },
    {
        id: "neutral",
        label: "Slate"
    },
    {
        id: "pink",
        label: "Pink"
    }
];
const DEFAULT_THEME_ID = "primary";
const THEME_PALETTES = {
    primary: {
        light: {
            brand: "#0b4f8a",
            background: "#edf2f8",
            backgroundAlt: "#e1e9f3",
            surface: "#ffffff",
            surfaceSoft: "#f4f8ff",
            foreground: "#0f172a",
            muted: "#475569",
            line: "#d9e3ef"
        },
        dark: {
            brand: "#5aa2ff",
            background: "#07111d",
            backgroundAlt: "#0b1727",
            surface: "#0e1d31",
            surfaceSoft: "#12243a",
            foreground: "#edf4ff",
            muted: "#9ab0ca",
            line: "#1e3652"
        }
    },
    secondary: {
        light: {
            brand: "#0f766e",
            background: "#ebf5f4",
            backgroundAlt: "#dcedea",
            surface: "#ffffff",
            surfaceSoft: "#f1fbf9",
            foreground: "#0f172a",
            muted: "#3f4b5b",
            line: "#d2e5e2"
        },
        dark: {
            brand: "#35d2c4",
            background: "#051412",
            backgroundAlt: "#0a1c1a",
            surface: "#0d2421",
            surfaceSoft: "#12302c",
            foreground: "#ecfffb",
            muted: "#95bbb5",
            line: "#1b4843"
        }
    },
    neutral: {
        light: {
            brand: "#334155",
            background: "#eef1f5",
            backgroundAlt: "#e0e5ec",
            surface: "#ffffff",
            surfaceSoft: "#f6f8fb",
            foreground: "#0f172a",
            muted: "#4b5563",
            line: "#d8dee8"
        },
        dark: {
            brand: "#b6c2d1",
            background: "#0a0f16",
            backgroundAlt: "#111926",
            surface: "#151f2d",
            surfaceSoft: "#1a2737",
            foreground: "#f1f5f9",
            muted: "#9aa6b2",
            line: "#253243"
        }
    },
    pink: {
        light: {
            brand: "#d946b7",
            background: "#fdf0f8",
            backgroundAlt: "#f8e1f1",
            surface: "#ffffff",
            surfaceSoft: "#fff5fb",
            foreground: "#2a1324",
            muted: "#7a4f6f",
            line: "#efcfe4"
        },
        dark: {
            brand: "#ff8de1",
            background: "#170613",
            backgroundAlt: "#220b1b",
            surface: "#2b1022",
            surfaceSoft: "#38152d",
            foreground: "#fff1fb",
            muted: "#d2a8c6",
            line: "#5c264b"
        }
    }
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
function mixHexColors(fromHex, toHex, ratio) {
    const from = hexToRgb(fromHex);
    const to = hexToRgb(toHex);
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const channel = (fromValue, toValue)=>Math.round(fromValue + (toValue - fromValue) * safeRatio).toString(16).padStart(2, "0");
    return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}
function applyThemePalette(id, nextStrength) {
    const palette = THEME_PALETTES[id] || THEME_PALETTES[DEFAULT_THEME_ID];
    const ratio = Math.max(0, Math.min(100, nextStrength)) / 100;
    const root = document.documentElement.style;
    root.setProperty("--brand", mixHexColors(palette.light.brand, palette.dark.brand, ratio));
    root.setProperty("--brand-solid", mixHexColors(palette.light.brand, palette.dark.brand, ratio));
    root.setProperty("--background", mixHexColors(palette.light.background, palette.dark.background, ratio));
    root.setProperty("--background-alt", mixHexColors(palette.light.backgroundAlt, palette.dark.backgroundAlt, ratio));
    root.setProperty("--surface", mixHexColors(palette.light.surface, palette.dark.surface, ratio));
    root.setProperty("--surface-soft", mixHexColors(palette.light.surfaceSoft, palette.dark.surfaceSoft, ratio));
    root.setProperty("--foreground", mixHexColors(palette.light.foreground, palette.dark.foreground, ratio));
    root.setProperty("--muted", mixHexColors(palette.light.muted, palette.dark.muted, ratio));
    root.setProperty("--line", mixHexColors(palette.light.line, palette.dark.line, ratio));
    root.setProperty("--brand-contrast", ratio >= 0.58 ? "#06111d" : "#f8fafc");
}
function ThemeSwitcher({ storageUserId }) {
    const [current, setCurrent] = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useState(DEFAULT_THEME_ID);
    const [mode, setMode] = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useState('light');
    function applyTheme(id, nextMode) {
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const value = undefined;
    }
    function setTheme(id) {
        // if selecting a new theme, default to dark mode; if clicking same, toggle
        const nextMode = current === id ? mode === 'dark' ? 'light' : 'dark' : 'dark';
        applyTheme(id, nextMode);
        setCurrent(id);
        setMode(nextMode);
        try {
            localStorage.setItem("theme", id);
        } catch  {}
    }
    __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useEffect(()=>{
        try {
            const stored = localStorage.getItem("theme") ?? document.documentElement.getAttribute("data-theme") ?? DEFAULT_THEME_ID;
            const storedMode = localStorage.getItem('theme-mode') || document.documentElement.getAttribute('data-theme-mode') || 'light';
            applyTheme(stored, storedMode);
            setCurrent(stored);
            setMode(storedMode);
        } catch  {
        // ignore
        }
    }, [
        storageUserId
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "theme-switcher-wrap",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "theme-switcher",
            role: "group",
            "aria-label": "Tema visual",
            children: options.map((option)=>{
                const active = current === option.id;
                const displayLabel = active ? mode === 'dark' ? 'Dark' : 'Light' : option.label;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    onClick: ()=>setTheme(option.id),
                    className: `theme-chip ${active ? "is-active" : ""}`,
                    "aria-pressed": active,
                    children: displayLabel
                }, option.id, false, {
                    fileName: "[project]/frontend/src/components/ThemeSwitcher.tsx",
                    lineNumber: 233,
                    columnNumber: 13
                }, this);
            })
        }, void 0, false, {
            fileName: "[project]/frontend/src/components/ThemeSwitcher.tsx",
            lineNumber: 228,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/frontend/src/components/ThemeSwitcher.tsx",
        lineNumber: 227,
        columnNumber: 5
    }, this);
}
}),
"[project]/frontend/src/components/ModuleNav.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "heroTab": "ModuleNav-module__AoTWxW__heroTab",
  "heroTabActive": "ModuleNav-module__AoTWxW__heroTabActive",
  "heroTabGroup": "ModuleNav-module__AoTWxW__heroTabGroup",
  "moduleNavContainer": "ModuleNav-module__AoTWxW__moduleNavContainer",
  "moduleNavHeader": "ModuleNav-module__AoTWxW__moduleNavHeader",
  "moduleNavWrap": "ModuleNav-module__AoTWxW__moduleNavWrap",
  "navScrollBtn": "ModuleNav-module__AoTWxW__navScrollBtn",
});
}),
"[project]/frontend/src/components/ModuleNav.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ModuleNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/frontend/src/components/ModuleNav.module.css [app-ssr] (css module)");
"use client";
;
;
;
;
;
;
function ModuleNav({ inHeader = false }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const authenticated = Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])());
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [userRole, setUserRole] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isSystemMaster, setIsSystemMaster] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const navScrollRef = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const [canScrollLeft, setCanScrollLeft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [canScrollRight, setCanScrollRight] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    // Keep CSS var for topbar total height in sync with the actual header height.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let mounted = true;
        if (!authenticated) return;
        (async ()=>{
            try {
                const [myModules, profile] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])('/modules/me'),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])('/profile/current-user').catch(()=>null)
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
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
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Set((modules || []).filter((m)=>m.accessible).map((m)=>m.key)), [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
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
                label: "HBX Recovery",
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: [
            __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavWrap,
            inHeader ? __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavHeader : ''
        ].filter(Boolean).join(' '),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavContainer,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].navScrollBtn,
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
                    fileName: "[project]/frontend/src/components/ModuleNav.tsx",
                    lineNumber: 166,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTabGroup,
                    role: "tablist",
                    "aria-label": "Navegacao de modulos",
                    ref: navScrollRef,
                    children: navItems.map((item)=>{
                        const active = item.matcher(pathname || '');
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: item.href,
                            className: active ? __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTab,
                            "aria-current": active ? 'page' : undefined,
                            children: item.label
                        }, item.href, false, {
                            fileName: "[project]/frontend/src/components/ModuleNav.tsx",
                            lineNumber: 188,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/frontend/src/components/ModuleNav.tsx",
                    lineNumber: 179,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].navScrollBtn,
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
                    fileName: "[project]/frontend/src/components/ModuleNav.tsx",
                    lineNumber: 200,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/frontend/src/components/ModuleNav.tsx",
            lineNumber: 165,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/frontend/src/components/ModuleNav.tsx",
        lineNumber: 164,
        columnNumber: 5
    }, this);
}
}),
"[project]/frontend/src/components/TopBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TopBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/lib/theme-preferences.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/components/ThemeSwitcher.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/components/ModuleNav.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
const hiddenRoutes = new Set([
    "/login",
    "/register",
    "/reset-password"
]);
function TopBar() {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const userMenuRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [authenticated, setAuthenticated] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [curPass, setCurPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [newPass, setNewPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [changing, setChanging] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [changeMsg, setChangeMsg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [whatsAppHealth, setWhatsAppHealth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("yellow");
    const [whatsAppHealthLabel, setWhatsAppHealthLabel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("WhatsApp status: sem validacao");
    const navScrollRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [canScrollLeft, setCanScrollLeft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [canScrollRight, setCanScrollRight] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    function updateScrollButtons() {
        const el = navScrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    }
    const showWorkspaceNav = pathname.startsWith("/dashboard") || pathname.startsWith("/hbx-recovery");
    const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
    const isSystemMaster = Boolean(user?.isSystemMaster);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return new Set((modules || []).filter((m)=>m.accessible).map((m)=>m.key));
    }, [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
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
                label: "HBX Recovery",
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        function refreshAuthState() {
            setAuthenticated(Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])()));
        }
        refreshAuthState();
        window.addEventListener("auth-change", refreshAuthState);
        window.addEventListener("storage", refreshAuthState);
        return ()=>{
            window.removeEventListener("auth-change", refreshAuthState);
            window.removeEventListener("storage", refreshAuthState);
        };
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!authenticated) {
            setUser(null);
            setWhatsAppHealth("yellow");
            setWhatsAppHealthLabel("WhatsApp status: sem validacao");
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setActiveThemeUser"])(null);
            return;
        }
        let mounted = true;
        async function loadUser() {
            try {
                const [profile, myModules] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setActiveThemeUser"])(user?.id ?? null);
    }, [
        user?.id
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
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
                const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/companies/me/whatsapp-status");
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setOpen(false);
    }, [
        pathname
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
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
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearToken"])();
        setAuthenticated(false);
        setUser(null);
        router.push("/login");
    }
    async function handlePasswordSubmit(event) {
        event.preventDefault();
        setChanging(true);
        setChangeMsg(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/password", {
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
    if (hiddenRoutes.has(pathname)) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "app-topbar",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "app-topbar__inner",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "app-topbar__left",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: authenticated ? "/dashboard" : "/login",
                        className: "app-brand",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "app-brand__mark",
                                children: "HB"
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/components/TopBar.tsx",
                                lineNumber: 319,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "app-brand__text",
                                children: "HBX Solutions"
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/components/TopBar.tsx",
                                lineNumber: 320,
                                columnNumber: 13
                            }, this),
                            authenticated && user && !user.isSystemMaster && user.company?.id ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `wa-health wa-health--${whatsAppHealth}`,
                                title: whatsAppHealthLabel,
                                "aria-label": whatsAppHealthLabel,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: "0 0 24 24",
                                    "aria-hidden": "true",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M19.1 4.9A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 19.1 4.9Zm-7.1 15.4a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.2c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1-.1.2-.5.7-.6.8-.1.1-.2.1-.4 0s-.9-.3-1.7-1a6.4 6.4 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.3.2-.3c.1-.1.1-.3 0-.4L10.4 8c-.1-.2-.3-.2-.4-.2h-.4c-.1 0-.4.1-.5.3-.2.2-.7.7-.7 1.6 0 1 .7 1.9.8 2 .1.1 1.3 2 3.2 2.8.5.2.9.4 1.2.5.5.1 1 .1 1.4.1.4-.1 1.2-.5 1.4-1 .2-.6.2-1 .1-1.1 0-.1-.2-.1-.4-.2Z"
                                    }, void 0, false, {
                                        fileName: "[project]/frontend/src/components/TopBar.tsx",
                                        lineNumber: 328,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                    lineNumber: 327,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/components/TopBar.tsx",
                                lineNumber: 322,
                                columnNumber: 15
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/frontend/src/components/TopBar.tsx",
                        lineNumber: 318,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                    lineNumber: 317,
                    columnNumber: 9
                }, this),
                authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        marginLeft: '6px'
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        inHeader: true
                    }, void 0, false, {
                        fileName: "[project]/frontend/src/components/TopBar.tsx",
                        lineNumber: 337,
                        columnNumber: 15
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                    lineNumber: 336,
                    columnNumber: 13
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "app-topbar__right",
                    children: [
                        authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            storageUserId: user?.id ?? null
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                            lineNumber: 342,
                            columnNumber: 28
                        }, this) : null,
                        user ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            ref: userMenuRef,
                            className: "app-user",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "app-user__trigger",
                                    onClick: ()=>setOpen((value)=>!value),
                                    "aria-expanded": open,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-user__avatar",
                                            children: user.username ? user.username.charAt(0).toUpperCase() : "U"
                                        }, void 0, false, {
                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                            lineNumber: 351,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-user__meta",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-user__name",
                                                    children: user.username
                                                }, void 0, false, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 355,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-user__company",
                                                    children: user.isSystemMaster ? "MASTER" : user.company?.name ?? "Sem empresa"
                                                }, void 0, false, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 356,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                            lineNumber: 354,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                    lineNumber: 345,
                                    columnNumber: 15
                                }, this),
                                open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "app-user__menu",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "app-user__menu-title",
                                            children: "Editar senha"
                                        }, void 0, false, {
                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                            lineNumber: 362,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                            onSubmit: handlePasswordSubmit,
                                            className: "app-user__form",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "password",
                                                    placeholder: "Senha atual",
                                                    value: curPass,
                                                    onChange: (event)=>setCurPass(event.target.value),
                                                    className: "field"
                                                }, void 0, false, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 364,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "password",
                                                    placeholder: "Nova senha (min. 4)",
                                                    value: newPass,
                                                    onChange: (event)=>setNewPass(event.target.value),
                                                    className: "field"
                                                }, void 0, false, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 371,
                                                    columnNumber: 21
                                                }, this),
                                                changeMsg ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs text-[var(--muted)] leading-5",
                                                    children: changeMsg
                                                }, void 0, false, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 379,
                                                    columnNumber: 23
                                                }, this) : null,
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "app-user__menu-actions",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "submit",
                                                            className: "btn btn-primary btn-sm",
                                                            disabled: changing || newPass.length < 4,
                                                            children: changing ? "Salvando..." : "Salvar senha"
                                                        }, void 0, false, {
                                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                            lineNumber: 382,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-secondary btn-sm",
                                                            onClick: ()=>setOpen(false),
                                                            children: "Fechar"
                                                        }, void 0, false, {
                                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                            lineNumber: 389,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 381,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                            lineNumber: 363,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                    lineNumber: 361,
                                    columnNumber: 17
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                            lineNumber: 344,
                            columnNumber: 13
                        }, this) : null,
                        authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: handleLogout,
                            className: "btn btn-secondary btn-sm",
                            children: "Sair"
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                            lineNumber: 404,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: "/login",
                            className: "btn btn-secondary btn-sm",
                            children: "Entrar"
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                            lineNumber: 408,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                    lineNumber: 341,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/frontend/src/components/TopBar.tsx",
            lineNumber: 316,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/frontend/src/components/TopBar.tsx",
        lineNumber: 315,
        columnNumber: 5
    }, this);
}
}),
"[project]/frontend/src/components/ThemeInit.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThemeInit
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/lib/theme-preferences.ts [app-ssr] (ecmascript)");
"use client";
;
;
const THEME_PALETTES = {
    primary: {
        light: {
            brand: "#0b4f8a",
            background: "#edf2f8",
            backgroundAlt: "#e1e9f3",
            surface: "#ffffff",
            surfaceSoft: "#f4f8ff",
            foreground: "#0f172a",
            muted: "#475569",
            line: "#d9e3ef"
        },
        dark: {
            brand: "#5aa2ff",
            background: "#07111d",
            backgroundAlt: "#0b1727",
            surface: "#0e1d31",
            surfaceSoft: "#12243a",
            foreground: "#edf4ff",
            muted: "#9ab0ca",
            line: "#1e3652"
        }
    },
    secondary: {
        light: {
            brand: "#0f766e",
            background: "#ebf5f4",
            backgroundAlt: "#dcedea",
            surface: "#ffffff",
            surfaceSoft: "#f1fbf9",
            foreground: "#0f172a",
            muted: "#3f4b5b",
            line: "#d2e5e2"
        },
        dark: {
            brand: "#35d2c4",
            background: "#051412",
            backgroundAlt: "#0a1c1a",
            surface: "#0d2421",
            surfaceSoft: "#12302c",
            foreground: "#ecfffb",
            muted: "#95bbb5",
            line: "#1b4843"
        }
    },
    neutral: {
        light: {
            brand: "#334155",
            background: "#eef1f5",
            backgroundAlt: "#e0e5ec",
            surface: "#ffffff",
            surfaceSoft: "#f6f8fb",
            foreground: "#0f172a",
            muted: "#4b5563",
            line: "#d8dee8"
        },
        dark: {
            brand: "#b6c2d1",
            background: "#0a0f16",
            backgroundAlt: "#111926",
            surface: "#151f2d",
            surfaceSoft: "#1a2737",
            foreground: "#f1f5f9",
            muted: "#9aa6b2",
            line: "#253243"
        }
    },
    pink: {
        light: {
            brand: "#d946b7",
            background: "#fdf0f8",
            backgroundAlt: "#f8e1f1",
            surface: "#ffffff",
            surfaceSoft: "#fff5fb",
            foreground: "#2a1324",
            muted: "#7a4f6f",
            line: "#efcfe4"
        },
        dark: {
            brand: "#ff8de1",
            background: "#170613",
            backgroundAlt: "#220b1b",
            surface: "#2b1022",
            surfaceSoft: "#38152d",
            foreground: "#fff1fb",
            muted: "#d2a8c6",
            line: "#5c264b"
        }
    }
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
function mixHexColors(fromHex, toHex, ratio) {
    const from = hexToRgb(fromHex);
    const to = hexToRgb(toHex);
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const channel = (fromValue, toValue)=>Math.round(fromValue + (toValue - fromValue) * safeRatio).toString(16).padStart(2, "0");
    return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}
function applyThemePalette(id, nextStrength) {
    const palette = THEME_PALETTES[id] || THEME_PALETTES.primary;
    const ratio = Math.max(0, Math.min(100, nextStrength)) / 100;
    const root = document.documentElement.style;
    root.setProperty("--brand", mixHexColors(palette.light.brand, palette.dark.brand, ratio));
    root.setProperty("--brand-solid", mixHexColors(palette.light.brand, palette.dark.brand, ratio));
    root.setProperty("--background", mixHexColors(palette.light.background, palette.dark.background, ratio));
    root.setProperty("--background-alt", mixHexColors(palette.light.backgroundAlt, palette.dark.backgroundAlt, ratio));
    root.setProperty("--surface", mixHexColors(palette.light.surface, palette.dark.surface, ratio));
    root.setProperty("--surface-soft", mixHexColors(palette.light.surfaceSoft, palette.dark.surfaceSoft, ratio));
    root.setProperty("--foreground", mixHexColors(palette.light.foreground, palette.dark.foreground, ratio));
    root.setProperty("--muted", mixHexColors(palette.light.muted, palette.dark.muted, ratio));
    root.setProperty("--line", mixHexColors(palette.light.line, palette.dark.line, ratio));
    root.setProperty("--brand-contrast", ratio >= 0.58 ? "#06111d" : "#f8fafc");
}
function ThemeInit() {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        try {
            const stored = localStorage.getItem("theme");
            const themeId = stored || "primary";
            const safeStrength = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clampThemeStrength"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["readStoredThemeStrength"])());
            if (stored) {
                document.documentElement.setAttribute("data-theme", stored);
            } else {
                document.documentElement.setAttribute("data-theme", "primary");
            }
            applyThemePalette(themeId, safeStrength);
            document.documentElement.style.setProperty("--theme-strength-pct", `${safeStrength}%`);
        } catch  {
        // ignore
        }
    }, []);
    return null;
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__75b1b078._.js.map
(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/frontend/src/components/PageTransition.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PageTransition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/navigation.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function PageTransition({ children }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "route-transition",
        children: children
    }, pathname, false, {
        fileName: "[project]/frontend/src/components/PageTransition.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
_s(PageTransition, "xbyQPtUVMO7MNj7WjJlpdWqRcTo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = PageTransition;
var _c;
__turbopack_context__.k.register(_c, "PageTransition");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
"use client";
const API_URL = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
function isApiErrorPayload(value) {
    return Boolean(value) && typeof value === "object";
}
function getToken() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return localStorage.getItem("token") || localStorage.getItem("access_token") || localStorage.getItem("accessToken");
}
function setToken(token) {
    localStorage.setItem("token", token);
    if ("TURBOPACK compile-time truthy", 1) {
        try {
            window.dispatchEvent(new Event("auth-change"));
        } catch  {
        // ignore event dispatch errors
        }
    }
}
function clearToken() {
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("accessToken");
    if ("TURBOPACK compile-time truthy", 1) {
        try {
            window.dispatchEvent(new Event("auth-change"));
        } catch  {
        // ignore event dispatch errors
        }
    }
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/src/lib/hbx-window-system.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/src/lib/theme-preferences.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$hbx$2d$window$2d$system$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/lib/hbx-window-system.ts [app-client] (ecmascript)");
;
const ACTIVE_THEME_USER_STORAGE_KEY = "hbx:active-user-id";
const DEFAULT_THEME_STRENGTH = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$hbx$2d$window$2d$system$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HBX_INTENSITY_DEFAULT"];
function clampThemeStrength(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return DEFAULT_THEME_STRENGTH;
    return Math.max(0, Math.min(100, Math.round(numericValue)));
}
function setActiveThemeUser(userId) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        const normalized = String(userId || "").trim();
        if (normalized) {
            localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, normalized);
            return;
        }
        localStorage.removeItem(ACTIVE_THEME_USER_STORAGE_KEY);
    } catch  {
    // ignore storage errors
    }
}
function readStoredThemeStrength() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        const activeUserId = localStorage.getItem(ACTIVE_THEME_USER_STORAGE_KEY);
        if (activeUserId) {
            const userSpecificValue = localStorage.getItem((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$hbx$2d$window$2d$system$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildHbxIntensityStorageKey"])(activeUserId));
            if (userSpecificValue !== null) return clampThemeStrength(userSpecificValue);
        }
        const globalValue = localStorage.getItem("theme-strength");
        if (globalValue !== null) return clampThemeStrength(globalValue);
    } catch  {
    // ignore storage errors
    }
    return DEFAULT_THEME_STRENGTH;
}
function persistThemeStrength(value, userId) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const safeStrength = clampThemeStrength(value);
    try {
        localStorage.setItem("theme-strength", String(safeStrength));
        const normalized = String(userId || "").trim();
        if (normalized) {
            localStorage.setItem((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$hbx$2d$window$2d$system$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildHbxIntensityStorageKey"])(normalized), String(safeStrength));
            localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, normalized);
        }
    } catch  {
    // ignore storage errors
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/src/components/ThemeSwitcher.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThemeSwitcher
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
    _s();
    const [current, setCurrent] = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState(DEFAULT_THEME_ID);
    const [mode, setMode] = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState('light');
    function applyTheme(id, nextMode) {
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        document.documentElement.setAttribute("data-theme", id);
        const value = nextMode === 'dark' ? 100 : 0;
        applyThemePalette(id, value);
        document.documentElement.style.setProperty("--theme-strength-pct", `${value}%`);
        document.documentElement.setAttribute('data-theme-mode', nextMode);
        try {
            localStorage.setItem('theme-mode', nextMode);
        } catch  {}
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
    __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "ThemeSwitcher.useEffect": ()=>{
            try {
                const stored = localStorage.getItem("theme") ?? document.documentElement.getAttribute("data-theme") ?? DEFAULT_THEME_ID;
                const storedMode = localStorage.getItem('theme-mode') || document.documentElement.getAttribute('data-theme-mode') || 'light';
                applyTheme(stored, storedMode);
                setCurrent(stored);
                setMode(storedMode);
            } catch  {
            // ignore
            }
        }
    }["ThemeSwitcher.useEffect"], [
        storageUserId
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "theme-switcher-wrap",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "theme-switcher",
            role: "group",
            "aria-label": "Tema visual",
            children: options.map((option)=>{
                const active = current === option.id;
                const displayLabel = active ? mode === 'dark' ? 'Dark' : 'Light' : option.label;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
_s(ThemeSwitcher, "FqpNk5fJoLBUild7ebIdzD+C6N8=");
_c = ThemeSwitcher;
var _c;
__turbopack_context__.k.register(_c, "ThemeSwitcher");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/src/components/ModuleNav.module.css [app-client] (css module)", ((__turbopack_context__) => {

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
"[project]/frontend/src/components/ModuleNav.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ModuleNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/frontend/src/components/ModuleNav.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function ModuleNav({ inHeader = false }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const authenticated = Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getToken"])());
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [userRole, setUserRole] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isSystemMaster, setIsSystemMaster] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const navScrollRef = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const [canScrollLeft, setCanScrollLeft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [canScrollRight, setCanScrollRight] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    // Keep CSS var for topbar total height in sync with the actual header height.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ModuleNav.useEffect": ()=>{
            const root = document.documentElement;
            const topbar = document.querySelector('.app-topbar');
            if (!topbar || !root) return;
            const setVar = {
                "ModuleNav.useEffect.setVar": ()=>{
                    const rect = topbar.getBoundingClientRect();
                    // use the header's full rendered height (px)
                    root.style.setProperty('--topbar-total-height', `${Math.ceil(rect.height)}px`);
                }
            }["ModuleNav.useEffect.setVar"];
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
            return ({
                "ModuleNav.useEffect": ()=>{
                    if (ro) ro.disconnect();
                    window.removeEventListener('resize', setVar);
                }
            })["ModuleNav.useEffect"];
        }
    }["ModuleNav.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ModuleNav.useEffect": ()=>{
            let mounted = true;
            if (!authenticated) return;
            ({
                "ModuleNav.useEffect": async ()=>{
                    try {
                        const [myModules, profile] = await Promise.all([
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])('/modules/me'),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])('/profile/current-user').catch({
                                "ModuleNav.useEffect": ()=>null
                            }["ModuleNav.useEffect"])
                        ]);
                        if (!mounted) return;
                        setModules(myModules || []);
                        setUserRole(String(profile?.role || null));
                        setIsSystemMaster(Boolean(profile?.isSystemMaster));
                    } catch (e) {
                    // ignore
                    }
                }
            })["ModuleNav.useEffect"]();
            return ({
                "ModuleNav.useEffect": ()=>{
                    mounted = false;
                }
            })["ModuleNav.useEffect"];
        }
    }["ModuleNav.useEffect"], [
        authenticated
    ]);
    function updateScrollButtons() {
        const el = navScrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ModuleNav.useEffect": ()=>{
            const el = navScrollRef.current;
            if (!el) return;
            const stableEl = el;
            updateScrollButtons();
            const onScroll = {
                "ModuleNav.useEffect.onScroll": ()=>updateScrollButtons()
            }["ModuleNav.useEffect.onScroll"];
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
            return ({
                "ModuleNav.useEffect": ()=>{
                    window.removeEventListener('resize', updateScrollButtons);
                    stableEl.removeEventListener('scroll', onScroll);
                    if (inHeader) {
                        stableEl.removeEventListener('pointerdown', onPointerDown);
                        window.removeEventListener('pointermove', onPointerMove);
                        window.removeEventListener('pointerup', onPointerUp);
                    }
                }
            })["ModuleNav.useEffect"];
        }
    }["ModuleNav.useEffect"], [
        navScrollRef.current
    ]);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ModuleNav.useMemo[accessibleModules]": ()=>new Set((modules || []).filter({
                "ModuleNav.useMemo[accessibleModules]": (m)=>m.accessible
            }["ModuleNav.useMemo[accessibleModules]"]).map({
                "ModuleNav.useMemo[accessibleModules]": (m)=>m.key
            }["ModuleNav.useMemo[accessibleModules]"]))
    }["ModuleNav.useMemo[accessibleModules]"], [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ModuleNav.useMemo[navItems]": ()=>{
            const items = [
                {
                    href: "/dashboard",
                    label: "Menu",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r === "/dashboard"
                    }["ModuleNav.useMemo[navItems]"]
                },
                {
                    href: "/dashboard/inbox",
                    label: "Atendimento",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/dashboard/inbox') || r.startsWith('/dashboard/auto-replies') || r.startsWith('/dashboard/messages')
                    }["ModuleNav.useMemo[navItems]"],
                    moduleKey: 'atendimento'
                },
                {
                    href: "/dashboard/gerencial",
                    label: "Gerencial",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/dashboard/gerencial')
                    }["ModuleNav.useMemo[navItems]"],
                    adminOnly: true,
                    moduleKey: 'gerencial'
                },
                {
                    href: "/hbx-recovery",
                    label: "HBX Recovery",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/hbx-recovery')
                    }["ModuleNav.useMemo[navItems]"],
                    moduleKey: 'hbx_recovery'
                },
                {
                    href: "/dashboard/webscraping",
                    label: "Webscraping",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/dashboard/webscraping')
                    }["ModuleNav.useMemo[navItems]"],
                    moduleKey: 'webscraping'
                },
                {
                    href: "/dashboard/website",
                    label: "Website",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/dashboard/website')
                    }["ModuleNav.useMemo[navItems]"],
                    moduleKey: 'website'
                },
                {
                    href: "/dashboard/importacoes/followup-global",
                    label: "Follow Up",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/dashboard/importacoes/followup-global') || r.startsWith('/dashboard/importacoes/historico') || r.startsWith('/dashboard/importacoes/novo')
                    }["ModuleNav.useMemo[navItems]"],
                    moduleKey: 'follow_up_internacional'
                },
                {
                    href: "/dashboard/importacoes/cadastros",
                    label: "Cadastros",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/dashboard/importacoes/cadastros')
                    }["ModuleNav.useMemo[navItems]"],
                    moduleKey: 'cadastros'
                },
                {
                    href: "/dashboard/master",
                    label: "Master",
                    matcher: {
                        "ModuleNav.useMemo[navItems]": (r)=>r.startsWith('/dashboard/master')
                    }["ModuleNav.useMemo[navItems]"],
                    adminOnly: true,
                    moduleKey: 'master'
                }
            ];
            // If modules haven't loaded yet (modules length === 0), show the full nav
            const showAllUntilLoaded = Array.isArray(modules) && modules.length === 0;
            return items.filter({
                "ModuleNav.useMemo[navItems]": (item)=>{
                    if (!showAllUntilLoaded) {
                        if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
                        if (!item.adminOnly) return true;
                        if (item.href === "/dashboard/master") return isSystemMaster;
                        return String(userRole || "").toUpperCase() === "ADMIN";
                    }
                    // modules not loaded yet: show everything (helps initial render)
                    return true;
                }
            }["ModuleNav.useMemo[navItems]"]);
        }
    }["ModuleNav.useMemo[navItems]"], [
        accessibleModules,
        userRole,
        isSystemMaster
    ]);
    // Always render the module navigation so it appears on all pages.
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: [
            __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleNavWrap,
            inHeader ? __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleNavHeader : ''
        ].filter(Boolean).join(' '),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleNavContainer,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].navScrollBtn,
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].heroTabGroup,
                    role: "tablist",
                    "aria-label": "Navegacao de modulos",
                    ref: navScrollRef,
                    children: navItems.map((item)=>{
                        const active = item.matcher(pathname || '');
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: item.href,
                            className: active ? __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].heroTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].heroTab,
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].navScrollBtn,
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
_s(ModuleNav, "ZeWuoRfEEiF2RbWzIyMyVKtsGRY=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = ModuleNav;
var _c;
__turbopack_context__.k.register(_c, "ModuleNav");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/src/components/TopBar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TopBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/lib/theme-preferences.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/components/ThemeSwitcher.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/components/ModuleNav.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const userMenuRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [authenticated, setAuthenticated] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [curPass, setCurPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [newPass, setNewPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [changing, setChanging] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [changeMsg, setChangeMsg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [whatsAppHealth, setWhatsAppHealth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("yellow");
    const [whatsAppHealthLabel, setWhatsAppHealthLabel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("WhatsApp status: sem validacao");
    const navScrollRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [canScrollLeft, setCanScrollLeft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [canScrollRight, setCanScrollRight] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    function updateScrollButtons() {
        const el = navScrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    }
    const showWorkspaceNav = pathname.startsWith("/dashboard") || pathname.startsWith("/hbx-recovery");
    const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
    const isSystemMaster = Boolean(user?.isSystemMaster);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TopBar.useMemo[accessibleModules]": ()=>{
            return new Set((modules || []).filter({
                "TopBar.useMemo[accessibleModules]": (m)=>m.accessible
            }["TopBar.useMemo[accessibleModules]"]).map({
                "TopBar.useMemo[accessibleModules]": (m)=>m.key
            }["TopBar.useMemo[accessibleModules]"]));
        }
    }["TopBar.useMemo[accessibleModules]"], [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TopBar.useMemo[navItems]": ()=>{
            const items = [
                {
                    href: "/dashboard",
                    label: "Menu",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route === "/dashboard"
                    }["TopBar.useMemo[navItems]"]
                },
                {
                    href: "/dashboard/inbox",
                    label: "Atendimento",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/dashboard/inbox") || route.startsWith("/dashboard/auto-replies") || route.startsWith("/dashboard/messages")
                    }["TopBar.useMemo[navItems]"],
                    moduleKey: 'atendimento'
                },
                {
                    href: "/dashboard/gerencial",
                    label: "Gerencial",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/dashboard/gerencial")
                    }["TopBar.useMemo[navItems]"],
                    adminOnly: true,
                    moduleKey: 'gerencial'
                },
                {
                    href: "/hbx-recovery",
                    label: "HBX Recovery",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/hbx-recovery")
                    }["TopBar.useMemo[navItems]"],
                    moduleKey: "hbx_recovery"
                },
                {
                    href: "/dashboard/webscraping",
                    label: "Webscraping",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/dashboard/webscraping")
                    }["TopBar.useMemo[navItems]"],
                    moduleKey: 'webscraping'
                },
                {
                    href: "/dashboard/website",
                    label: "Website",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/dashboard/website")
                    }["TopBar.useMemo[navItems]"],
                    moduleKey: "website"
                },
                {
                    href: "/dashboard/importacoes/followup-global",
                    label: "Follow Up",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/dashboard/importacoes/followup-global") || route.startsWith("/dashboard/importacoes/historico") || route.startsWith("/dashboard/importacoes/novo")
                    }["TopBar.useMemo[navItems]"],
                    moduleKey: "follow_up_internacional"
                },
                {
                    href: "/dashboard/importacoes/cadastros",
                    label: "Cadastros",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/dashboard/importacoes/cadastros")
                    }["TopBar.useMemo[navItems]"],
                    moduleKey: "cadastros"
                },
                {
                    href: "/dashboard/master",
                    label: "Master",
                    matcher: {
                        "TopBar.useMemo[navItems]": (route)=>route.startsWith("/dashboard/master")
                    }["TopBar.useMemo[navItems]"],
                    adminOnly: true,
                    moduleKey: 'master'
                }
            ];
            return items.filter({
                "TopBar.useMemo[navItems]": (item)=>{
                    if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
                    if (!item.adminOnly) return true;
                    if (item.href === '/dashboard/master') return isSystemMaster;
                    return isAdmin;
                }
            }["TopBar.useMemo[navItems]"]);
        }
    }["TopBar.useMemo[navItems]"], [
        accessibleModules,
        isAdmin,
        isSystemMaster
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            function refreshAuthState() {
                setAuthenticated(Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getToken"])()));
            }
            refreshAuthState();
            window.addEventListener("auth-change", refreshAuthState);
            window.addEventListener("storage", refreshAuthState);
            return ({
                "TopBar.useEffect": ()=>{
                    window.removeEventListener("auth-change", refreshAuthState);
                    window.removeEventListener("storage", refreshAuthState);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            if (!authenticated) {
                setUser(null);
                setWhatsAppHealth("yellow");
                setWhatsAppHealthLabel("WhatsApp status: sem validacao");
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["setActiveThemeUser"])(null);
                return;
            }
            let mounted = true;
            async function loadUser() {
                try {
                    const [profile, myModules] = await Promise.all([
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
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
            return ({
                "TopBar.useEffect": ()=>{
                    mounted = false;
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], [
        authenticated
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["setActiveThemeUser"])(user?.id ?? null);
        }
    }["TopBar.useEffect"], [
        user?.id
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            if (!authenticated || !user) return;
            if (user.isSystemMaster || !user.company?.id) return;
            let mounted = true;
            const applyStatus = {
                "TopBar.useEffect.applyStatus": (payload, failed = false)=>{
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
                }
            }["TopBar.useEffect.applyStatus"];
            const loadStatus = {
                "TopBar.useEffect.loadStatus": async ()=>{
                    try {
                        const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/companies/me/whatsapp-status");
                        applyStatus(payload, false);
                    } catch  {
                        applyStatus(null, true);
                    }
                }
            }["TopBar.useEffect.loadStatus"];
            loadStatus();
            const timer = window.setInterval(loadStatus, 30000);
            return ({
                "TopBar.useEffect": ()=>{
                    mounted = false;
                    window.clearInterval(timer);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], [
        authenticated,
        user?.id,
        user?.company?.id,
        user?.isSystemMaster
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            setOpen(false);
        }
    }["TopBar.useEffect"], [
        pathname
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            // initialize scroll button visibility after items load
            const el = navScrollRef.current;
            if (!el) return;
            const onResize = {
                "TopBar.useEffect.onResize": ()=>updateScrollButtons()
            }["TopBar.useEffect.onResize"];
            updateScrollButtons();
            window.addEventListener('resize', onResize);
            el.addEventListener('transitionend', updateScrollButtons);
            return ({
                "TopBar.useEffect": ()=>{
                    window.removeEventListener('resize', onResize);
                    el.removeEventListener('transitionend', updateScrollButtons);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], [
        navItems.length
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            function handleOutsideClick(event) {
                if (!userMenuRef.current) return;
                if (!(event.target instanceof Node)) return;
                if (!userMenuRef.current.contains(event.target)) {
                    setOpen(false);
                }
            }
            document.addEventListener("mousedown", handleOutsideClick);
            return ({
                "TopBar.useEffect": ()=>{
                    document.removeEventListener("mousedown", handleOutsideClick);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], []);
    function handleLogout() {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clearToken"])();
        setAuthenticated(false);
        setUser(null);
        router.push("/login");
    }
    async function handlePasswordSubmit(event) {
        event.preventDefault();
        setChanging(true);
        setChangeMsg(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/password", {
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "app-topbar",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "app-topbar__inner",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "app-topbar__left",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: authenticated ? "/dashboard" : "/login",
                        className: "app-brand",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "app-brand__mark",
                                children: "HB"
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/components/TopBar.tsx",
                                lineNumber: 319,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "app-brand__text",
                                children: "HBX Solutions"
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/components/TopBar.tsx",
                                lineNumber: 320,
                                columnNumber: 13
                            }, this),
                            authenticated && user && !user.isSystemMaster && user.company?.id ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `wa-health wa-health--${whatsAppHealth}`,
                                title: whatsAppHealthLabel,
                                "aria-label": whatsAppHealthLabel,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: "0 0 24 24",
                                    "aria-hidden": "true",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
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
                authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        marginLeft: '6px'
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "app-topbar__right",
                    children: [
                        authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            storageUserId: user?.id ?? null
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                            lineNumber: 342,
                            columnNumber: 28
                        }, this) : null,
                        user ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            ref: userMenuRef,
                            className: "app-user",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "app-user__trigger",
                                    onClick: ()=>setOpen((value)=>!value),
                                    "aria-expanded": open,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-user__avatar",
                                            children: user.username ? user.username.charAt(0).toUpperCase() : "U"
                                        }, void 0, false, {
                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                            lineNumber: 351,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-user__meta",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-user__name",
                                                    children: user.username
                                                }, void 0, false, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 355,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "app-user__menu",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "app-user__menu-title",
                                            children: "Editar senha"
                                        }, void 0, false, {
                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                            lineNumber: 362,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                            onSubmit: handlePasswordSubmit,
                                            className: "app-user__form",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
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
                                                changeMsg ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs text-[var(--muted)] leading-5",
                                                    children: changeMsg
                                                }, void 0, false, {
                                                    fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                    lineNumber: 379,
                                                    columnNumber: 23
                                                }, this) : null,
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "app-user__menu-actions",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "submit",
                                                            className: "btn btn-primary btn-sm",
                                                            disabled: changing || newPass.length < 4,
                                                            children: changing ? "Salvando..." : "Salvar senha"
                                                        }, void 0, false, {
                                                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                                                            lineNumber: 382,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                        authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: handleLogout,
                            className: "btn btn-secondary btn-sm",
                            children: "Sair"
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/components/TopBar.tsx",
                            lineNumber: 404,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
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
_s(TopBar, "Txz9Hw7/WQLvr7SynL5qrbQfzvc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = TopBar;
var _c;
__turbopack_context__.k.register(_c, "TopBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/src/components/ThemeInit.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThemeInit
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/lib/theme-preferences.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
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
    _s();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ThemeInit.useEffect": ()=>{
            try {
                const stored = localStorage.getItem("theme");
                const themeId = stored || "primary";
                const safeStrength = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clampThemeStrength"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStoredThemeStrength"])());
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
        }
    }["ThemeInit.useEffect"], []);
    return null;
}
_s(ThemeInit, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c = ThemeInit;
var _c;
__turbopack_context__.k.register(_c, "ThemeInit");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/frontend/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
/**
 * @license React
 * react-jsx-dev-runtime.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ "use strict";
"production" !== ("TURBOPACK compile-time value", "development") && function() {
    function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch(type){
            case REACT_FRAGMENT_TYPE:
                return "Fragment";
            case REACT_PROFILER_TYPE:
                return "Profiler";
            case REACT_STRICT_MODE_TYPE:
                return "StrictMode";
            case REACT_SUSPENSE_TYPE:
                return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
                return "SuspenseList";
            case REACT_ACTIVITY_TYPE:
                return "Activity";
            case REACT_VIEW_TRANSITION_TYPE:
                return "ViewTransition";
        }
        if ("object" === typeof type) switch("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof){
            case REACT_PORTAL_TYPE:
                return "Portal";
            case REACT_CONTEXT_TYPE:
                return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
                return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
                var innerType = type.render;
                type = type.displayName;
                type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
                return type;
            case REACT_MEMO_TYPE:
                return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
                innerType = type._payload;
                type = type._init;
                try {
                    return getComponentNameFromType(type(innerType));
                } catch (x) {}
        }
        return null;
    }
    function testStringCoercion(value) {
        return "" + value;
    }
    function checkKeyStringCoercion(value) {
        try {
            testStringCoercion(value);
            var JSCompiler_inline_result = !1;
        } catch (e) {
            JSCompiler_inline_result = !0;
        }
        if (JSCompiler_inline_result) {
            JSCompiler_inline_result = console;
            var JSCompiler_temp_const = JSCompiler_inline_result.error;
            var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
            return testStringCoercion(value);
        }
    }
    function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
        try {
            var name = getComponentNameFromType(type);
            return name ? "<" + name + ">" : "<...>";
        } catch (x) {
            return "<...>";
        }
    }
    function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
    }
    function UnknownOwner() {
        return Error("react-stack-top-frame");
    }
    function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
            var getter = Object.getOwnPropertyDescriptor(config, "key").get;
            if (getter && getter.isReactWarning) return !1;
        }
        return void 0 !== config.key;
    }
    function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
            specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
        }
        warnAboutAccessingKey.isReactWarning = !0;
        Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: !0
        });
    }
    function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
    }
    function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: type,
            key: key,
            props: props,
            _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
            enumerable: !1,
            get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", {
            enumerable: !1,
            value: null
        });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: null
        });
        Object.defineProperty(type, "_debugStack", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
    }
    function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children) if (isStaticChildren) if (isArrayImpl(children)) {
            for(isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)validateChildKeys(children[isStaticChildren]);
            Object.freeze && Object.freeze(children);
        } else console.error("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
        else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
            children = getComponentNameFromType(type);
            var keys = Object.keys(config).filter(function(k) {
                return "key" !== k;
            });
            isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
            didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error('A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />', isStaticChildren, children, keys, children), didWarnAboutKeySpread[children + isStaticChildren] = !0);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
            maybeKey = {};
            for(var propName in config)"key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(maybeKey, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
        return ReactElement(type, children, maybeKey, getOwner(), debugStack, debugTask);
    }
    function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
    }
    function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    var React = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)"), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
    };
    React = {
        react_stack_bottom_frame: function(callStackForError) {
            return callStackForError();
        }
    };
    var specialPropKeyWarningShown;
    var didWarnAboutElementRef = {};
    var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(React, UnknownOwner)();
    var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
    var didWarnAboutKeySpread = {};
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsxDEV = function(type, config, maybeKey, isStaticChildren) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        if (trackActualOwner) {
            var previousStackTraceLimit = Error.stackTraceLimit;
            Error.stackTraceLimit = 10;
            var debugStackDEV = Error("react-stack-top-frame");
            Error.stackTraceLimit = previousStackTraceLimit;
        } else debugStackDEV = unknownOwnerDebugStack;
        return jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStackDEV, trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
    };
}();
}),
"[project]/frontend/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
'use strict';
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
else {
    module.exports = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)");
}
}),
"[project]/frontend/node_modules/next/navigation.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/client/components/navigation.js [app-client] (ecmascript)");
}),
"[project]/frontend/node_modules/next/dist/shared/lib/router/utils/querystring.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    assign: null,
    searchParamsToUrlQuery: null,
    urlQueryToSearchParams: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    assign: function() {
        return assign;
    },
    searchParamsToUrlQuery: function() {
        return searchParamsToUrlQuery;
    },
    urlQueryToSearchParams: function() {
        return urlQueryToSearchParams;
    }
});
function searchParamsToUrlQuery(searchParams) {
    const query = {};
    for (const [key, value] of searchParams.entries()){
        const existing = query[key];
        if (typeof existing === 'undefined') {
            query[key] = value;
        } else if (Array.isArray(existing)) {
            existing.push(value);
        } else {
            query[key] = [
                existing,
                value
            ];
        }
    }
    return query;
}
function stringifyUrlQueryParam(param) {
    if (typeof param === 'string') {
        return param;
    }
    if (typeof param === 'number' && !isNaN(param) || typeof param === 'boolean') {
        return String(param);
    } else {
        return '';
    }
}
function urlQueryToSearchParams(query) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)){
        if (Array.isArray(value)) {
            for (const item of value){
                searchParams.append(key, stringifyUrlQueryParam(item));
            }
        } else {
            searchParams.set(key, stringifyUrlQueryParam(value));
        }
    }
    return searchParams;
}
function assign(target, ...searchParamsList) {
    for (const searchParams of searchParamsList){
        for (const key of searchParams.keys()){
            target.delete(key);
        }
        for (const [key, value] of searchParams.entries()){
            target.append(key, value);
        }
    }
    return target;
} //# sourceMappingURL=querystring.js.map
}),
"[project]/frontend/node_modules/next/dist/shared/lib/router/utils/format-url.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
// Format function modified from nodejs
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    formatUrl: null,
    formatWithValidation: null,
    urlObjectKeys: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    formatUrl: function() {
        return formatUrl;
    },
    formatWithValidation: function() {
        return formatWithValidation;
    },
    urlObjectKeys: function() {
        return urlObjectKeys;
    }
});
const _interop_require_wildcard = __turbopack_context__.r("[project]/frontend/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-client] (ecmascript)");
const _querystring = /*#__PURE__*/ _interop_require_wildcard._(__turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/router/utils/querystring.js [app-client] (ecmascript)"));
const slashedProtocols = /https?|ftp|gopher|file/;
function formatUrl(urlObj) {
    let { auth, hostname } = urlObj;
    let protocol = urlObj.protocol || '';
    let pathname = urlObj.pathname || '';
    let hash = urlObj.hash || '';
    let query = urlObj.query || '';
    let host = false;
    auth = auth ? encodeURIComponent(auth).replace(/%3A/i, ':') + '@' : '';
    if (urlObj.host) {
        host = auth + urlObj.host;
    } else if (hostname) {
        host = auth + (~hostname.indexOf(':') ? `[${hostname}]` : hostname);
        if (urlObj.port) {
            host += ':' + urlObj.port;
        }
    }
    if (query && typeof query === 'object') {
        query = String(_querystring.urlQueryToSearchParams(query));
    }
    let search = urlObj.search || query && `?${query}` || '';
    if (protocol && !protocol.endsWith(':')) protocol += ':';
    if (urlObj.slashes || (!protocol || slashedProtocols.test(protocol)) && host !== false) {
        host = '//' + (host || '');
        if (pathname && pathname[0] !== '/') pathname = '/' + pathname;
    } else if (!host) {
        host = '';
    }
    if (hash && hash[0] !== '#') hash = '#' + hash;
    if (search && search[0] !== '?') search = '?' + search;
    pathname = pathname.replace(/[?#]/g, encodeURIComponent);
    search = search.replace('#', '%23');
    return `${protocol}${host}${pathname}${search}${hash}`;
}
const urlObjectKeys = [
    'auth',
    'hash',
    'host',
    'hostname',
    'href',
    'path',
    'pathname',
    'port',
    'protocol',
    'query',
    'search',
    'slashes'
];
function formatWithValidation(url) {
    if ("TURBOPACK compile-time truthy", 1) {
        if (url !== null && typeof url === 'object') {
            Object.keys(url).forEach((key)=>{
                if (!urlObjectKeys.includes(key)) {
                    console.warn(`Unknown key passed via urlObject into url.format: ${key}`);
                }
            });
        }
    }
    return formatUrl(url);
} //# sourceMappingURL=format-url.js.map
}),
"[project]/frontend/node_modules/next/dist/client/use-merged-ref.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "useMergedRef", {
    enumerable: true,
    get: function() {
        return useMergedRef;
    }
});
const _react = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
function useMergedRef(refA, refB) {
    const cleanupA = (0, _react.useRef)(null);
    const cleanupB = (0, _react.useRef)(null);
    // NOTE: In theory, we could skip the wrapping if only one of the refs is non-null.
    // (this happens often if the user doesn't pass a ref to Link/Form/Image)
    // But this can cause us to leak a cleanup-ref into user code (previously via `<Link legacyBehavior>`),
    // and the user might pass that ref into ref-merging library that doesn't support cleanup refs
    // (because it hasn't been updated for React 19)
    // which can then cause things to blow up, because a cleanup-returning ref gets called with `null`.
    // So in practice, it's safer to be defensive and always wrap the ref, even on React 19.
    return (0, _react.useCallback)((current)=>{
        if (current === null) {
            const cleanupFnA = cleanupA.current;
            if (cleanupFnA) {
                cleanupA.current = null;
                cleanupFnA();
            }
            const cleanupFnB = cleanupB.current;
            if (cleanupFnB) {
                cleanupB.current = null;
                cleanupFnB();
            }
        } else {
            if (refA) {
                cleanupA.current = applyRef(refA, current);
            }
            if (refB) {
                cleanupB.current = applyRef(refB, current);
            }
        }
    }, [
        refA,
        refB
    ]);
}
function applyRef(refA, current) {
    if (typeof refA === 'function') {
        const cleanup = refA(current);
        if (typeof cleanup === 'function') {
            return cleanup;
        } else {
            return ()=>refA(null);
        }
    } else {
        refA.current = current;
        return ()=>{
            refA.current = null;
        };
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=use-merged-ref.js.map
}),
"[project]/frontend/node_modules/next/dist/shared/lib/utils.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    DecodeError: null,
    MiddlewareNotFoundError: null,
    MissingStaticPage: null,
    NormalizeError: null,
    PageNotFoundError: null,
    SP: null,
    ST: null,
    WEB_VITALS: null,
    execOnce: null,
    getDisplayName: null,
    getLocationOrigin: null,
    getURL: null,
    isAbsoluteUrl: null,
    isResSent: null,
    loadGetInitialProps: null,
    normalizeRepeatedSlashes: null,
    stringifyError: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    DecodeError: function() {
        return DecodeError;
    },
    MiddlewareNotFoundError: function() {
        return MiddlewareNotFoundError;
    },
    MissingStaticPage: function() {
        return MissingStaticPage;
    },
    NormalizeError: function() {
        return NormalizeError;
    },
    PageNotFoundError: function() {
        return PageNotFoundError;
    },
    SP: function() {
        return SP;
    },
    ST: function() {
        return ST;
    },
    WEB_VITALS: function() {
        return WEB_VITALS;
    },
    execOnce: function() {
        return execOnce;
    },
    getDisplayName: function() {
        return getDisplayName;
    },
    getLocationOrigin: function() {
        return getLocationOrigin;
    },
    getURL: function() {
        return getURL;
    },
    isAbsoluteUrl: function() {
        return isAbsoluteUrl;
    },
    isResSent: function() {
        return isResSent;
    },
    loadGetInitialProps: function() {
        return loadGetInitialProps;
    },
    normalizeRepeatedSlashes: function() {
        return normalizeRepeatedSlashes;
    },
    stringifyError: function() {
        return stringifyError;
    }
});
const WEB_VITALS = [
    'CLS',
    'FCP',
    'FID',
    'INP',
    'LCP',
    'TTFB'
];
function execOnce(fn) {
    let used = false;
    let result;
    return (...args)=>{
        if (!used) {
            used = true;
            result = fn(...args);
        }
        return result;
    };
}
// Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
// Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/;
const isAbsoluteUrl = (url)=>ABSOLUTE_URL_REGEX.test(url);
function getLocationOrigin() {
    const { protocol, hostname, port } = window.location;
    return `${protocol}//${hostname}${port ? ':' + port : ''}`;
}
function getURL() {
    const { href } = window.location;
    const origin = getLocationOrigin();
    return href.substring(origin.length);
}
function getDisplayName(Component) {
    return typeof Component === 'string' ? Component : Component.displayName || Component.name || 'Unknown';
}
function isResSent(res) {
    return res.finished || res.headersSent;
}
function normalizeRepeatedSlashes(url) {
    const urlParts = url.split('?');
    const urlNoQuery = urlParts[0];
    return urlNoQuery // first we replace any non-encoded backslashes with forward
    // then normalize repeated forward slashes
    .replace(/\\/g, '/').replace(/\/\/+/g, '/') + (urlParts[1] ? `?${urlParts.slice(1).join('?')}` : '');
}
async function loadGetInitialProps(App, ctx) {
    if ("TURBOPACK compile-time truthy", 1) {
        if (App.prototype?.getInitialProps) {
            const message = `"${getDisplayName(App)}.getInitialProps()" is defined as an instance method - visit https://nextjs.org/docs/messages/get-initial-props-as-an-instance-method for more information.`;
            throw Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
                value: "E394",
                enumerable: false,
                configurable: true
            });
        }
    }
    // when called from _app `ctx` is nested in `ctx`
    const res = ctx.res || ctx.ctx && ctx.ctx.res;
    if (!App.getInitialProps) {
        if (ctx.ctx && ctx.Component) {
            // @ts-ignore pageProps default
            return {
                pageProps: await loadGetInitialProps(ctx.Component, ctx.ctx)
            };
        }
        return {};
    }
    const props = await App.getInitialProps(ctx);
    if (res && isResSent(res)) {
        return props;
    }
    if (!props) {
        const message = `"${getDisplayName(App)}.getInitialProps()" should resolve to an object. But found "${props}" instead.`;
        throw Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
            value: "E394",
            enumerable: false,
            configurable: true
        });
    }
    if ("TURBOPACK compile-time truthy", 1) {
        if (Object.keys(props).length === 0 && !ctx.ctx) {
            console.warn(`${getDisplayName(App)} returned an empty object from \`getInitialProps\`. This de-optimizes and prevents automatic static optimization. https://nextjs.org/docs/messages/empty-object-getInitialProps`);
        }
    }
    return props;
}
const SP = typeof performance !== 'undefined';
const ST = SP && [
    'mark',
    'measure',
    'getEntriesByName'
].every((method)=>typeof performance[method] === 'function');
class DecodeError extends Error {
}
class NormalizeError extends Error {
}
class PageNotFoundError extends Error {
    constructor(page){
        super();
        this.code = 'ENOENT';
        this.name = 'PageNotFoundError';
        this.message = `Cannot find module for page: ${page}`;
    }
}
class MissingStaticPage extends Error {
    constructor(page, message){
        super();
        this.message = `Failed to load static file for page: ${page} ${message}`;
    }
}
class MiddlewareNotFoundError extends Error {
    constructor(){
        super();
        this.code = 'ENOENT';
        this.message = `Cannot find the middleware module`;
    }
}
function stringifyError(error) {
    return JSON.stringify({
        message: error.message,
        stack: error.stack
    });
} //# sourceMappingURL=utils.js.map
}),
"[project]/frontend/node_modules/next/dist/shared/lib/router/utils/is-local-url.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "isLocalURL", {
    enumerable: true,
    get: function() {
        return isLocalURL;
    }
});
const _utils = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/utils.js [app-client] (ecmascript)");
const _hasbasepath = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/client/has-base-path.js [app-client] (ecmascript)");
function isLocalURL(url) {
    // prevent a hydration mismatch on href for url with anchor refs
    if (!(0, _utils.isAbsoluteUrl)(url)) return true;
    try {
        // absolute urls can be local if they are on the same origin
        const locationOrigin = (0, _utils.getLocationOrigin)();
        const resolved = new URL(url, locationOrigin);
        return resolved.origin === locationOrigin && (0, _hasbasepath.hasBasePath)(resolved.pathname);
    } catch (_) {
        return false;
    }
} //# sourceMappingURL=is-local-url.js.map
}),
"[project]/frontend/node_modules/next/dist/shared/lib/utils/error-once.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "errorOnce", {
    enumerable: true,
    get: function() {
        return errorOnce;
    }
});
let errorOnce = (_)=>{};
if ("TURBOPACK compile-time truthy", 1) {
    const errors = new Set();
    errorOnce = (msg)=>{
        if (!errors.has(msg)) {
            console.error(msg);
        }
        errors.add(msg);
    };
} //# sourceMappingURL=error-once.js.map
}),
"[project]/frontend/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
'use client';
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    default: null,
    useLinkStatus: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    /**
 * A React component that extends the HTML `<a>` element to provide
 * [prefetching](https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#2-prefetching)
 * and client-side navigation. This is the primary way to navigate between routes in Next.js.
 *
 * @remarks
 * - Prefetching is only enabled in production.
 *
 * @see https://nextjs.org/docs/app/api-reference/components/link
 */ default: function() {
        return LinkComponent;
    },
    useLinkStatus: function() {
        return useLinkStatus;
    }
});
const _interop_require_wildcard = __turbopack_context__.r("[project]/frontend/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-client] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_wildcard._(__turbopack_context__.r("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)"));
const _formaturl = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/router/utils/format-url.js [app-client] (ecmascript)");
const _approutercontextsharedruntime = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/app-router-context.shared-runtime.js [app-client] (ecmascript)");
const _usemergedref = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/client/use-merged-ref.js [app-client] (ecmascript)");
const _utils = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/utils.js [app-client] (ecmascript)");
const _addbasepath = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/client/add-base-path.js [app-client] (ecmascript)");
const _warnonce = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/utils/warn-once.js [app-client] (ecmascript)");
const _links = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/client/components/links.js [app-client] (ecmascript)");
const _islocalurl = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/router/utils/is-local-url.js [app-client] (ecmascript)");
const _types = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/client/components/segment-cache/types.js [app-client] (ecmascript)");
const _erroronce = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/shared/lib/utils/error-once.js [app-client] (ecmascript)");
function isModifiedEvent(event) {
    const eventTarget = event.currentTarget;
    const target = eventTarget.getAttribute('target');
    return target && target !== '_self' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || // triggers resource download
    event.nativeEvent && event.nativeEvent.which === 2;
}
function linkClicked(e, href, as, linkInstanceRef, replace, scroll, onNavigate) {
    if (typeof window !== 'undefined') {
        const { nodeName } = e.currentTarget;
        // anchors inside an svg have a lowercase nodeName
        const isAnchorNodeName = nodeName.toUpperCase() === 'A';
        if (isAnchorNodeName && isModifiedEvent(e) || e.currentTarget.hasAttribute('download')) {
            // ignore click for browser’s default behavior
            return;
        }
        if (!(0, _islocalurl.isLocalURL)(href)) {
            if (replace) {
                // browser default behavior does not replace the history state
                // so we need to do it manually
                e.preventDefault();
                location.replace(href);
            }
            // ignore click for browser’s default behavior
            return;
        }
        e.preventDefault();
        if (onNavigate) {
            let isDefaultPrevented = false;
            onNavigate({
                preventDefault: ()=>{
                    isDefaultPrevented = true;
                }
            });
            if (isDefaultPrevented) {
                return;
            }
        }
        const { dispatchNavigateAction } = __turbopack_context__.r("[project]/frontend/node_modules/next/dist/client/components/app-router-instance.js [app-client] (ecmascript)");
        _react.default.startTransition(()=>{
            dispatchNavigateAction(as || href, replace ? 'replace' : 'push', scroll ?? true, linkInstanceRef.current);
        });
    }
}
function formatStringOrUrl(urlObjOrString) {
    if (typeof urlObjOrString === 'string') {
        return urlObjOrString;
    }
    return (0, _formaturl.formatUrl)(urlObjOrString);
}
function LinkComponent(props) {
    const [linkStatus, setOptimisticLinkStatus] = (0, _react.useOptimistic)(_links.IDLE_LINK_STATUS);
    let children;
    const linkInstanceRef = (0, _react.useRef)(null);
    const { href: hrefProp, as: asProp, children: childrenProp, prefetch: prefetchProp = null, passHref, replace, shallow, scroll, onClick, onMouseEnter: onMouseEnterProp, onTouchStart: onTouchStartProp, legacyBehavior = false, onNavigate, ref: forwardedRef, unstable_dynamicOnHover, ...restProps } = props;
    children = childrenProp;
    if (legacyBehavior && (typeof children === 'string' || typeof children === 'number')) {
        children = /*#__PURE__*/ (0, _jsxruntime.jsx)("a", {
            children: children
        });
    }
    const router = _react.default.useContext(_approutercontextsharedruntime.AppRouterContext);
    const prefetchEnabled = prefetchProp !== false;
    const fetchStrategy = prefetchProp !== false ? getFetchStrategyFromPrefetchProp(prefetchProp) : _types.FetchStrategy.PPR;
    if ("TURBOPACK compile-time truthy", 1) {
        function createPropError(args) {
            return Object.defineProperty(new Error(`Failed prop type: The prop \`${args.key}\` expects a ${args.expected} in \`<Link>\`, but got \`${args.actual}\` instead.` + (typeof window !== 'undefined' ? "\nOpen your browser's console to view the Component stack trace." : '')), "__NEXT_ERROR_CODE", {
                value: "E319",
                enumerable: false,
                configurable: true
            });
        }
        // TypeScript trick for type-guarding:
        const requiredPropsGuard = {
            href: true
        };
        const requiredProps = Object.keys(requiredPropsGuard);
        requiredProps.forEach((key)=>{
            if (key === 'href') {
                if (props[key] == null || typeof props[key] !== 'string' && typeof props[key] !== 'object') {
                    throw createPropError({
                        key,
                        expected: '`string` or `object`',
                        actual: props[key] === null ? 'null' : typeof props[key]
                    });
                }
            } else {
                // TypeScript trick for type-guarding:
                const _ = key;
            }
        });
        // TypeScript trick for type-guarding:
        const optionalPropsGuard = {
            as: true,
            replace: true,
            scroll: true,
            shallow: true,
            passHref: true,
            prefetch: true,
            unstable_dynamicOnHover: true,
            onClick: true,
            onMouseEnter: true,
            onTouchStart: true,
            legacyBehavior: true,
            onNavigate: true
        };
        const optionalProps = Object.keys(optionalPropsGuard);
        optionalProps.forEach((key)=>{
            const valType = typeof props[key];
            if (key === 'as') {
                if (props[key] && valType !== 'string' && valType !== 'object') {
                    throw createPropError({
                        key,
                        expected: '`string` or `object`',
                        actual: valType
                    });
                }
            } else if (key === 'onClick' || key === 'onMouseEnter' || key === 'onTouchStart' || key === 'onNavigate') {
                if (props[key] && valType !== 'function') {
                    throw createPropError({
                        key,
                        expected: '`function`',
                        actual: valType
                    });
                }
            } else if (key === 'replace' || key === 'scroll' || key === 'shallow' || key === 'passHref' || key === 'legacyBehavior' || key === 'unstable_dynamicOnHover') {
                if (props[key] != null && valType !== 'boolean') {
                    throw createPropError({
                        key,
                        expected: '`boolean`',
                        actual: valType
                    });
                }
            } else if (key === 'prefetch') {
                if (props[key] != null && valType !== 'boolean' && props[key] !== 'auto') {
                    throw createPropError({
                        key,
                        expected: '`boolean | "auto"`',
                        actual: valType
                    });
                }
            } else {
                // TypeScript trick for type-guarding:
                const _ = key;
            }
        });
    }
    if ("TURBOPACK compile-time truthy", 1) {
        if (props.locale) {
            (0, _warnonce.warnOnce)('The `locale` prop is not supported in `next/link` while using the `app` router. Read more about app router internalization: https://nextjs.org/docs/app/building-your-application/routing/internationalization');
        }
        if (!asProp) {
            let href;
            if (typeof hrefProp === 'string') {
                href = hrefProp;
            } else if (typeof hrefProp === 'object' && typeof hrefProp.pathname === 'string') {
                href = hrefProp.pathname;
            }
            if (href) {
                const hasDynamicSegment = href.split('/').some((segment)=>segment.startsWith('[') && segment.endsWith(']'));
                if (hasDynamicSegment) {
                    throw Object.defineProperty(new Error(`Dynamic href \`${href}\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href`), "__NEXT_ERROR_CODE", {
                        value: "E267",
                        enumerable: false,
                        configurable: true
                    });
                }
            }
        }
    }
    const { href, as } = _react.default.useMemo({
        "LinkComponent.useMemo": ()=>{
            const resolvedHref = formatStringOrUrl(hrefProp);
            return {
                href: resolvedHref,
                as: asProp ? formatStringOrUrl(asProp) : resolvedHref
            };
        }
    }["LinkComponent.useMemo"], [
        hrefProp,
        asProp
    ]);
    // This will return the first child, if multiple are provided it will throw an error
    let child;
    if (legacyBehavior) {
        if (children?.$$typeof === Symbol.for('react.lazy')) {
            throw Object.defineProperty(new Error(`\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.`), "__NEXT_ERROR_CODE", {
                value: "E863",
                enumerable: false,
                configurable: true
            });
        }
        if ("TURBOPACK compile-time truthy", 1) {
            if (onClick) {
                console.warn(`"onClick" was passed to <Link> with \`href\` of \`${hrefProp}\` but "legacyBehavior" was set. The legacy behavior requires onClick be set on the child of next/link`);
            }
            if (onMouseEnterProp) {
                console.warn(`"onMouseEnter" was passed to <Link> with \`href\` of \`${hrefProp}\` but "legacyBehavior" was set. The legacy behavior requires onMouseEnter be set on the child of next/link`);
            }
            try {
                child = _react.default.Children.only(children);
            } catch (err) {
                if (!children) {
                    throw Object.defineProperty(new Error(`No children were passed to <Link> with \`href\` of \`${hrefProp}\` but one child is required https://nextjs.org/docs/messages/link-no-children`), "__NEXT_ERROR_CODE", {
                        value: "E320",
                        enumerable: false,
                        configurable: true
                    });
                }
                throw Object.defineProperty(new Error(`Multiple children were passed to <Link> with \`href\` of \`${hrefProp}\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children` + (typeof window !== 'undefined' ? " \nOpen your browser's console to view the Component stack trace." : '')), "__NEXT_ERROR_CODE", {
                    value: "E266",
                    enumerable: false,
                    configurable: true
                });
            }
        } else //TURBOPACK unreachable
        ;
    } else {
        if ("TURBOPACK compile-time truthy", 1) {
            if (children?.type === 'a') {
                throw Object.defineProperty(new Error('Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>.\nLearn more: https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor'), "__NEXT_ERROR_CODE", {
                    value: "E209",
                    enumerable: false,
                    configurable: true
                });
            }
        }
    }
    const childRef = legacyBehavior ? child && typeof child === 'object' && child.ref : forwardedRef;
    // Use a callback ref to attach an IntersectionObserver to the anchor tag on
    // mount. In the future we will also use this to keep track of all the
    // currently mounted <Link> instances, e.g. so we can re-prefetch them after
    // a revalidation or refresh.
    const observeLinkVisibilityOnMount = _react.default.useCallback({
        "LinkComponent.useCallback[observeLinkVisibilityOnMount]": (element)=>{
            if (router !== null) {
                linkInstanceRef.current = (0, _links.mountLinkInstance)(element, href, router, fetchStrategy, prefetchEnabled, setOptimisticLinkStatus);
            }
            return ({
                "LinkComponent.useCallback[observeLinkVisibilityOnMount]": ()=>{
                    if (linkInstanceRef.current) {
                        (0, _links.unmountLinkForCurrentNavigation)(linkInstanceRef.current);
                        linkInstanceRef.current = null;
                    }
                    (0, _links.unmountPrefetchableInstance)(element);
                }
            })["LinkComponent.useCallback[observeLinkVisibilityOnMount]"];
        }
    }["LinkComponent.useCallback[observeLinkVisibilityOnMount]"], [
        prefetchEnabled,
        href,
        router,
        fetchStrategy,
        setOptimisticLinkStatus
    ]);
    const mergedRef = (0, _usemergedref.useMergedRef)(observeLinkVisibilityOnMount, childRef);
    const childProps = {
        ref: mergedRef,
        onClick (e) {
            if ("TURBOPACK compile-time truthy", 1) {
                if (!e) {
                    throw Object.defineProperty(new Error(`Component rendered inside next/link has to pass click event to "onClick" prop.`), "__NEXT_ERROR_CODE", {
                        value: "E312",
                        enumerable: false,
                        configurable: true
                    });
                }
            }
            if (!legacyBehavior && typeof onClick === 'function') {
                onClick(e);
            }
            if (legacyBehavior && child.props && typeof child.props.onClick === 'function') {
                child.props.onClick(e);
            }
            if (!router) {
                return;
            }
            if (e.defaultPrevented) {
                return;
            }
            linkClicked(e, href, as, linkInstanceRef, replace, scroll, onNavigate);
        },
        onMouseEnter (e) {
            if (!legacyBehavior && typeof onMouseEnterProp === 'function') {
                onMouseEnterProp(e);
            }
            if (legacyBehavior && child.props && typeof child.props.onMouseEnter === 'function') {
                child.props.onMouseEnter(e);
            }
            if (!router) {
                return;
            }
            if ("TURBOPACK compile-time truthy", 1) {
                return;
            }
            //TURBOPACK unreachable
            ;
            const upgradeToDynamicPrefetch = undefined;
        },
        onTouchStart: ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : function onTouchStart(e) {
            if (!legacyBehavior && typeof onTouchStartProp === 'function') {
                onTouchStartProp(e);
            }
            if (legacyBehavior && child.props && typeof child.props.onTouchStart === 'function') {
                child.props.onTouchStart(e);
            }
            if (!router) {
                return;
            }
            if (!prefetchEnabled) {
                return;
            }
            const upgradeToDynamicPrefetch = unstable_dynamicOnHover === true;
            (0, _links.onNavigationIntent)(e.currentTarget, upgradeToDynamicPrefetch);
        }
    };
    // If the url is absolute, we can bypass the logic to prepend the basePath.
    if ((0, _utils.isAbsoluteUrl)(as)) {
        childProps.href = as;
    } else if (!legacyBehavior || passHref || child.type === 'a' && !('href' in child.props)) {
        childProps.href = (0, _addbasepath.addBasePath)(as);
    }
    let link;
    if (legacyBehavior) {
        if ("TURBOPACK compile-time truthy", 1) {
            (0, _erroronce.errorOnce)('`legacyBehavior` is deprecated and will be removed in a future ' + 'release. A codemod is available to upgrade your components:\n\n' + 'npx @next/codemod@latest new-link .\n\n' + 'Learn more: https://nextjs.org/docs/app/building-your-application/upgrading/codemods#remove-a-tags-from-link-components');
        }
        link = /*#__PURE__*/ _react.default.cloneElement(child, childProps);
    } else {
        link = /*#__PURE__*/ (0, _jsxruntime.jsx)("a", {
            ...restProps,
            ...childProps,
            children: children
        });
    }
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(LinkStatusContext.Provider, {
        value: linkStatus,
        children: link
    });
}
const LinkStatusContext = /*#__PURE__*/ (0, _react.createContext)(_links.IDLE_LINK_STATUS);
const useLinkStatus = ()=>{
    return (0, _react.useContext)(LinkStatusContext);
};
function getFetchStrategyFromPrefetchProp(prefetchProp) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    else {
        return prefetchProp === null || prefetchProp === 'auto' ? _types.FetchStrategy.PPR : // (although invalid values should've been filtered out by prop validation in dev)
        _types.FetchStrategy.Full;
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=link.js.map
}),
]);

//# sourceMappingURL=frontend_04099969._.js.map
(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/window-layout-presets.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MODULE_WINDOW_CATALOG",
    ()=>MODULE_WINDOW_CATALOG,
    "WINDOW_ROLE_PRESETS",
    ()=>WINDOW_ROLE_PRESETS,
    "getRolePreset",
    ()=>getRolePreset,
    "normalizeRole",
    ()=>normalizeRole
]);
const WINDOW_ROLE_PRESETS = {
    inbox: {
        USER: {
            visiblePanels: [
                "conversations",
                "chat"
            ],
            sidebarPercent: 42,
            splitPercent: 42,
            layoutMode: "horizontal",
            primaryPanelPosition: "left"
        },
        GERENTE: {
            visiblePanels: [
                "conversations",
                "chat"
            ],
            sidebarPercent: 40,
            splitPercent: 40,
            layoutMode: "horizontal",
            primaryPanelPosition: "left"
        },
        ADMIN: {
            visiblePanels: [
                "conversations",
                "chat"
            ],
            sidebarPercent: 38,
            splitPercent: 38,
            layoutMode: "horizontal",
            primaryPanelPosition: "left"
        }
    },
    recovery: {
        USER: {
            visiblePanels: [
                "conversations",
                "detail"
            ],
            sidebarPercent: 40,
            splitPercent: 40,
            layoutMode: "horizontal",
            primaryPanelPosition: "left"
        },
        GERENTE: {
            visiblePanels: [
                "conversations",
                "detail"
            ],
            sidebarPercent: 37,
            splitPercent: 37,
            layoutMode: "horizontal",
            primaryPanelPosition: "left"
        },
        ADMIN: {
            visiblePanels: [
                "conversations",
                "detail"
            ],
            sidebarPercent: 35,
            splitPercent: 35,
            layoutMode: "horizontal",
            primaryPanelPosition: "left"
        }
    },
    master: {
        USER: {
            visiblePanels: [
                "metrics",
                "companies"
            ]
        },
        GERENTE: {
            visiblePanels: [
                "metrics",
                "companies"
            ]
        },
        ADMIN: {
            visiblePanels: [
                "metrics",
                "companies"
            ]
        }
    }
};
const MODULE_WINDOW_CATALOG = {
    inbox: [
        {
            id: "conversations",
            label: "Lista de conversas",
            description: "Sidebar com todas as conversas"
        },
        {
            id: "chat",
            label: "Timeline de mensagens",
            description: "Janela principal da conversa"
        }
    ],
    recovery: [
        {
            id: "conversations",
            label: "Lista de conversas",
            description: "Fila compacta de interações"
        },
        {
            id: "detail",
            label: "Detalhe da conversa",
            description: "Timeline e ações operacionais"
        }
    ],
    master: [
        {
            id: "metrics",
            label: "Cards de métricas",
            description: "Resumo do estado global"
        },
        {
            id: "companies",
            label: "Lista de empresas",
            description: "Gestão de empresas e configurações"
        }
    ]
};
function normalizeRole(rawRole) {
    const role = String(rawRole || "").trim().toUpperCase();
    if (role === "ADMIN") return "ADMIN";
    if (role === "GERENTE") return "GERENTE";
    return "USER";
}
function getRolePreset(module, roleRaw) {
    const role = normalizeRole(roleRaw);
    const byModule = WINDOW_ROLE_PRESETS[module];
    if (!byModule) {
        return {
            visiblePanels: []
        };
    }
    return byModule[role] || byModule.USER;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/use-ui-preferences.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useUiPreferences",
    ()=>useUiPreferences
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/window-layout-presets.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
const STORAGE_KEY = "hbx:ui-prefs";
function readFromStorage() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch  {
        return {};
    }
}
function writeToStorage(prefs) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch  {
    // ignore
    }
}
function useUiPreferences() {
    _s();
    const [prefs, setPrefs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "useUiPreferences.useState": ()=>readFromStorage()
    }["useUiPreferences.useState"]);
    const syncTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const loadedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    // Load from backend once on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useUiPreferences.useEffect": ()=>{
            if (loadedRef.current) return;
            loadedRef.current = true;
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/users/me/ui-preferences").then({
                "useUiPreferences.useEffect": (data)=>{
                    if (!data || typeof data !== "object" || Array.isArray(data)) return;
                    setPrefs({
                        "useUiPreferences.useEffect": (prev)=>{
                            // Backend wins for non-empty values; localStorage wins if backend is empty
                            const merged = {
                                ...prev
                            };
                            for (const key of Object.keys(data)){
                                if (data[key] !== undefined) merged[key] = data[key];
                            }
                            writeToStorage(merged);
                            return merged;
                        }
                    }["useUiPreferences.useEffect"]);
                }
            }["useUiPreferences.useEffect"]).catch({
                "useUiPreferences.useEffect": ()=>{
                // non-fatal: keep localStorage values
                }
            }["useUiPreferences.useEffect"]);
        }
    }["useUiPreferences.useEffect"], []);
    // Listen for global reset event
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useUiPreferences.useEffect": ()=>{
            function handleReset() {
                setPrefs({});
                writeToStorage({});
            }
            window.addEventListener("hbx-reset-layout", handleReset);
            return ({
                "useUiPreferences.useEffect": ()=>window.removeEventListener("hbx-reset-layout", handleReset)
            })["useUiPreferences.useEffect"];
        }
    }["useUiPreferences.useEffect"], []);
    /**
   * Partial update for a specific module's layout prefs.
   * Instantly commits to localStorage and debounces backend sync.
   */ const updateModule = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useUiPreferences.useCallback[updateModule]": (module, patch)=>{
            setPrefs({
                "useUiPreferences.useCallback[updateModule]": (prev)=>{
                    const next = {
                        ...prev,
                        [module]: {
                            ...prev[module] ?? {},
                            ...patch
                        }
                    };
                    writeToStorage(next);
                    // Debounced backend sync
                    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
                    syncTimerRef.current = setTimeout({
                        "useUiPreferences.useCallback[updateModule]": ()=>{
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/users/me/ui-preferences", {
                                method: "PATCH",
                                body: JSON.stringify({
                                    [module]: next[module]
                                })
                            }).catch({
                                "useUiPreferences.useCallback[updateModule]": ()=>{
                                // non-fatal
                                }
                            }["useUiPreferences.useCallback[updateModule]"]);
                        }
                    }["useUiPreferences.useCallback[updateModule]"], 1500);
                    return next;
                }
            }["useUiPreferences.useCallback[updateModule]"]);
        }
    }["useUiPreferences.useCallback[updateModule]"], []);
    /**
   * Reset all layout preferences to defaults.
   * Fires a global event so all mounted components react.
   */ const resetAll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useUiPreferences.useCallback[resetAll]": ()=>{
            setPrefs({});
            writeToStorage({});
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/users/me/ui-preferences/reset", {
                method: "PATCH"
            }).catch({
                "useUiPreferences.useCallback[resetAll]": ()=>{}
            }["useUiPreferences.useCallback[resetAll]"]);
            window.dispatchEvent(new CustomEvent("hbx-reset-layout"));
        }
    }["useUiPreferences.useCallback[resetAll]"], []);
    const getModulePrefs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useUiPreferences.useCallback[getModulePrefs]": (module, roleRaw)=>{
            const preset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRolePreset"])(module, roleRaw);
            const saved = prefs[module] ?? {};
            return {
                sidebarPercent: saved.sidebarPercent ?? preset.sidebarPercent,
                splitPercent: saved.splitPercent ?? preset.splitPercent ?? saved.sidebarPercent ?? preset.sidebarPercent,
                visiblePanels: saved.visiblePanels && saved.visiblePanels.length > 0 ? saved.visiblePanels : preset.visiblePanels,
                layoutMode: saved.layoutMode ?? preset.layoutMode,
                primaryPanelPosition: saved.primaryPanelPosition ?? preset.primaryPanelPosition
            };
        }
    }["useUiPreferences.useCallback[getModulePrefs]"], [
        prefs
    ]);
    const applyRolePreset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useUiPreferences.useCallback[applyRolePreset]": (module, roleRaw)=>{
            const role = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeRole"])(roleRaw);
            const preset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRolePreset"])(module, role);
            updateModule(module, {
                visiblePanels: preset.visiblePanels,
                sidebarPercent: preset.sidebarPercent,
                splitPercent: preset.splitPercent ?? preset.sidebarPercent,
                layoutMode: preset.layoutMode,
                primaryPanelPosition: preset.primaryPanelPosition
            });
        }
    }["useUiPreferences.useCallback[applyRolePreset]"], [
        updateModule
    ]);
    return {
        prefs,
        updateModule,
        resetAll,
        getModulePrefs,
        applyRolePreset
    };
}
_s(useUiPreferences, "i7XHEbncgSd2gaKlt83Aa74R0iU=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_lib_68fab421._.js.map
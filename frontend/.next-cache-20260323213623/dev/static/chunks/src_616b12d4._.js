(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/ModuleNav.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "moduleCard": "ModuleNav-module__gFNEqG__moduleCard",
  "moduleCardActive": "ModuleNav-module__gFNEqG__moduleCardActive",
  "moduleCardArrow": "ModuleNav-module__gFNEqG__moduleCardArrow",
  "moduleCardBadge": "ModuleNav-module__gFNEqG__moduleCardBadge",
  "moduleCardBody": "ModuleNav-module__gFNEqG__moduleCardBody",
  "moduleNavStatus": "ModuleNav-module__gFNEqG__moduleNavStatus",
  "moduleNavWrap": "ModuleNav-module__gFNEqG__moduleNavWrap",
});
}),
"[project]/src/components/ModuleNav.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ModuleNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/masterContextEvents.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/ModuleNav.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
const NAV_ITEMS = [
    {
        href: "/dashboard",
        label: "Menu",
        shortLabel: "ME",
        description: "Resumo de acesso e atalhos por módulo.",
        matcher: (route)=>route === "/dashboard"
    },
    {
        href: "/dashboard/inbox",
        label: "Atendimento",
        shortLabel: "AT",
        description: "Inbox, agenda conectada e bot do atendimento.",
        matcher: (route)=>route.startsWith("/dashboard/inbox") || route.startsWith("/dashboard/auto-replies") || route.startsWith("/dashboard/messages"),
        moduleKey: "atendimento"
    },
    {
        href: "/dashboard/gerencial",
        label: "Gerencial",
        shortLabel: "GE",
        description: "Usuários, acessos e operação de equipe.",
        matcher: (route)=>route.startsWith("/dashboard/gerencial"),
        adminOnly: true,
        moduleKey: "gerencial"
    },
    {
        href: "/hbx-recovery",
        label: "Recovery",
        shortLabel: "RC",
        description: "Cobrança, negociação e console de recuperação.",
        matcher: (route)=>route.startsWith("/hbx-recovery"),
        moduleKey: "hbx_recovery"
    },
    {
        href: "/dashboard/webscraping",
        label: "Webscraping",
        shortLabel: "WS",
        description: "Prospecção local integrada ao workspace.",
        matcher: (route)=>route.startsWith("/dashboard/webscraping"),
        moduleKey: "webscraping"
    },
    {
        href: "/dashboard/website",
        label: "Website",
        shortLabel: "WB",
        description: "Abrir o site da empresa e entrar no admin com segurança.",
        matcher: (route)=>route.startsWith("/dashboard/website"),
        moduleKey: "website"
    },
    {
        href: "/dashboard/layouts",
        label: "Layout ERP",
        shortLabel: "LY",
        description: "Gerenciar janelas, presets e organização visual por módulo.",
        matcher: (route)=>route.startsWith("/dashboard/layouts")
    },
    {
        href: "/dashboard/importacoes/followup-global",
        label: "Follow Up",
        shortLabel: "FU",
        description: "Importações, histórico e follow-up global.",
        matcher: (route)=>route.startsWith("/dashboard/importacoes/followup-global") || route.startsWith("/dashboard/importacoes/historico") || route.startsWith("/dashboard/importacoes/novo"),
        moduleKey: "follow_up_internacional"
    },
    {
        href: "/dashboard/importacoes/cadastros",
        label: "Cadastros",
        shortLabel: "CD",
        description: "Tabelas operacionais e base de fornecedores.",
        matcher: (route)=>route.startsWith("/dashboard/importacoes/cadastros"),
        moduleKey: "cadastros"
    },
    {
        href: "/dashboard/master",
        label: "Master",
        shortLabel: "MS",
        description: "Empresas, billing, acessos e configurações globais.",
        matcher: (route)=>route.startsWith("/dashboard/master"),
        adminOnly: true,
        moduleKey: "master"
    }
];
function ModuleNav() {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const authenticated = Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getToken"])());
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [userRole, setUserRole] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isSystemMaster, setIsSystemMaster] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(authenticated);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ModuleNav.useEffect": ()=>{
            let mounted = true;
            async function loadNavigationContext() {
                if (!authenticated) {
                    if (!mounted) return;
                    setModules([]);
                    setUserRole(null);
                    setIsSystemMaster(false);
                    setLoading(false);
                    return;
                }
                setLoading(true);
                try {
                    const [myModules, profile] = await Promise.all([
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me"),
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user").catch({
                            "ModuleNav.useEffect.loadNavigationContext": ()=>null
                        }["ModuleNav.useEffect.loadNavigationContext"])
                    ]);
                    if (!mounted) return;
                    setModules(myModules || []);
                    setUserRole(String(profile?.role || null));
                    setIsSystemMaster(Boolean(profile?.isSystemMaster));
                } catch  {
                    if (!mounted) return;
                    setModules([]);
                    setUserRole(null);
                    setIsSystemMaster(false);
                } finally{
                    if (mounted) {
                        setLoading(false);
                    }
                }
            }
            void loadNavigationContext();
            function handleMasterContextChanged() {
                void loadNavigationContext();
            }
            window.addEventListener(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MASTER_CONTEXT_CHANGED_EVENT"], handleMasterContextChanged);
            return ({
                "ModuleNav.useEffect": ()=>{
                    mounted = false;
                    window.removeEventListener(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MASTER_CONTEXT_CHANGED_EVENT"], handleMasterContextChanged);
                }
            })["ModuleNav.useEffect"];
        }
    }["ModuleNav.useEffect"], [
        authenticated
    ]);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ModuleNav.useMemo[accessibleModules]": ()=>new Set((modules || []).filter({
                "ModuleNav.useMemo[accessibleModules]": (module)=>module.accessible
            }["ModuleNav.useMemo[accessibleModules]"]).map({
                "ModuleNav.useMemo[accessibleModules]": (module)=>module.key
            }["ModuleNav.useMemo[accessibleModules]"]))
    }["ModuleNav.useMemo[accessibleModules]"], [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ModuleNav.useMemo[navItems]": ()=>{
            return NAV_ITEMS.filter({
                "ModuleNav.useMemo[navItems]": (item)=>{
                    if (item.href === "/dashboard") return true;
                    if (loading) return false;
                    if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
                    if (!item.adminOnly) return true;
                    if (item.href === "/dashboard/master") return isSystemMaster;
                    return String(userRole || "").toUpperCase() === "ADMIN";
                }
            }["ModuleNav.useMemo[navItems]"]);
        }
    }["ModuleNav.useMemo[navItems]"], [
        accessibleModules,
        isSystemMaster,
        loading,
        userRole
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleNavWrap,
        "aria-label": "Navegação de módulos",
        children: [
            navItems.map((item)=>{
                const active = item.matcher(pathname || "");
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    href: item.href,
                    className: active ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleCardActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleCard,
                    "data-ui-slot": "module-card",
                    "aria-current": active ? "page" : undefined,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleCardBadge,
                            children: item.shortLabel
                        }, void 0, false, {
                            fileName: "[project]/src/components/ModuleNav.tsx",
                            lineNumber: 198,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleCardBody,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: item.label
                                }, void 0, false, {
                                    fileName: "[project]/src/components/ModuleNav.tsx",
                                    lineNumber: 200,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                    children: item.description
                                }, void 0, false, {
                                    fileName: "[project]/src/components/ModuleNav.tsx",
                                    lineNumber: 201,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/ModuleNav.tsx",
                            lineNumber: 199,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleCardArrow,
                            "aria-hidden": "true",
                            children: active ? "ATIVO" : "ABRIR"
                        }, void 0, false, {
                            fileName: "[project]/src/components/ModuleNav.tsx",
                            lineNumber: 203,
                            columnNumber: 13
                        }, this)
                    ]
                }, item.href, true, {
                    fileName: "[project]/src/components/ModuleNav.tsx",
                    lineNumber: 191,
                    columnNumber: 11
                }, this);
            }),
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].moduleNavStatus,
                children: "Carregando módulos..."
            }, void 0, false, {
                fileName: "[project]/src/components/ModuleNav.tsx",
                lineNumber: 209,
                columnNumber: 18
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ModuleNav.tsx",
        lineNumber: 187,
        columnNumber: 5
    }, this);
}
_s(ModuleNav, "9shLwot+qGLZlnDHcf03F+Yd2Vs=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = ModuleNav;
var _c;
__turbopack_context__.k.register(_c, "ModuleNav");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/DashboardScaffold.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardScaffold
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ModuleNav.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function buildPageKey(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "dashboard";
}
function DashboardScaffold({ title, children, actions, showDashboardShortcut = true, hideHeader = false }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const isRootDashboard = pathname === "/dashboard";
    const sectionLabel = pathname.startsWith("/hbx-recovery") ? "HBX Recovery" : "HBX Workspace";
    const pageKey = buildPageKey(pathname);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "app-shell",
        "data-page-key": pageKey,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "app-container",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "workspace-shell",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                        className: "workspace-rail",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "shell-card shell-card--nav",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "shell-card__header",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "shell-card__eyebrow",
                                                children: "Módulos"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 42,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                className: "shell-card__title",
                                                children: "Navegação principal"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 43,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                                        lineNumber: 41,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/DashboardScaffold.tsx",
                                    lineNumber: 40,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                    fileName: "[project]/src/components/DashboardScaffold.tsx",
                                    lineNumber: 46,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/DashboardScaffold.tsx",
                            lineNumber: 39,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "workspace-main",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "panel page-hero",
                                style: {
                                    display: hideHeader ? "none" : "block"
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "page-hero__copy",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "page-overline",
                                                children: sectionLabel
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 53,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                                children: title
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 54,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                                        lineNumber: 52,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "page-hero__sidebar",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "page-hero__actions",
                                            children: [
                                                showDashboardShortcut && !isRootDashboard ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                    href: "/dashboard",
                                                    className: "btn btn-secondary btn-sm",
                                                    children: "Voltar ao menu"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                    lineNumber: 60,
                                                    columnNumber: 21
                                                }, this) : null,
                                                actions
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/DashboardScaffold.tsx",
                                            lineNumber: 58,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                                        lineNumber: 57,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                lineNumber: 51,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "page-content",
                                children: children
                            }, void 0, false, {
                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                lineNumber: 69,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                        lineNumber: 50,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/DashboardScaffold.tsx",
                lineNumber: 37,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/components/DashboardScaffold.tsx",
            lineNumber: 36,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/DashboardScaffold.tsx",
        lineNumber: 35,
        columnNumber: 5
    }, this);
}
_s(DashboardScaffold, "xbyQPtUVMO7MNj7WjJlpdWqRcTo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = DashboardScaffold;
var _c;
__turbopack_context__.k.register(_c, "DashboardScaffold");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/dashboard/_lib/useRequireAuth.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useRequireAuth",
    ()=>useRequireAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function subscribeAuth(callback) {
    window.addEventListener("auth-change", callback);
    window.addEventListener("storage", callback);
    return ()=>{
        window.removeEventListener("auth-change", callback);
        window.removeEventListener("storage", callback);
    };
}
function getAuthSnapshot() {
    return Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getToken"])());
}
function getServerSnapshot() {
    return null;
}
function useRequireAuth() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const hasToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(subscribeAuth, getAuthSnapshot, getServerSnapshot);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useRequireAuth.useEffect": ()=>{
            if (hasToken === false) {
                router.push("/login");
            }
        }
    }["useRequireAuth.useEffect"], [
        hasToken,
        router
    ]);
    return hasToken;
}
_s(useRequireAuth, "9IHckIQNf5yqBm/fNRNtE27QxIQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/websiteLaunch.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveWebsiteLaunchUrl",
    ()=>resolveWebsiteLaunchUrl,
    "resolveWebsiteOnlyDestination",
    ()=>resolveWebsiteOnlyDestination
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
;
async function resolveWebsiteLaunchUrl(target = 'auto') {
    const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])(`/website/portal?target=${target}`);
    return String(payload?.launchUrl || '').trim() || null;
}
async function resolveWebsiteOnlyDestination() {
    const modules = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])('/modules/me');
    const accessibleModules = Array.isArray(modules) ? modules.filter((item)=>item && item.accessible) : [];
    if (accessibleModules.length !== 1 || accessibleModules[0]?.key !== 'website') {
        return null;
    }
    try {
        return await resolveWebsiteLaunchUrl('admin') || '/dashboard/website';
    } catch  {
        return '/dashboard/website';
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/dashboard/page.client.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardClientPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/DashboardScaffold.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/useRequireAuth.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$websiteLaunch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/websiteLaunch.ts [app-client] (ecmascript)");
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
function DashboardClientPage() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const hasToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRequireAuth"])();
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [redirectingToWebsite, setRedirectingToWebsite] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DashboardClientPage.useEffect": ()=>{
            if (hasToken !== true) return;
            setError(null);
            setLoading(true);
            ({
                "DashboardClientPage.useEffect": async ()=>{
                    try {
                        const [me, userModules] = await Promise.all([
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
                        ]);
                        setUser(me);
                        setModules(userModules || []);
                    } catch (loadError) {
                        const message = loadError instanceof Error ? loadError.message : "Falha ao carregar usuário.";
                        setError(message);
                    } finally{
                        setLoading(false);
                    }
                }
            })["DashboardClientPage.useEffect"]();
        }
    }["DashboardClientPage.useEffect"], [
        hasToken
    ]);
    const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
    const roleLabel = String(user?.role ?? "").toUpperCase() || "USUÁRIO";
    const isSystemMaster = Boolean(user?.isSystemMaster);
    const moduleCards = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DashboardClientPage.useMemo[moduleCards]": ()=>{
            const moduleRoutes = {
                atendimento: "/dashboard/inbox",
                gerencial: "/dashboard/gerencial",
                hbx_recovery: "/hbx-recovery",
                webscraping: "/dashboard/webscraping",
                website: "/dashboard/website",
                follow_up_internacional: "/dashboard/importacoes/followup-global",
                cadastros: "/dashboard/importacoes/cadastros",
                master: "/dashboard/master"
            };
            const base = modules.filter({
                "DashboardClientPage.useMemo[moduleCards].base": (item)=>item.accessible
            }["DashboardClientPage.useMemo[moduleCards].base"]).filter({
                "DashboardClientPage.useMemo[moduleCards].base": (item)=>item.key === 'gerencial' ? isAdmin : true
            }["DashboardClientPage.useMemo[moduleCards].base"]).map({
                "DashboardClientPage.useMemo[moduleCards].base": (item)=>({
                        title: item.name,
                        description: item.description || "Módulo disponível para seu usuário.",
                        href: moduleRoutes[item.key] || "/dashboard",
                        badge: item.key === "gerencial" || item.key === "master" ? "ADMIN" : undefined
                    })
            }["DashboardClientPage.useMemo[moduleCards].base"]);
            if (isSystemMaster && !base.some({
                "DashboardClientPage.useMemo[moduleCards]": (item)=>item.href === "/dashboard/master"
            }["DashboardClientPage.useMemo[moduleCards]"])) {
                base.push({
                    title: "Master",
                    description: "Gestão global de empresas, módulos, usuários e billing.",
                    href: "/dashboard/master",
                    badge: "ADMIN"
                });
            }
            return base;
        }
    }["DashboardClientPage.useMemo[moduleCards]"], [
        isAdmin,
        isSystemMaster,
        modules
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DashboardClientPage.useEffect": ()=>{
            if (hasToken !== true || loading || redirectingToWebsite) return;
            if (moduleCards.length !== 1 || moduleCards[0]?.href !== "/dashboard/website") return;
            let cancelled = false;
            setRedirectingToWebsite(true);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$websiteLaunch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveWebsiteOnlyDestination"])().then({
                "DashboardClientPage.useEffect": (destination)=>{
                    if (cancelled) return;
                    if (!destination) {
                        setRedirectingToWebsite(false);
                        return;
                    }
                    if (/^https?:\/\//i.test(destination)) {
                        window.location.assign(destination);
                        return;
                    }
                    router.replace(destination);
                }
            }["DashboardClientPage.useEffect"]).catch({
                "DashboardClientPage.useEffect": ()=>{
                    if (!cancelled) {
                        setRedirectingToWebsite(false);
                        router.replace("/dashboard/website");
                    }
                }
            }["DashboardClientPage.useEffect"]);
            return ({
                "DashboardClientPage.useEffect": ()=>{
                    cancelled = true;
                }
            })["DashboardClientPage.useEffect"];
        }
    }["DashboardClientPage.useEffect"], [
        hasToken,
        loading,
        moduleCards,
        redirectingToWebsite,
        router
    ]);
    if (hasToken === null) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
            className: "app-shell",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "app-container",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "panel p-4 text-sm text-muted",
                    children: "Carregando..."
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                    lineNumber: 140,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/page.client.tsx",
                lineNumber: 139,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/dashboard/page.client.tsx",
            lineNumber: 138,
            columnNumber: 7
        }, this);
    }
    if (!hasToken) return null;
    if (redirectingToWebsite) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
            title: "Dashboard",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "panel p-4 text-sm text-muted",
                children: "Abrindo o admin do website..."
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/page.client.tsx",
                lineNumber: 151,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/dashboard/page.client.tsx",
            lineNumber: 150,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        title: "Dashboard",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "dashboard-home",
            children: [
                error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "alert alert-error",
                    children: error
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                    lineNumber: 159,
                    columnNumber: 18
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "metrics-grid",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: "stat-card",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__label",
                                    children: "Empresa"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 163,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__value text-[1.1rem] leading-tight",
                                    children: isSystemMaster ? "Sistema Global" : user?.company?.name ?? "Não vinculada"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 164,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                            lineNumber: 162,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: "stat-card",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__label",
                                    children: "Usuário"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 169,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__value text-[1.1rem] leading-tight",
                                    children: user?.username ?? "-"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 170,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                            lineNumber: 168,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: "stat-card",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__label",
                                    children: "Perfil"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 173,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__value text-[1.1rem] leading-tight",
                                    children: roleLabel
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 174,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                            lineNumber: 172,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: "stat-card",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__label",
                                    children: "Módulos ativos"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 177,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "stat-card__value",
                                    children: moduleCards.length
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 178,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                            lineNumber: 176,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                    lineNumber: 161,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "grid grid-cols-1 lg:grid-cols-2 gap-3",
                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "panel p-4 text-sm text-muted lg:col-span-2",
                        children: "Carregando módulos..."
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/page.client.tsx",
                        lineNumber: 184,
                        columnNumber: 13
                    }, this) : moduleCards.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: item.href,
                            className: "panel panel-interactive p-5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                    className: "text-xl md:text-2xl font-extrabold tracking-tight",
                                                    children: item.title
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                                    lineNumber: 190,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-sm text-muted mt-2 leading-relaxed",
                                                    children: item.description
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                                    lineNumber: 191,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                                            lineNumber: 189,
                                            columnNumber: 19
                                        }, this),
                                        item.badge ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "badge badge-brand",
                                            children: item.badge
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                                            lineNumber: 193,
                                            columnNumber: 33
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 188,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-5 inline-flex items-center gap-2 text-sm font-semibold text-(--brand)",
                                    children: [
                                        "Acessar módulo",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            "aria-hidden": "true",
                                            children: "->"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                                            lineNumber: 197,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                                    lineNumber: 195,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, item.href, true, {
                            fileName: "[project]/src/app/dashboard/page.client.tsx",
                            lineNumber: 187,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/page.client.tsx",
                    lineNumber: 182,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/dashboard/page.client.tsx",
            lineNumber: 158,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/dashboard/page.client.tsx",
        lineNumber: 157,
        columnNumber: 5
    }, this);
}
_s(DashboardClientPage, "/s5P5J625fu9++jA9IW3N1uNTMw=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRequireAuth"]
    ];
});
_c = DashboardClientPage;
var _c;
__turbopack_context__.k.register(_c, "DashboardClientPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_616b12d4._.js.map
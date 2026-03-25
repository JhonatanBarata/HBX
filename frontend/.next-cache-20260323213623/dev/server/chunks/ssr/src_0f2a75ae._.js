module.exports = [
"[project]/src/components/ModuleNav.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/masterContextEvents.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/ModuleNav.module.css [app-ssr] (css module)");
"use client";
;
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
        description: "Inbox, agenda, templates e bot do atendimento.",
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
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const authenticated = Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])());
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [userRole, setUserRole] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isSystemMaster, setIsSystemMaster] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(authenticated);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
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
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me"),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user").catch(()=>null)
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
        window.addEventListener(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MASTER_CONTEXT_CHANGED_EVENT"], handleMasterContextChanged);
        return ()=>{
            mounted = false;
            window.removeEventListener(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MASTER_CONTEXT_CHANGED_EVENT"], handleMasterContextChanged);
        };
    }, [
        authenticated
    ]);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Set((modules || []).filter((module)=>module.accessible).map((module)=>module.key)), [
        modules
    ]);
    const navItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return NAV_ITEMS.filter((item)=>{
            if (item.href === "/dashboard") return true;
            if (loading) return false;
            if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
            if (!item.adminOnly) return true;
            if (item.href === "/dashboard/master") return isSystemMaster;
            return String(userRole || "").toUpperCase() === "ADMIN";
        });
    }, [
        accessibleModules,
        isSystemMaster,
        loading,
        userRole
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavWrap,
        "aria-label": "Navegação de módulos",
        children: [
            navItems.map((item)=>{
                const active = item.matcher(pathname || "");
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: item.href,
                    className: active ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCardActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCard,
                    "data-ui-slot": "module-card",
                    "aria-current": active ? "page" : undefined,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCardBadge,
                            children: item.shortLabel
                        }, void 0, false, {
                            fileName: "[project]/src/components/ModuleNav.tsx",
                            lineNumber: 191,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCardBody,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: item.label
                                }, void 0, false, {
                                    fileName: "[project]/src/components/ModuleNav.tsx",
                                    lineNumber: 193,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                    children: item.description
                                }, void 0, false, {
                                    fileName: "[project]/src/components/ModuleNav.tsx",
                                    lineNumber: 194,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/ModuleNav.tsx",
                            lineNumber: 192,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCardArrow,
                            "aria-hidden": "true",
                            children: active ? "ATIVO" : "ABRIR"
                        }, void 0, false, {
                            fileName: "[project]/src/components/ModuleNav.tsx",
                            lineNumber: 196,
                            columnNumber: 13
                        }, this)
                    ]
                }, item.href, true, {
                    fileName: "[project]/src/components/ModuleNav.tsx",
                    lineNumber: 184,
                    columnNumber: 11
                }, this);
            }),
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavStatus,
                children: "Carregando módulos..."
            }, void 0, false, {
                fileName: "[project]/src/components/ModuleNav.tsx",
                lineNumber: 202,
                columnNumber: 18
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ModuleNav.tsx",
        lineNumber: 180,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/DashboardScaffold.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardScaffold
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ModuleNav.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function buildPageKey(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "dashboard";
}
function DashboardScaffold({ title, children, actions, showDashboardShortcut = true }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const isRootDashboard = pathname === "/dashboard";
    const sectionLabel = pathname.startsWith("/hbx-recovery") ? "HBX Recovery" : "HBX Workspace";
    const pageKey = buildPageKey(pathname);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "app-shell",
        "data-page-key": pageKey,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "app-container",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "workspace-shell",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                        className: "workspace-rail",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "shell-card shell-card--nav",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "shell-card__header",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "shell-card__eyebrow",
                                                children: "Módulos"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 40,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                className: "shell-card__title",
                                                children: "Navegação principal"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 41,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                                        lineNumber: 39,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/DashboardScaffold.tsx",
                                    lineNumber: 38,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                    fileName: "[project]/src/components/DashboardScaffold.tsx",
                                    lineNumber: 44,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/DashboardScaffold.tsx",
                            lineNumber: 37,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                        lineNumber: 36,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "workspace-main",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "panel page-hero",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "page-hero__copy",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "page-overline",
                                                children: sectionLabel
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 51,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                                children: title
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 52,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                                        lineNumber: 50,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "page-hero__sidebar",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "page-hero__actions",
                                            children: [
                                                showDashboardShortcut && !isRootDashboard ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                    href: "/dashboard",
                                                    className: "btn btn-secondary btn-sm",
                                                    children: "Voltar ao menu"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                    lineNumber: 58,
                                                    columnNumber: 21
                                                }, this) : null,
                                                actions
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/DashboardScaffold.tsx",
                                            lineNumber: 56,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                                        lineNumber: 55,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                lineNumber: 49,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "page-content",
                                children: children
                            }, void 0, false, {
                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                lineNumber: 67,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DashboardScaffold.tsx",
                        lineNumber: 48,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/DashboardScaffold.tsx",
                lineNumber: 35,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/components/DashboardScaffold.tsx",
            lineNumber: 34,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/DashboardScaffold.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/dashboard/_lib/useRequireAuth.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useRequireAuth",
    ()=>useRequireAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
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
    return Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])());
}
function getServerSnapshot() {
    return null;
}
function useRequireAuth() {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const hasToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(subscribeAuth, getAuthSnapshot, getServerSnapshot);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (hasToken === false) {
            router.push("/login");
        }
    }, [
        hasToken,
        router
    ]);
    return hasToken;
}
}),
"[project]/src/app/dashboard/master/page.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "app-shell": "page-module__OGvEgq__app-shell",
  "app-topbar": "page-module__OGvEgq__app-topbar",
  "attentionCard": "page-module__OGvEgq__attentionCard",
  "attentionCardHeader": "page-module__OGvEgq__attentionCardHeader",
  "attentionGrid": "page-module__OGvEgq__attentionGrid",
  "attentionList": "page-module__OGvEgq__attentionList",
  "attentionRow": "page-module__OGvEgq__attentionRow",
  "attentionSection": "page-module__OGvEgq__attentionSection",
  "avatarToken": "page-module__OGvEgq__avatarToken",
  "chartAxis": "page-module__OGvEgq__chartAxis",
  "chartCard": "page-module__OGvEgq__chartCard",
  "chartGrid": "page-module__OGvEgq__chartGrid",
  "chartLegend": "page-module__OGvEgq__chartLegend",
  "chartLossLine": "page-module__OGvEgq__chartLossLine",
  "chartPoint": "page-module__OGvEgq__chartPoint",
  "chartProjectedArea": "page-module__OGvEgq__chartProjectedArea",
  "chartProjectedLine": "page-module__OGvEgq__chartProjectedLine",
  "chartReceivedLine": "page-module__OGvEgq__chartReceivedLine",
  "chartSvg": "page-module__OGvEgq__chartSvg",
  "chartsGrid": "page-module__OGvEgq__chartsGrid",
  "checkboxCard": "page-module__OGvEgq__checkboxCard",
  "commandAlerts": "page-module__OGvEgq__commandAlerts",
  "commandBar": "page-module__OGvEgq__commandBar",
  "commandLabel": "page-module__OGvEgq__commandLabel",
  "commandQuick": "page-module__OGvEgq__commandQuick",
  "commandSearch": "page-module__OGvEgq__commandSearch",
  "commandUser": "page-module__OGvEgq__commandUser",
  "companyCell": "page-module__OGvEgq__companyCell",
  "contextBanner": "page-module__OGvEgq__contextBanner",
  "contextBannerActive": "page-module__OGvEgq__contextBannerActive",
  "contextBannerStrong": "page-module__OGvEgq__contextBannerStrong",
  "distributionFill": "page-module__OGvEgq__distributionFill",
  "distributionItem": "page-module__OGvEgq__distributionItem",
  "distributionList": "page-module__OGvEgq__distributionList",
  "distributionMeta": "page-module__OGvEgq__distributionMeta",
  "distributionTrack": "page-module__OGvEgq__distributionTrack",
  "drawerBackdrop": "page-module__OGvEgq__drawerBackdrop",
  "drawerBadges": "page-module__OGvEgq__drawerBadges",
  "drawerBody": "page-module__OGvEgq__drawerBody",
  "drawerEmpty": "page-module__OGvEgq__drawerEmpty",
  "drawerHeader": "page-module__OGvEgq__drawerHeader",
  "drawerLoading": "page-module__OGvEgq__drawerLoading",
  "drawerPanel": "page-module__OGvEgq__drawerPanel",
  "drawerQuickActions": "page-module__OGvEgq__drawerQuickActions",
  "drawerRoot": "page-module__OGvEgq__drawerRoot",
  "drawerTab": "page-module__OGvEgq__drawerTab",
  "drawerTabActive": "page-module__OGvEgq__drawerTabActive",
  "drawerTabs": "page-module__OGvEgq__drawerTabs",
  "emptyPanel": "page-module__OGvEgq__emptyPanel",
  "filterChip": "page-module__OGvEgq__filterChip",
  "filterChipActive": "page-module__OGvEgq__filterChipActive",
  "filterChips": "page-module__OGvEgq__filterChips",
  "formGrid": "page-module__OGvEgq__formGrid",
  "heroActions": "page-module__OGvEgq__heroActions",
  "historyTable": "page-module__OGvEgq__historyTable",
  "historyTableWrap": "page-module__OGvEgq__historyTableWrap",
  "iconButton": "page-module__OGvEgq__iconButton",
  "iconOnlyButton": "page-module__OGvEgq__iconOnlyButton",
  "inlineCheck": "page-module__OGvEgq__inlineCheck",
  "legendDot": "page-module__OGvEgq__legendDot",
  "loadingGrid": "page-module__OGvEgq__loadingGrid",
  "masterPage": "page-module__OGvEgq__masterPage",
  "masterShimmer": "page-module__OGvEgq__masterShimmer",
  "masterTable": "page-module__OGvEgq__masterTable",
  "metricAux": "page-module__OGvEgq__metricAux",
  "metricCard": "page-module__OGvEgq__metricCard",
  "metricCardHeader": "page-module__OGvEgq__metricCardHeader",
  "metricEyebrow": "page-module__OGvEgq__metricEyebrow",
  "metricNote": "page-module__OGvEgq__metricNote",
  "metricTrend": "page-module__OGvEgq__metricTrend",
  "metricValue": "page-module__OGvEgq__metricValue",
  "metricsGrid": "page-module__OGvEgq__metricsGrid",
  "modalActions": "page-module__OGvEgq__modalActions",
  "modalBackdrop": "page-module__OGvEgq__modalBackdrop",
  "modalBody": "page-module__OGvEgq__modalBody",
  "modalCard": "page-module__OGvEgq__modalCard",
  "modalCardWide": "page-module__OGvEgq__modalCardWide",
  "modalHeader": "page-module__OGvEgq__modalHeader",
  "modalRoot": "page-module__OGvEgq__modalRoot",
  "moduleCatalogGrid": "page-module__OGvEgq__moduleCatalogGrid",
  "moduleList": "page-module__OGvEgq__moduleList",
  "modulePills": "page-module__OGvEgq__modulePills",
  "moduleToggle": "page-module__OGvEgq__moduleToggle",
  "panelCard": "page-module__OGvEgq__panelCard",
  "panelCardHeader": "page-module__OGvEgq__panelCardHeader",
  "paymentBar": "page-module__OGvEgq__paymentBar",
  "paymentBarFill": "page-module__OGvEgq__paymentBarFill",
  "paymentBarLabel": "page-module__OGvEgq__paymentBarLabel",
  "paymentBarTrack": "page-module__OGvEgq__paymentBarTrack",
  "paymentBarValue": "page-module__OGvEgq__paymentBarValue",
  "paymentBars": "page-module__OGvEgq__paymentBars",
  "paymentHint": "page-module__OGvEgq__paymentHint",
  "quickRow": "page-module__OGvEgq__quickRow",
  "rowActions": "page-module__OGvEgq__rowActions",
  "secondaryCell": "page-module__OGvEgq__secondaryCell",
  "sectionEyebrow": "page-module__OGvEgq__sectionEyebrow",
  "sectionHeader": "page-module__OGvEgq__sectionHeader",
  "skeletonCard": "page-module__OGvEgq__skeletonCard",
  "statusStack": "page-module__OGvEgq__statusStack",
  "summaryCard": "page-module__OGvEgq__summaryCard",
  "summaryMeta": "page-module__OGvEgq__summaryMeta",
  "summaryStats": "page-module__OGvEgq__summaryStats",
  "tableControls": "page-module__OGvEgq__tableControls",
  "tableSection": "page-module__OGvEgq__tableSection",
  "tableWrap": "page-module__OGvEgq__tableWrap",
  "timeline": "page-module__OGvEgq__timeline",
  "timelineDot": "page-module__OGvEgq__timelineDot",
  "timelineItem": "page-module__OGvEgq__timelineItem",
  "timelineTopline": "page-module__OGvEgq__timelineTopline",
  "toggleOff": "page-module__OGvEgq__toggleOff",
  "toggleOn": "page-module__OGvEgq__toggleOn",
  "userCard": "page-module__OGvEgq__userCard",
  "userList": "page-module__OGvEgq__userList",
});
}),
"[project]/src/app/dashboard/master/page.premium.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MasterPremiumPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/DashboardScaffold.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/useRequireAuth.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/masterContextEvents.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/master/page.module.css [app-ssr] (css module)");
"use client";
;
;
;
;
;
;
;
;
const FILTERS = [
    {
        id: "all",
        label: "Todos"
    },
    {
        id: "PAYING",
        label: "Pagando"
    },
    {
        id: "TRIAL",
        label: "Trial"
    },
    {
        id: "TRIAL_ENDING",
        label: "Trial vencendo"
    },
    {
        id: "OVERDUE",
        label: "Inadimplentes"
    },
    {
        id: "NO_METHOD",
        label: "Sem método"
    },
    {
        id: "manual",
        label: "Pagamento manual"
    },
    {
        id: "SUSPENDED",
        label: "Suspensos"
    }
];
const TABS = [
    {
        id: "summary",
        label: "Resumo"
    },
    {
        id: "finance",
        label: "Financeiro"
    },
    {
        id: "users",
        label: "Usuários"
    },
    {
        id: "modules",
        label: "Módulos"
    },
    {
        id: "website",
        label: "Website"
    },
    {
        id: "integrations",
        label: "Integrações"
    },
    {
        id: "audit",
        label: "Auditoria"
    }
];
function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2
    });
}
function formatCurrencyInput(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
function normalizeCurrencyInput(raw) {
    const digits = String(raw || "").replace(/\D+/g, "");
    const amount = Number(digits || 0) / 100;
    return formatCurrencyInput(amount);
}
function parseCurrencyInput(raw) {
    const normalized = String(raw || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : 0;
}
function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
}
function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR");
}
function paymentMethodLabel(value) {
    const method = String(value || "").trim().toUpperCase();
    if (method === "CARD") return "Cartão";
    if (method === "PIX") return "Pix";
    if (method === "BOLETO") return "Boleto";
    if (method === "MANUAL") return "Manual";
    if (method === "TRANSFERENCIA") return "Transferência";
    if (method === "DINHEIRO") return "Dinheiro";
    return "Sem método";
}
function subscriptionLabel(value) {
    const status = String(value || "").trim().toLowerCase();
    if (status === "active") return "Ativa";
    if (status === "trialing") return "Trial";
    if (status === "past_due") return "Em atraso";
    if (status === "canceled") return "Cancelada";
    if (status === "expired") return "Expirada";
    return status || "-";
}
function paymentStatusLabel(value) {
    const status = String(value || "").trim().toUpperCase();
    if (status === "PAID") return "Pago";
    if (status === "TRIAL") return "Trial";
    if (status === "PENDING") return "Pendente";
    if (status === "OVERDUE") return "Atrasado";
    if (status === "EXPIRED") return "Expirado";
    if (status === "DISABLED") return "Suspenso";
    return status || "-";
}
function bucketLabel(value) {
    if (value === "PAYING") return "Pagando";
    if (value === "TRIAL") return "Trial";
    if (value === "TRIAL_ENDING") return "Trial vencendo";
    if (value === "OVERDUE") return "Atrasado";
    if (value === "SUSPENDED") return "Suspenso";
    if (value === "NO_METHOD") return "Sem método";
    return "Indefinido";
}
function badgeClass(tone) {
    if (tone === "success") return "badge badge-success";
    if (tone === "danger") return "badge badge-danger";
    if (tone === "warning" || tone === "brand") return "badge badge-brand";
    return "badge";
}
function statusTone(bucket) {
    if (bucket === "PAYING") return "success";
    if (bucket === "TRIAL" || bucket === "TRIAL_ENDING") return "warning";
    if (bucket === "OVERDUE" || bucket === "SUSPENDED" || bucket === "NO_METHOD") return "danger";
    return "neutral";
}
function initials(label) {
    const parts = String(label || "MASTER").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!parts.length) return "MS";
    return parts.map((part)=>part[0]?.toUpperCase() || "").join("");
}
function toDatetimeLocalValue(value) {
    const base = value ? new Date(value) : new Date();
    if (Number.isNaN(base.getTime())) return "";
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}
function toDateInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}
function metricValue(metric) {
    if (!metric) return "-";
    return metric.kind === "currency" ? formatCurrency(metric.value) : metric.value.toLocaleString("pt-BR");
}
function metricDelta(metric) {
    if (!metric || metric.delta == null || metric.previousValue == null) return "Sem base anterior";
    const sign = metric.delta > 0 ? "+" : metric.delta < 0 ? "-" : "";
    const deltaValue = metric.kind === "currency" ? formatCurrency(Math.abs(metric.delta)) : Math.abs(metric.delta).toLocaleString("pt-BR");
    return `${sign}${deltaValue} vs. mês anterior`;
}
function buildProfileDraft(company) {
    return {
        name: company.name || "",
        primaryContactName: company.primaryContactName || "",
        contactEmail: company.contactEmail || "",
        contactPhone: company.contactPhone || "",
        taxDocument: company.taxDocument || "",
        paymentMethod: company.paymentMethod || "NONE",
        subscriptionStatus: company.subscriptionStatus || "trialing",
        billingProvider: company.billingProvider || "manual",
        premiumAccess: Boolean(company.premiumAccess)
    };
}
function buildWebsiteDraft(company) {
    return {
        websiteEnabled: Boolean(company.website.enabled),
        websitePublicUrl: company.website.publicUrl || "",
        websiteAdminUrl: company.website.adminUrl || "",
        websiteProjectId: company.website.projectId || "",
        websiteAdminEnabled: Boolean(company.website.adminEnabled),
        websiteLaunchMode: company.website.launchMode === "admin" ? "admin" : "public"
    };
}
function buildMercadoPagoDraft(company) {
    return {
        mercadoPagoAccessToken: "",
        status: company.mercadoPago.status || "DISCONNECTED",
        statusError: company.mercadoPago.statusError || null,
        accountEmail: company.mercadoPago.accountEmail || null,
        accountUserId: company.mercadoPago.accountUserId || null,
        lastValidatedAt: company.mercadoPago.lastValidatedAt || null,
        accessTokenConfigured: Boolean(company.mercadoPago.tokenConfigured)
    };
}
function buildModuleCatalogDrafts(workspace) {
    const entries = (workspace?.systemModules || []).map((moduleItem)=>[
            moduleItem.key,
            {
                key: moduleItem.key,
                name: moduleItem.name,
                description: moduleItem.description || "",
                monthlyPrice: formatCurrencyInput(moduleItem.monthlyPrice ?? 0),
                companyAssignable: Boolean(moduleItem.companyAssignable),
                defaultEnabled: Boolean(moduleItem.defaultEnabled)
            }
        ]);
    return Object.fromEntries(entries);
}
function buildMasterIntegrationsDraft(workspace) {
    return {
        mercadoPagoAccessToken: workspace?.masterIntegrations?.mercadoPagoAccessToken || "",
        whatsappAccessToken: workspace?.masterIntegrations?.whatsappAccessToken || "",
        whatsappPhoneNumberId: workspace?.masterIntegrations?.whatsappPhoneNumberId || "",
        whatsappWabaId: workspace?.masterIntegrations?.whatsappWabaId || "",
        whatsappNumber: workspace?.masterIntegrations?.whatsappNumber || "",
        whatsappDisplayNumber: workspace?.masterIntegrations?.whatsappDisplayNumber || ""
    };
}
function buildCsv(detail) {
    const header = [
        "id",
        "competencia",
        "tipo",
        "valor",
        "status",
        "origem",
        "metodo",
        "vencimento",
        "pagamento",
        "observacao"
    ];
    const lines = detail.financeHistory.map((entry)=>[
            entry.id,
            entry.competence || "",
            entry.entryType,
            String(entry.amount),
            entry.status,
            entry.origin || "",
            entry.paymentMethod || "",
            entry.dueDate || "",
            entry.paidAt || "",
            (entry.observation || "").replace(/[\r\n;]+/g, " ")
        ]);
    return [
        header,
        ...lines
    ].map((line)=>line.map((cell)=>`"${String(cell || "").replace(/"/g, '""')}"`).join(";")).join("\n");
}
function MetricCard({ title, metric, accent }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCard,
        "data-accent": accent || "default",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCardHeader,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricEyebrow,
                        children: title
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 622,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricTrend,
                        children: metricDelta(metric)
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 623,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 621,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricValue,
                children: metricValue(metric)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 625,
                columnNumber: 7
            }, this),
            metric?.auxValue ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricAux,
                children: [
                    "Auxiliar: ",
                    formatCurrency(metric.auxValue)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 626,
                columnNumber: 27
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricNote,
                children: metric?.note || "Sem dados consolidados."
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 627,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 620,
        columnNumber: 5
    }, this);
}
function RevenueChart({ points }) {
    if (!points.length) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyPanel,
        children: "Sem histórico suficiente."
    }, void 0, false, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 633,
        columnNumber: 30
    }, this);
    const width = 860;
    const height = 280;
    const paddingX = 28;
    const paddingY = 28;
    const maxValue = Math.max(1, ...points.flatMap((point)=>[
            point.received,
            point.projected,
            point.loss
        ]));
    const stepX = points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : width - paddingX * 2;
    const baselineY = height - paddingY;
    const build = (key)=>points.map((point, index)=>{
            const x = paddingX + stepX * index;
            const value = Number(point[key] || 0);
            const y = baselineY - value / maxValue * (height - paddingY * 2);
            return {
                x,
                y,
                label: point.label
            };
        });
    const received = build("received");
    const projected = build("projected");
    const loss = build("loss");
    const path = (items)=>items.map((item, index)=>`${index === 0 ? "M" : "L"} ${item.x} ${item.y}`).join(" ");
    const projectedArea = `${path(projected)} L ${projected[projected.length - 1]?.x || 0} ${baselineY} L ${projected[0]?.x || 0} ${baselineY} Z`;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartCard,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                children: "Financeiro"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 662,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                children: "Receita recebida, prevista e perda"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 663,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 661,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartLegend,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].legendDot,
                                        "data-tone": "received"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 666,
                                        columnNumber: 17
                                    }, this),
                                    "Recebida"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 666,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].legendDot,
                                        "data-tone": "projected"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 667,
                                        columnNumber: 17
                                    }, this),
                                    "Prevista"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 667,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].legendDot,
                                        "data-tone": "loss"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 668,
                                        columnNumber: 17
                                    }, this),
                                    "Perda"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 668,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 665,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 660,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                viewBox: `0 0 ${width} ${height}`,
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartSvg,
                children: [
                    [
                        0.2,
                        0.45,
                        0.7,
                        0.95
                    ].map((guide)=>{
                        const y = paddingY + (height - paddingY * 2) * guide;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                            x1: paddingX,
                            x2: width - paddingX,
                            y1: y,
                            y2: y,
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartGrid
                        }, guide, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 674,
                            columnNumber: 18
                        }, this);
                    }),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: projectedArea,
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartProjectedArea
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 676,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: path(projected),
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartProjectedLine
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 677,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: path(received),
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartReceivedLine
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 678,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: path(loss),
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartLossLine
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 679,
                        columnNumber: 9
                    }, this),
                    received.map((point)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: point.x,
                                    cy: point.y,
                                    r: 4.5,
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartPoint
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 682,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                    x: point.x,
                                    y: baselineY + 18,
                                    textAnchor: "middle",
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartAxis,
                                    children: point.label
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 683,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, point.label, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 681,
                            columnNumber: 11
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 671,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 659,
        columnNumber: 5
    }, this);
}
function DistributionCard({ title, eyebrow, points, currency = false }) {
    const max = Math.max(1, ...points.map((point)=>point.value));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCard,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                            children: eyebrow
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 710,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 711,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 709,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 708,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].distributionList,
                children: points.length ? points.map((point)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].distributionItem,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].distributionMeta,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: point.label
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 719,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: currency ? formatCurrency(point.value) : point.value.toLocaleString("pt-BR")
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 720,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 718,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].distributionTrack,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].distributionFill,
                                    style: {
                                        width: `${point.value / max * 100}%`
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 723,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 722,
                                columnNumber: 15
                            }, this)
                        ]
                    }, point.label, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 717,
                        columnNumber: 13
                    }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyPanel,
                    children: "Nenhum dado suficiente."
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 728,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 714,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 707,
        columnNumber: 5
    }, this);
}
function paymentModeLabel(mode) {
    if (mode === "approved") return "Aprovados";
    if (mode === "failed") return "Falhos";
    if (mode === "manual") return "Manuais";
    return "Pendentes";
}
function PaymentChart({ points, mode, onModeChange }) {
    if (!points.length) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyPanel,
        children: "Sem volume suficiente para pagamentos."
    }, void 0, false, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 751,
        columnNumber: 30
    }, this);
    const max = Math.max(1, ...points.map((point)=>Number(point[mode] || 0)));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCard,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                children: "Pagamentos"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 759,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                children: [
                                    paymentModeLabel(mode),
                                    " por período"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 760,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 758,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].filterChips,
                        children: [
                            "approved",
                            "failed",
                            "manual",
                            "pending"
                        ].map((option)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: mode === option ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].filterChipActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].filterChip,
                                onClick: ()=>onModeChange(option),
                                children: paymentModeLabel(option)
                            }, option, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 764,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 762,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 757,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].paymentBars,
                children: points.map((point)=>{
                    const value = Number(point[mode] || 0);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].paymentBar,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].paymentBarTrack,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].paymentBarFill,
                                    "data-mode": mode,
                                    style: {
                                        height: `${Math.max(10, value / max * 100)}%`
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 781,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 780,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].paymentBarValue,
                                children: value.toLocaleString("pt-BR")
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 787,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].paymentBarLabel,
                                children: point.label
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 788,
                                columnNumber: 15
                            }, this)
                        ]
                    }, `${point.id}-${mode}`, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 779,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 775,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].paymentHint,
                children: "Alterne entre aprovados, falhos, manuais e pendentes para localizar rapidamente a pressão do funil de cobrança."
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 793,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 756,
        columnNumber: 5
    }, this);
}
function EyeIcon() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        width: "16",
        height: "16",
        "aria-hidden": "true",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "1.8",
                strokeLinecap: "round",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 803,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "12",
                cy: "12",
                r: "3",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "1.8"
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 811,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 802,
        columnNumber: 5
    }, this);
}
function ModalShell({ title, subtitle, open, onClose, children, wide = false }) {
    if (!open) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalRoot,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBackdrop,
                onClick: onClose,
                "aria-label": "Fechar modal"
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 834,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                className: wide ? `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalCard} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalCardWide}` : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalCard,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalHeader,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                        children: "Operação MASTER"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 838,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        children: title
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 839,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: subtitle
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 840,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 837,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].iconButton,
                                onClick: onClose,
                                children: "Fechar"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 842,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 836,
                        columnNumber: 9
                    }, this),
                    children
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 835,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 833,
        columnNumber: 5
    }, this);
}
function MasterPremiumPage() {
    const hasToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRequireAuth"])();
    const [workspace, setWorkspace] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [currentUser, setCurrentUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [refreshing, setRefreshing] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [detailLoading, setDetailLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [detail, setDetail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [drawerOpen, setDrawerOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [drawerTab, setDrawerTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("summary");
    const [search, setSearch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [filterId, setFilterId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("all");
    const [sortId, setSortId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("risk");
    const [paymentMode, setPaymentMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("approved");
    const [quickCompanyId, setQuickCompanyId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [message, setMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [busyAction, setBusyAction] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [createCompanyOpen, setCreateCompanyOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [masterIntegrationsOpen, setMasterIntegrationsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [moduleCatalogOpen, setModuleCatalogOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [createCompanyName, setCreateCompanyName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [createCompanySlug, setCreateCompanySlug] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [profileDraft, setProfileDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [websiteDraft, setWebsiteDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [mercadoPagoDraft, setMercadoPagoDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [trialDateDraft, setTrialDateDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [trialDaysDraft, setTrialDaysDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("7");
    const [moduleCatalogDrafts, setModuleCatalogDrafts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [masterIntegrationsDraft, setMasterIntegrationsDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        mercadoPagoAccessToken: "",
        whatsappAccessToken: "",
        whatsappPhoneNumberId: "",
        whatsappWabaId: "",
        whatsappNumber: "",
        whatsappDisplayNumber: ""
    });
    const [integrationVisibility, setIntegrationVisibility] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [userModal, setUserModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [manualPaymentModal, setManualPaymentModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [confirmAction, setConfirmAction] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const deferredSearch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useDeferredValue"])(search);
    const commercialModuleDrafts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>Object.values(moduleCatalogDrafts).filter((moduleItem)=>moduleItem.companyAssignable).sort((left, right)=>left.name.localeCompare(right.name, "pt-BR")), [
        moduleCatalogDrafts
    ]);
    async function loadWorkspace(background = false) {
        if (background) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const [workspacePayload, userPayload] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/master/workspace"),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user")
            ]);
            setWorkspace(workspacePayload);
            setCurrentUser(userPayload);
            setModuleCatalogDrafts(buildModuleCatalogDrafts(workspacePayload));
            setMasterIntegrationsDraft(buildMasterIntegrationsDraft(workspacePayload));
            if (!quickCompanyId && workspacePayload.companies.length) {
                setQuickCompanyId(String(workspacePayload.companies[0].id));
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o command center.");
        } finally{
            if (background) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }
    async function loadDetail(companyId, preferredTab) {
        setDetailLoading(true);
        setError(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${companyId}/detail`);
            setDetail(payload);
            setProfileDraft(buildProfileDraft(payload.company));
            setWebsiteDraft(buildWebsiteDraft(payload.company));
            setMercadoPagoDraft(buildMercadoPagoDraft(payload.company));
            setTrialDateDraft(toDateInputValue(payload.company.trialEndsAt));
            if (preferredTab) setDrawerTab(preferredTab);
            setDrawerOpen(true);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Falha ao abrir detalhes da empresa.");
        } finally{
            setDetailLoading(false);
        }
    }
    async function refreshAll(companyId) {
        await loadWorkspace(true);
        if (companyId) {
            await loadDetail(companyId, drawerTab);
        }
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (hasToken !== true) return;
        loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        hasToken
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const anyModalOpen = createCompanyOpen || masterIntegrationsOpen || moduleCatalogOpen || Boolean(userModal) || Boolean(manualPaymentModal) || Boolean(confirmAction);
        const focusOpen = drawerOpen || anyModalOpen;
        if (typeof document === "undefined") return;
        document.body.classList.toggle("master-company-focus-open", focusOpen);
        document.body.style.overflow = focusOpen ? "hidden" : "";
        const topbar = document.querySelector(".app-topbar");
        if (topbar) {
            if (focusOpen) {
                topbar.dataset.masterFocusHidden = "true";
                topbar.style.opacity = "0";
                topbar.style.pointerEvents = "none";
                topbar.style.transform = "translateY(-16px)";
                topbar.style.visibility = "hidden";
            } else if (topbar.dataset.masterFocusHidden === "true") {
                topbar.style.opacity = "";
                topbar.style.pointerEvents = "";
                topbar.style.transform = "";
                topbar.style.visibility = "";
                delete topbar.dataset.masterFocusHidden;
            }
        }
        return ()=>{
            document.body.classList.remove("master-company-focus-open");
            document.body.style.overflow = "";
            const activeTopbar = document.querySelector(".app-topbar");
            if (activeTopbar?.dataset.masterFocusHidden === "true") {
                activeTopbar.style.opacity = "";
                activeTopbar.style.pointerEvents = "";
                activeTopbar.style.transform = "";
                activeTopbar.style.visibility = "";
                delete activeTopbar.dataset.masterFocusHidden;
            }
        };
    }, [
        drawerOpen,
        createCompanyOpen,
        masterIntegrationsOpen,
        moduleCatalogOpen,
        userModal,
        manualPaymentModal,
        confirmAction
    ]);
    const filteredCompanies = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const items = [
            ...workspace?.companies || []
        ];
        const normalizedSearch = deferredSearch.trim().toLowerCase();
        let filtered = items;
        if (normalizedSearch) {
            filtered = filtered.filter((company)=>{
                const haystack = [
                    company.name,
                    company.primaryContactName,
                    company.contactEmail,
                    company.contactPhone,
                    company.slug,
                    company.plan?.name,
                    ...company.modules.map((module)=>module.name)
                ].filter(Boolean).join(" ").toLowerCase();
                return haystack.includes(normalizedSearch);
            });
        }
        if (filterId !== "all") {
            filtered = filtered.filter((company)=>{
                if (filterId === "manual") return Boolean(company.manualPaymentPending);
                return company.statusBucket === filterId;
            });
        }
        filtered.sort((left, right)=>{
            if (sortId === "name") return left.name.localeCompare(right.name);
            if (sortId === "revenue") return right.monthlyValue - left.monthlyValue;
            if (sortId === "due") {
                return new Date(left.nextDueAt || 0).getTime() - new Date(right.nextDueAt || 0).getTime();
            }
            const riskWeight = {
                critical: 0,
                warning: 1,
                stable: 2
            };
            const diff = riskWeight[left.riskLevel] - riskWeight[right.riskLevel];
            if (diff !== 0) return diff;
            return right.currentOutstandingValue - left.currentOutstandingValue;
        });
        return filtered;
    }, [
        workspace?.companies,
        deferredSearch,
        filterId,
        sortId
    ]);
    const activeCompany = detail?.company || null;
    const activeContextCompanyId = currentUser?.masterContext?.active ? currentUser.masterContext.companyId : null;
    const quickCompanyTarget = workspace?.companies.find((company)=>String(company.id) === quickCompanyId) || null;
    function openCompany(companyId, preferredTab = "summary") {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["startTransition"])(()=>{
            setDrawerTab(preferredTab);
            void loadDetail(companyId, preferredTab);
        });
    }
    async function submitCreateCompany() {
        if (!createCompanyName.trim()) {
            setError("Informe o nome da empresa.");
            return;
        }
        setBusyAction("create-company");
        setError(null);
        try {
            const created = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/companies/master", {
                method: "POST",
                body: JSON.stringify({
                    name: createCompanyName.trim(),
                    slug: createCompanySlug.trim() || undefined
                })
            });
            setCreateCompanyOpen(false);
            setCreateCompanyName("");
            setCreateCompanySlug("");
            setMessage(`Empresa criada com sucesso: ${created.name}.`);
            await loadWorkspace(true);
            openCompany(created.id);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao criar empresa.");
        } finally{
            setBusyAction(null);
        }
    }
    async function saveSystemModule(moduleKey) {
        const draft = moduleCatalogDrafts[moduleKey];
        if (!draft) return;
        setBusyAction(`system-module-${moduleKey}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/system-modules/${moduleKey}`, {
                method: "PUT",
                body: JSON.stringify({
                    name: draft.name.trim(),
                    description: draft.description.trim(),
                    monthlyPrice: parseCurrencyInput(draft.monthlyPrice),
                    defaultEnabled: draft.defaultEnabled
                })
            });
            setMessage(`Módulo ${draft.name} atualizado.`);
            await loadWorkspace(true);
            if (activeCompany) {
                await loadDetail(activeCompany.id, drawerTab);
            }
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao salvar módulo.");
        } finally{
            setBusyAction(null);
        }
    }
    async function saveMasterIntegrations() {
        setBusyAction("master-integrations-save");
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/master/global-integrations", {
                method: "PUT",
                body: JSON.stringify(masterIntegrationsDraft)
            });
            setMessage("Tokens globais do MASTER atualizados.");
            await loadWorkspace(true);
            if (activeCompany) {
                await loadDetail(activeCompany.id, drawerTab);
            }
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao salvar os tokens globais do MASTER.");
        } finally{
            setBusyAction(null);
        }
    }
    async function setCompanyMasterTokenUsage(next) {
        if (!activeCompany) return;
        setBusyAction(`master-token-usage-${activeCompany.id}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${activeCompany.id}/global-token-usage`, {
                method: "PUT",
                body: JSON.stringify(next)
            });
            setMessage("Vínculo com token MASTER atualizado.");
            await refreshAll(activeCompany.id);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar o vínculo com o token MASTER.");
        } finally{
            setBusyAction(null);
        }
    }
    async function importActiveCompanyTokensToMaster(clearSource = true) {
        if (!activeCompany) return;
        setBusyAction(`import-master-tokens-${activeCompany.id}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${activeCompany.id}/import-tokens-to-master`, {
                method: "POST",
                body: JSON.stringify({
                    clearSource
                })
            });
            setMessage(`Tokens de ${activeCompany.name} importados para o MASTER.`);
            await refreshAll(activeCompany.id);
            setMasterIntegrationsOpen(false);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao importar tokens da empresa para o MASTER.");
        } finally{
            setBusyAction(null);
        }
    }
    async function assumeContext(company) {
        setBusyAction(`context-${company.id}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/master-context/assume", {
                method: "POST",
                headers: {
                    "x-master-route": "/dashboard/master"
                },
                body: JSON.stringify({
                    companyId: company.id,
                    reason: `Operacao no master: ${company.name}`
                })
            });
            setMessage(`Contexto MASTER aplicado em ${company.name}.`);
            const [userPayload] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                loadWorkspace(true)
            ]);
            setCurrentUser(userPayload);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dispatchMasterContextChanged"])({
                mode: "assumed",
                companyName: company.name
            });
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao assumir contexto.");
        } finally{
            setBusyAction(null);
        }
    }
    async function exitContext() {
        setBusyAction("context-exit");
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/master-context/exit", {
                method: "POST",
                headers: {
                    "x-master-route": "/dashboard/master"
                },
                body: JSON.stringify({
                    reason: "Saindo do contexto pela central master"
                })
            });
            setMessage("Contexto MASTER encerrado.");
            const [userPayload] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                loadWorkspace(true)
            ]);
            setCurrentUser(userPayload);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dispatchMasterContextChanged"])({
                mode: "exited",
                companyName: currentUser?.masterContext?.companyName || null
            });
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao sair do contexto.");
        } finally{
            setBusyAction(null);
        }
    }
    async function runTrialAction(companyId, body, successMessage) {
        setBusyAction(`trial-${companyId}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${companyId}/trial`, {
                method: "POST",
                body: JSON.stringify(body)
            });
            setMessage(successMessage);
            await refreshAll(companyId);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar trial.");
        } finally{
            setBusyAction(null);
        }
    }
    async function setPaymentStatus(companyId, paymentStatus, successMessage) {
        setBusyAction(`payment-${companyId}-${paymentStatus}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${companyId}/payment`, {
                method: "PUT",
                body: JSON.stringify({
                    paymentStatus
                })
            });
            setMessage(successMessage);
            await refreshAll(companyId);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar status financeiro.");
        } finally{
            setBusyAction(null);
        }
    }
    function openManualPayment(company) {
        setManualPaymentModal({
            companyId: company.id,
            companyName: company.name,
            value: String(company.currentOutstandingValue || company.monthlyValue || 0),
            competence: new Date().toISOString().slice(0, 7),
            paidAt: toDatetimeLocalValue(new Date().toISOString()),
            dueDate: toDateInputValue(company.nextDueAt),
            paymentMethod: company.paymentMethod === "NONE" ? "PIX" : company.paymentMethod || "PIX",
            observation: "",
            settlePending: true,
            generateAudit: true
        });
    }
    async function submitUserModal() {
        if (!userModal) return;
        setBusyAction(`user-${userModal.mode}`);
        setError(null);
        try {
            if (userModal.mode === "create") {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/users/master/company/${userModal.companyId}/create`, {
                    method: "POST",
                    body: JSON.stringify({
                        email: userModal.email.trim().toLowerCase(),
                        username: userModal.username.trim() || undefined,
                        role: userModal.role,
                        password: userModal.password.trim() || undefined
                    })
                });
                setMessage("Usuário criado com sucesso.");
            } else if (userModal.mode === "edit" && userModal.userId) {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/users/master/${userModal.userId}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        email: userModal.email.trim().toLowerCase(),
                        username: userModal.username.trim(),
                        role: userModal.role
                    })
                });
                setMessage("Usuário atualizado com sucesso.");
            } else if (userModal.mode === "reset" && userModal.userId) {
                const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/users/master/${userModal.userId}/reset-password`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        password: userModal.password.trim() || undefined
                    })
                });
                setMessage(`Senha resetada. Nova senha: ${payload.temporaryPassword}`);
            }
            const companyId = userModal.companyId;
            setUserModal(null);
            await refreshAll(companyId);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao processar usuário.");
        } finally{
            setBusyAction(null);
        }
    }
    async function deleteUser(companyId, userId, userLabel) {
        setBusyAction(`user-delete-${userId}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/users/master/${userId}/delete`, {
                method: "PATCH"
            });
            setMessage(`Usuário removido: ${userLabel}.`);
            await refreshAll(companyId);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao deletar usuário.");
        } finally{
            setBusyAction(null);
        }
    }
    async function submitManualPayment() {
        if (!manualPaymentModal) return;
        setBusyAction("manual-payment");
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${manualPaymentModal.companyId}/manual-payment`, {
                method: "POST",
                body: JSON.stringify({
                    value: Number(manualPaymentModal.value.replace(",", ".")),
                    competence: manualPaymentModal.competence.trim(),
                    paidAt: manualPaymentModal.paidAt ? new Date(manualPaymentModal.paidAt).toISOString() : undefined,
                    dueDate: manualPaymentModal.dueDate ? new Date(`${manualPaymentModal.dueDate}T12:00:00`).toISOString() : undefined,
                    paymentMethod: manualPaymentModal.paymentMethod,
                    observation: manualPaymentModal.observation.trim() || undefined,
                    settlePending: manualPaymentModal.settlePending,
                    generateAudit: manualPaymentModal.generateAudit
                })
            });
            setMessage(`Pagamento manual registrado para ${manualPaymentModal.companyName}.`);
            const companyId = manualPaymentModal.companyId;
            setManualPaymentModal(null);
            await refreshAll(companyId);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao lançar pagamento manual.");
        } finally{
            setBusyAction(null);
        }
    }
    async function cancelManualPayment(entryId) {
        if (!activeCompany) return;
        setBusyAction(`cancel-manual-${entryId}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${activeCompany.id}/manual-payment/${entryId}/cancel`, {
                method: "PUT",
                body: JSON.stringify({
                    observation: "Cancelado pela central master."
                })
            });
            setMessage("Lançamento manual removido e preservado no histórico.");
            await refreshAll(activeCompany.id);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao remover lançamento manual.");
        } finally{
            setBusyAction(null);
        }
    }
    async function saveProfile() {
        if (!activeCompany || !profileDraft) return;
        setBusyAction(`profile-${activeCompany.id}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${activeCompany.id}/profile`, {
                method: "PUT",
                body: JSON.stringify({
                    name: profileDraft.name.trim(),
                    primaryContactName: profileDraft.primaryContactName.trim() || undefined,
                    contactEmail: profileDraft.contactEmail.trim() || undefined,
                    contactPhone: profileDraft.contactPhone.trim() || undefined,
                    taxDocument: profileDraft.taxDocument.trim() || undefined,
                    paymentMethod: profileDraft.paymentMethod,
                    subscriptionStatus: profileDraft.subscriptionStatus,
                    billingProvider: profileDraft.billingProvider,
                    premiumAccess: profileDraft.premiumAccess
                })
            });
            setMessage("Perfil financeiro salvo.");
            await refreshAll(activeCompany.id);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao salvar perfil.");
        } finally{
            setBusyAction(null);
        }
    }
    async function saveWebsite() {
        if (!activeCompany || !websiteDraft) return;
        setBusyAction(`website-${activeCompany.id}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/website/master/company/${activeCompany.id}/config`, {
                method: "PATCH",
                body: JSON.stringify({
                    websiteEnabled: websiteDraft.websiteEnabled,
                    websitePublicUrl: websiteDraft.websitePublicUrl.trim() || undefined,
                    websiteAdminUrl: websiteDraft.websiteAdminUrl.trim() || undefined,
                    websiteProjectId: websiteDraft.websiteProjectId.trim() || undefined,
                    websiteAdminEnabled: websiteDraft.websiteAdminEnabled,
                    websiteLaunchMode: websiteDraft.websiteLaunchMode
                })
            });
            setMessage("Configuração do website salva.");
            await refreshAll(activeCompany.id);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao salvar website.");
        } finally{
            setBusyAction(null);
        }
    }
    async function toggleModule(companyId, moduleKey, enabled) {
        setBusyAction(`module-${companyId}-${moduleKey}`);
        setError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/modules/master/company/${companyId}`, {
                method: "PUT",
                body: JSON.stringify({
                    moduleKey,
                    enabled: !enabled
                })
            });
            setMessage("Módulo atualizado.");
            await refreshAll(companyId);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar módulo.");
        } finally{
            setBusyAction(null);
        }
    }
    async function saveMercadoPagoConfig() {
        if (!activeCompany || !mercadoPagoDraft) return;
        setBusyAction(`mp-save-${activeCompany.id}`);
        setError(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/companies/master/${activeCompany.id}/mercadopago`, {
                method: "PATCH",
                body: JSON.stringify({
                    mercadoPagoAccessToken: mercadoPagoDraft.mercadoPagoAccessToken.trim()
                })
            });
            setMercadoPagoDraft((current)=>current ? {
                    ...current,
                    mercadoPagoAccessToken: "",
                    status: payload.status,
                    statusError: payload.statusError,
                    accountEmail: payload.accountEmail,
                    accountUserId: payload.accountUserId,
                    lastValidatedAt: payload.lastValidatedAt,
                    accessTokenConfigured: payload.accessTokenConfigured
                } : current);
            setMessage("Token Mercado Pago salvo.");
            await refreshAll(activeCompany.id);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao salvar token Mercado Pago.");
        } finally{
            setBusyAction(null);
        }
    }
    async function validateMercadoPagoConfig() {
        if (!activeCompany || !mercadoPagoDraft) return;
        setBusyAction(`mp-validate-${activeCompany.id}`);
        setError(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/companies/master/${activeCompany.id}/mercadopago/validate`, {
                method: "POST"
            });
            setMercadoPagoDraft((current)=>current ? {
                    ...current,
                    status: payload.status,
                    statusError: payload.statusError,
                    accountEmail: payload.accountEmail,
                    accountUserId: payload.accountUserId,
                    lastValidatedAt: payload.lastValidatedAt,
                    accessTokenConfigured: payload.accessTokenConfigured
                } : current);
            setMessage("Validação Mercado Pago concluída.");
            await refreshAll(activeCompany.id);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao validar Mercado Pago.");
        } finally{
            setBusyAction(null);
        }
    }
    async function launchWebsite(companyId, target) {
        setBusyAction(`launch-${companyId}-${target}`);
        setError(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/website/master/company/${companyId}/launch?target=${target}`);
            const launchUrl = String(payload?.launchUrl || "").trim();
            if (!launchUrl) {
                throw new Error(payload?.message || "Website não configurado para esta empresa.");
            }
            window.open(launchUrl, "_blank", "noopener,noreferrer");
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Falha ao abrir website.");
        } finally{
            setBusyAction(null);
        }
    }
    if (hasToken === null) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
            className: "app-shell",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "app-container",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "panel p-4 text-sm text-muted",
                    children: "Carregando central master..."
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 1554,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 1553,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
            lineNumber: 1552,
            columnNumber: 7
        }, this);
    }
    if (!hasToken) return null;
    const summary = workspace?.summary || {};
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        title: "Master Command Center",
        description: "Operação premium do HBX com foco financeiro, contexto da empresa ativa e ações seguras.",
        actions: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroActions,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: "btn btn-primary btn-sm",
                    onClick: ()=>setCreateCompanyOpen(true),
                    children: "Nova empresa"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 1570,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: "btn btn-secondary btn-sm",
                    onClick: ()=>setMasterIntegrationsOpen(true),
                    children: "Tokens MASTER"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 1573,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: "btn btn-secondary btn-sm",
                    onClick: ()=>setModuleCatalogOpen(true),
                    children: "Módulos"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 1576,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: "btn btn-secondary btn-sm",
                    onClick: ()=>loadWorkspace(true),
                    children: refreshing ? "Atualizando..." : "Atualizar"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 1579,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: "/dashboard/master/assistente-tecnico",
                    className: "btn btn-secondary btn-sm",
                    children: "Assistente Técnico"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 1582,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: "/dashboard/master/exclusoes",
                    className: "btn btn-secondary btn-sm",
                    children: "Exclusões"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 1585,
                    columnNumber: 11
                }, void 0)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
            lineNumber: 1569,
            columnNumber: 9
        }, void 0),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].masterPage,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].commandBar,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].commandSearch,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].commandLabel,
                                        children: "Busca global"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1594,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        className: "field",
                                        placeholder: "Buscar empresa, contato, plano ou módulo...",
                                        value: search,
                                        onChange: (event)=>setSearch(event.target.value)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1595,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1593,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].commandQuick,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].commandLabel,
                                        children: "Empresa rápida"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1603,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].quickRow,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                className: "field",
                                                value: quickCompanyId,
                                                onChange: (event)=>setQuickCompanyId(event.target.value),
                                                children: (workspace?.companies || []).map((company)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: company.id,
                                                        children: company.name
                                                    }, company.id, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1607,
                                                        columnNumber: 19
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1605,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-secondary btn-sm",
                                                disabled: !quickCompanyTarget,
                                                onClick: ()=>quickCompanyTarget && openCompany(quickCompanyTarget.id),
                                                children: "Abrir"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1612,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-secondary btn-sm",
                                                disabled: !quickCompanyTarget,
                                                onClick: ()=>quickCompanyTarget && assumeContext(quickCompanyTarget),
                                                children: "Contexto"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1615,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1604,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1602,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].commandAlerts,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: badgeClass(workspace?.attention.some((item)=>item.severity === "danger") ? "danger" : "brand"),
                                        children: [
                                            workspace?.attention.length || 0,
                                            " alertas"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1621,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: workspace?.attention[0]?.title || "Fila operacional sob controle"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1624,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: workspace?.attention[0] ? "Use os cards abaixo para agir rápido." : "Nenhuma ação crítica pendente."
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1625,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1620,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].commandUser,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].avatarToken,
                                        children: initials(currentUser?.username || currentUser?.email)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1628,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                children: currentUser?.username || currentUser?.email || "MASTER"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1630,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: currentUser?.masterContext?.active ? `Operando em ${currentUser.masterContext.companyName || "empresa"}` : "MASTER puro"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1631,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1629,
                                        columnNumber: 13
                                    }, this),
                                    currentUser?.masterContext?.active ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-secondary btn-sm",
                                        onClick: exitContext,
                                        children: "Sair do contexto"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1638,
                                        columnNumber: 15
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1627,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 1592,
                        columnNumber: 9
                    }, this),
                    error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "alert alert-error",
                        children: error
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 1645,
                        columnNumber: 18
                    }, this) : null,
                    message ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "msg-info",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-sm",
                            children: message
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 1646,
                            columnNumber: 46
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 1646,
                        columnNumber: 20
                    }, this) : null,
                    loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].loadingGrid,
                        children: Array.from({
                            length: 6
                        }).map((_, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].skeletonCard
                            }, index, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1650,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 1648,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricsGrid,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Receita confirmada do mês",
                                        metric: summary.confirmedRevenueMonth,
                                        accent: "navy"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1656,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Receita prevista do mês",
                                        metric: summary.projectedRevenueMonth,
                                        accent: "emerald"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1657,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Receita líquida do mês",
                                        metric: summary.netRevenueMonth,
                                        accent: "sun"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1658,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Inadimplência atual",
                                        metric: summary.delinquencyCurrent,
                                        accent: "rose"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1659,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Trials ativos",
                                        metric: summary.activeTrials,
                                        accent: "amber"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1660,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Clientes pagantes",
                                        metric: summary.payingClients,
                                        accent: "mint"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1661,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Cartões com falha",
                                        metric: summary.recentCardFailures,
                                        accent: "crimson"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1662,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        title: "Pagamentos manuais",
                                        metric: summary.manualPaymentsMonth,
                                        accent: "slate"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1663,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1655,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chartsGrid,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(RevenueChart, {
                                        points: workspace?.charts.revenue || []
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1667,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PaymentChart, {
                                        points: workspace?.charts.payments || [],
                                        mode: paymentMode,
                                        onModeChange: setPaymentMode
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1668,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DistributionCard, {
                                        eyebrow: "Base ativa",
                                        title: "Status da base",
                                        points: (workspace?.charts.baseStatus || []).map((item)=>({
                                                label: item.label,
                                                value: item.value
                                            }))
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1673,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DistributionCard, {
                                        eyebrow: "Conversão",
                                        title: "Trials e conversão",
                                        points: [
                                            {
                                                label: "Trials ativos",
                                                value: workspace?.charts.trialConversion.active || 0
                                            },
                                            {
                                                label: "Convertidos",
                                                value: workspace?.charts.trialConversion.converted || 0
                                            },
                                            {
                                                label: "Expirados",
                                                value: workspace?.charts.trialConversion.expired || 0
                                            },
                                            {
                                                label: "Prorrogações",
                                                value: workspace?.charts.trialConversion.extended || 0
                                            }
                                        ]
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1681,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DistributionCard, {
                                        eyebrow: "Receita por módulo",
                                        title: "Receita estimada",
                                        points: workspace?.charts.revenueByModule || [],
                                        currency: true
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1691,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1666,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionSection,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionHeader,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                    children: "Ação imediata"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 1702,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                    children: "Precisa da sua atenção agora"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 1703,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 1701,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1700,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionGrid,
                                        children: (workspace?.attention || []).length ? workspace?.attention.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionCard,
                                                "data-tone": item.severity,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionCardHeader,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: badgeClass(item.severity === "danger" ? "danger" : item.severity === "warning" ? "brand" : "neutral"),
                                                                children: item.count
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1711,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: item.title
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1714,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1710,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionList,
                                                        children: item.companies.map((company)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionRow,
                                                                onClick: ()=>openCompany(company.id, company.statusBucket === "OVERDUE" ? "finance" : "summary"),
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                children: company.name
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 1725,
                                                                                columnNumber: 31
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                children: bucketLabel(company.statusBucket)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 1726,
                                                                                columnNumber: 31
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1724,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: company.trialRemainingDays != null ? `${company.trialRemainingDays}d` : formatDate(company.nextDueAt)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1728,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                ]
                                                            }, company.id, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1718,
                                                                columnNumber: 27
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1716,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, item.id, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1709,
                                                columnNumber: 21
                                            }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyPanel,
                                            children: "Nenhuma ação crítica no momento."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 1735,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1706,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1699,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].tableSection,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionHeader,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                        children: "Operação diária"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1743,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                        children: "Empresas"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1744,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1742,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].filterChips,
                                                children: FILTERS.map((filter)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        className: filterId === filter.id ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].filterChipActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].filterChip,
                                                        onClick: ()=>setFilterId(filter.id),
                                                        children: filter.label
                                                    }, filter.id, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1748,
                                                        columnNumber: 21
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1746,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1741,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].tableControls,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            className: "field",
                                            value: sortId,
                                            onChange: (event)=>setSortId(event.target.value),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "risk",
                                                    children: "Ordenar por risco"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 1761,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "due",
                                                    children: "Ordenar por vencimento"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 1762,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "revenue",
                                                    children: "Ordenar por receita"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 1763,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "name",
                                                    children: "Ordenar por nome"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 1764,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 1760,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1759,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].tableWrap,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].masterTable,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Empresa"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1771,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Responsável"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1772,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Status"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1773,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Plano"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1774,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Trial"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1775,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Próx. vencimento"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1776,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Último pagamento"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1777,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Método"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1778,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Situação"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1779,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Website"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1780,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Módulos"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1781,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                    children: "Ações"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 1782,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                            lineNumber: 1770,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1769,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                        children: filteredCompanies.map((company)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                            type: "button",
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].companyCell,
                                                                            onClick: ()=>openCompany(company.id),
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                    children: company.name
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1790,
                                                                                    columnNumber: 29
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: [
                                                                                        "#",
                                                                                        company.id,
                                                                                        company.slug ? ` • ${company.slug}` : ""
                                                                                    ]
                                                                                }, void 0, true, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1791,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 1789,
                                                                            columnNumber: 27
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1788,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].secondaryCell,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                    children: company.primaryContactName || "-"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1796,
                                                                                    columnNumber: 29
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: company.contactEmail || company.contactPhone || "Sem contato principal"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1797,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 1795,
                                                                            columnNumber: 27
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1794,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statusStack,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    className: badgeClass(statusTone(company.statusBucket)),
                                                                                    children: bucketLabel(company.statusBucket)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1802,
                                                                                    columnNumber: 29
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: paymentStatusLabel(company.paymentStatus)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1803,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 1801,
                                                                            columnNumber: 27
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1800,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].secondaryCell,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                    children: company.plan?.name || "Sem plano"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1808,
                                                                                    columnNumber: 29
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: formatCurrency(company.monthlyValue)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1809,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 1807,
                                                                            columnNumber: 27
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1806,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: company.trialRemainingDays != null ? `${company.trialRemainingDays} dia(s)` : "-"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1812,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: formatDate(company.nextDueAt)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1813,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: company.lastPayment ? formatDate(company.lastPayment.paidAt) : "Sem histórico"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1814,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: paymentMethodLabel(company.paymentMethod)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1815,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: company.financialSituation
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1816,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            className: badgeClass(company.website.configured ? "success" : company.websiteNeedsAttention ? "danger" : "neutral"),
                                                                            children: company.website.configured ? "Configurado" : "Pendente"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 1818,
                                                                            columnNumber: 27
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1817,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modulePills,
                                                                            children: [
                                                                                company.modules.slice(0, 2).map((module)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                        className: "badge",
                                                                                        children: module.name
                                                                                    }, module.key, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 1825,
                                                                                        columnNumber: 31
                                                                                    }, this)),
                                                                                company.modules.length > 2 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    className: "badge",
                                                                                    children: [
                                                                                        "+",
                                                                                        company.modules.length - 2
                                                                                    ]
                                                                                }, void 0, true, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1827,
                                                                                    columnNumber: 59
                                                                                }, this) : null
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 1823,
                                                                            columnNumber: 27
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1822,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                    type: "button",
                                                                                    className: "btn btn-secondary btn-sm",
                                                                                    onClick: ()=>openCompany(company.id),
                                                                                    children: "Abrir"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1832,
                                                                                    columnNumber: 29
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                    type: "button",
                                                                                    className: "btn btn-secondary btn-sm",
                                                                                    onClick: ()=>openManualPayment(company),
                                                                                    children: "Manual"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1835,
                                                                                    columnNumber: 29
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                    type: "button",
                                                                                    className: "btn btn-secondary btn-sm",
                                                                                    onClick: ()=>assumeContext(company),
                                                                                    children: "Contexto"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 1838,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 1831,
                                                                            columnNumber: 27
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1830,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, company.id, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1787,
                                                                columnNumber: 23
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1785,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1768,
                                                columnNumber: 17
                                            }, this),
                                            !filteredCompanies.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyPanel,
                                                children: "Nenhuma empresa encontrada para o filtro atual."
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1847,
                                                columnNumber: 46
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1767,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1740,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 1591,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerRoot,
                "data-open": drawerOpen,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerBackdrop,
                        onClick: ()=>setDrawerOpen(false),
                        "aria-label": "Fechar detalhes"
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 1855,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerPanel,
                        children: [
                            detailLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerLoading,
                                children: "Carregando empresa..."
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 1857,
                                columnNumber: 28
                            }, this) : null,
                            !detailLoading && activeCompany ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerHeader,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                        children: "Empresa ativa no detalhe"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1862,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                        children: activeCompany.name
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1863,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerBadges,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: badgeClass(statusTone(activeCompany.statusBucket)),
                                                                children: bucketLabel(activeCompany.statusBucket)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1865,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "badge",
                                                                children: activeCompany.plan?.name || "Sem plano"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1866,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "badge",
                                                                children: paymentMethodLabel(activeCompany.paymentMethod)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1867,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1864,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1861,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].iconButton,
                                                onClick: ()=>setDrawerOpen(false),
                                                children: "Fechar"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1870,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1860,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: activeContextCompanyId === activeCompany.id ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].contextBannerActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].contextBanner,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                children: "Você está operando esta empresa"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1874,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: activeContextCompanyId === activeCompany.id ? `${activeCompany.name} está assumida no contexto MASTER.` : "Assuma o contexto correto antes de criar usuários ou abrir o admin do website."
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1875,
                                                columnNumber: 17
                                            }, this),
                                            activeContextCompanyId !== activeCompany.id ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-primary btn-sm",
                                                onClick: ()=>assumeContext(activeCompany),
                                                children: "Assumir contexto"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1881,
                                                columnNumber: 19
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1873,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerTabs,
                                        children: TABS.map((tab)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: drawerTab === tab.id ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerTab,
                                                onClick: ()=>setDrawerTab(tab.id),
                                                children: tab.label
                                            }, tab.id, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1889,
                                                columnNumber: 19
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1887,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerBody,
                                        children: [
                                            drawerTab === "finance" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryStats,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Mensalidade"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1899,
                                                                        columnNumber: 26
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: formatCurrency(activeCompany.monthlyValue)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1899,
                                                                        columnNumber: 50
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1899,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Próxima cobrança"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1900,
                                                                        columnNumber: 26
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: formatDate(activeCompany.nextDueAt)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1900,
                                                                        columnNumber: 55
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1900,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Último pagamento"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1901,
                                                                        columnNumber: 26
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: activeCompany.lastPayment ? formatDate(activeCompany.lastPayment.paidAt) : "Sem histórico"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1901,
                                                                        columnNumber: 55
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1901,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Dias em atraso"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1902,
                                                                        columnNumber: 26
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: activeCompany.daysOverdue
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1902,
                                                                        columnNumber: 53
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1902,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1898,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerQuickActions,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-primary btn-sm",
                                                                onClick: ()=>openManualPayment(activeCompany),
                                                                children: "Lançar pagamento manual"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1905,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                type: "number",
                                                                min: "1",
                                                                max: "365",
                                                                value: trialDaysDraft,
                                                                onChange: (event)=>setTrialDaysDraft(event.target.value)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1906,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                disabled: !Number(trialDaysDraft),
                                                                onClick: ()=>runTrialAction(activeCompany.id, {
                                                                        action: "extend",
                                                                        days: Number(trialDaysDraft)
                                                                    }, `Trial prorrogado em ${trialDaysDraft} dias.`),
                                                                children: "Aplicar dias"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1907,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                type: "date",
                                                                value: trialDateDraft,
                                                                onChange: (event)=>setTrialDateDraft(event.target.value)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1908,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                disabled: !trialDateDraft,
                                                                onClick: ()=>runTrialAction(activeCompany.id, {
                                                                        action: "set_date",
                                                                        endsAt: `${trialDateDraft}T12:00:00`
                                                                    }, "Data do trial atualizada."),
                                                                children: "Definir data"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1909,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>setPaymentStatus(activeCompany.id, "PAID", "Cliente marcado como pago."),
                                                                children: "Marcar pago"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1910,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-danger btn-sm",
                                                                onClick: ()=>setConfirmAction({
                                                                        title: "Suspender cliente",
                                                                        description: `Isso vai suspender ${activeCompany.name} e desativar seus módulos.`,
                                                                        confirmLabel: "Suspender cliente",
                                                                        tone: "danger",
                                                                        run: async ()=>{
                                                                            setConfirmAction(null);
                                                                            await setPaymentStatus(activeCompany.id, "DISABLED", "Cliente suspenso.");
                                                                        }
                                                                    }),
                                                                children: "Suspender"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1911,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1904,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1897,
                                                columnNumber: 17
                                            }, this) : null,
                                            drawerTab === "summary" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                                        children: "Resumo operacional"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1929,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                        children: "Contexto completo da empresa ativa"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1930,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1928,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: "btn btn-secondary btn-sm",
                                                                        onClick: ()=>openCompany(activeCompany.id, "finance"),
                                                                        children: "Ver pagamentos"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1933,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: "btn btn-secondary btn-sm",
                                                                        onClick: ()=>setDrawerTab("audit"),
                                                                        children: "Ver auditoria"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1936,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1932,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1927,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryMeta,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Responsável: ",
                                                                    activeCompany.primaryContactName || "Não definido"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1942,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Contato: ",
                                                                    activeCompany.contactEmail || activeCompany.contactPhone || "Sem contato principal"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1943,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Plano: ",
                                                                    activeCompany.plan?.name || "Sem plano",
                                                                    " • ",
                                                                    formatCurrency(activeCompany.monthlyValue)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1944,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Cobrança: ",
                                                                    subscriptionLabel(activeCompany.subscriptionStatus),
                                                                    " • ",
                                                                    paymentMethodLabel(activeCompany.paymentMethod)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1945,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Website: ",
                                                                    activeCompany.website.enabled ? "Habilitado" : "Desligado",
                                                                    " • ",
                                                                    activeCompany.website.configured ? "Configurado" : "Pendente"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1946,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Módulos ativos: ",
                                                                    activeCompany.modules.filter((module)=>module.enabled).map((module)=>module.name).join(", ") || "Nenhum módulo ativo"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1947,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1941,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryStats,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Trial inicia"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1950,
                                                                        columnNumber: 28
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: formatDate(activeCompany.trialStartsAt)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1950,
                                                                        columnNumber: 53
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1950,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Trial termina"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1951,
                                                                        columnNumber: 28
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: formatDate(activeCompany.trialEndsAt)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1951,
                                                                        columnNumber: 54
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1951,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Trial restante"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1952,
                                                                        columnNumber: 28
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: activeCompany.trialRemainingDays != null ? `${activeCompany.trialRemainingDays} dia(s)` : "-"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1952,
                                                                        columnNumber: 55
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1952,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Valor em aberto"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1953,
                                                                        columnNumber: 28
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                        children: formatCurrency(activeCompany.currentOutstandingValue)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1953,
                                                                        columnNumber: 56
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1953,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1949,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>runTrialAction(activeCompany.id, {
                                                                        action: "reactivate",
                                                                        days: 7
                                                                    }, "Trial reativado por 7 dias."),
                                                                children: "Reativar trial"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1956,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>setConfirmAction({
                                                                        title: "Encerrar trial",
                                                                        description: `O trial de ${activeCompany.name} será encerrado agora.`,
                                                                        confirmLabel: "Encerrar trial",
                                                                        tone: "danger",
                                                                        run: async ()=>{
                                                                            setConfirmAction(null);
                                                                            await runTrialAction(activeCompany.id, {
                                                                                action: "end"
                                                                            }, "Trial encerrado.");
                                                                        }
                                                                    }),
                                                                children: "Encerrar trial"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1963,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>launchWebsite(activeCompany.id, "public"),
                                                                children: "Abrir website"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1979,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>launchWebsite(activeCompany.id, "admin"),
                                                                children: "Abrir admin"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1982,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1955,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timeline,
                                                        children: activeCompany.trialHistory.length ? activeCompany.trialHistory.map((entry)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timelineItem,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timelineDot
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1990,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timelineTopline,
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                        children: entry.action
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 1993,
                                                                                        columnNumber: 33
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                        children: formatDateTime(entry.createdAt)
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 1994,
                                                                                        columnNumber: 33
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 1992,
                                                                                columnNumber: 31
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                children: entry.scope
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 1996,
                                                                                columnNumber: 31
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 1991,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                ]
                                                            }, entry.id, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 1989,
                                                                columnNumber: 27
                                                            }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyPanel,
                                                            children: "Nenhum histórico de trial para esta empresa."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                            lineNumber: 2001,
                                                            columnNumber: 25
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 1986,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 1926,
                                                columnNumber: 19
                                            }, this) : null,
                                            drawerTab === "finance" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                                        children: "Financeiro"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2011,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                        children: "Configuração financeira e histórico"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2012,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2010,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: "btn btn-primary btn-sm",
                                                                        onClick: saveProfile,
                                                                        children: "Salvar financeiro"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2015,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: "btn btn-secondary btn-sm",
                                                                        onClick: ()=>{
                                                                            const csv = buildCsv(activeCompany);
                                                                            const blob = new Blob([
                                                                                csv
                                                                            ], {
                                                                                type: "text/csv;charset=utf-8;"
                                                                            });
                                                                            const url = URL.createObjectURL(blob);
                                                                            const link = document.createElement("a");
                                                                            link.href = url;
                                                                            link.download = `master-financeiro-${activeCompany.slug || activeCompany.id}.csv`;
                                                                            document.body.appendChild(link);
                                                                            link.click();
                                                                            link.remove();
                                                                            URL.revokeObjectURL(url);
                                                                        },
                                                                        children: "Exportar histórico"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2018,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2014,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2009,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "Nome da empresa",
                                                                value: profileDraft?.name || "",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            name: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2039,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "Responsável",
                                                                value: profileDraft?.primaryContactName || "",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            primaryContactName: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2040,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "E-mail",
                                                                value: profileDraft?.contactEmail || "",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            contactEmail: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2041,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "Telefone",
                                                                value: profileDraft?.contactPhone || "",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            contactPhone: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2042,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "CPF/CNPJ",
                                                                value: profileDraft?.taxDocument || "",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            taxDocument: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2043,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                className: "field",
                                                                value: profileDraft?.paymentMethod || "NONE",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            paymentMethod: event.target.value
                                                                        } : current),
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "NONE",
                                                                        children: "Sem método"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2045,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "CARD",
                                                                        children: "Cartão"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2046,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "PIX",
                                                                        children: "Pix"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2047,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "BOLETO",
                                                                        children: "Boleto"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2048,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "MANUAL",
                                                                        children: "Manual"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2049,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2044,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                className: "field",
                                                                value: profileDraft?.subscriptionStatus || "trialing",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            subscriptionStatus: event.target.value
                                                                        } : current),
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "trialing",
                                                                        children: "Trial"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2052,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "active",
                                                                        children: "Ativa"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2053,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "past_due",
                                                                        children: "Em atraso"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2054,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "canceled",
                                                                        children: "Cancelada"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2055,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "expired",
                                                                        children: "Expirada"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2056,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2051,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                className: "field",
                                                                value: profileDraft?.billingProvider || "manual",
                                                                onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                            ...current,
                                                                            billingProvider: event.target.value
                                                                        } : current),
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "manual",
                                                                        children: "manual"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2059,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "mercadopago",
                                                                        children: "mercadopago"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2060,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "stripe",
                                                                        children: "stripe"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2061,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "apple",
                                                                        children: "apple"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2062,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "google",
                                                                        children: "google"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2063,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2058,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].checkboxCard,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                        type: "checkbox",
                                                                        checked: Boolean(profileDraft?.premiumAccess),
                                                                        onChange: (event)=>setProfileDraft((current)=>current ? {
                                                                                    ...current,
                                                                                    premiumAccess: event.target.checked
                                                                                } : current)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2066,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    "Liberar acesso operacional mesmo fora da régua automática"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2065,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2038,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyTableWrap,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyTable,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "ID"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2074,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Competência"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2075,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Valor"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2076,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Vencimento"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2077,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Pagamento"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2078,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Status"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2079,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Origem"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2080,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Método"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2081,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                children: "Ações"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2082,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2073,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2072,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                                    children: activeCompany.financeHistory.map((entry)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: entry.id.slice(0, 8)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2088,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: entry.competence || "-"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2089,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: formatCurrency(entry.amount)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2090,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: formatDate(entry.dueDate)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2091,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: formatDateTime(entry.paidAt)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2092,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                        className: "badge",
                                                                                        children: entry.status
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2093,
                                                                                        columnNumber: 35
                                                                                    }, this)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2093,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: entry.origin || entry.entryType
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2094,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: paymentMethodLabel(entry.paymentMethod)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2095,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                    children: String(entry.origin || "").toLowerCase() === "master_manual_payment" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                        type: "button",
                                                                                        className: "btn btn-secondary btn-sm",
                                                                                        onClick: ()=>setConfirmAction({
                                                                                                title: "Remover lançamento manual",
                                                                                                description: `O lançamento ${entry.id.slice(0, 8)} será marcado como cancelado e continuará no histórico.`,
                                                                                                confirmLabel: "Remover lançamento",
                                                                                                tone: "danger",
                                                                                                run: async ()=>{
                                                                                                    setConfirmAction(null);
                                                                                                    await cancelManualPayment(entry.id);
                                                                                                }
                                                                                            }),
                                                                                        children: "Remover"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2098,
                                                                                        columnNumber: 35
                                                                                    }, this) : "-"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2096,
                                                                                    columnNumber: 31
                                                                                }, this)
                                                                            ]
                                                                        }, entry.id, true, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 2087,
                                                                            columnNumber: 29
                                                                        }, this))
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2085,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                            lineNumber: 2071,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2070,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 2008,
                                                columnNumber: 19
                                            }, this) : null,
                                            drawerTab === "users" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                                        children: "Segurança operacional"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2132,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                        children: "Usuários"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2133,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2131,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-primary btn-sm",
                                                                onClick: ()=>setUserModal({
                                                                        mode: "create",
                                                                        companyId: activeCompany.id,
                                                                        companyName: activeCompany.name,
                                                                        email: "",
                                                                        username: "",
                                                                        role: "USER",
                                                                        password: ""
                                                                    }),
                                                                children: "Criar usuário"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2135,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2130,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userList,
                                                        children: activeCompany.users.map((user)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userCard,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                children: user.username || user.email || `#${user.id}`
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2157,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                children: user.email || "Sem e-mail"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2158,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2156,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modulePills,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: "badge",
                                                                                children: user.role
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2161,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: badgeClass(user.isActive ? "success" : "danger"),
                                                                                children: user.isActive ? "Ativo" : "Inativo"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2162,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2160,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                type: "button",
                                                                                className: "btn btn-secondary btn-sm",
                                                                                onClick: ()=>setUserModal({
                                                                                        mode: "edit",
                                                                                        companyId: activeCompany.id,
                                                                                        companyName: activeCompany.name,
                                                                                        userId: user.id,
                                                                                        userLabel: user.username || user.email || `#${user.id}`,
                                                                                        email: user.email || "",
                                                                                        username: user.username || "",
                                                                                        role: user.role === "ADMIN" || user.role === "GERENTE" ? user.role : "USER",
                                                                                        password: ""
                                                                                    }),
                                                                                children: "Editar"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2165,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                type: "button",
                                                                                className: "btn btn-secondary btn-sm",
                                                                                onClick: ()=>setUserModal({
                                                                                        mode: "reset",
                                                                                        companyId: activeCompany.id,
                                                                                        companyName: activeCompany.name,
                                                                                        userId: user.id,
                                                                                        userLabel: user.username || user.email || `#${user.id}`,
                                                                                        email: user.email || "",
                                                                                        username: user.username || "",
                                                                                        role: user.role === "ADMIN" || user.role === "GERENTE" ? user.role : "USER",
                                                                                        password: ""
                                                                                    }),
                                                                                children: "Resetar senha"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2184,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                type: "button",
                                                                                className: "btn btn-danger btn-sm",
                                                                                onClick: ()=>setConfirmAction({
                                                                                        title: "Deletar usuário",
                                                                                        description: `O usuário ${user.username || user.email || `#${user.id}`} será removido desta empresa.`,
                                                                                        confirmLabel: "Deletar usuário",
                                                                                        tone: "danger",
                                                                                        run: async ()=>{
                                                                                            setConfirmAction(null);
                                                                                            await deleteUser(activeCompany.id, user.id, user.username || user.email || `#${user.id}`);
                                                                                        }
                                                                                    }),
                                                                                children: "Deletar"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2203,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2164,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, user.id, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2155,
                                                                columnNumber: 25
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2153,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 2129,
                                                columnNumber: 19
                                            }, this) : null,
                                            drawerTab === "modules" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                                        children: "Produtos habilitados"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2232,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                        children: "Módulos"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2233,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2231,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryMeta,
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    children: [
                                                                        "Total mensal dos ativos: ",
                                                                        formatCurrency(activeCompany.modules.filter((module)=>module.enabled).reduce((total, module)=>total + Number(module.monthlyPrice || 0), 0))
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2236,
                                                                    columnNumber: 25
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2235,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2230,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleList,
                                                        children: activeCompany.modules.map((module)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleToggle,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                children: module.name
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2243,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                children: [
                                                                                    module.key,
                                                                                    " • ",
                                                                                    formatCurrency(module.monthlyPrice || 0),
                                                                                    "/mês"
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2244,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2242,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: module.enabled ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].toggleOn : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].toggleOff,
                                                                        onClick: ()=>toggleModule(activeCompany.id, module.key, module.enabled),
                                                                        children: module.enabled ? "Ativo" : "Desativado"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2246,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, module.key, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2241,
                                                                columnNumber: 25
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2239,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 2229,
                                                columnNumber: 19
                                            }, this) : null,
                                            drawerTab === "website" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                                        children: "Website"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2259,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                        children: "Configuração do website"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2260,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2258,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-primary btn-sm",
                                                                onClick: saveWebsite,
                                                                children: "Salvar website"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2262,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2257,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].checkboxCard,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                        type: "checkbox",
                                                                        checked: Boolean(websiteDraft?.websiteEnabled),
                                                                        onChange: (event)=>setWebsiteDraft((current)=>current ? {
                                                                                    ...current,
                                                                                    websiteEnabled: event.target.checked
                                                                                } : current)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2268,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    "Website habilitado"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2267,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].checkboxCard,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                        type: "checkbox",
                                                                        checked: Boolean(websiteDraft?.websiteAdminEnabled),
                                                                        onChange: (event)=>setWebsiteDraft((current)=>current ? {
                                                                                    ...current,
                                                                                    websiteAdminEnabled: event.target.checked
                                                                                } : current)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2272,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    "Admin habilitado"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2271,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                className: "field",
                                                                value: websiteDraft?.websiteLaunchMode || "public",
                                                                onChange: (event)=>setWebsiteDraft((current)=>current ? {
                                                                            ...current,
                                                                            websiteLaunchMode: event.target.value === "admin" ? "admin" : "public"
                                                                        } : current),
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "public",
                                                                        children: "Abrir site público"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2276,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "admin",
                                                                        children: "Abrir admin"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2277,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2275,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "URL pública",
                                                                value: websiteDraft?.websitePublicUrl || "",
                                                                onChange: (event)=>setWebsiteDraft((current)=>current ? {
                                                                            ...current,
                                                                            websitePublicUrl: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2279,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "Project ID",
                                                                value: websiteDraft?.websiteProjectId || "",
                                                                onChange: (event)=>setWebsiteDraft((current)=>current ? {
                                                                            ...current,
                                                                            websiteProjectId: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2280,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "URL do admin",
                                                                value: websiteDraft?.websiteAdminUrl || "",
                                                                onChange: (event)=>setWebsiteDraft((current)=>current ? {
                                                                            ...current,
                                                                            websiteAdminUrl: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2281,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2266,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>launchWebsite(activeCompany.id, "public"),
                                                                children: "Abrir website"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2284,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>launchWebsite(activeCompany.id, "admin"),
                                                                children: "Abrir admin"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2285,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2283,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 2256,
                                                columnNumber: 19
                                            }, this) : null,
                                            drawerTab === "integrations" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                                        children: "Integrações"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2294,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                        children: "Mercado Pago e WhatsApp com token MASTER"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2295,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2293,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: ()=>setMasterIntegrationsOpen(true),
                                                                children: "Editar tokens MASTER"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2297,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2292,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryMeta,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Mercado Pago: ",
                                                                    mercadoPagoDraft?.status || activeCompany.mercadoPago.status || "Sem status"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2302,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "Conta MP: ",
                                                                    mercadoPagoDraft?.accountEmail || activeCompany.mercadoPago.accountEmail || "-"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2303,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "MASTER Pagamentos: ",
                                                                    workspace?.masterIntegrations?.mercadoPagoConfigured ? "Configurado" : "Pendente"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2304,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "WhatsApps configurados: ",
                                                                    activeCompany.whatsapp.endpoints.length
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2305,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: [
                                                                    "MASTER WhatsApp: ",
                                                                    workspace?.masterIntegrations?.whatsappConfigured ? "Configurado" : "Pendente"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2306,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2301,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userCard,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                children: "Mercado Pago da empresa"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2311,
                                                                                columnNumber: 27
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                children: "Checkout por cartão e webhook financeiro desta empresa. Você pode trocar para o token global do MASTER."
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2312,
                                                                                columnNumber: 27
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2310,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineCheck,
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                                        type: "checkbox",
                                                                                        checked: Boolean(activeCompany.mercadoPago.usingMasterToken),
                                                                                        onChange: ()=>void setCompanyMasterTokenUsage({
                                                                                                useMasterMercadoPagoToken: !activeCompany.mercadoPago.usingMasterToken
                                                                                            }),
                                                                                        disabled: busyAction === `master-token-usage-${activeCompany.id}` || !activeCompany.mercadoPago.usingMasterToken && !workspace?.masterIntegrations?.mercadoPagoConfigured
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2316,
                                                                                        columnNumber: 29
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                        children: "Usar Token Master"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2329,
                                                                                        columnNumber: 29
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2315,
                                                                                columnNumber: 27
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                type: "button",
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].iconOnlyButton,
                                                                                onClick: ()=>setIntegrationVisibility((current)=>({
                                                                                            ...current,
                                                                                            mercadopago: !current.mercadopago
                                                                                        })),
                                                                                "aria-label": "Ver token da empresa",
                                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(EyeIcon, {}, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2332,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2331,
                                                                                columnNumber: 27
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2314,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2309,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modulePills,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: badgeClass(activeCompany.mercadoPago.usingMasterToken ? "success" : "warning"),
                                                                        children: activeCompany.mercadoPago.usingMasterToken ? "Usando token MASTER" : "Usando token próprio"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2337,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "badge",
                                                                        children: [
                                                                            "MASTER ",
                                                                            activeCompany.mercadoPago.masterTokenConfigured ? "configurado" : "pendente"
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2340,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2336,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                placeholder: "Cole o access token do Mercado Pago",
                                                                value: mercadoPagoDraft?.mercadoPagoAccessToken || "",
                                                                onChange: (event)=>setMercadoPagoDraft((current)=>current ? {
                                                                            ...current,
                                                                            mercadoPagoAccessToken: event.target.value
                                                                        } : current)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2344,
                                                                columnNumber: 23
                                                            }, this),
                                                            integrationVisibility.mercadopago && activeCompany.mercadoPago.accessTokenValue ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "msg-info",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "text-sm",
                                                                    children: activeCompany.mercadoPago.accessTokenValue
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2346,
                                                                    columnNumber: 51
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2346,
                                                                columnNumber: 25
                                                            }, this) : null,
                                                            activeCompany.mercadoPago.masterTokenConfigured ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "msg-info",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "text-sm",
                                                                        children: [
                                                                            "Token MASTER pronto para uso nesta empresa.",
                                                                            integrationVisibility.master_mp && activeCompany.mercadoPago.masterAccessTokenValue ? ` ${activeCompany.mercadoPago.masterAccessTokenValue}` : ""
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2350,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].iconOnlyButton,
                                                                        onClick: ()=>setIntegrationVisibility((current)=>({
                                                                                    ...current,
                                                                                    master_mp: !current.master_mp
                                                                                })),
                                                                        "aria-label": "Ver token master de Mercado Pago",
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(EyeIcon, {}, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 2357,
                                                                            columnNumber: 29
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2356,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2349,
                                                                columnNumber: 25
                                                            }, this) : null
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2308,
                                                        columnNumber: 21
                                                    }, this),
                                                    mercadoPagoDraft?.statusError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "alert alert-error",
                                                        children: mercadoPagoDraft.statusError
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2362,
                                                        columnNumber: 54
                                                    }, this) : null,
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: validateMercadoPagoConfig,
                                                                children: "Validar token"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2364,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-primary btn-sm",
                                                                onClick: saveMercadoPagoConfig,
                                                                children: "Salvar token"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2365,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2363,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userCard,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                children: "WhatsApp da empresa"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2370,
                                                                                columnNumber: 27
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                children: "Use o token global do MASTER para onboarding e operação guiada da empresa."
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2371,
                                                                                columnNumber: 27
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2369,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineCheck,
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                                        type: "checkbox",
                                                                                        checked: Boolean(activeCompany.whatsapp.usingMasterToken),
                                                                                        onChange: ()=>void setCompanyMasterTokenUsage({
                                                                                                useMasterWhatsAppToken: !activeCompany.whatsapp.usingMasterToken
                                                                                            }),
                                                                                        disabled: busyAction === `master-token-usage-${activeCompany.id}` || !activeCompany.whatsapp.usingMasterToken && !workspace?.masterIntegrations?.whatsappConfigured
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2375,
                                                                                        columnNumber: 29
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                        children: "Usar Token Master"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2388,
                                                                                        columnNumber: 29
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2374,
                                                                                columnNumber: 27
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                type: "button",
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].iconOnlyButton,
                                                                                onClick: ()=>setIntegrationVisibility((current)=>({
                                                                                            ...current,
                                                                                            whatsapp_company: !current.whatsapp_company
                                                                                        })),
                                                                                "aria-label": "Ver token de WhatsApp da empresa",
                                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(EyeIcon, {}, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                    lineNumber: 2391,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2390,
                                                                                columnNumber: 27
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2373,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2368,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modulePills,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: badgeClass(activeCompany.whatsapp.usingMasterToken ? "success" : "warning"),
                                                                        children: activeCompany.whatsapp.usingMasterToken ? "Usando token MASTER" : "Usando token próprio"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2396,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "badge",
                                                                        children: [
                                                                            "MASTER ",
                                                                            activeCompany.whatsapp.masterAccessTokenConfigured ? "configurado" : "pendente"
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2399,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2395,
                                                                columnNumber: 23
                                                            }, this),
                                                            integrationVisibility.whatsapp_company && activeCompany.whatsapp.companyAccessTokenValue ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "msg-info",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "text-sm",
                                                                    children: activeCompany.whatsapp.companyAccessTokenValue
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2404,
                                                                    columnNumber: 51
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2404,
                                                                columnNumber: 25
                                                            }, this) : null,
                                                            activeCompany.whatsapp.masterAccessTokenConfigured ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "msg-info",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "text-sm",
                                                                        children: [
                                                                            "Número MASTER: ",
                                                                            activeCompany.whatsapp.masterDisplayNumber || "-",
                                                                            " • Phone ID: ",
                                                                            activeCompany.whatsapp.masterPhoneNumberId || "-",
                                                                            integrationVisibility.whatsapp_master && activeCompany.whatsapp.masterAccessTokenValue ? ` • Token: ${activeCompany.whatsapp.masterAccessTokenValue}` : ""
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2408,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].iconOnlyButton,
                                                                        onClick: ()=>setIntegrationVisibility((current)=>({
                                                                                    ...current,
                                                                                    whatsapp_master: !current.whatsapp_master
                                                                                })),
                                                                        "aria-label": "Ver token master de WhatsApp",
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(EyeIcon, {}, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 2415,
                                                                            columnNumber: 29
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2414,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2407,
                                                                columnNumber: 25
                                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "msg-info",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "text-sm",
                                                                    children: "Cadastre o WhatsApp global no botão Tokens MASTER para habilitar o V nesta empresa."
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2419,
                                                                    columnNumber: 51
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2419,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2367,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userList,
                                                        children: activeCompany.whatsapp.endpoints.map((endpoint)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userCard,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                children: endpoint.label || endpoint.whatsappDisplayNumber || "Entrada WhatsApp"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2426,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                children: endpoint.whatsappNumber || "Sem número"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2427,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2425,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modulePills,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: "badge",
                                                                                children: endpoint.moduleKey || "global"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2430,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: badgeClass(String(endpoint.whatsappStatus || "").toUpperCase() === "CONNECTED" ? "success" : "danger"),
                                                                                children: endpoint.whatsappStatus || "DISCONNECTED"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2431,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2429,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].iconOnlyButton,
                                                                        onClick: ()=>setIntegrationVisibility((current)=>({
                                                                                    ...current,
                                                                                    [endpoint.id]: !current[endpoint.id]
                                                                                })),
                                                                        "aria-label": "Ver token do endpoint",
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(EyeIcon, {}, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 2436,
                                                                            columnNumber: 29
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2435,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    integrationVisibility[endpoint.id] ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "msg-info",
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "text-sm",
                                                                            children: endpoint.accessTokenValue || "Sem token neste endpoint"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                            lineNumber: 2439,
                                                                            columnNumber: 55
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2439,
                                                                        columnNumber: 29
                                                                    }, this) : null
                                                                ]
                                                            }, endpoint.id, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2424,
                                                                columnNumber: 25
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2422,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 2291,
                                                columnNumber: 19
                                            }, this) : null,
                                            drawerTab === "audit" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelCardHeader,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                                    children: "Timeline"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2451,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                    children: "Auditoria"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                    lineNumber: 2452,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                            lineNumber: 2450,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2449,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timeline,
                                                        children: activeCompany.auditTimeline.map((entry)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timelineItem,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timelineDot
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2458,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].timelineTopline,
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                        children: entry.action
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2461,
                                                                                        columnNumber: 31
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                        children: formatDateTime(entry.createdAt)
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                        lineNumber: 2462,
                                                                                        columnNumber: 31
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2460,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                children: entry.scope
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                                lineNumber: 2464,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                        lineNumber: 2459,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, entry.id, true, {
                                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                                lineNumber: 2457,
                                                                columnNumber: 25
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                        lineNumber: 2455,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 2448,
                                                columnNumber: 19
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 1895,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true) : !detailLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerEmpty,
                                children: "Selecione uma empresa para abrir o detalhe premium."
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 2474,
                                columnNumber: 13
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 1856,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 1854,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModalShell, {
                open: masterIntegrationsOpen,
                onClose: ()=>setMasterIntegrationsOpen(false),
                title: "Tokens globais do MASTER",
                subtitle: "Cadastre seus tokens centrais para pagamentos e WhatsApp e reutilize nas empresas com o V MASTER.",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBody,
                    children: [
                        activeCompany ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].contextBannerActive,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: "Importar da empresa ativa"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2483,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        activeCompany.name,
                                        " pode transferir os tokens atuais para o MASTER e já ficar usando o token MASTER no lugar."
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2484,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].rowActions,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-primary btn-sm",
                                        onClick: ()=>setConfirmAction({
                                                title: "Importar tokens para o MASTER",
                                                description: `${activeCompany.name} terá os tokens copiados para o MASTER, a origem será limpa e a empresa passará a usar o token MASTER.`,
                                                confirmLabel: "Importar e limpar origem",
                                                tone: "primary",
                                                run: async ()=>{
                                                    setConfirmAction(null);
                                                    await importActiveCompanyTokensToMaster(true);
                                                }
                                            }),
                                        disabled: busyAction === `import-master-tokens-${activeCompany.id}`,
                                        children: busyAction === `import-master-tokens-${activeCompany.id}` ? "Importando..." : "Importar da empresa ativa"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                        lineNumber: 2488,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2487,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2482,
                            columnNumber: 13
                        }, this) : null,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userCard,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            children: "Pagamentos do MASTER"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2513,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: "Access token central do Mercado Pago para checkout em cartão e webhooks financeiros."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2514,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2512,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    placeholder: "Access token do Mercado Pago",
                                    value: masterIntegrationsDraft.mercadoPagoAccessToken,
                                    onChange: (event)=>setMasterIntegrationsDraft((current)=>({
                                                ...current,
                                                mercadoPagoAccessToken: event.target.value
                                            }))
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2516,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryMeta,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: [
                                                "Status: ",
                                                workspace?.masterIntegrations?.mercadoPagoConfigured ? "Configurado" : "Pendente"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2528,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: "Uso: empresas com V MASTER em Mercado Pago passam a cobrar com este token."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2529,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2527,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2511,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userCard,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            children: "WhatsApp do MASTER"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2535,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: "Credencial central do número que você usa para onboarding e operação das empresas."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2536,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2534,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "field",
                                            placeholder: "Access token do WhatsApp",
                                            value: masterIntegrationsDraft.whatsappAccessToken,
                                            onChange: (event)=>setMasterIntegrationsDraft((current)=>({
                                                        ...current,
                                                        whatsappAccessToken: event.target.value
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2539,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "field",
                                            placeholder: "Phone Number ID",
                                            value: masterIntegrationsDraft.whatsappPhoneNumberId,
                                            onChange: (event)=>setMasterIntegrationsDraft((current)=>({
                                                        ...current,
                                                        whatsappPhoneNumberId: event.target.value
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2550,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "field",
                                            placeholder: "WABA ID",
                                            value: masterIntegrationsDraft.whatsappWabaId,
                                            onChange: (event)=>setMasterIntegrationsDraft((current)=>({
                                                        ...current,
                                                        whatsappWabaId: event.target.value
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2561,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "field",
                                            placeholder: "Número WhatsApp",
                                            value: masterIntegrationsDraft.whatsappNumber,
                                            onChange: (event)=>setMasterIntegrationsDraft((current)=>({
                                                        ...current,
                                                        whatsappNumber: event.target.value
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2572,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "field",
                                            placeholder: "Número exibido",
                                            value: masterIntegrationsDraft.whatsappDisplayNumber,
                                            onChange: (event)=>setMasterIntegrationsDraft((current)=>({
                                                        ...current,
                                                        whatsappDisplayNumber: event.target.value
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2583,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2538,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryMeta,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: [
                                                "Status: ",
                                                workspace?.masterIntegrations?.whatsappConfigured ? "Configurado" : "Pendente"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2596,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: "Uso: empresas com V MASTER em WhatsApp passam a operar com esta credencial global."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2597,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2595,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2533,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: ()=>setMasterIntegrationsOpen(false),
                                    children: "Fechar"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2602,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-primary btn-sm",
                                    onClick: saveMasterIntegrations,
                                    disabled: busyAction === "master-integrations-save",
                                    children: busyAction === "master-integrations-save" ? "Salvando..." : "Salvar tokens MASTER"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2605,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2601,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 2480,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 2479,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModalShell, {
                open: moduleCatalogOpen,
                onClose: ()=>setModuleCatalogOpen(false),
                title: "Módulos comercializáveis",
                subtitle: "Defina aqui apenas os módulos que podem ser liberados para empresas e entram na cobrança mensal.",
                wide: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBody,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].contextBannerStrong,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: "Catálogo financeiro do HBX"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2615,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "Itens internos do MASTER e ferramentas operacionais não aparecem aqui nem entram na mensalidade das empresas."
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2616,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2614,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCatalogGrid,
                            children: commercialModuleDrafts.map((moduleItem)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].userCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: moduleItem.name
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 2622,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: moduleItem.key
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 2623,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2621,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "field",
                                            placeholder: "Nome do módulo",
                                            value: moduleItem.name,
                                            onChange: (event)=>setModuleCatalogDrafts((current)=>({
                                                        ...current,
                                                        [moduleItem.key]: {
                                                            ...current[moduleItem.key],
                                                            name: event.target.value
                                                        }
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2625,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "field",
                                            inputMode: "numeric",
                                            placeholder: "R$ 0,00",
                                            value: moduleItem.monthlyPrice,
                                            onChange: (event)=>setModuleCatalogDrafts((current)=>({
                                                        ...current,
                                                        [moduleItem.key]: {
                                                            ...current[moduleItem.key],
                                                            monthlyPrice: normalizeCurrencyInput(event.target.value)
                                                        }
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2626,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                            className: "field",
                                            placeholder: "Descrição",
                                            rows: 3,
                                            value: moduleItem.description,
                                            onChange: (event)=>setModuleCatalogDrafts((current)=>({
                                                        ...current,
                                                        [moduleItem.key]: {
                                                            ...current[moduleItem.key],
                                                            description: event.target.value
                                                        }
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2627,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            className: "field",
                                            value: moduleItem.defaultEnabled ? "enabled" : "disabled",
                                            onChange: (event)=>setModuleCatalogDrafts((current)=>({
                                                        ...current,
                                                        [moduleItem.key]: {
                                                            ...current[moduleItem.key],
                                                            defaultEnabled: event.target.value === "enabled"
                                                        }
                                                    })),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "enabled",
                                                    children: "Ativo por padrão"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 2629,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "disabled",
                                                    children: "Desativado por padrão"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 2630,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2628,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].summaryMeta,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: "Liberável para empresas"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 2633,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: moduleItem.defaultEnabled ? "Novas empresas recebem este módulo ativo" : "Novas empresas começam com este módulo desativado"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                    lineNumber: 2634,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2632,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-primary btn-sm",
                                                onClick: ()=>saveSystemModule(moduleItem.key),
                                                disabled: busyAction === `system-module-${moduleItem.key}`,
                                                children: busyAction === `system-module-${moduleItem.key}` ? "Salvando..." : "Salvar catálogo"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                                lineNumber: 2637,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2636,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, moduleItem.key, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2620,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2618,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 2613,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 2612,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModalShell, {
                open: createCompanyOpen,
                onClose: ()=>setCreateCompanyOpen(false),
                title: "Nova empresa",
                subtitle: "Crie a empresa e depois configure cobrança, website e módulos.",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBody,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            className: "field",
                            placeholder: "Nome da empresa",
                            value: createCompanyName,
                            onChange: (event)=>setCreateCompanyName(event.target.value)
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2649,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            className: "field",
                            placeholder: "Slug opcional",
                            value: createCompanySlug,
                            onChange: (event)=>setCreateCompanySlug(event.target.value)
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2650,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: ()=>setCreateCompanyOpen(false),
                                    children: "Cancelar"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2652,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-primary btn-sm",
                                    onClick: submitCreateCompany,
                                    disabled: busyAction === "create-company",
                                    children: busyAction === "create-company" ? "Criando..." : "Criar empresa"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2653,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2651,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 2648,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 2647,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModalShell, {
                open: Boolean(userModal),
                onClose: ()=>setUserModal(null),
                title: userModal?.mode === "create" ? "Criar usuário" : userModal?.mode === "edit" ? "Editar usuário" : "Resetar senha",
                subtitle: userModal ? `Empresa: ${userModal.companyName}` : "",
                children: userModal ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBody,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].contextBannerStrong,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: "Empresa ativa para esta operação"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2664,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: userModal.companyName
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2665,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2663,
                            columnNumber: 13
                        }, this),
                        userModal.mode !== "reset" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    placeholder: "E-mail",
                                    value: userModal.email,
                                    onChange: (event)=>setUserModal((current)=>current ? {
                                                ...current,
                                                email: event.target.value
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2669,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    placeholder: "Nome / username",
                                    value: userModal.username,
                                    onChange: (event)=>setUserModal((current)=>current ? {
                                                ...current,
                                                username: event.target.value
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2670,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    className: "field",
                                    value: userModal.role,
                                    onChange: (event)=>setUserModal((current)=>current ? {
                                                ...current,
                                                role: event.target.value
                                            } : current),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "USER",
                                            children: "USER"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2672,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "ADMIN",
                                            children: "ADMIN"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2673,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "GERENTE",
                                            children: "GERENTE"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2674,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2671,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true) : null,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            className: "field",
                            type: "password",
                            placeholder: userModal.mode === "reset" ? "Nova senha opcional" : "Senha opcional",
                            value: userModal.password,
                            onChange: (event)=>setUserModal((current)=>current ? {
                                        ...current,
                                        password: event.target.value
                                    } : current)
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2678,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: ()=>setUserModal(null),
                                    children: "Cancelar"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2680,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-primary btn-sm",
                                    onClick: submitUserModal,
                                    disabled: busyAction === `user-${userModal.mode}`,
                                    children: busyAction === `user-${userModal.mode}` ? "Salvando..." : userModal.mode === "create" ? "Criar usuário" : userModal.mode === "edit" ? "Salvar alterações" : "Resetar senha"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2681,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2679,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 2662,
                    columnNumber: 11
                }, this) : null
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 2660,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModalShell, {
                open: Boolean(manualPaymentModal),
                onClose: ()=>setManualPaymentModal(null),
                title: "Lançar pagamento manual",
                subtitle: manualPaymentModal ? `Registrar cobrança manual para ${manualPaymentModal.companyName}.` : "",
                children: manualPaymentModal ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBody,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    placeholder: "Valor",
                                    value: manualPaymentModal.value,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                value: event.target.value
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2693,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    placeholder: "Competência AAAA-MM",
                                    value: manualPaymentModal.competence,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                competence: event.target.value
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2694,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    type: "datetime-local",
                                    value: manualPaymentModal.paidAt,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                paidAt: event.target.value
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2695,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    type: "date",
                                    value: manualPaymentModal.dueDate,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                dueDate: event.target.value
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2696,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    className: "field",
                                    value: manualPaymentModal.paymentMethod,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                paymentMethod: event.target.value
                                            } : current),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "PIX",
                                            children: "PIX"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2698,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "TRANSFERENCIA",
                                            children: "Transferência"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2699,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "DINHEIRO",
                                            children: "Dinheiro"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2700,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "MANUAL",
                                            children: "Outro manual"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                            lineNumber: 2701,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2697,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    placeholder: "Observação",
                                    value: manualPaymentModal.observation,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                observation: event.target.value
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2703,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2692,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].checkboxCard,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "checkbox",
                                    checked: manualPaymentModal.settlePending,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                settlePending: event.target.checked
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2706,
                                    columnNumber: 15
                                }, this),
                                "Quitar a pendência atual"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2705,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].checkboxCard,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "checkbox",
                                    checked: manualPaymentModal.generateAudit,
                                    onChange: (event)=>setManualPaymentModal((current)=>current ? {
                                                ...current,
                                                generateAudit: event.target.checked
                                            } : current)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2710,
                                    columnNumber: 15
                                }, this),
                                "Registrar histórico e auditoria"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2709,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: ()=>setManualPaymentModal(null),
                                    children: "Cancelar"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2714,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-primary btn-sm",
                                    onClick: submitManualPayment,
                                    disabled: busyAction === "manual-payment",
                                    children: busyAction === "manual-payment" ? "Lançando..." : "Confirmar pagamento"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                    lineNumber: 2715,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                            lineNumber: 2713,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 2691,
                    columnNumber: 11
                }, this) : null
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 2689,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModalShell, {
                open: Boolean(confirmAction),
                onClose: ()=>setConfirmAction(null),
                title: confirmAction?.title || "Confirmar operação",
                subtitle: confirmAction?.description || "",
                children: confirmAction ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBody,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$master$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-secondary btn-sm",
                                onClick: ()=>setConfirmAction(null),
                                children: "Cancelar"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 2727,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: confirmAction.tone === "danger" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm",
                                onClick: ()=>void confirmAction.run(),
                                children: confirmAction.confirmLabel
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                                lineNumber: 2728,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                        lineNumber: 2726,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                    lineNumber: 2725,
                    columnNumber: 11
                }, this) : null
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
                lineNumber: 2723,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/master/page.premium.tsx",
        lineNumber: 1565,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_0f2a75ae._.js.map
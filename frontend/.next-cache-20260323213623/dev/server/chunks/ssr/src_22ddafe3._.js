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
                            lineNumber: 198,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCardBody,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: item.label
                                }, void 0, false, {
                                    fileName: "[project]/src/components/ModuleNav.tsx",
                                    lineNumber: 200,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleCardArrow,
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
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].moduleNavStatus,
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
function DashboardScaffold({ title, children, actions, showDashboardShortcut = true, hideHeader = false }) {
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
                                                lineNumber: 42,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ModuleNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "workspace-main",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "panel page-hero",
                                style: {
                                    display: hideHeader ? "none" : "block"
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "page-hero__copy",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "page-overline",
                                                children: sectionLabel
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DashboardScaffold.tsx",
                                                lineNumber: 53,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
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
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
}),
"[project]/src/lib/popup-visibility.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "acquirePopupTopbarLock",
    ()=>acquirePopupTopbarLock
]);
const POPUP_OPEN_ATTR = "data-popup-open";
let popupOpenCount = 0;
function syncPopupState() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (popupOpenCount > 0) {
        root.setAttribute(POPUP_OPEN_ATTR, "true");
        return;
    }
    root.removeAttribute(POPUP_OPEN_ATTR);
}
function acquirePopupTopbarLock() {
    if (typeof document === "undefined") {
        return ()=>undefined;
    }
    popupOpenCount += 1;
    syncPopupState();
    let released = false;
    return ()=>{
        if (released) return;
        released = true;
        popupOpenCount = Math.max(0, popupOpenCount - 1);
        syncPopupState();
    };
}
}),
"[project]/src/lib/use-popup-topbar-lock.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "usePopupTopbarLock",
    ()=>usePopupTopbarLock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$popup$2d$visibility$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/popup-visibility.ts [app-ssr] (ecmascript)");
"use client";
;
;
function usePopupTopbarLock(isPopupOpen) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isPopupOpen) return;
        const releaseTopbarLock = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$popup$2d$visibility$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["acquirePopupTopbarLock"])();
        return releaseTopbarLock;
    }, [
        isPopupOpen
    ]);
}
}),
"[project]/src/app/dashboard/_lib/polling.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "startSmartPolling",
    ()=>startSmartPolling
]);
"use client";
function startSmartPolling(task, options) {
    const intervalMs = Math.max(1000, options.intervalMs);
    const immediate = options.immediate ?? true;
    const pauseWhenHidden = options.pauseWhenHidden ?? true;
    let disposed = false;
    let inFlight = false;
    let timer = null;
    const schedule = (delay)=>{
        if (disposed) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(()=>{
            void run();
        }, delay);
    };
    const run = async ()=>{
        if (disposed) return;
        if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
            schedule(intervalMs);
            return;
        }
        if (inFlight) {
            schedule(intervalMs);
            return;
        }
        inFlight = true;
        try {
            await task();
        } finally{
            inFlight = false;
            schedule(intervalMs);
        }
    };
    const onVisibilityChange = ()=>{
        if (disposed || !pauseWhenHidden || typeof document === "undefined") return;
        if (!document.hidden) {
            schedule(0);
        }
    };
    if (pauseWhenHidden && typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibilityChange);
    }
    if (immediate) {
        void run();
    } else {
        schedule(intervalMs);
    }
    return ()=>{
        disposed = true;
        if (timer) clearTimeout(timer);
        if (pauseWhenHidden && typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", onVisibilityChange);
        }
    };
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
"[project]/src/app/dashboard/inbox/inbox-model.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ATENDIMENTO_QUEUE_EVENT",
    ()=>ATENDIMENTO_QUEUE_EVENT,
    "DEFAULT_ATENDIMENTO_AGENDA_CONFIG",
    ()=>DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
    "DEFAULT_ATENDIMENTO_BOT_CONFIG",
    ()=>DEFAULT_ATENDIMENTO_BOT_CONFIG,
    "buildAgendaActionId",
    ()=>buildAgendaActionId,
    "createCustomAction",
    ()=>createCustomAction,
    "fetchBrazilianHolidays",
    ()=>fetchBrazilianHolidays,
    "formatAgendaPreview",
    ()=>formatAgendaPreview,
    "formatCurrency",
    ()=>formatCurrency,
    "formatWeekday",
    ()=>formatWeekday,
    "getMessagePreview",
    ()=>getMessagePreview,
    "isHoliday",
    ()=>isHoliday,
    "normalizeAgendaConfig",
    ()=>normalizeAgendaConfig,
    "normalizeBotConfig",
    ()=>normalizeBotConfig
]);
const ATENDIMENTO_QUEUE_EVENT = "atendimento-human-queue";
function normalizeButtonId(value, fallback) {
    const normalized = String(value || fallback).trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_:-]/g, "").slice(0, 80);
    return normalized || fallback;
}
function buildDefaultButtonId(sectionKey, actionId, index) {
    return normalizeButtonId(`${sectionKey}_${actionId || "action"}_${index + 1}`, `${sectionKey}_${index + 1}`);
}
function makeDefaultButton(sectionKey, actionId, title, index) {
    return {
        buttonId: buildDefaultButtonId(sectionKey, actionId, index),
        actionId,
        title
    };
}
const DEFAULT_ATENDIMENTO_BOT_CONFIG = {
    variableCatalog: [
        {
            key: "cliente",
            label: "Nome do cliente",
            example: "Maria Oliveira",
            description: "Nome mostrado nas mensagens do Atendimento.",
            scope: "shared",
            required: true
        },
        {
            key: "empresa",
            label: "Nome da empresa",
            example: "Colsani Ar Condicionado",
            description: "Empresa logada no tenant atual.",
            scope: "shared",
            required: true
        },
        {
            key: "funcionario",
            label: "Atendente responsavel",
            example: "Leo Colsani",
            description: "Usado quando a conversa precisa ficar mais humana.",
            scope: "atendimento",
            required: false
        },
        {
            key: "valor_formatado",
            label: "Valor em aberto",
            example: "R$ 480,00",
            description: "Valor vindo do Recovery quando o cliente esta devendo.",
            scope: "recovery",
            required: false
        },
        {
            key: "agenda_nome",
            label: "Nome da agenda",
            example: "Tecnicos",
            description: "Nome da agenda escolhida pelo cliente.",
            scope: "atendimento",
            required: false
        },
        {
            key: "agenda_slots",
            label: "Horarios disponiveis",
            example: "Seg 09:00-11:00 | Qua 14:00-18:00",
            description: "Lista renderizada com os horarios ativos da agenda.",
            scope: "atendimento",
            required: false
        }
    ],
    actionCatalog: [
        {
            actionId: "start_quick_registration",
            title: "Iniciar cadastro rapido",
            description: "Abre a coleta inicial de dados para um novo cliente sem depender de texto livre.",
            route: "atendimento",
            kind: "reply",
            enabled: true,
            responseMessage: "Perfeito. Vamos iniciar seu cadastro rapido agora. Me envie seu nome completo para eu abrir a ficha inicial."
        },
        {
            actionId: "talk_human",
            title: "Falar com atendente",
            description: "Entrega a conversa para a fila humana do Atendimento.",
            route: "atendimento",
            kind: "human_handoff",
            enabled: true
        },
        {
            actionId: "close_topic",
            title: "Encerrar conversa",
            description: "Fecha a conversa sem manter o bot ativo.",
            route: "shared",
            kind: "close",
            enabled: true
        },
        {
            actionId: "enter_recovery",
            title: "Falar sobre o debito",
            description: "Entrega a conversa para o menu do Recovery quando houver inadimplencia.",
            route: "recovery",
            kind: "recovery_handoff",
            enabled: true
        },
        {
            actionId: "show_main_menu",
            title: "Mostrar menu principal",
            description: "Mostra novamente o menu principal do Atendimento.",
            route: "atendimento",
            kind: "show_menu",
            enabled: true
        }
    ],
    routingRules: {
        checkRecoveryBeforeReply: true,
        autoRouteDebtorsToRecovery: true,
        autoReopenClosedConversation: true,
        notifyOnNewInbound: true
    },
    welcomeMessage: "Ola, tudo bem?\nEu sou o atendimento digital da {{empresa}}. Nao localizamos em nosso cadastro seu telefone.",
    welcomeButtons: [
        makeDefaultButton("welcome_message", "start_quick_registration", "Fazer cadastro rapido", 0),
        makeDefaultButton("welcome_message", "talk_human", "Falar com atendente", 1)
    ],
    mainMenuPrompt: "Escolha abaixo como deseja continuar:",
    mainMenuButtons: [
        makeDefaultButton("main_menu", "talk_human", "Falar com atendente", 0)
    ],
    returningCustomerMessage: "Que bom te ver de novo, {{cliente}}. Vou continuar daqui e te mostrar as opcoes disponiveis.",
    recoveryDetectedMessage: "Localizei um cadastro com valor em aberto de {{valor_formatado}} no Recovery. Podemos conversar sobre isso agora ou prefere falar com um atendente?",
    recoveryDetectedButtons: [
        makeDefaultButton("recovery_detected", "enter_recovery", "Falar sobre o debito", 0),
        makeDefaultButton("recovery_detected", "talk_human", "Falar com atendente", 1)
    ],
    postActionPrompt: "Se precisar de mais alguma coisa, posso continuar por aqui.",
    postActionButtons: [
        makeDefaultButton("post_action", "show_main_menu", "Voltar ao menu", 0),
        makeDefaultButton("post_action", "talk_human", "Atendimento humano", 1)
    ],
    humanAckMessage: "Perfeito. Vou encaminhar sua conversa para um atendente agora.",
    closeTopicMessage: "Entendido. Vou encerrar esta conversa por agora. Quando precisar, e so chamar.",
    blockedMessage: "Este contato esta bloqueado no Atendimento."
};
const DEFAULT_ATENDIMENTO_AGENDA_CONFIG = {
    timezone: "America/Sao_Paulo",
    groups: [
        {
            id: "agenda_tecnicos",
            title: "Tecnicos",
            description: "Horarios de manutencao e visitas tecnicas.",
            buttonLabel: "Tecnicos",
            introMessage: "Esses sao os horarios disponiveis para {{agenda_nome}}. Se quiser, um atendente pode confirmar o melhor encaixe.\n\n{{agenda_slots}}",
            emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
            linkedEmail: "",
            linkedUserName: "",
            connectionStatus: "not_linked",
            accentColor: "#4da36f",
            isActive: true,
            slots: [
                {
                    id: "agenda_tecnicos_seg_0900",
                    label: "Segunda 09:00-11:00",
                    dayOfWeek: 1,
                    startTime: "09:00",
                    endTime: "11:00",
                    enabled: true
                },
                {
                    id: "agenda_tecnicos_qua_1400",
                    label: "Quarta 14:00-18:00",
                    dayOfWeek: 3,
                    startTime: "14:00",
                    endTime: "18:00",
                    enabled: true
                }
            ]
        },
        {
            id: "agenda_gerencia",
            title: "Gerencia",
            description: "Espacos de alinhamento, aprovacao e retorno executivo.",
            buttonLabel: "Gerencia",
            introMessage: "Essas sao as janelas abertas para {{agenda_nome}}. Escolha a melhor opcao e eu sigo com a confirmacao.\n\n{{agenda_slots}}",
            emptyMessage: "A gerencia nao abriu novos horarios nesta semana.",
            linkedEmail: "",
            linkedUserName: "",
            connectionStatus: "not_linked",
            accentColor: "#5d83ff",
            isActive: true,
            slots: [
                {
                    id: "agenda_gerencia_ter_1000",
                    label: "Terca 10:00-11:00",
                    dayOfWeek: 2,
                    startTime: "10:00",
                    endTime: "11:00",
                    enabled: true
                },
                {
                    id: "agenda_gerencia_qui_1500",
                    label: "Quinta 15:00-16:30",
                    dayOfWeek: 4,
                    startTime: "15:00",
                    endTime: "16:30",
                    enabled: true
                }
            ]
        },
        {
            id: "agenda_equipe",
            title: "Equipe",
            description: "Treinamentos, handoff e distribuicao da operacao.",
            buttonLabel: "Equipe",
            introMessage: "Esses horarios da {{agenda_nome}} ja estao liberados para atendimento.\n\n{{agenda_slots}}",
            emptyMessage: "A equipe ainda nao publicou novas faixas para este fluxo.",
            linkedEmail: "",
            linkedUserName: "",
            connectionStatus: "not_linked",
            accentColor: "#e57b47",
            isActive: true,
            slots: [
                {
                    id: "agenda_equipe_seg_0830",
                    label: "Segunda 08:30-09:30",
                    dayOfWeek: 1,
                    startTime: "08:30",
                    endTime: "09:30",
                    enabled: true
                },
                {
                    id: "agenda_equipe_sex_1330",
                    label: "Sexta 13:30-15:00",
                    dayOfWeek: 5,
                    startTime: "13:30",
                    endTime: "15:00",
                    enabled: true
                }
            ]
        }
    ],
    holidays: []
};
function uniqueByKey(items) {
    const map = new Map();
    for (const item of items)map.set(item.key, item);
    return Array.from(map.values());
}
function uniqueByAction(items) {
    const map = new Map();
    for (const item of items)map.set(item.actionId, item);
    return Array.from(map.values());
}
function normalizeBotConfig(payload) {
    const hasWelcomeButtons = Boolean(payload) && Object.prototype.hasOwnProperty.call(payload, "welcomeButtons");
    const merged = {
        ...DEFAULT_ATENDIMENTO_BOT_CONFIG,
        ...payload || {}
    };
    return {
        ...merged,
        variableCatalog: uniqueByKey([
            ...DEFAULT_ATENDIMENTO_BOT_CONFIG.variableCatalog,
            ...payload?.variableCatalog || []
        ].map((item)=>({
                key: String(item.key || "").trim(),
                label: String(item.label || item.key || "").trim(),
                example: String(item.example || "").trim(),
                description: String(item.description || "").trim(),
                scope: [
                    "shared",
                    "atendimento",
                    "recovery"
                ].includes(item.scope) ? item.scope : "shared",
                required: Boolean(item.required)
            }))).filter((item)=>item.key),
        actionCatalog: uniqueByAction([
            ...DEFAULT_ATENDIMENTO_BOT_CONFIG.actionCatalog,
            ...payload?.actionCatalog || []
        ].map((item)=>({
                actionId: String(item.actionId || "").trim(),
                title: String(item.title || item.actionId || "").trim(),
                description: String(item.description || "").trim(),
                route: [
                    "shared",
                    "atendimento",
                    "recovery"
                ].includes(item.route) ? item.route : "shared",
                kind: [
                    "reply",
                    "human_handoff",
                    "recovery_handoff",
                    "close",
                    "show_menu",
                    "agenda"
                ].includes(item.kind) ? item.kind : "reply",
                enabled: item.enabled ?? true,
                responseMessage: String(item.responseMessage || "").trim(),
                agendaGroupId: String(item.agendaGroupId || "").trim() || null,
                custom: Boolean(item.custom)
            }))).filter((item)=>item.actionId),
        welcomeButtons: hasWelcomeButtons ? normalizeButtons(payload?.welcomeButtons, DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeButtons, "welcome_message") : [],
        mainMenuButtons: normalizeButtons(payload?.mainMenuButtons, DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuButtons, "main_menu"),
        recoveryDetectedButtons: normalizeButtons(payload?.recoveryDetectedButtons, DEFAULT_ATENDIMENTO_BOT_CONFIG.recoveryDetectedButtons, "recovery_detected"),
        postActionButtons: normalizeButtons(payload?.postActionButtons, DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionButtons, "post_action"),
        routingRules: {
            ...DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules,
            ...payload?.routingRules || {}
        }
    };
}
function normalizeButtons(buttons, fallback, sectionKey) {
    if (buttons === undefined || buttons === null) {
        return fallback.map((button)=>({
                ...button
            }));
    }
    const seen = new Set();
    return buttons.map((button, index)=>{
        const buttonId = normalizeButtonId(button.buttonId, buildDefaultButtonId(sectionKey, button.actionId, index));
        if (seen.has(buttonId)) return null;
        seen.add(buttonId);
        return {
            buttonId,
            actionId: String(button.actionId || "").trim(),
            title: String(button.title || "").trim()
        };
    }).filter((button)=>Boolean(button?.buttonId && button.actionId && button.title));
}
function normalizeAgendaConfig(payload) {
    return {
        timezone: String(payload?.timezone || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.timezone).trim(),
        holidays: Array.isArray(payload?.holidays) ? payload.holidays.filter((date)=>/^\d{4}-\d{2}-\d{2}$/.test(String(date))).map((date)=>String(date)) : [],
        groups: Array.isArray(payload?.groups) && payload.groups.length ? payload.groups.map((group, groupIndex)=>({
                id: String(group.id || `agenda_group_${groupIndex + 1}`).trim(),
                title: String(group.title || `Agenda ${groupIndex + 1}`).trim(),
                description: String(group.description || "").trim(),
                buttonLabel: String(group.buttonLabel || group.title || "Abrir agenda").trim(),
                introMessage: String(group.introMessage || "").trim(),
                emptyMessage: String(group.emptyMessage || "Sem horarios ativos.").trim(),
                linkedEmail: String(group.linkedEmail || "").trim().toLowerCase(),
                linkedUserName: String(group.linkedUserName || "").trim(),
                connectionStatus: group.connectionStatus === "connected" || group.connectionStatus === "pending" ? group.connectionStatus : "not_linked",
                accentColor: String(group.accentColor || "#4da36f").trim() || "#4da36f",
                isActive: group.isActive ?? true,
                slots: Array.isArray(group.slots) ? group.slots.map((slot, slotIndex)=>({
                        id: String(slot.id || `${group.id || `agenda_group_${groupIndex + 1}`}_${slotIndex + 1}`).trim(),
                        label: String(slot.label || `${slot.startTime}-${slot.endTime}`).trim(),
                        dayOfWeek: Number(slot.dayOfWeek || 0),
                        startTime: String(slot.startTime || "09:00").trim(),
                        endTime: String(slot.endTime || "10:00").trim(),
                        enabled: slot.enabled ?? true
                    })) : []
            })) : DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups.map((group)=>({
                ...group,
                slots: group.slots.map((slot)=>({
                        ...slot
                    }))
            }))
    };
}
function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}
function getMessagePreview(message) {
    if (!message) return "Sem mensagens";
    const content = String(message.content || "").trim();
    if (content) return content;
    const type = String(message.messageType || "text").trim().toLowerCase();
    if (type === "image") return "[Imagem recebida]";
    if (type === "audio") return "[Audio recebido]";
    if (type === "document") return "[Documento recebido]";
    if (type === "interactive") return "[Interacao recebida]";
    if (type === "button") return "[Botao recebido]";
    if (type === "system_event") return "[Evento do sistema]";
    return `[${type || "mensagem"}]`;
}
function buildAgendaActionId(groupId) {
    return `agenda_group_${String(groupId || "").trim()}`;
}
function formatAgendaPreview(group) {
    return [
        ...group.slots || []
    ].filter((slot)=>slot.enabled).sort((left, right)=>{
        if (left.dayOfWeek !== right.dayOfWeek) return left.dayOfWeek - right.dayOfWeek;
        return String(left.startTime || "").localeCompare(String(right.startTime || ""));
    }).slice(0, 6).map((slot)=>`${formatWeekday(slot.dayOfWeek)} ${slot.startTime}-${slot.endTime}`).join(" | ");
}
function formatWeekday(dayOfWeek) {
    return [
        "Dom",
        "Seg",
        "Ter",
        "Qua",
        "Qui",
        "Sex",
        "Sab"
    ][Math.max(0, Math.min(6, Number(dayOfWeek || 0)))] || "Dia";
}
function createCustomAction(config) {
    const customCount = config.actionCatalog.filter((item)=>item.custom).length + 1;
    return {
        actionId: `custom_action_${customCount}`,
        title: `Acao custom ${customCount}`,
        description: "Explique aqui o que essa acao deve fazer.",
        route: "atendimento",
        kind: "reply",
        enabled: true,
        responseMessage: "Recebi sua solicitacao e vou seguir com esse fluxo.",
        custom: true
    };
}
async function fetchBrazilianHolidays(year) {
    try {
        // Using a public API for Brazilian holidays
        const response = await fetch(`https://api.iseatz.com/holidays?country=BR&year=${year}`);
        if (!response.ok) throw new Error("API request failed");
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        return data.map((item)=>{
            // Extract just the date part (YYYY-MM-DD)
            const dateStr = String(item.date || "").split("T")[0];
            return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null;
        }).filter((date)=>date !== null).sort();
    } catch (error) {
        console.warn("Failed to fetch holidays from API:", error);
        return [];
    }
}
function isHoliday(date, holidays) {
    return holidays.includes(date);
}
}),
"[project]/src/app/dashboard/inbox/page.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "actionBar": "page-module__ckvPwa__actionBar",
  "actionCard": "page-module__ckvPwa__actionCard",
  "actionCatalogList": "page-module__ckvPwa__actionCatalogList",
  "agendaAccountCard": "page-module__ckvPwa__agendaAccountCard",
  "agendaBoardColumns": "page-module__ckvPwa__agendaBoardColumns",
  "agendaBoardShell": "page-module__ckvPwa__agendaBoardShell",
  "agendaBreakdownBar": "page-module__ckvPwa__agendaBreakdownBar",
  "agendaBreakdownList": "page-module__ckvPwa__agendaBreakdownList",
  "agendaBreakdownRow": "page-module__ckvPwa__agendaBreakdownRow",
  "agendaCard": "page-module__ckvPwa__agendaCard",
  "agendaCardHeader": "page-module__ckvPwa__agendaCardHeader",
  "agendaDayBody": "page-module__ckvPwa__agendaDayBody",
  "agendaDayColumn": "page-module__ckvPwa__agendaDayColumn",
  "agendaDayHeader": "page-module__ckvPwa__agendaDayHeader",
  "agendaDetails": "page-module__ckvPwa__agendaDetails",
  "agendaEventCard": "page-module__ckvPwa__agendaEventCard",
  "agendaEventCardActive": "page-module__ckvPwa__agendaEventCardActive",
  "agendaGrid": "page-module__ckvPwa__agendaGrid",
  "agendaMain": "page-module__ckvPwa__agendaMain",
  "agendaMiniItem": "page-module__ckvPwa__agendaMiniItem",
  "agendaMiniItemActive": "page-module__ckvPwa__agendaMiniItemActive",
  "agendaMiniList": "page-module__ckvPwa__agendaMiniList",
  "agendaMonthDay": "page-module__ckvPwa__agendaMonthDay",
  "agendaMonthDayActive": "page-module__ckvPwa__agendaMonthDayActive",
  "agendaMonthGrid": "page-module__ckvPwa__agendaMonthGrid",
  "agendaMonthHeader": "page-module__ckvPwa__agendaMonthHeader",
  "agendaMonthWeekdays": "page-module__ckvPwa__agendaMonthWeekdays",
  "agendaSidebar": "page-module__ckvPwa__agendaSidebar",
  "agendaSidebarCard": "page-module__ckvPwa__agendaSidebarCard",
  "agendaSlotChip": "page-module__ckvPwa__agendaSlotChip",
  "agendaSlotChipActive": "page-module__ckvPwa__agendaSlotChipActive",
  "agendaSlotPicker": "page-module__ckvPwa__agendaSlotPicker",
  "agendaStudioCard": "page-module__ckvPwa__agendaStudioCard",
  "agendaStudioShell": "page-module__ckvPwa__agendaStudioShell",
  "agendaTabAccent": "page-module__ckvPwa__agendaTabAccent",
  "agendaTabActions": "page-module__ckvPwa__agendaTabActions",
  "agendaTabButton": "page-module__ckvPwa__agendaTabButton",
  "agendaTabButtonActive": "page-module__ckvPwa__agendaTabButtonActive",
  "agendaTabWrap": "page-module__ckvPwa__agendaTabWrap",
  "agendaTabs": "page-module__ckvPwa__agendaTabs",
  "agendaTimeRail": "page-module__ckvPwa__agendaTimeRail",
  "agendaTopbar": "page-module__ckvPwa__agendaTopbar",
  "agendaWeekCard": "page-module__ckvPwa__agendaWeekCard",
  "agendaWeekHeader": "page-module__ckvPwa__agendaWeekHeader",
  "atendimento-pulse": "page-module__ckvPwa__atendimento-pulse",
  "atendimento-pulse-strong": "page-module__ckvPwa__atendimento-pulse-strong",
  "attentionEyebrow": "page-module__ckvPwa__attentionEyebrow",
  "attentionHeader": "page-module__ckvPwa__attentionHeader",
  "attentionPreview": "page-module__ckvPwa__attentionPreview",
  "badgeConfirmed": "page-module__ckvPwa__badgeConfirmed",
  "badgeDebt": "page-module__ckvPwa__badgeDebt",
  "badgeManual": "page-module__ckvPwa__badgeManual",
  "badgeRecovery": "page-module__ckvPwa__badgeRecovery",
  "badgeWhatsapp": "page-module__ckvPwa__badgeWhatsapp",
  "blockTag": "page-module__ckvPwa__blockTag",
  "botStudioBody": "page-module__ckvPwa__botStudioBody",
  "botStudioChrome": "page-module__ckvPwa__botStudioChrome",
  "botStudioFrame": "page-module__ckvPwa__botStudioFrame",
  "botStudioLaunchButton": "page-module__ckvPwa__botStudioLaunchButton",
  "botStudioOverlay": "page-module__ckvPwa__botStudioOverlay",
  "buttonBuilderList": "page-module__ckvPwa__buttonBuilderList",
  "buttonBuilderRow": "page-module__ckvPwa__buttonBuilderRow",
  "cardHeader": "page-module__ckvPwa__cardHeader",
  "chatBubble": "page-module__ckvPwa__chatBubble",
  "chatDate": "page-module__ckvPwa__chatDate",
  "chatFilterPill": "page-module__ckvPwa__chatFilterPill",
  "chatHeaderActions": "page-module__ckvPwa__chatHeaderActions",
  "chatHeaderIdentity": "page-module__ckvPwa__chatHeaderIdentity",
  "chatHeaderMain": "page-module__ckvPwa__chatHeaderMain",
  "chatListHeader": "page-module__ckvPwa__chatListHeader",
  "chatMeta": "page-module__ckvPwa__chatMeta",
  "chatSidebarCard": "page-module__ckvPwa__chatSidebarCard",
  "chatTimeline": "page-module__ckvPwa__chatTimeline",
  "chatTopFilters": "page-module__ckvPwa__chatTopFilters",
  "chatWindowCard": "page-module__ckvPwa__chatWindowCard",
  "closePopupButton": "page-module__ckvPwa__closePopupButton",
  "conversationAvatar": "page-module__ckvPwa__conversationAvatar",
  "conversationContent": "page-module__ckvPwa__conversationContent",
  "conversationFoot": "page-module__ckvPwa__conversationFoot",
  "conversationHead": "page-module__ckvPwa__conversationHead",
  "conversationItem": "page-module__ckvPwa__conversationItem",
  "conversationItemActive": "page-module__ckvPwa__conversationItemActive",
  "conversationList": "page-module__ckvPwa__conversationList",
  "conversationQuickAction": "page-module__ckvPwa__conversationQuickAction",
  "conversationRow": "page-module__ckvPwa__conversationRow",
  "conversationStatusDot": "page-module__ckvPwa__conversationStatusDot",
  "customerCell": "page-module__ckvPwa__customerCell",
  "dashboardGrid": "page-module__ckvPwa__dashboardGrid",
  "dataTable": "page-module__ckvPwa__dataTable",
  "detailMeta": "page-module__ckvPwa__detailMeta",
  "editorCard": "page-module__ckvPwa__editorCard",
  "editorColumn": "page-module__ckvPwa__editorColumn",
  "editorGrid": "page-module__ckvPwa__editorGrid",
  "emptyState": "page-module__ckvPwa__emptyState",
  "fieldBlock": "page-module__ckvPwa__fieldBlock",
  "flowList": "page-module__ckvPwa__flowList",
  "footerActions": "page-module__ckvPwa__footerActions",
  "formGrid": "page-module__ckvPwa__formGrid",
  "formGroup": "page-module__ckvPwa__formGroup",
  "formInput": "page-module__ckvPwa__formInput",
  "headerActions": "page-module__ckvPwa__headerActions",
  "heroDescription": "page-module__ckvPwa__heroDescription",
  "heroEyebrow": "page-module__ckvPwa__heroEyebrow",
  "heroIntro": "page-module__ckvPwa__heroIntro",
  "heroMeta": "page-module__ckvPwa__heroMeta",
  "heroPanel": "page-module__ckvPwa__heroPanel",
  "heroTitle": "page-module__ckvPwa__heroTitle",
  "holidayChip": "page-module__ckvPwa__holidayChip",
  "holidaysList": "page-module__ckvPwa__holidaysList",
  "inboundBubble": "page-module__ckvPwa__inboundBubble",
  "inlineError": "page-module__ckvPwa__inlineError",
  "inlineNote": "page-module__ckvPwa__inlineNote",
  "inlineSuccess": "page-module__ckvPwa__inlineSuccess",
  "interactionsHeader": "page-module__ckvPwa__interactionsHeader",
  "interactionsHeaderInfo": "page-module__ckvPwa__interactionsHeaderInfo",
  "interactionsHeaderStats": "page-module__ckvPwa__interactionsHeaderStats",
  "messageGrid": "page-module__ckvPwa__messageGrid",
  "metaBadge": "page-module__ckvPwa__metaBadge",
  "metricCard": "page-module__ckvPwa__metricCard",
  "metricStrip": "page-module__ckvPwa__metricStrip",
  "modalActions": "page-module__ckvPwa__modalActions",
  "modalBackdrop": "page-module__ckvPwa__modalBackdrop",
  "modalCard": "page-module__ckvPwa__modalCard",
  "modalSubtitle": "page-module__ckvPwa__modalSubtitle",
  "modalTitle": "page-module__ckvPwa__modalTitle",
  "mutedText": "page-module__ckvPwa__mutedText",
  "notificationCard": "page-module__ckvPwa__notificationCard",
  "notificationCardInfo": "page-module__ckvPwa__notificationCardInfo",
  "notificationCount": "page-module__ckvPwa__notificationCount",
  "notificationDock": "page-module__ckvPwa__notificationDock",
  "notificationHeader": "page-module__ckvPwa__notificationHeader",
  "notificationMinimized": "page-module__ckvPwa__notificationMinimized",
  "notificationMinimizedInfo": "page-module__ckvPwa__notificationMinimizedInfo",
  "notificationModule": "page-module__ckvPwa__notificationModule",
  "notificationUnread": "page-module__ckvPwa__notificationUnread",
  "outboundBubble": "page-module__ckvPwa__outboundBubble",
  "panelHeader": "page-module__ckvPwa__panelHeader",
  "panelHeaderActions": "page-module__ckvPwa__panelHeaderActions",
  "panelHeaderTitle": "page-module__ckvPwa__panelHeaderTitle",
  "panelMenuDropdown": "page-module__ckvPwa__panelMenuDropdown",
  "panelMenuItem": "page-module__ckvPwa__panelMenuItem",
  "panelMenuTitle": "page-module__ckvPwa__panelMenuTitle",
  "panelMenuTrigger": "page-module__ckvPwa__panelMenuTrigger",
  "priorityItem": "page-module__ckvPwa__priorityItem",
  "priorityList": "page-module__ckvPwa__priorityList",
  "priorityMeta": "page-module__ckvPwa__priorityMeta",
  "pulseBadge": "page-module__ckvPwa__pulseBadge",
  "replyComposer": "page-module__ckvPwa__replyComposer",
  "replyFooter": "page-module__ckvPwa__replyFooter",
  "resizeDivider": "page-module__ckvPwa__resizeDivider",
  "routeAtendimento": "page-module__ckvPwa__routeAtendimento",
  "routeRecovery": "page-module__ckvPwa__routeRecovery",
  "ruleGrid": "page-module__ckvPwa__ruleGrid",
  "sectionEyebrow": "page-module__ckvPwa__sectionEyebrow",
  "sectionHead": "page-module__ckvPwa__sectionHead",
  "slotHeader": "page-module__ckvPwa__slotHeader",
  "slotList": "page-module__ckvPwa__slotList",
  "slotRow": "page-module__ckvPwa__slotRow",
  "stackSection": "page-module__ckvPwa__stackSection",
  "switchCard": "page-module__ckvPwa__switchCard",
  "switchRow": "page-module__ckvPwa__switchRow",
  "systemBubble": "page-module__ckvPwa__systemBubble",
  "tabActive": "page-module__ckvPwa__tabActive",
  "tabButton": "page-module__ckvPwa__tabButton",
  "tabDescription": "page-module__ckvPwa__tabDescription",
  "tabRow": "page-module__ckvPwa__tabRow",
  "tableFilters": "page-module__ckvPwa__tableFilters",
  "tableWrap": "page-module__ckvPwa__tableWrap",
  "templateActions": "page-module__ckvPwa__templateActions",
  "templateCard": "page-module__ckvPwa__templateCard",
  "templateCardHeader": "page-module__ckvPwa__templateCardHeader",
  "templateCatalog": "page-module__ckvPwa__templateCatalog",
  "templateFlags": "page-module__ckvPwa__templateFlags",
  "templateGrid": "page-module__ckvPwa__templateGrid",
  "variableChip": "page-module__ckvPwa__variableChip",
  "variableChipRow": "page-module__ckvPwa__variableChipRow",
  "whatsAppShell": "page-module__ckvPwa__whatsAppShell",
  "workspaceCard": "page-module__ckvPwa__workspaceCard",
  "workspaceCardWide": "page-module__ckvPwa__workspaceCardWide",
});
}),
"[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AgendaPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/inbox-model.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/page.module.css [app-ssr] (css module)");
"use client";
;
;
;
;
const WEEKDAY_ORDER = [
    1,
    2,
    3,
    4,
    5,
    6,
    0
];
const HOUR_LABELS = [
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18
];
function copyDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function startOfWeek(date) {
    const next = copyDate(date);
    const weekdayIndex = (next.getDay() + 6) % 7;
    next.setDate(next.getDate() - weekdayIndex);
    return next;
}
function addDays(date, amount) {
    const next = copyDate(date);
    next.setDate(next.getDate() + amount);
    return next;
}
function toMinutes(value) {
    const [hours, minutes] = String(value || "00:00").split(":").map(Number);
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}
function toDateTime(date, value) {
    const next = new Date(date);
    const [hours, minutes] = String(value || "00:00").split(":").map(Number);
    next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    return next;
}
function formatMonthTitle(date) {
    return date.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric"
    });
}
function formatDayChip(date) {
    return date.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit"
    });
}
function formatShortDate(date) {
    return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit"
    });
}
function buildMonthMatrix(anchor) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    return Array.from({
        length: 35
    }, (_, index)=>addDays(start, index));
}
function buildWeekEvents(group, anchorDate) {
    if (!group) return [];
    const weekStart = startOfWeek(anchorDate);
    const days = WEEKDAY_ORDER.map((_, index)=>addDays(weekStart, index));
    return group.slots.filter((slot)=>slot.enabled).flatMap((slot)=>{
        const dayDate = days.find((candidate)=>candidate.getDay() === slot.dayOfWeek);
        if (!dayDate) return [];
        return [
            {
                slot,
                startDate: toDateTime(dayDate, slot.startTime),
                endDate: toDateTime(dayDate, slot.endTime)
            }
        ];
    }).sort((left, right)=>left.startDate.getTime() - right.startDate.getTime());
}
function AgendaPanel({ agendaConfig, loadingAgenda, savingAgenda, currentUserEmail, currentUserName, currentUserRole, canManageAgenda, onAddGroup, onMoveGroup, onRemoveGroup, onLinkCurrentUser, onSave, onUpdateGroup, onAddSlot, onRemoveSlot, onUpdateSlot, onUpdateHolidays, onLoadHolidays }) {
    const [selectedDate, setSelectedDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>new Date());
    const [selectedGroupId, setSelectedGroupId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(agendaConfig.groups[0]?.id || null);
    const [selectedSlotId, setSelectedSlotId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loadingHolidays, setLoadingHolidays] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!agendaConfig.groups.some((group)=>group.id === selectedGroupId)) {
            setSelectedGroupId(agendaConfig.groups[0]?.id || null);
        }
    }, [
        agendaConfig.groups,
        selectedGroupId
    ]);
    const selectedGroup = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>agendaConfig.groups.find((group)=>group.id === selectedGroupId) || agendaConfig.groups[0] || null, [
        agendaConfig.groups,
        selectedGroupId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!selectedGroup) {
            setSelectedSlotId(null);
            return;
        }
        if (!selectedGroup.slots.some((slot)=>slot.id === selectedSlotId)) {
            setSelectedSlotId(selectedGroup.slots[0]?.id || null);
        }
    }, [
        selectedGroup,
        selectedSlotId
    ]);
    const selectedSlot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>selectedGroup?.slots.find((slot)=>slot.id === selectedSlotId) || selectedGroup?.slots[0] || null, [
        selectedGroup,
        selectedSlotId
    ]);
    const monthDays = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>buildMonthMatrix(selectedDate), [
        selectedDate
    ]);
    const weekStart = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>startOfWeek(selectedDate), [
        selectedDate
    ]);
    const weekDays = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>WEEKDAY_ORDER.map((_, index)=>addDays(weekStart, index)), [
        weekStart
    ]);
    const weekEvents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>buildWeekEvents(selectedGroup, selectedDate), [
        selectedDate,
        selectedGroup
    ]);
    const selectedEvent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return weekEvents.find((event)=>event.slot.id === selectedSlot?.id) || weekEvents[0] || null;
    }, [
        selectedSlot?.id,
        weekEvents
    ]);
    const timeBreakdown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!selectedGroup) return [];
        const buckets = [
            {
                label: "Manha",
                range: [
                    0,
                    12
                ]
            },
            {
                label: "Almoco",
                range: [
                    12,
                    14
                ]
            },
            {
                label: "Tarde",
                range: [
                    14,
                    18
                ]
            },
            {
                label: "Noite",
                range: [
                    18,
                    24
                ]
            }
        ];
        return buckets.map((bucket)=>({
                label: bucket.label,
                count: selectedGroup.slots.filter((slot)=>{
                    const hour = Number(String(slot.startTime || "00:00").slice(0, 2));
                    return slot.enabled && hour >= bucket.range[0] && hour < bucket.range[1];
                }).length
            }));
    }, [
        selectedGroup
    ]);
    const accentColor = selectedGroup?.accentColor || "#4da36f";
    const roleLabel = String(currentUserRole || "").trim().toUpperCase() || "USUARIO";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stackSection,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].workspaceCard} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaStudioCard}`,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionHead,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                children: [
                                    agendaConfig.groups.length,
                                    " guias"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                lineNumber: 220,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: canManageAgenda ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].routeAtendimento : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].blockTag,
                                children: canManageAgenda ? `Edicao liberada para ${roleLabel}` : `Leitura para ${roleLabel}`
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                lineNumber: 221,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-secondary btn-sm",
                                onClick: onAddGroup,
                                disabled: !canManageAgenda,
                                children: "Nova guia"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                lineNumber: 224,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-primary btn-sm",
                                onClick: onSave,
                                disabled: savingAgenda || loadingAgenda || !canManageAgenda,
                                children: savingAgenda ? "Salvando..." : "Salvar agenda"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                lineNumber: 227,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                        lineNumber: 219,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                    lineNumber: 217,
                    columnNumber: 9
                }, this),
                loadingAgenda ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                    children: "Carregando agenda..."
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                    lineNumber: 239,
                    columnNumber: 11
                }, this) : !selectedGroup ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                    children: "Nenhuma guia cadastrada ainda. Crie a primeira para montar a agenda."
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                    lineNumber: 241,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaStudioShell,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebar,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebarCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMonthHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                            children: "Mes de referencia"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 248,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: formatMonthTitle(selectedDate)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 249,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 247,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-secondary btn-sm",
                                                            onClick: ()=>setSelectedDate(addDays(selectedDate, -7)),
                                                            children: "Semana anterior"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 252,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-secondary btn-sm",
                                                            onClick: ()=>setSelectedDate(addDays(selectedDate, 7)),
                                                            children: "Proxima semana"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 255,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 251,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 246,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMonthWeekdays,
                                            children: [
                                                "S",
                                                "T",
                                                "Q",
                                                "Q",
                                                "S",
                                                "S",
                                                "D"
                                            ].map((day, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: day
                                                }, `${day}-${index}`, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 263,
                                                    columnNumber: 21
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 261,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMonthGrid,
                                            children: monthDays.map((day)=>{
                                                const inCurrentMonth = day.getMonth() === selectedDate.getMonth();
                                                const active = day.getDate() === selectedDate.getDate() && day.getMonth() === selectedDate.getMonth() && day.getFullYear() === selectedDate.getFullYear();
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMonthDay} ${active ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMonthDayActive : ""}`,
                                                    "data-outside": !inCurrentMonth,
                                                    onClick: ()=>setSelectedDate(day),
                                                    children: day.getDate()
                                                }, day.toISOString(), false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 274,
                                                    columnNumber: 23
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 266,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 245,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebarCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                            children: "Proximas janelas"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 291,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: selectedGroup.title
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 292,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 290,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                                    children: [
                                                        selectedGroup.slots.filter((slot)=>slot.enabled).length,
                                                        " ativas"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 294,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 289,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMiniList,
                                            children: weekEvents.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                children: selectedGroup.emptyMessage
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                lineNumber: 298,
                                                columnNumber: 21
                                            }, this) : weekEvents.map((event)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMiniItem} ${selectedSlot?.id === event.slot.id ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMiniItemActive : ""}`,
                                                    onClick: ()=>setSelectedSlotId(event.slot.id),
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: event.slot.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 307,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: [
                                                                formatDayChip(event.startDate),
                                                                " · ",
                                                                event.slot.startTime,
                                                                " - ",
                                                                event.slot.endTime
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 308,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, event.slot.id, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 301,
                                                    columnNumber: 23
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 296,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 288,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebarCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                        children: "Distribuicao"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                        lineNumber: 318,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Faixas do dia"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                        lineNumber: 319,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                lineNumber: 317,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 316,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaBreakdownList,
                                            children: timeBreakdown.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaBreakdownRow,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: item.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 325,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    children: item.count
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 327,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaBreakdownBar,
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        style: {
                                                                            width: `${Math.min(100, item.count * 24)}%`,
                                                                            background: accentColor
                                                                        }
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                        lineNumber: 329,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 328,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 326,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, item.label, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 324,
                                                    columnNumber: 21
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 322,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 315,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                            lineNumber: 244,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaMain,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTopbar,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTabs,
                                            children: agendaConfig.groups.map((group, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTabWrap,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTabButton} ${group.id === selectedGroup.id ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTabButtonActive : ""}`,
                                                            onClick: ()=>setSelectedGroupId(group.id),
                                                            style: {
                                                                borderColor: group.id === selectedGroup.id ? group.accentColor : undefined
                                                            },
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTabAccent,
                                                                    style: {
                                                                        background: group.accentColor
                                                                    }
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 349,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: group.title
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 350,
                                                                    columnNumber: 25
                                                                }, this),
                                                                !group.isActive ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                    children: "inativa"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 351,
                                                                    columnNumber: 44
                                                                }, this) : null
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 343,
                                                            columnNumber: 23
                                                        }, this),
                                                        canManageAgenda ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTabActions,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    onClick: ()=>onMoveGroup(group.id, -1),
                                                                    disabled: index === 0,
                                                                    children: "←"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 355,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    onClick: ()=>onMoveGroup(group.id, 1),
                                                                    disabled: index === agendaConfig.groups.length - 1,
                                                                    children: "→"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 358,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 354,
                                                            columnNumber: 25
                                                        }, this) : null
                                                    ]
                                                }, group.id, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 342,
                                                    columnNumber: 21
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 340,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaAccountCard,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                            children: "Conta vinculada"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 369,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: selectedGroup.linkedUserName || "Sem responsavel"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 370,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                            children: selectedGroup.linkedEmail || "Nenhum e-mail conectado"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 371,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 368,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                                            children: selectedGroup.connectionStatus === "connected" ? "Conectado" : selectedGroup.connectionStatus === "pending" ? "Pendente" : "Nao vinculado"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 374,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-secondary btn-sm",
                                                            onClick: ()=>onLinkCurrentUser(selectedGroup.id),
                                                            disabled: !canManageAgenda || !currentUserEmail,
                                                            children: "Usar meu e-mail"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 375,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 373,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 367,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 339,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaWeekCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaWeekHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                            children: "Semana ativa"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 390,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: [
                                                                selectedGroup.title,
                                                                " · ",
                                                                formatMonthTitle(selectedDate)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 391,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                            children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatAgendaPreview"])(selectedGroup) || selectedGroup.emptyMessage
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 392,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 389,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].routeAtendimento,
                                                            children: agendaConfig.timezone
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 395,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                                            children: selectedGroup.buttonLabel
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 396,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 394,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 388,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaBoardShell,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaTimeRail,
                                                    children: HOUR_LABELS.map((hour)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: [
                                                                String(hour).padStart(2, "0"),
                                                                ":00"
                                                            ]
                                                        }, hour, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 403,
                                                            columnNumber: 23
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 401,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaBoardColumns,
                                                    children: weekDays.map((day)=>{
                                                        const dayEvents = weekEvents.filter((event)=>event.startDate.getDay() === day.getDay());
                                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaDayColumn,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaDayHeader,
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                            children: formatDayChip(day)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                            lineNumber: 413,
                                                                            columnNumber: 29
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            children: day.toLocaleDateString("pt-BR", {
                                                                                weekday: "long"
                                                                            })
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                            lineNumber: 414,
                                                                            columnNumber: 29
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 412,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaDayBody,
                                                                    children: dayEvents.map((event)=>{
                                                                        const start = toMinutes(event.slot.startTime);
                                                                        const end = toMinutes(event.slot.endTime);
                                                                        const top = (start - 8 * 60) / (11 * 60) * 100;
                                                                        const height = Math.max(10, (end - start) / (11 * 60) * 100);
                                                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                            type: "button",
                                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaEventCard} ${selectedSlot?.id === event.slot.id ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaEventCardActive : ""}`,
                                                                            style: {
                                                                                top: `${top}%`,
                                                                                height: `${height}%`,
                                                                                background: accentColor
                                                                            },
                                                                            onClick: ()=>setSelectedSlotId(event.slot.id),
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                    children: event.slot.label
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                                    lineNumber: 430,
                                                                                    columnNumber: 35
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: [
                                                                                        event.slot.startTime,
                                                                                        " - ",
                                                                                        event.slot.endTime
                                                                                    ]
                                                                                }, void 0, true, {
                                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                                    lineNumber: 431,
                                                                                    columnNumber: 35
                                                                                }, this)
                                                                            ]
                                                                        }, event.slot.id, true, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                            lineNumber: 423,
                                                                            columnNumber: 33
                                                                        }, this);
                                                                    })
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 416,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, day.toISOString(), true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 411,
                                                            columnNumber: 25
                                                        }, this);
                                                    })
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 407,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 400,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 387,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                            lineNumber: 338,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaDetails,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebarCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                            children: "Configuracao da guia"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 448,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: selectedGroup.title
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 449,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 447,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                                            children: selectedGroup.isActive ? "Ativa" : "Inativa"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 452,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-danger btn-sm",
                                                            onClick: ()=>onRemoveGroup(selectedGroup.id),
                                                            disabled: !canManageAgenda,
                                                            children: "Excluir"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 453,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 451,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 446,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Nome da guia"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 461,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            value: selectedGroup.title,
                                                            disabled: !canManageAgenda,
                                                            onChange: (event)=>onUpdateGroup(selectedGroup.id, "title", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 462,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 460,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Botao do bot"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 465,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            value: selectedGroup.buttonLabel,
                                                            disabled: !canManageAgenda,
                                                            onChange: (event)=>onUpdateGroup(selectedGroup.id, "buttonLabel", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 466,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 464,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Cor"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 469,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            type: "color",
                                                            value: selectedGroup.accentColor,
                                                            disabled: !canManageAgenda,
                                                            onChange: (event)=>onUpdateGroup(selectedGroup.id, "accentColor", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 470,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 468,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Status"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 473,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: selectedGroup.connectionStatus,
                                                            disabled: !canManageAgenda,
                                                            onChange: (event)=>onUpdateGroup(selectedGroup.id, "connectionStatus", event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "not_linked",
                                                                    children: "Nao vinculado"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 475,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "pending",
                                                                    children: "Pendente"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 476,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "connected",
                                                                    children: "Conectado"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 477,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 474,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 472,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 459,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Descricao"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 483,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 3,
                                                    value: selectedGroup.description,
                                                    disabled: !canManageAgenda,
                                                    onChange: (event)=>onUpdateGroup(selectedGroup.id, "description", event.target.value)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 484,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 482,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Responsavel"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 489,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            value: selectedGroup.linkedUserName,
                                                            disabled: !canManageAgenda,
                                                            onChange: (event)=>onUpdateGroup(selectedGroup.id, "linkedUserName", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 490,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 488,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "E-mail vinculado"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 493,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            type: "email",
                                                            value: selectedGroup.linkedEmail,
                                                            disabled: !canManageAgenda,
                                                            onChange: (event)=>onUpdateGroup(selectedGroup.id, "linkedEmail", event.target.value.toLowerCase())
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 494,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 492,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 487,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].switchRow,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "checkbox",
                                                    checked: selectedGroup.isActive,
                                                    disabled: !canManageAgenda,
                                                    onChange: (event)=>onUpdateGroup(selectedGroup.id, "isActive", event.target.checked)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 499,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Guia disponivel para o bot e para a agenda"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 500,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 498,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineNote,
                                            children: [
                                                "Usuario atual: ",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: currentUserName || "Sem nome"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 504,
                                                    columnNumber: 34
                                                }, this),
                                                " · ",
                                                currentUserEmail || "Sem e-mail no perfil"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 503,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 445,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebarCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].slotHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Horarios da guia"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 510,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>onAddSlot(selectedGroup.id),
                                                    disabled: !canManageAgenda,
                                                    children: "Adicionar horario"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 511,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 509,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSlotPicker,
                                            children: selectedGroup.slots.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                children: "Nenhum horario cadastrado nesta guia."
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                lineNumber: 518,
                                                columnNumber: 21
                                            }, this) : selectedGroup.slots.map((slot)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSlotChip} ${selectedSlot?.id === slot.id ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSlotChipActive : ""}`,
                                                    onClick: ()=>setSelectedSlotId(slot.id),
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatWeekday"])(slot.dayOfWeek)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 527,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: [
                                                                slot.startTime,
                                                                " - ",
                                                                slot.endTime
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 528,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, slot.id, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 521,
                                                    columnNumber: 23
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 516,
                                            columnNumber: 17
                                        }, this),
                                        selectedSlot ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: "Rotulo"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 538,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                    className: "field",
                                                                    value: selectedSlot.label,
                                                                    disabled: !canManageAgenda,
                                                                    onChange: (event)=>onUpdateSlot(selectedGroup.id, selectedSlot.id, "label", event.target.value)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 539,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 537,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: "Dia"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 542,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                    className: "field",
                                                                    value: selectedSlot.dayOfWeek,
                                                                    disabled: !canManageAgenda,
                                                                    onChange: (event)=>onUpdateSlot(selectedGroup.id, selectedSlot.id, "dayOfWeek", Number(event.target.value)),
                                                                    children: [
                                                                        1,
                                                                        2,
                                                                        3,
                                                                        4,
                                                                        5,
                                                                        6,
                                                                        0
                                                                    ].map((day)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                            value: day,
                                                                            children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatWeekday"])(day)
                                                                        }, day, false, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                            lineNumber: 545,
                                                                            columnNumber: 29
                                                                        }, this))
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 543,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 541,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: "Inicio"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 550,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                    className: "field",
                                                                    type: "time",
                                                                    value: selectedSlot.startTime,
                                                                    disabled: !canManageAgenda,
                                                                    onChange: (event)=>onUpdateSlot(selectedGroup.id, selectedSlot.id, "startTime", event.target.value)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 551,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 549,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: "Fim"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 554,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                    className: "field",
                                                                    type: "time",
                                                                    value: selectedSlot.endTime,
                                                                    disabled: !canManageAgenda,
                                                                    onChange: (event)=>onUpdateSlot(selectedGroup.id, selectedSlot.id, "endTime", event.target.value)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 555,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 553,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 536,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].switchRow,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                    type: "checkbox",
                                                                    checked: selectedSlot.enabled,
                                                                    disabled: !canManageAgenda,
                                                                    onChange: (event)=>onUpdateSlot(selectedGroup.id, selectedSlot.id, "enabled", event.target.checked)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 561,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: "Horario ativo"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                                    lineNumber: 562,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 560,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-danger btn-sm",
                                                            onClick: ()=>onRemoveSlot(selectedGroup.id, selectedSlot.id),
                                                            disabled: !canManageAgenda,
                                                            children: "Remover horario"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 564,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 559,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 508,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebarCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                            children: "Feriados"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 575,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "Datas de fechamento"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 576,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 574,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                                        children: [
                                                            agendaConfig.holidays.length,
                                                            " feriados"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                        lineNumber: 579,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 578,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 573,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].holidaysList,
                                            children: agendaConfig.holidays.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                children: "Nenhum feriado cadastrado."
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                lineNumber: 585,
                                                columnNumber: 21
                                            }, this) : agendaConfig.holidays.sort().slice(0, 10).map((dateStr)=>{
                                                const date = new Date(`${dateStr}T00:00:00`);
                                                const formatted = date.toLocaleDateString("pt-BR", {
                                                    weekday: "short",
                                                    day: "2-digit",
                                                    month: "2-digit"
                                                });
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].holidayChip,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: formatted
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 595,
                                                            columnNumber: 29
                                                        }, this),
                                                        canManageAgenda ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            onClick: ()=>{
                                                                const updated = agendaConfig.holidays.filter((h)=>h !== dateStr);
                                                                onUpdateHolidays?.(updated);
                                                            },
                                                            className: "btn btn-danger btn-xs",
                                                            children: "×"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                            lineNumber: 597,
                                                            columnNumber: 31
                                                        }, this) : null
                                                    ]
                                                }, dateStr, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 594,
                                                    columnNumber: 27
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 583,
                                            columnNumber: 17
                                        }, this),
                                        agendaConfig.holidays.length > 10 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                            style: {
                                                color: "var(--color-muted)",
                                                display: "block",
                                                marginTop: "0.5rem"
                                            },
                                            children: [
                                                "+ ",
                                                agendaConfig.holidays.length - 10,
                                                " feriados nao listados"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 615,
                                            columnNumber: 19
                                        }, this) : null,
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            style: {
                                                marginTop: "1rem",
                                                display: "flex",
                                                gap: "0.5rem"
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: async ()=>{
                                                        setLoadingHolidays(true);
                                                        try {
                                                            await onLoadHolidays?.();
                                                        } finally{
                                                            setLoadingHolidays(false);
                                                        }
                                                    },
                                                    disabled: !canManageAgenda || loadingHolidays || loadingAgenda || savingAgenda,
                                                    children: loadingHolidays ? "Carregando..." : "📅 Carregar feriados"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 621,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "date",
                                                    className: "field",
                                                    style: {
                                                        flex: 1,
                                                        fontSize: "0.875rem"
                                                    },
                                                    disabled: !canManageAgenda,
                                                    onChange: (event)=>{
                                                        if (event.target.value && !agendaConfig.holidays.includes(event.target.value)) {
                                                            onUpdateHolidays?.([
                                                                ...agendaConfig.holidays,
                                                                event.target.value
                                                            ].sort());
                                                            event.target.value = "";
                                                        }
                                                    },
                                                    title: "Adicionar feriado manualmente"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 636,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 620,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 572,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].agendaSidebarCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                        children: "Mensagens do fluxo"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                        lineNumber: 655,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Texto enviado ao cliente"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                        lineNumber: 656,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                lineNumber: 654,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 653,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Mensagem com horarios"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 660,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 4,
                                                    value: selectedGroup.introMessage,
                                                    disabled: !canManageAgenda,
                                                    onChange: (event)=>onUpdateGroup(selectedGroup.id, "introMessage", event.target.value)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 661,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 659,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Fallback sem horario"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 664,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 3,
                                                    value: selectedGroup.emptyMessage,
                                                    disabled: !canManageAgenda,
                                                    onChange: (event)=>onUpdateGroup(selectedGroup.id, "emptyMessage", event.target.value)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 665,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 663,
                                            columnNumber: 17
                                        }, this),
                                        selectedEvent ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineNote,
                                            children: [
                                                "Proxima janela selecionada: ",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: formatShortDate(selectedEvent.startDate)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                                    lineNumber: 669,
                                                    columnNumber: 49
                                                }, this),
                                                " · ",
                                                selectedEvent.slot.startTime,
                                                " - ",
                                                selectedEvent.slot.endTime
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                            lineNumber: 668,
                                            columnNumber: 19
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                                    lineNumber: 652,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                            lineNumber: 444,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
                    lineNumber: 243,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
            lineNumber: 216,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx",
        lineNumber: 215,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/bot-editor/BotMessageStudio.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "actionItem": "BotMessageStudio-module__gr4-ZW__actionItem",
  "actionItemHeader": "BotMessageStudio-module__gr4-ZW__actionItemHeader",
  "actionList": "BotMessageStudio-module__gr4-ZW__actionList",
  "badge": "BotMessageStudio-module__gr4-ZW__badge",
  "badgeAccent": "BotMessageStudio-module__gr4-ZW__badgeAccent",
  "badgeMuted": "BotMessageStudio-module__gr4-ZW__badgeMuted",
  "badgeWarning": "BotMessageStudio-module__gr4-ZW__badgeWarning",
  "branchConnector": "BotMessageStudio-module__gr4-ZW__branchConnector",
  "branchGrid": "BotMessageStudio-module__gr4-ZW__branchGrid",
  "branchLane": "BotMessageStudio-module__gr4-ZW__branchLane",
  "bubbleMeta": "BotMessageStudio-module__gr4-ZW__bubbleMeta",
  "buttonActions": "BotMessageStudio-module__gr4-ZW__buttonActions",
  "buttonGrid": "BotMessageStudio-module__gr4-ZW__buttonGrid",
  "buttonList": "BotMessageStudio-module__gr4-ZW__buttonList",
  "buttonMeta": "BotMessageStudio-module__gr4-ZW__buttonMeta",
  "buttonRow": "BotMessageStudio-module__gr4-ZW__buttonRow",
  "canvasPanel": "BotMessageStudio-module__gr4-ZW__canvasPanel",
  "canvasStatus": "BotMessageStudio-module__gr4-ZW__canvasStatus",
  "canvasSurface": "BotMessageStudio-module__gr4-ZW__canvasSurface",
  "canvasTransform": "BotMessageStudio-module__gr4-ZW__canvasTransform",
  "canvasViewport": "BotMessageStudio-module__gr4-ZW__canvasViewport",
  "card": "BotMessageStudio-module__gr4-ZW__card",
  "cardHeader": "BotMessageStudio-module__gr4-ZW__cardHeader",
  "catalogCard": "BotMessageStudio-module__gr4-ZW__catalogCard",
  "catalogGrid": "BotMessageStudio-module__gr4-ZW__catalogGrid",
  "catalogLayout": "BotMessageStudio-module__gr4-ZW__catalogLayout",
  "catalogMeta": "BotMessageStudio-module__gr4-ZW__catalogMeta",
  "catalogSummary": "BotMessageStudio-module__gr4-ZW__catalogSummary",
  "checkCard": "BotMessageStudio-module__gr4-ZW__checkCard",
  "checkGrid": "BotMessageStudio-module__gr4-ZW__checkGrid",
  "chip": "BotMessageStudio-module__gr4-ZW__chip",
  "chipList": "BotMessageStudio-module__gr4-ZW__chipList",
  "chipStatic": "BotMessageStudio-module__gr4-ZW__chipStatic",
  "connectorLine": "BotMessageStudio-module__gr4-ZW__connectorLine",
  "description": "BotMessageStudio-module__gr4-ZW__description",
  "emptyState": "BotMessageStudio-module__gr4-ZW__emptyState",
  "extraPanel": "BotMessageStudio-module__gr4-ZW__extraPanel",
  "eyebrow": "BotMessageStudio-module__gr4-ZW__eyebrow",
  "fieldBlock": "BotMessageStudio-module__gr4-ZW__fieldBlock",
  "flowCanvasNode": "BotMessageStudio-module__gr4-ZW__flowCanvasNode",
  "flowCanvasNodeActive": "BotMessageStudio-module__gr4-ZW__flowCanvasNodeActive",
  "flowEdgeLabel": "BotMessageStudio-module__gr4-ZW__flowEdgeLabel",
  "flowEdgePath": "BotMessageStudio-module__gr4-ZW__flowEdgePath",
  "flowIndex": "BotMessageStudio-module__gr4-ZW__flowIndex",
  "flowIndexGrid": "BotMessageStudio-module__gr4-ZW__flowIndexGrid",
  "flowIndexItem": "BotMessageStudio-module__gr4-ZW__flowIndexItem",
  "flowIndexItemActive": "BotMessageStudio-module__gr4-ZW__flowIndexItemActive",
  "flowLayout": "BotMessageStudio-module__gr4-ZW__flowLayout",
  "flowNode": "BotMessageStudio-module__gr4-ZW__flowNode",
  "flowNodeAction": "BotMessageStudio-module__gr4-ZW__flowNodeAction",
  "flowNodeEyebrow": "BotMessageStudio-module__gr4-ZW__flowNodeEyebrow",
  "flowNodePrimary": "BotMessageStudio-module__gr4-ZW__flowNodePrimary",
  "flowNodeSecondary": "BotMessageStudio-module__gr4-ZW__flowNodeSecondary",
  "flowNodeTemplate": "BotMessageStudio-module__gr4-ZW__flowNodeTemplate",
  "flowNodeTerminal": "BotMessageStudio-module__gr4-ZW__flowNodeTerminal",
  "flowSvg": "BotMessageStudio-module__gr4-ZW__flowSvg",
  "hero": "BotMessageStudio-module__gr4-ZW__hero",
  "heroMeta": "BotMessageStudio-module__gr4-ZW__heroMeta",
  "inboundBubble": "BotMessageStudio-module__gr4-ZW__inboundBubble",
  "inspectorPanel": "BotMessageStudio-module__gr4-ZW__inspectorPanel",
  "inspectorPhoneShell": "BotMessageStudio-module__gr4-ZW__inspectorPhoneShell",
  "inspectorPreviewWrap": "BotMessageStudio-module__gr4-ZW__inspectorPreviewWrap",
  "libraryChip": "BotMessageStudio-module__gr4-ZW__libraryChip",
  "libraryChipAccent": "BotMessageStudio-module__gr4-ZW__libraryChipAccent",
  "libraryPanel": "BotMessageStudio-module__gr4-ZW__libraryPanel",
  "messageBubble": "BotMessageStudio-module__gr4-ZW__messageBubble",
  "metaLabel": "BotMessageStudio-module__gr4-ZW__metaLabel",
  "metricCard": "BotMessageStudio-module__gr4-ZW__metricCard",
  "nodeBadgeRow": "BotMessageStudio-module__gr4-ZW__nodeBadgeRow",
  "outboundBubble": "BotMessageStudio-module__gr4-ZW__outboundBubble",
  "paletteGrid": "BotMessageStudio-module__gr4-ZW__paletteGrid",
  "panel": "BotMessageStudio-module__gr4-ZW__panel",
  "panelHeader": "BotMessageStudio-module__gr4-ZW__panelHeader",
  "phoneAvatar": "BotMessageStudio-module__gr4-ZW__phoneAvatar",
  "phoneBody": "BotMessageStudio-module__gr4-ZW__phoneBody",
  "phoneHeader": "BotMessageStudio-module__gr4-ZW__phoneHeader",
  "phoneHeaderMain": "BotMessageStudio-module__gr4-ZW__phoneHeaderMain",
  "phonePresence": "BotMessageStudio-module__gr4-ZW__phonePresence",
  "phoneShell": "BotMessageStudio-module__gr4-ZW__phoneShell",
  "previewActionEvent": "BotMessageStudio-module__gr4-ZW__previewActionEvent",
  "previewButton": "BotMessageStudio-module__gr4-ZW__previewButton",
  "previewButtonList": "BotMessageStudio-module__gr4-ZW__previewButtonList",
  "previewConversationStep": "BotMessageStudio-module__gr4-ZW__previewConversationStep",
  "previewFallback": "BotMessageStudio-module__gr4-ZW__previewFallback",
  "previewHeaderActions": "BotMessageStudio-module__gr4-ZW__previewHeaderActions",
  "previewLayout": "BotMessageStudio-module__gr4-ZW__previewLayout",
  "previewNote": "BotMessageStudio-module__gr4-ZW__previewNote",
  "previewStage": "BotMessageStudio-module__gr4-ZW__previewStage",
  "publicationActions": "BotMessageStudio-module__gr4-ZW__publicationActions",
  "publicationHero": "BotMessageStudio-module__gr4-ZW__publicationHero",
  "publicationLayout": "BotMessageStudio-module__gr4-ZW__publicationLayout",
  "readonlyInspector": "BotMessageStudio-module__gr4-ZW__readonlyInspector",
  "scenarioItem": "BotMessageStudio-module__gr4-ZW__scenarioItem",
  "scenarioItemActive": "BotMessageStudio-module__gr4-ZW__scenarioItemActive",
  "scenarioList": "BotMessageStudio-module__gr4-ZW__scenarioList",
  "scenarioMeta": "BotMessageStudio-module__gr4-ZW__scenarioMeta",
  "scenarioTitleRow": "BotMessageStudio-module__gr4-ZW__scenarioTitleRow",
  "statusBadge": "BotMessageStudio-module__gr4-ZW__statusBadge",
  "statusDot": "BotMessageStudio-module__gr4-ZW__statusDot",
  "statusDotDraft": "BotMessageStudio-module__gr4-ZW__statusDotDraft",
  "statusDotReady": "BotMessageStudio-module__gr4-ZW__statusDotReady",
  "statusDraft": "BotMessageStudio-module__gr4-ZW__statusDraft",
  "statusReady": "BotMessageStudio-module__gr4-ZW__statusReady",
  "studio": "BotMessageStudio-module__gr4-ZW__studio",
  "tabButton": "BotMessageStudio-module__gr4-ZW__tabButton",
  "tabButtonActive": "BotMessageStudio-module__gr4-ZW__tabButtonActive",
  "tabRow": "BotMessageStudio-module__gr4-ZW__tabRow",
  "templateInspector": "BotMessageStudio-module__gr4-ZW__templateInspector",
  "templateOption": "BotMessageStudio-module__gr4-ZW__templateOption",
  "templateOptionActive": "BotMessageStudio-module__gr4-ZW__templateOptionActive",
  "title": "BotMessageStudio-module__gr4-ZW__title",
  "toggleCard": "BotMessageStudio-module__gr4-ZW__toggleCard",
  "toggleCardActive": "BotMessageStudio-module__gr4-ZW__toggleCardActive",
  "toggleGrid": "BotMessageStudio-module__gr4-ZW__toggleGrid",
  "variableGroup": "BotMessageStudio-module__gr4-ZW__variableGroup",
});
}),
"[project]/src/components/bot-editor/BotMessageStudio.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>BotMessageStudio
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/bot-editor/BotMessageStudio.module.css [app-ssr] (css module)");
"use client";
;
;
;
const FLOW_NODE_WIDTH = 248;
const FLOW_NODE_HEIGHT = 110;
const FLOW_CANVAS_PADDING_X = 28;
const FLOW_CANVAS_PADDING_Y = 28;
function extractVariableKeys(message) {
    return Array.from(new Set(String(message || "").match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)?.map((token)=>{
        return token.replace(/\{\{|\}\}/g, "").trim();
    }) || []));
}
function getNodeKindLabel(kind) {
    switch(kind){
        case "template":
            return "Template";
        case "action":
            return "Acao";
        case "human_handoff":
            return "Humano";
        case "end":
            return "Encerrar";
        default:
            return "Mensagem";
    }
}
function isEditableNode(node) {
    return Boolean(node && node.editable !== false && node.nodeKind !== "template" && node.nodeKind !== "action");
}
function BotMessageStudio(props) {
    const { eyebrow, title, description, flowScenarios, flowEdges = [], startNodeId, selectedScenarioId, onSelectScenario, messageText, onMessageTextChange, messageType, onMessageTypeChange, buttons, actionOptions, actionById, catalogActions, onUpdateButton, onAddButton, onRemoveButton, variables, catalogVariables, onAppendVariable, previewText, previewFooter, previewFallbackText, previewNote, templateStart, templateOptions = [], onSelectTemplateOption, publicationChecks = [], publicationTitle = "Publicacao", publicationDescription = "Valide se o builder esta legivel, previsivel e pronto para seguir como rascunho confiavel.", publicationStatusLabel, primaryActionLabel = "Salvar editor", onPrimaryAction, primaryActionDisabled = false, variablesTabExtra, actionsTabExtra, publicationTabExtra, loading = false } = props;
    const [activeTab, setActiveTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("flow");
    const [zoom, setZoom] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(1);
    const [pan, setPan] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        x: 24,
        y: 24
    });
    const [previewTrail, setPreviewTrail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([
        startNodeId || selectedScenarioId
    ]);
    const [previewVisible, setPreviewVisible] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const dragStateRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const selectedScenario = flowScenarios.find((scenario)=>scenario.id === selectedScenarioId) || flowScenarios[0] || null;
    const supportsButtons = Boolean(selectedScenario && selectedScenario.supportsButtons !== false && selectedScenario.nodeKind !== "template" && selectedScenario.nodeKind !== "action");
    const nodeById = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Map(flowScenarios.map((scenario, index)=>[
                scenario.id,
                {
                    ...scenario,
                    position: scenario.position || {
                        x: 320 * index,
                        y: 120
                    }
                }
            ])), [
        flowScenarios
    ]);
    const selectedNode = nodeById.get(selectedScenarioId) || selectedScenario || null;
    const startNode = nodeById.get(startNodeId || "") || nodeById.get(templateStart?.id || "") || flowScenarios[0] || null;
    const variableUsage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const entries = catalogVariables.map((variable)=>{
            const usedIn = flowScenarios.filter((scenario)=>extractVariableKeys(scenario.messageText).includes(variable.key)).map((scenario)=>scenario.label);
            return [
                variable.key,
                usedIn
            ];
        });
        return Object.fromEntries(entries);
    }, [
        catalogVariables,
        flowScenarios
    ]);
    const actionUsage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const next = new Map();
        for (const scenario of flowScenarios){
            for (const button of scenario.buttons){
                const current = next.get(button.actionId) || [];
                current.push({
                    scenarioLabel: scenario.label,
                    buttonLabel: button.title || button.buttonId
                });
                next.set(button.actionId, current);
            }
        }
        return next;
    }, [
        flowScenarios
    ]);
    const graphBounds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const points = flowScenarios.map((node, index)=>node.position || {
                x: 320 * index,
                y: 120
            });
        const xs = points.map((point)=>point.x);
        const ys = points.map((point)=>point.y);
        const minX = Math.min(...xs, 0) - FLOW_CANVAS_PADDING_X;
        const minY = Math.min(...ys, 0) - FLOW_CANVAS_PADDING_Y;
        const maxX = Math.max(...xs.map((x)=>x + FLOW_NODE_WIDTH), FLOW_NODE_WIDTH) + FLOW_CANVAS_PADDING_X;
        const maxY = Math.max(...ys.map((y)=>y + FLOW_NODE_HEIGHT), FLOW_NODE_HEIGHT) + FLOW_CANVAS_PADDING_Y;
        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }, [
        flowScenarios
    ]);
    const canvasViewportHeight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>Math.max(360, Math.min(graphBounds.height + 12, 640)), [
        graphBounds.height
    ]);
    const previewPaths = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const rootId = startNode?.id || selectedScenarioId || flowScenarios[0]?.id;
        const paths = new Map();
        if (!rootId || !nodeById.has(rootId)) return paths;
        const queue = [
            rootId
        ];
        paths.set(rootId, [
            rootId
        ]);
        while(queue.length > 0){
            const currentId = queue.shift();
            const currentPath = paths.get(currentId) || [
                currentId
            ];
            const currentNode = nodeById.get(currentId);
            for (const button of currentNode?.buttons || []){
                if (!button.nextNodeId || paths.has(button.nextNodeId) || !nodeById.has(button.nextNodeId)) {
                    continue;
                }
                paths.set(button.nextNodeId, [
                    ...currentPath,
                    button.nextNodeId
                ]);
                queue.push(button.nextNodeId);
            }
        }
        return paths;
    }, [
        flowScenarios,
        nodeById,
        selectedScenarioId,
        startNode?.id
    ]);
    const previewNodeId = previewTrail[previewTrail.length - 1] || startNode?.id || selectedScenarioId;
    const previewNode = nodeById.get(previewNodeId) || startNode || null;
    const previewNodeButtons = previewNode?.buttons || [];
    const activeQuickInsertKeys = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Set(variables.map((item)=>item.key)), [
        variables
    ]);
    const publicationReady = publicationChecks.length > 0 && publicationChecks.every((item)=>item.ok);
    const computedPublicationStatus = publicationStatusLabel || (publicationReady ? "Fluxo pronto para salvar" : "Rascunho com pontos para revisar");
    const tabItems = [
        {
            id: "flow",
            label: "Fluxo",
            helper: `${flowScenarios.length} blocos`
        },
        {
            id: "variables",
            label: "Variaveis",
            helper: `${catalogVariables.length} itens`
        },
        {
            id: "actions",
            label: "Acoes",
            helper: `${catalogActions.length} rotas`
        },
        {
            id: "publication",
            label: "Publicacao",
            helper: publicationReady ? "Pronto" : "Rascunho"
        }
    ];
    function getPreviewPath(nodeId) {
        return previewPaths.get(nodeId) || [
            nodeId
        ];
    }
    function getPreviewMessage(node, index) {
        if (!node) return "";
        if (index === 0 && node.nodeKind === "template") {
            return templateStart?.body || node.messageText || node.effectLabel || node.description;
        }
        return node.messageText || node.effectLabel || node.description || "Sem mensagem configurada.";
    }
    function handleSelectNode(nodeId) {
        onSelectScenario(nodeId);
        setPreviewTrail(getPreviewPath(nodeId));
        setPreviewVisible(true);
    }
    function handleCanvasPointerDown(event) {
        if (event.target.closest(`.${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowCanvasNode}`)) return;
        dragStateRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function handleCanvasPointerMove(event) {
        if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - dragStateRef.current.x;
        const deltaY = event.clientY - dragStateRef.current.y;
        dragStateRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY
        };
        setPan((current)=>({
                x: current.x + deltaX,
                y: current.y + deltaY
            }));
    }
    function handleCanvasPointerUp(event) {
        if (dragStateRef.current?.pointerId === event.pointerId) {
            dragStateRef.current = null;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }
    function handlePreviewAdvance(button) {
        if (!button.nextNodeId || !nodeById.has(button.nextNodeId)) return;
        onSelectScenario(button.nextNodeId);
        setPreviewTrail((current)=>[
                ...current,
                button.nextNodeId
            ]);
    }
    function renderConversationPreview() {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inspectorPreviewWrap,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].phoneShell} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inspectorPhoneShell}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].phoneHeader,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].phoneHeaderMain,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].phoneAvatar,
                                        children: (previewFooter || eyebrow).slice(0, 1)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 367,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                children: previewFooter || eyebrow
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 369,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].phonePresence,
                                                children: previewNode?.label || "Fluxo"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 370,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 368,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 366,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].previewHeaderActions,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-secondary btn-sm",
                                        onClick: ()=>setPreviewTrail(getPreviewPath(selectedScenarioId)),
                                        children: "Reiniciar"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 374,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-secondary btn-sm",
                                        onClick: ()=>setPreviewVisible(false),
                                        "aria-label": "Fechar preview",
                                        children: "Fechar"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 381,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 373,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                        lineNumber: 365,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].phoneBody,
                        children: previewTrail.map((nodeId, index)=>{
                            const node = nodeById.get(nodeId);
                            if (!node) return null;
                            const previousNodeId = index > 0 ? previewTrail[index - 1] : null;
                            const previousNode = previousNodeId ? nodeById.get(previousNodeId) : null;
                            const triggerButton = previousNode?.buttons.find((button)=>button.nextNodeId === node.id) || null;
                            const triggerAction = triggerButton ? actionById[triggerButton.actionId] : null;
                            const isLastStep = index === previewTrail.length - 1;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].previewConversationStep,
                                children: [
                                    triggerButton ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].messageBubble} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inboundBubble}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: triggerButton.title
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 407,
                                                columnNumber: 23
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].bubbleMeta,
                                                children: "Cliente"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 408,
                                                columnNumber: 23
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 406,
                                        columnNumber: 21
                                    }, this) : null,
                                    triggerAction ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].previewActionEvent,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent}`,
                                                children: triggerAction.title
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 414,
                                                columnNumber: 23
                                            }, this),
                                            triggerAction.typeLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                                children: triggerAction.typeLabel
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 415,
                                                columnNumber: 50
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 413,
                                        columnNumber: 21
                                    }, this) : null,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].messageBubble} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].outboundBubble}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: getPreviewMessage(node, index)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 420,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].bubbleMeta,
                                                children: "Agora"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 421,
                                                columnNumber: 21
                                            }, this),
                                            isLastStep && node.buttons.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].previewButtonList,
                                                children: node.buttons.map((button)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].previewButton,
                                                        onClick: ()=>handlePreviewAdvance(button),
                                                        children: button.title
                                                    }, `preview-${node.id}-${button.buttonId}`, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 425,
                                                        columnNumber: 27
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 423,
                                                columnNumber: 23
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 419,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, `preview-step-${node.id}-${index}`, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 404,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                        lineNumber: 392,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                lineNumber: 364,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
            lineNumber: 363,
            columnNumber: 7
        }, this);
    }
    function renderFlowTab() {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowLayout,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].libraryPanel}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeader,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: "Biblioteca do fluxo"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 452,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 451,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 450,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioList,
                            children: flowScenarios.map((scenario)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioItem} ${scenario.id === selectedScenarioId ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioItemActive : ""}`,
                                    onClick: ()=>handleSelectNode(scenario.id),
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioTitleRow,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                children: scenario.label
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 470,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge,
                                                children: scenario.badge || getNodeKindLabel(scenario.nodeKind)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 471,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 469,
                                        columnNumber: 17
                                    }, this)
                                }, scenario.id, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 461,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 459,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 449,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].canvasPanel}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeader,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].canvasStatus,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-secondary btn-sm",
                                        onClick: ()=>setZoom((current)=>Math.max(0.72, Number((current - 0.12).toFixed(2)))),
                                        children: "-"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 482,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent}`,
                                        children: [
                                            Math.round(zoom * 100),
                                            "%"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 483,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-secondary btn-sm",
                                        onClick: ()=>setZoom((current)=>Math.min(1.4, Number((current + 0.12).toFixed(2)))),
                                        children: "+"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 484,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-ghost btn-sm",
                                        onClick: ()=>{
                                            setZoom(1);
                                            setPan({
                                                x: 24,
                                                y: 24
                                            });
                                        },
                                        children: "Resetar vista"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 485,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 481,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 479,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].canvasSurface,
                            onPointerDown: handleCanvasPointerDown,
                            onPointerMove: handleCanvasPointerMove,
                            onPointerUp: handleCanvasPointerUp,
                            onPointerCancel: handleCanvasPointerUp,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].canvasViewport,
                                style: {
                                    minHeight: canvasViewportHeight
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].canvasTransform,
                                    style: {
                                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                        width: graphBounds.width,
                                        height: graphBounds.height
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowSvg,
                                            viewBox: `0 0 ${graphBounds.width} ${graphBounds.height}`,
                                            children: flowEdges.map((edge)=>{
                                                const from = nodeById.get(edge.from);
                                                const to = nodeById.get(edge.to);
                                                if (!from?.position || !to?.position) return null;
                                                const startX = from.position.x + 124 - graphBounds.minX;
                                                const startY = from.position.y + 74 - graphBounds.minY;
                                                const endX = to.position.x + 124 - graphBounds.minX;
                                                const endY = to.position.y + 18 - graphBounds.minY;
                                                const midX = (startX + endX) / 2;
                                                const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                            d: path,
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowEdgePath
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 520,
                                                            columnNumber: 25
                                                        }, this),
                                                        edge.label ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                                            x: midX,
                                                            y: (startY + endY) / 2 - 8,
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowEdgeLabel,
                                                            children: edge.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 522,
                                                            columnNumber: 27
                                                        }, this) : null
                                                    ]
                                                }, edge.id, true, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 519,
                                                    columnNumber: 23
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 507,
                                            columnNumber: 17
                                        }, this),
                                        flowScenarios.map((node)=>{
                                            const position = node.position || {
                                                x: 0,
                                                y: 0
                                            };
                                            const active = node.id === selectedScenarioId;
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowCanvasNode} ${active ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowCanvasNodeActive : ""}`,
                                                style: {
                                                    left: position.x - graphBounds.minX,
                                                    top: position.y - graphBounds.minY
                                                },
                                                onClick: ()=>handleSelectNode(node.id),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].flowNodeEyebrow,
                                                        children: getNodeKindLabel(node.nodeKind)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 542,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: node.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 543,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].nodeBadgeRow,
                                                        children: [
                                                            node.badge ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge,
                                                                children: node.badge
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 545,
                                                                columnNumber: 39
                                                            }, this) : null,
                                                            node.buttons.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                                                children: [
                                                                    node.buttons.length,
                                                                    " saídas"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 547,
                                                                columnNumber: 27
                                                            }, this) : null
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 544,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, node.id, true, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 535,
                                                columnNumber: 21
                                            }, this);
                                        })
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 499,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 498,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 491,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 478,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inspectorPanel}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeader,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: "Inspector contextual"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 561,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: "So o que importa para o tipo de no selecionado."
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 562,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 560,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 559,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].card,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                children: selectedNode?.label || "Sem no selecionado"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 569,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 568,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                            children: getNodeKindLabel(selectedNode?.nodeKind)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 571,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 567,
                                    columnNumber: 13
                                }, this),
                                selectedNode?.nodeKind === "template" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].templateInspector,
                                    children: templateOptions.length > 0 ? templateOptions.map((option)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].templateOption} ${option.selected ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].templateOptionActive : ""}`,
                                            onClick: ()=>{
                                                onSelectTemplateOption?.(option.id);
                                                setPreviewTrail([
                                                    startNode?.id || selectedScenarioId
                                                ]);
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: option.title
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 588,
                                                            columnNumber: 25
                                                        }, this),
                                                        option.subtitle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            children: option.subtitle
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 589,
                                                            columnNumber: 44
                                                        }, this) : null
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 587,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioMeta,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${option.ready === false ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeWarning : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent}`,
                                                            children: option.ready === false ? "Revisar" : "Pronto"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 592,
                                                            columnNumber: 25
                                                        }, this),
                                                        option.selected ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge,
                                                            children: "Ativo"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 595,
                                                            columnNumber: 44
                                                        }, this) : null
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 591,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, option.id, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 578,
                                            columnNumber: 21
                                        }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                        children: "Nenhum template ativo para ser usado como primeiro no."
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 600,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 575,
                                    columnNumber: 15
                                }, this) : null,
                                isEditableNode(selectedNode) ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Nome interno"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 608,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    className: "field",
                                                    value: selectedNode?.id || "",
                                                    disabled: true
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 609,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 607,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].card,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "Tipo de mensagem"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 614,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: "Escolha se esta etapa usa apenas texto ou ramificacoes por botoes."
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 615,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 613,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 612,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].toggleGrid,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].toggleCard} ${messageType === "simple" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].toggleCardActive : ""}`,
                                                            onClick: ()=>onMessageTypeChange("simple"),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    children: "Simples"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 624,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    children: "Resposta direta sem clique visual."
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 625,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 619,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            disabled: !supportsButtons,
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].toggleCard} ${messageType === "buttons" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].toggleCardActive : ""}`,
                                                            onClick: ()=>onMessageTypeChange("buttons"),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    children: "Com botoes"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 633,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    children: "Navega por nos estaveis do fluxo."
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 634,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 627,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 618,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 611,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Texto"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 640,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 7,
                                                    value: messageText,
                                                    onChange: (event)=>onMessageTextChange(event.target.value)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 641,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 639,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Variaveis usadas"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 650,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chipList,
                                                    children: variables.map((variable)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chip,
                                                            onClick: ()=>onAppendVariable(variable.key),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    children: `{{${variable.key}}}`
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 659,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                    children: variable.scopeLabel
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 660,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, variable.key, true, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 653,
                                                            columnNumber: 23
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 651,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 649,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].card,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    children: "Botoes"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 669,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    children: "Label, id estavel, proximo no e acao complementar."
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 670,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 668,
                                                            columnNumber: 21
                                                        }, this),
                                                        supportsButtons && messageType === "buttons" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-secondary btn-sm",
                                                            onClick: onAddButton,
                                                            children: "Adicionar botao"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 673,
                                                            columnNumber: 23
                                                        }, this) : null
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 667,
                                                    columnNumber: 19
                                                }, this),
                                                !supportsButtons || messageType === "simple" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                    children: "Esse no esta em modo simples."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 680,
                                                    columnNumber: 21
                                                }, this) : buttons.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].buttonList,
                                                    children: buttons.map((button, index)=>{
                                                        const action = actionById[button.actionId];
                                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].buttonRow,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].buttonGrid,
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: "Label"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                                    lineNumber: 689,
                                                                                    columnNumber: 33
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                                    className: "field",
                                                                                    value: button.title,
                                                                                    onChange: (event)=>onUpdateButton(index, "title", event.target.value)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                                    lineNumber: 690,
                                                                                    columnNumber: 33
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                            lineNumber: 688,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: "ID"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                                    lineNumber: 697,
                                                                                    columnNumber: 33
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                                    className: "field",
                                                                                    value: button.buttonId,
                                                                                    onChange: (event)=>onUpdateButton(index, "buttonId", event.target.value)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                                    lineNumber: 698,
                                                                                    columnNumber: 33
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                            lineNumber: 696,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: "ActionId"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                                    lineNumber: 705,
                                                                                    columnNumber: 33
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                                    className: "field",
                                                                                    value: button.actionId,
                                                                                    onChange: (event)=>onUpdateButton(index, "actionId", event.target.value),
                                                                                    children: actionOptions.map((option)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                                            value: option.value,
                                                                                            children: option.label
                                                                                        }, option.value, false, {
                                                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                                            lineNumber: 712,
                                                                                            columnNumber: 37
                                                                                        }, this))
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                                    lineNumber: 706,
                                                                                    columnNumber: 33
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                            lineNumber: 704,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 687,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].buttonMeta,
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                            children: button.nextNodeId || "Sem nextNodeId"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                            lineNumber: 720,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            children: button.nextLabel || "Defina um destino visual para esse clique."
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                            lineNumber: 721,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        action ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            children: `Acao complementar: ${action.title}`
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                            lineNumber: 722,
                                                                            columnNumber: 41
                                                                        }, this) : null
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 719,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].buttonActions,
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: "btn btn-danger btn-sm",
                                                                        onClick: ()=>onRemoveButton(index),
                                                                        children: "Remover"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                        lineNumber: 725,
                                                                        columnNumber: 31
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                    lineNumber: 724,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, `${button.buttonId}-${index}`, true, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 686,
                                                            columnNumber: 27
                                                        }, this);
                                                    })
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 682,
                                                    columnNumber: 21
                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                    children: "Nenhum botao configurado neste no ainda."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 734,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 666,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true) : selectedNode ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].readonlyInspector,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "ID tecnico"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 741,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    className: "field",
                                                    value: selectedNode.id,
                                                    disabled: true
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 742,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 740,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Efeito esperado"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 745,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    rows: 4,
                                                    value: selectedNode.effectLabel || selectedNode.description,
                                                    disabled: true
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 746,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 744,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioMeta,
                                            children: [
                                                selectedNode.toneLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge,
                                                    children: selectedNode.toneLabel
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 749,
                                                    columnNumber: 45
                                                }, this) : null,
                                                selectedNode.badge ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                                    children: selectedNode.badge
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 750,
                                                    columnNumber: 41
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 748,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 739,
                                    columnNumber: 15
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 566,
                            columnNumber: 11
                        }, this),
                        previewVisible ? renderConversationPreview() : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                            children: "Clique em um no do organograma para abrir o follow da conversa aqui na direita."
                        }, void 0, false, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 759,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 558,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
            lineNumber: 448,
            columnNumber: 7
        }, this);
    }
    function renderVariablesTab() {
        const groupOrder = [
            "Empresa",
            "Cliente",
            "Recovery",
            "Atendimento",
            "Sistema",
            "Capturadas no fluxo"
        ];
        const grouped = catalogVariables.reduce((map, variable)=>{
            const group = variable.categoryLabel || variable.scopeLabel || "Sistema";
            const current = map.get(group) || [];
            current.push(variable);
            map.set(group, current);
            return map;
        }, new Map());
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogLayout,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogSummary,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: catalogVariables.length
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 781,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "variaveis no catalogo"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 782,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 780,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: catalogVariables.filter((item)=>item.required).length
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 785,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "obrigatorias"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 786,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 784,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: variables.length
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 789,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "disponiveis neste bloco"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 790,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 788,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 779,
                    columnNumber: 9
                }, this),
                groupOrder.map((groupLabel)=>{
                    const items = grouped.get(groupLabel) || [];
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].variableGroup,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeader,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            children: groupLabel
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 800,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: items.length > 0 ? `${items.length} variaveis agrupadas por contexto de origem.` : "Nenhuma variavel exposta nesta categoria por enquanto."
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 801,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 799,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 798,
                                columnNumber: 13
                            }, this),
                            items.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogGrid,
                                children: items.map((variable)=>{
                                    const usedIn = variableUsage[variable.key] || [];
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogCard}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: variable.label
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 812,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                children: `{{${variable.key}}}`
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 813,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 811,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioMeta,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                                                children: variable.scopeLabel
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 816,
                                                                columnNumber: 25
                                                            }, this),
                                                            variable.required ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent}`,
                                                                children: "Obrigatoria"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 817,
                                                                columnNumber: 46
                                                            }, this) : null,
                                                            activeQuickInsertKeys.has(variable.key) ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge,
                                                                children: "Disponivel agora"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 818,
                                                                columnNumber: 68
                                                            }, this) : null
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 815,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 810,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogMeta,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaLabel,
                                                        children: "Origem"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 822,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: variable.originLabel || variable.scopeLabel
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 823,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 821,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogMeta,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaLabel,
                                                        children: "Exemplo"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 826,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: variable.example || "Sem exemplo cadastrado."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 827,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 825,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogMeta,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaLabel,
                                                        children: "Usada em"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 830,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioMeta,
                                                        children: usedIn.length > 0 ? usedIn.map((usage)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                                                children: usage
                                                            }, `${variable.key}-${usage}`, false, {
                                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                                lineNumber: 834,
                                                                columnNumber: 29
                                                            }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge,
                                                            children: "Ainda nao usada"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                            lineNumber: 839,
                                                            columnNumber: 27
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                        lineNumber: 831,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 829,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, variable.key, true, {
                                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                        lineNumber: 809,
                                        columnNumber: 19
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 805,
                                columnNumber: 13
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                children: "O fluxo atual ainda nao expoe variaveis desta categoria."
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 848,
                                columnNumber: 15
                            }, this)
                        ]
                    }, groupLabel, true, {
                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                        lineNumber: 797,
                        columnNumber: 11
                    }, this);
                }),
                variablesTabExtra ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].extraPanel,
                    children: variablesTabExtra
                }, void 0, false, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 853,
                    columnNumber: 30
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
            lineNumber: 778,
            columnNumber: 7
        }, this);
    }
    function renderActionsTab() {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogLayout,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogSummary,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: catalogActions.length
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 863,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "acoes registradas"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 864,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 862,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: catalogActions.filter((item)=>item.enabled !== false).length
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 867,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "acoes ativas"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 868,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 866,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metricCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: buttons.length
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 871,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "cliques no bloco atual"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 872,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 870,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 861,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogGrid,
                    children: catalogActions.map((action)=>{
                        const usedIn = actionUsage.get(action.actionId) || [];
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: action.title
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 883,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: action.description
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 884,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 882,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioMeta,
                                            children: [
                                                action.typeLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent}`,
                                                    children: action.typeLabel
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 887,
                                                    columnNumber: 41
                                                }, this) : null,
                                                action.routeLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                                    children: action.routeLabel
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 888,
                                                    columnNumber: 42
                                                }, this) : null,
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${action.enabled === false ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeWarning : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent}`,
                                                    children: action.enabled === false ? "Legada" : "Ativa"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 889,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 886,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 881,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogMeta,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaLabel,
                                            children: "ID tecnico"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 895,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: action.actionId
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 896,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 894,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].catalogMeta,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaLabel,
                                            children: "Usada por"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 899,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioMeta,
                                            children: usedIn.length > 0 ? usedIn.map((usage)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                                    children: `${usage.scenarioLabel}: ${usage.buttonLabel}`
                                                }, `${action.actionId}-${usage.scenarioLabel}-${usage.buttonLabel}`, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 903,
                                                    columnNumber: 25
                                                }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge,
                                                children: "Sem botoes vinculados"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                lineNumber: 911,
                                                columnNumber: 23
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 900,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 898,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, action.actionId, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 880,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 876,
                    columnNumber: 9
                }, this),
                actionsTabExtra ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].extraPanel,
                    children: actionsTabExtra
                }, void 0, false, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 920,
                    columnNumber: 28
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
            lineNumber: 860,
            columnNumber: 7
        }, this);
    }
    function renderPublicationTab() {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].publicationLayout,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].publicationHero}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            children: publicationTitle
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 931,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: publicationDescription
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 932,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 930,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statusBadge} ${publicationReady ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statusReady : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statusDraft}`,
                                    children: computedPublicationStatus
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 934,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 929,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].publicationActions,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].scenarioMeta,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                            children: [
                                                flowScenarios.length,
                                                " blocos mapeados"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 941,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                            children: [
                                                catalogActions.length,
                                                " acoes catalogadas"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 942,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                            children: [
                                                catalogVariables.length,
                                                " variaveis prontas"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 943,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 940,
                                    columnNumber: 13
                                }, this),
                                onPrimaryAction ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-primary",
                                    onClick: onPrimaryAction,
                                    disabled: primaryActionDisabled,
                                    children: primaryActionLabel
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 946,
                                    columnNumber: 15
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 939,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 928,
                    columnNumber: 9
                }, this),
                publicationChecks.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].checkGrid,
                    children: publicationChecks.map((check)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].checkCard}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: check.label
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 964,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: check.description
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                                    lineNumber: 965,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 963,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statusDot} ${check.ok ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statusDotReady : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statusDotDraft}`
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                            lineNumber: 967,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 962,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${check.ok ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeWarning}`,
                                    children: check.ok ? "Validado" : "Revisar"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                    lineNumber: 969,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, check.id, true, {
                            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                            lineNumber: 961,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 959,
                    columnNumber: 11
                }, this) : null,
                publicationTabExtra ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].extraPanel,
                    children: publicationTabExtra
                }, void 0, false, {
                    fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                    lineNumber: 977,
                    columnNumber: 32
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
            lineNumber: 927,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].studio,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panel} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].hero}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].eyebrow,
                                children: eyebrow
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 986,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].title,
                                children: title
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 987,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].description,
                                children: description
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 988,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                        lineNumber: 985,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroMeta,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeAccent}`,
                                children: [
                                    flowScenarios.length,
                                    " blocos visuais"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 991,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                children: [
                                    catalogVariables.length,
                                    " variaveis"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 992,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeMuted}`,
                                children: [
                                    catalogActions.length,
                                    " acoes"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 993,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                        lineNumber: 990,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                lineNumber: 984,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].tabRow,
                role: "tablist",
                "aria-label": `${eyebrow} builder`,
                children: tabItems.map((tab)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": tab.id === activeTab,
                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].tabButton} ${tab.id === activeTab ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].tabButtonActive : ""}`,
                        onClick: ()=>setActiveTab(tab.id),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: tab.label
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 1007,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: tab.helper
                            }, void 0, false, {
                                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                                lineNumber: 1008,
                                columnNumber: 13
                            }, this)
                        ]
                    }, tab.id, true, {
                        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                        lineNumber: 999,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                lineNumber: 997,
                columnNumber: 7
            }, this),
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                children: "Carregando editor..."
            }, void 0, false, {
                fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
                lineNumber: 1014,
                columnNumber: 9
            }, this) : activeTab === "flow" ? renderFlowTab() : activeTab === "variables" ? renderVariablesTab() : activeTab === "actions" ? renderActionsTab() : renderPublicationTab()
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/bot-editor/BotMessageStudio.tsx",
        lineNumber: 983,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/dashboard/inbox/_components/BotPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>BotPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/bot-editor/BotMessageStudio.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/inbox-model.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/page.module.css [app-ssr] (css module)");
"use client";
;
;
;
;
;
const VARIABLE_SCOPE_LABELS = {
    shared: "Compartilhado",
    atendimento: "Atendimento",
    recovery: "Recovery"
};
const ACTION_KIND_LABELS = {
    reply: "Resposta",
    human_handoff: "Fila humana",
    recovery_handoff: "Ir para Recovery",
    close: "Encerrar",
    show_menu: "Mostrar menu",
    agenda: "Agenda"
};
const BOT_SCENARIOS = [
    {
        id: "welcomeMessage",
        label: "Mensagem para cliente novo",
        description: "Primeira resposta para quem ainda nao tem historico de conversa.",
        badge: "Entrada",
        supportsButtons: true,
        buttonSection: "welcomeButtons",
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "returningCustomerMessage",
        label: "Mensagem para cliente recorrente",
        description: "Resposta curta para retomar o atendimento de quem voltou a falar.",
        badge: "Retorno",
        supportsButtons: true,
        buttonSection: "mainMenuButtons",
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "mainMenuPrompt",
        label: "Menu principal",
        description: "Mensagem central com as opcoes principais do Atendimento.",
        badge: "Interativo",
        supportsButtons: true,
        buttonSection: "mainMenuButtons",
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "recoveryDetectedMessage",
        label: "Parede com Recovery",
        description: "Mensagem quando o cliente tem debito e precisa ser encaminhado com clareza.",
        badge: "Recovery",
        supportsButtons: true,
        buttonSection: "recoveryDetectedButtons",
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "postActionPrompt",
        label: "Mensagem apos acoes",
        description: "Continua o fluxo depois de agenda ou resposta custom.",
        badge: "Continuidade",
        supportsButtons: true,
        buttonSection: "postActionButtons",
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "humanAckMessage",
        label: "Confirmacao de humano",
        description: "Mensagem enviada quando a conversa sai do bot e entra na fila humana.",
        badge: "Humano",
        supportsButtons: false,
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "closeTopicMessage",
        label: "Encerramento",
        description: "Fecha a conversa de forma clara e sem ruído visual.",
        badge: "Saida",
        supportsButtons: false,
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "blockedMessage",
        label: "Mensagem de bloqueio",
        description: "Referencia visual do estado bloqueado dentro do Atendimento.",
        badge: "Bloqueio",
        supportsButtons: false,
        scopes: [
            "shared",
            "atendimento"
        ]
    }
];
function buildFallbackText(message, buttons) {
    const lines = buttons.map((button, index)=>`${index + 1}. ${button.title}`).join("\n");
    return lines ? `${message}\n\n${lines}`.trim() : message;
}
function renderPreviewText(message, botConfig) {
    const samples = Object.fromEntries(botConfig.variableCatalog.map((item)=>[
            item.key,
            item.example || item.label || item.key
        ]));
    return String(message || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key)=>{
        return String(samples[key] || `{{${key}}}`);
    });
}
function resolveAtendimentoNextNode(actionId) {
    switch(actionId){
        case "talk_human":
            return "humanAckMessage";
        case "close_topic":
            return "closeTopicMessage";
        case "show_main_menu":
            return "mainMenuPrompt";
        case "enter_recovery":
            return "recoveryDetectedMessage";
        case "start_quick_registration":
            return "registrationCapture";
        default:
            if (actionId.startsWith("agenda:")) return "agendaDispatch";
            return "postActionPrompt";
    }
}
function BotPanel({ botConfig, loadingBot, savingBot, actionOptions, agendaOptions, onSave, onUpdateRoutingRule, onAppendVariable, onUpdateBotText, onUpdateButtonSection, onAddButtonSection, onRemoveButtonSection, onUpdateActionGuide, onAddCustomAction, onRemoveCustomAction }) {
    const [selectedScenarioId, setSelectedScenarioId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("entry_gate");
    const selectedScenario = BOT_SCENARIOS.find((scenario)=>scenario.id === selectedScenarioId) || null;
    const selectedButtons = selectedScenario?.supportsButtons && selectedScenario.buttonSection ? botConfig[selectedScenario.buttonSection] : [];
    const messageType = selectedScenario?.supportsButtons && selectedButtons.length > 0 ? "buttons" : "simple";
    const actionById = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const next = {};
        for (const action of botConfig.actionCatalog){
            next[action.actionId] = {
                actionId: action.actionId,
                title: action.title,
                description: action.description,
                routeLabel: VARIABLE_SCOPE_LABELS[action.route],
                typeLabel: ACTION_KIND_LABELS[action.kind],
                enabled: action.enabled
            };
        }
        for (const agenda of agendaOptions){
            const actionId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildAgendaActionId"])(agenda.id);
            next[actionId] = {
                actionId,
                title: agenda.title,
                description: "Abre uma agenda operacional real vinculada ao Atendimento.",
                routeLabel: "Atendimento",
                typeLabel: "Agenda",
                enabled: true
            };
        }
        return next;
    }, [
        agendaOptions,
        botConfig.actionCatalog
    ]);
    const studioVariables = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>botConfig.variableCatalog.filter((item)=>!selectedScenario || selectedScenario.scopes.includes(item.scope) || item.scope === "shared").map((item)=>({
                key: item.key,
                label: item.label,
                example: item.example,
                scopeLabel: VARIABLE_SCOPE_LABELS[item.scope],
                categoryLabel: item.key === "empresa" ? "Empresa" : item.key === "cliente" ? "Cliente" : item.scope === "recovery" ? "Recovery" : item.scope === "atendimento" ? "Atendimento" : "Sistema",
                originLabel: item.scope === "shared" ? "Contexto automatico da empresa logada" : item.scope === "recovery" ? "Parede com Recovery e debitos" : "Dados operacionais do Atendimento",
                required: item.required
            })), [
        botConfig.variableCatalog,
        selectedScenario
    ]);
    const flowScenarios = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const positions = {
            entry_gate: {
                x: 40,
                y: 140
            },
            welcomeMessage: {
                x: 360,
                y: 20
            },
            returningCustomerMessage: {
                x: 360,
                y: 240
            },
            mainMenuPrompt: {
                x: 700,
                y: 20
            },
            recoveryDetectedMessage: {
                x: 700,
                y: 240
            },
            postActionPrompt: {
                x: 1040,
                y: 20
            },
            registrationCapture: {
                x: 1040,
                y: 240
            },
            agendaDispatch: {
                x: 1380,
                y: 20
            },
            humanAckMessage: {
                x: 1380,
                y: 240
            },
            closeTopicMessage: {
                x: 1380,
                y: 440
            },
            blockedMessage: {
                x: 700,
                y: 460
            }
        };
        const gateNode = {
            id: "entry_gate",
            label: "Entrada do WhatsApp",
            description: "Primeiro no do Atendimento apos a mensagem inbound do cliente.",
            badge: "Entrada",
            nodeKind: "template",
            supportsButtons: true,
            editable: false,
            messageText: "Primeira triagem automatica do Atendimento.",
            buttons: [
                {
                    buttonId: "new_customer",
                    actionId: "entry_new_customer",
                    title: "Cliente novo",
                    nextNodeId: "welcomeMessage",
                    nextLabel: "Abrir mensagem para cliente novo"
                },
                {
                    buttonId: "returning_customer",
                    actionId: "entry_returning_customer",
                    title: "Cliente recorrente",
                    nextNodeId: "returningCustomerMessage",
                    nextLabel: "Retomar atendimento do cliente recorrente"
                }
            ],
            position: positions.entry_gate,
            toneLabel: "Entrada automatica do canal"
        };
        const scenarioNodes = BOT_SCENARIOS.map((scenario)=>({
                id: scenario.id,
                label: scenario.label,
                description: scenario.description,
                badge: scenario.badge,
                nodeKind: scenario.id === "humanAckMessage" ? "human_handoff" : scenario.id === "closeTopicMessage" ? "end" : "message",
                supportsButtons: scenario.supportsButtons,
                editable: true,
                messageText: String(botConfig[scenario.id] || ""),
                buttons: scenario.supportsButtons && scenario.buttonSection ? botConfig[scenario.buttonSection].map((button)=>({
                        ...button,
                        nextNodeId: resolveAtendimentoNextNode(String(button.actionId)),
                        nextLabel: BOT_SCENARIOS.find((item)=>item.id === resolveAtendimentoNextNode(String(button.actionId)))?.label || (String(button.actionId).startsWith("agenda:") ? "Despacho para agenda operacional" : "Destino do fluxo")
                    })) : [],
                position: positions[scenario.id] || {
                    x: 0,
                    y: 0
                }
            }));
        const syntheticNodes = [
            {
                id: "registrationCapture",
                label: "Captura de cadastro",
                description: "Coleta rapida de dados do novo cliente antes de continuar o atendimento.",
                badge: "Acao",
                nodeKind: "action",
                supportsButtons: false,
                editable: false,
                messageText: "Acao de cadastro rapido em andamento.",
                buttons: [],
                position: positions.registrationCapture,
                effectLabel: "Salva cadastro inicial e depois devolve o cliente ao fluxo principal."
            },
            {
                id: "agendaDispatch",
                label: "Despacho para agenda",
                description: "Envia o cliente para a agenda operacional selecionada.",
                badge: "Agenda",
                nodeKind: "action",
                supportsButtons: false,
                editable: false,
                messageText: "Agenda operacional selecionada.",
                buttons: [],
                position: positions.agendaDispatch,
                effectLabel: "Abre agenda real e registra o grupo selecionado para o atendimento."
            }
        ];
        return [
            gateNode,
            ...scenarioNodes,
            ...syntheticNodes
        ];
    }, [
        botConfig
    ]);
    const catalogVariables = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>botConfig.variableCatalog.map((item)=>({
                key: item.key,
                label: item.label,
                example: item.example,
                scopeLabel: VARIABLE_SCOPE_LABELS[item.scope],
                categoryLabel: item.key === "empresa" ? "Empresa" : item.key === "cliente" ? "Cliente" : item.scope === "recovery" ? "Recovery" : item.scope === "atendimento" ? "Atendimento" : "Sistema",
                originLabel: item.scope === "shared" ? "Contexto automatico da empresa logada" : item.scope === "recovery" ? "Parede com Recovery e debitos" : "Dados operacionais do Atendimento",
                required: item.required
            })), [
        botConfig.variableCatalog
    ]);
    const flowEdges = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>flowScenarios.flatMap((scenario)=>scenario.buttons.filter((button)=>button.nextNodeId).map((button)=>({
                    id: `${scenario.id}-${button.buttonId}-${button.nextNodeId}`,
                    from: scenario.id,
                    to: String(button.nextNodeId),
                    label: button.title
                }))), [
        flowScenarios
    ]);
    const catalogActions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const base = botConfig.actionCatalog.map((action)=>({
                actionId: action.actionId,
                title: action.title,
                description: action.description,
                routeLabel: VARIABLE_SCOPE_LABELS[action.route],
                typeLabel: ACTION_KIND_LABELS[action.kind],
                enabled: action.enabled
            }));
        const agendas = agendaOptions.map((agenda)=>({
                actionId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildAgendaActionId"])(agenda.id),
                title: agenda.title,
                description: "Abre uma agenda operacional real vinculada ao Atendimento.",
                routeLabel: "Atendimento",
                typeLabel: "Agenda",
                enabled: true
            }));
        return [
            ...base,
            ...agendas
        ];
    }, [
        agendaOptions,
        botConfig.actionCatalog
    ]);
    const publicationChecks = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>[
            {
                id: "welcome",
                label: "Boas-vindas",
                description: "O primeiro contato precisa ter uma mensagem clara para cliente novo.",
                ok: String(botConfig.welcomeMessage || "").trim().length > 0
            },
            {
                id: "main_menu",
                label: "Menu principal",
                description: "O fluxo principal do Atendimento precisa ter pelo menos uma rota clicavel.",
                ok: botConfig.mainMenuButtons.length > 0
            },
            {
                id: "active_actions",
                label: "Acoes operacionais",
                description: "Pelo menos uma acao do catalogo precisa estar ativa e pronta para uso.",
                ok: botConfig.actionCatalog.some((action)=>action.enabled)
            },
            {
                id: "routing",
                label: "Parede com Recovery",
                description: "As regras de triagem precisam continuar ativas para nao misturar cobranca com atendimento.",
                ok: botConfig.routingRules.checkRecoveryBeforeReply || botConfig.routingRules.autoRouteDebtorsToRecovery
            }
        ], [
        botConfig.actionCatalog,
        botConfig.mainMenuButtons.length,
        botConfig.routingRules,
        botConfig.welcomeMessage
    ]);
    const handleMessageTypeChange = (nextType)=>{
        if (!selectedScenario?.supportsButtons || !selectedScenario.buttonSection) return;
        if (nextType === "simple") {
            for(let index = selectedButtons.length - 1; index >= 0; index -= 1){
                onRemoveButtonSection(selectedScenario.buttonSection, index);
            }
            return;
        }
        if (selectedButtons.length === 0) {
            onAddButtonSection(selectedScenario.buttonSection);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stackSection,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].workspaceCard,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionHead,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                children: "Editor premium"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                lineNumber: 498,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                            lineNumber: 497,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "btn btn-primary btn-sm",
                            onClick: onSave,
                            disabled: savingBot || loadingBot,
                            children: savingBot ? "Salvando..." : "Salvar editor"
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                            lineNumber: 501,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                    lineNumber: 496,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    eyebrow: "Atendimento",
                    title: selectedScenario?.label || "Entrada do WhatsApp",
                    description: selectedScenario?.description || "Primeiro no do fluxo do Atendimento.",
                    flowScenarios: flowScenarios,
                    flowEdges: flowEdges,
                    startNodeId: "entry_gate",
                    selectedScenarioId: selectedScenarioId,
                    onSelectScenario: (scenarioId)=>setSelectedScenarioId(scenarioId),
                    messageText: selectedScenario ? String(botConfig[selectedScenario.id] || "") : "",
                    onMessageTextChange: (value)=>{
                        if (!selectedScenario) return;
                        onUpdateBotText(selectedScenario.id, value);
                    },
                    messageType: messageType,
                    onMessageTypeChange: handleMessageTypeChange,
                    buttons: selectedButtons,
                    actionOptions: actionOptions,
                    actionById: actionById,
                    catalogActions: catalogActions,
                    onUpdateButton: (index, field, value)=>{
                        if (!selectedScenario?.buttonSection) return;
                        onUpdateButtonSection(selectedScenario.buttonSection, index, field, value);
                    },
                    onAddButton: ()=>{
                        if (!selectedScenario?.buttonSection) return;
                        onAddButtonSection(selectedScenario.buttonSection);
                    },
                    onRemoveButton: (index)=>{
                        if (!selectedScenario?.buttonSection) return;
                        onRemoveButtonSection(selectedScenario.buttonSection, index);
                    },
                    variables: studioVariables,
                    catalogVariables: catalogVariables,
                    onAppendVariable: (variableKey)=>{
                        if (!selectedScenario) return;
                        onAppendVariable(selectedScenario.id, variableKey);
                    },
                    previewText: selectedScenario ? renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig) : "Entrada inicial do canal.",
                    previewFooter: "Atendimento",
                    previewFallbackText: selectedScenario ? buildFallbackText(renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig), selectedButtons) : "Entrada inicial do canal.",
                    previewNote: "O fallback textual continua disponivel para canais ou cenarios sem suporte a botoes.",
                    publicationChecks: publicationChecks,
                    publicationTitle: "Publicacao do fluxo Atendimento",
                    publicationDescription: "Revise entrada, menu principal e parede com Recovery antes de salvar o builder.",
                    primaryActionLabel: savingBot ? "Salvando..." : "Salvar editor",
                    onPrimaryAction: onSave,
                    primaryActionDisabled: savingBot || loadingBot,
                    actionsTabExtra: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].ruleGrid,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].switchCard,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: botConfig.routingRules.checkRecoveryBeforeReply,
                                                onChange: (event)=>onUpdateRoutingRule("checkRecoveryBeforeReply", event.target.checked)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 562,
                                                columnNumber: 19
                                            }, void 0),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Checar Recovery antes"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 563,
                                                        columnNumber: 24
                                                    }, void 0),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        children: "Primeiro passo do Atendimento ao receber qualquer mensagem."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 563,
                                                        columnNumber: 62
                                                    }, void 0)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 563,
                                                columnNumber: 19
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                        lineNumber: 561,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].switchCard,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: botConfig.routingRules.autoRouteDebtorsToRecovery,
                                                onChange: (event)=>onUpdateRoutingRule("autoRouteDebtorsToRecovery", event.target.checked)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 566,
                                                columnNumber: 19
                                            }, void 0),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Subir devedor para Recovery"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 567,
                                                        columnNumber: 24
                                                    }, void 0),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        children: "Clientes inadimplentes nao ficam misturados no Atendimento."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 567,
                                                        columnNumber: 68
                                                    }, void 0)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 567,
                                                columnNumber: 19
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                        lineNumber: 565,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].switchCard,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: botConfig.routingRules.autoReopenClosedConversation,
                                                onChange: (event)=>onUpdateRoutingRule("autoReopenClosedConversation", event.target.checked)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 570,
                                                columnNumber: 19
                                            }, void 0),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Reabrir conversa encerrada"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 571,
                                                        columnNumber: 24
                                                    }, void 0),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        children: "Se o cliente voltar a falar, a conversa volta automaticamente."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 571,
                                                        columnNumber: 67
                                                    }, void 0)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 571,
                                                columnNumber: 19
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                        lineNumber: 569,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].switchCard,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: botConfig.routingRules.notifyOnNewInbound,
                                                onChange: (event)=>onUpdateRoutingRule("notifyOnNewInbound", event.target.checked)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 574,
                                                columnNumber: 19
                                            }, void 0),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Notificar novas mensagens"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 575,
                                                        columnNumber: 24
                                                    }, void 0),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        children: "Alimenta o aviso visual do modulo e do topo do sistema."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 575,
                                                        columnNumber: 66
                                                    }, void 0)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 575,
                                                columnNumber: 19
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                        lineNumber: 573,
                                        columnNumber: 17
                                    }, void 0)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                lineNumber: 560,
                                columnNumber: 15
                            }, void 0),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].editorCard,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].cardHeader,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Catalogo de acoes"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 582,
                                                        columnNumber: 21
                                                    }, void 0),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                        children: "Base real para os botoes do editor, com rota, tipo e resposta automatica."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 583,
                                                        columnNumber: 21
                                                    }, void 0)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 581,
                                                columnNumber: 19
                                            }, void 0),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-secondary btn-sm",
                                                onClick: onAddCustomAction,
                                                children: "Nova acao custom"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 585,
                                                columnNumber: 19
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                        lineNumber: 580,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].actionCatalogList,
                                        children: botConfig.actionCatalog.map((action)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].actionCard,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGrid,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Titulo"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 595,
                                                                        columnNumber: 27
                                                                    }, void 0),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                        className: "field",
                                                                        value: action.title,
                                                                        onChange: (event)=>onUpdateActionGuide(action.actionId, "title", event.target.value)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 596,
                                                                        columnNumber: 27
                                                                    }, void 0)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 594,
                                                                columnNumber: 25
                                                            }, void 0),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Tipo"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 599,
                                                                        columnNumber: 27
                                                                    }, void 0),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                        className: "field",
                                                                        value: action.kind,
                                                                        onChange: (event)=>onUpdateActionGuide(action.actionId, "kind", event.target.value),
                                                                        children: Object.entries(ACTION_KIND_LABELS).map(([value, label])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                                value: value,
                                                                                children: label
                                                                            }, value, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                                lineNumber: 602,
                                                                                columnNumber: 31
                                                                            }, void 0))
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 600,
                                                                        columnNumber: 27
                                                                    }, void 0)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 598,
                                                                columnNumber: 25
                                                            }, void 0),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Destino"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 607,
                                                                        columnNumber: 27
                                                                    }, void 0),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                        className: "field",
                                                                        value: action.route,
                                                                        onChange: (event)=>onUpdateActionGuide(action.actionId, "route", event.target.value),
                                                                        children: Object.entries(VARIABLE_SCOPE_LABELS).map(([value, label])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                                value: value,
                                                                                children: label
                                                                            }, value, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                                lineNumber: 610,
                                                                                columnNumber: 31
                                                                            }, void 0))
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 608,
                                                                        columnNumber: 27
                                                                    }, void 0)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 606,
                                                                columnNumber: 25
                                                            }, void 0),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].switchRow,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                        type: "checkbox",
                                                                        checked: action.enabled,
                                                                        onChange: (event)=>onUpdateActionGuide(action.actionId, "enabled", event.target.checked)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 615,
                                                                        columnNumber: 27
                                                                    }, void 0),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: "Ativa"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 616,
                                                                        columnNumber: 27
                                                                    }, void 0)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 614,
                                                                columnNumber: 25
                                                            }, void 0)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 593,
                                                        columnNumber: 23
                                                    }, void 0),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                children: "Descricao operacional"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 621,
                                                                columnNumber: 25
                                                            }, void 0),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                className: "field",
                                                                value: action.description,
                                                                onChange: (event)=>onUpdateActionGuide(action.actionId, "description", event.target.value)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 622,
                                                                columnNumber: 25
                                                            }, void 0)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 620,
                                                        columnNumber: 23
                                                    }, void 0),
                                                    action.kind === "agenda" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                children: "Agenda vinculada"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 627,
                                                                columnNumber: 27
                                                            }, void 0),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                                className: "field",
                                                                value: String(action.agendaGroupId || ""),
                                                                onChange: (event)=>onUpdateActionGuide(action.actionId, "agendaGroupId", event.target.value),
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                        value: "",
                                                                        children: "Selecione"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                        lineNumber: 629,
                                                                        columnNumber: 29
                                                                    }, void 0),
                                                                    agendaOptions.map((group)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                            value: group.id,
                                                                            children: group.title
                                                                        }, group.id, false, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                            lineNumber: 631,
                                                                            columnNumber: 31
                                                                        }, void 0))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 628,
                                                                columnNumber: 27
                                                            }, void 0)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 626,
                                                        columnNumber: 25
                                                    }, void 0) : null,
                                                    action.kind === "reply" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                children: "Mensagem da acao"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 639,
                                                                columnNumber: 27
                                                            }, void 0),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                                className: "field",
                                                                rows: 3,
                                                                value: action.responseMessage || "",
                                                                onChange: (event)=>onUpdateActionGuide(action.actionId, "responseMessage", event.target.value)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                                lineNumber: 640,
                                                                columnNumber: 27
                                                            }, void 0)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 638,
                                                        columnNumber: 25
                                                    }, void 0) : null,
                                                    action.custom ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].footerActions,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-danger btn-sm",
                                                            onClick: ()=>onRemoveCustomAction(action.actionId),
                                                            children: "Excluir acao custom"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                            lineNumber: 646,
                                                            columnNumber: 27
                                                        }, void 0)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                        lineNumber: 645,
                                                        columnNumber: 25
                                                    }, void 0) : null
                                                ]
                                            }, action.actionId, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                                lineNumber: 592,
                                                columnNumber: 21
                                            }, void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                        lineNumber: 590,
                                        columnNumber: 17
                                    }, void 0)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                                lineNumber: 579,
                                columnNumber: 15
                            }, void 0)
                        ]
                    }, void 0, true),
                    loading: loadingBot
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
                    lineNumber: 506,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
            lineNumber: 495,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/dashboard/inbox/_components/BotPanel.tsx",
        lineNumber: 494,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/hbx-recovery/page.module.css [app-ssr] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "agendaItemActions": "page-module__kVQJJW__agendaItemActions",
  "agendaItemCard": "page-module__kVQJJW__agendaItemCard",
  "agendaItemHeader": "page-module__kVQJJW__agendaItemHeader",
  "agendaItemPreview": "page-module__kVQJJW__agendaItemPreview",
  "agendaList": "page-module__kVQJJW__agendaList",
  "agendaMetaGrid": "page-module__kVQJJW__agendaMetaGrid",
  "agendaStatCard": "page-module__kVQJJW__agendaStatCard",
  "agendaStatsGrid": "page-module__kVQJJW__agendaStatsGrid",
  "alert-error": "page-module__kVQJJW__alert-error",
  "alert-info": "page-module__kVQJJW__alert-info",
  "automationChip": "page-module__kVQJJW__automationChip",
  "automationChipOff": "page-module__kVQJJW__automationChipOff",
  "automationChipOn": "page-module__kVQJJW__automationChipOn",
  "batchActions": "page-module__kVQJJW__batchActions",
  "botActionGuideEditor": "page-module__kVQJJW__botActionGuideEditor",
  "botActionGuideItem": "page-module__kVQJJW__botActionGuideItem",
  "botActionGuideList": "page-module__kVQJJW__botActionGuideList",
  "botActionMeta": "page-module__kVQJJW__botActionMeta",
  "botButtonList": "page-module__kVQJJW__botButtonList",
  "botButtonRow": "page-module__kVQJJW__botButtonRow",
  "botEditorPanel": "page-module__kVQJJW__botEditorPanel",
  "botFlowLayout": "page-module__kVQJJW__botFlowLayout",
  "botRoutingGrid": "page-module__kVQJJW__botRoutingGrid",
  "botRoutingToggle": "page-module__kVQJJW__botRoutingToggle",
  "botStepCard": "page-module__kVQJJW__botStepCard",
  "botStepHeader": "page-module__kVQJJW__botStepHeader",
  "botStudioStack": "page-module__kVQJJW__botStudioStack",
  "botVariableCard": "page-module__kVQJJW__botVariableCard",
  "botVariableGrid": "page-module__kVQJJW__botVariableGrid",
  "botVariableHeader": "page-module__kVQJJW__botVariableHeader",
  "botVariableShortcut": "page-module__kVQJJW__botVariableShortcut",
  "botVariableShortcutRow": "page-module__kVQJJW__botVariableShortcutRow",
  "btn": "page-module__kVQJJW__btn",
  "btn-danger": "page-module__kVQJJW__btn-danger",
  "btn-ghost": "page-module__kVQJJW__btn-ghost",
  "btn-primary": "page-module__kVQJJW__btn-primary",
  "btn-secondary": "page-module__kVQJJW__btn-secondary",
  "cardEyebrow": "page-module__kVQJJW__cardEyebrow",
  "cardFoot": "page-module__kVQJJW__cardFoot",
  "cardTitle": "page-module__kVQJJW__cardTitle",
  "cardValue": "page-module__kVQJJW__cardValue",
  "chartArea": "page-module__kVQJJW__chartArea",
  "chartAxis": "page-module__kVQJJW__chartAxis",
  "chartGridLine": "page-module__kVQJJW__chartGridLine",
  "chartLegend": "page-module__kVQJJW__chartLegend",
  "chartLegendItem": "page-module__kVQJJW__chartLegendItem",
  "chartLegendLabel": "page-module__kVQJJW__chartLegendLabel",
  "chartLegendNote": "page-module__kVQJJW__chartLegendNote",
  "chartLegendValue": "page-module__kVQJJW__chartLegendValue",
  "chartLine": "page-module__kVQJJW__chartLine",
  "chartPoint": "page-module__kVQJJW__chartPoint",
  "chartPointStrong": "page-module__kVQJJW__chartPointStrong",
  "chartSurface": "page-module__kVQJJW__chartSurface",
  "chartSvg": "page-module__kVQJJW__chartSvg",
  "clientCell": "page-module__kVQJJW__clientCell",
  "comparisonGrid": "page-module__kVQJJW__comparisonGrid",
  "comparisonItem": "page-module__kVQJJW__comparisonItem",
  "contentGrid": "page-module__kVQJJW__contentGrid",
  "dateInputWrap": "page-module__kVQJJW__dateInputWrap",
  "delayCell": "page-module__kVQJJW__delayCell",
  "drawerActions": "page-module__kVQJJW__drawerActions",
  "drawerBackdrop": "page-module__kVQJJW__drawerBackdrop",
  "drawerEyebrow": "page-module__kVQJJW__drawerEyebrow",
  "drawerHeader": "page-module__kVQJJW__drawerHeader",
  "drawerPanel": "page-module__kVQJJW__drawerPanel",
  "drawerRoot": "page-module__kVQJJW__drawerRoot",
  "drawerSection": "page-module__kVQJJW__drawerSection",
  "drawerSectionHeader": "page-module__kVQJJW__drawerSectionHeader",
  "drawerStats": "page-module__kVQJJW__drawerStats",
  "drawerSubtitle": "page-module__kVQJJW__drawerSubtitle",
  "drawerTitle": "page-module__kVQJJW__drawerTitle",
  "emptyCell": "page-module__kVQJJW__emptyCell",
  "field": "page-module__kVQJJW__field",
  "fieldBlock": "page-module__kVQJJW__fieldBlock",
  "filterPill": "page-module__kVQJJW__filterPill",
  "filterPillActive": "page-module__kVQJJW__filterPillActive",
  "filterPills": "page-module__kVQJJW__filterPills",
  "flowCard": "page-module__kVQJJW__flowCard",
  "flowCardActions": "page-module__kVQJJW__flowCardActions",
  "flowCardActive": "page-module__kVQJJW__flowCardActive",
  "flowCardHeader": "page-module__kVQJJW__flowCardHeader",
  "flowEmpty": "page-module__kVQJJW__flowEmpty",
  "flowGrid": "page-module__kVQJJW__flowGrid",
  "flowHeaderActions": "page-module__kVQJJW__flowHeaderActions",
  "flowIndex": "page-module__kVQJJW__flowIndex",
  "flowMessageHeader": "page-module__kVQJJW__flowMessageHeader",
  "flowStageActions": "page-module__kVQJJW__flowStageActions",
  "flowStageEditor": "page-module__kVQJJW__flowStageEditor",
  "flowStageGrid": "page-module__kVQJJW__flowStageGrid",
  "flowStageList": "page-module__kVQJJW__flowStageList",
  "flowStageRow": "page-module__kVQJJW__flowStageRow",
  "flowStageToggle": "page-module__kVQJJW__flowStageToggle",
  "flowStep": "page-module__kVQJJW__flowStep",
  "heroActions": "page-module__kVQJJW__heroActions",
  "heroCreateButton": "page-module__kVQJJW__heroCreateButton",
  "heroTab": "page-module__kVQJJW__heroTab",
  "heroTabActive": "page-module__kVQJJW__heroTabActive",
  "heroTabGroup": "page-module__kVQJJW__heroTabGroup",
  "hiddenDateInput": "page-module__kVQJJW__hiddenDateInput",
  "hiddenFileInput": "page-module__kVQJJW__hiddenFileInput",
  "highlightCard": "page-module__kVQJJW__highlightCard",
  "highlightHeader": "page-module__kVQJJW__highlightHeader",
  "historyAside": "page-module__kVQJJW__historyAside",
  "historyCard": "page-module__kVQJJW__historyCard",
  "historyList": "page-module__kVQJJW__historyList",
  "historyMeta": "page-module__kVQJJW__historyMeta",
  "historyMonthWrap": "page-module__kVQJJW__historyMonthWrap",
  "historyStatus": "page-module__kVQJJW__historyStatus",
  "historyTitle": "page-module__kVQJJW__historyTitle",
  "humanAttentionActions": "page-module__kVQJJW__humanAttentionActions",
  "humanAttentionCard": "page-module__kVQJJW__humanAttentionCard",
  "humanAttentionCount": "page-module__kVQJJW__humanAttentionCount",
  "humanAttentionEyebrow": "page-module__kVQJJW__humanAttentionEyebrow",
  "humanAttentionFeed": "page-module__kVQJJW__humanAttentionFeed",
  "humanAttentionFeedCount": "page-module__kVQJJW__humanAttentionFeedCount",
  "humanAttentionFeedItem": "page-module__kVQJJW__humanAttentionFeedItem",
  "humanAttentionFeedMeta": "page-module__kVQJJW__humanAttentionFeedMeta",
  "humanAttentionFeedPreview": "page-module__kVQJJW__humanAttentionFeedPreview",
  "humanAttentionFeedTitle": "page-module__kVQJJW__humanAttentionFeedTitle",
  "humanAttentionHeader": "page-module__kVQJJW__humanAttentionHeader",
  "humanAttentionPhone": "page-module__kVQJJW__humanAttentionPhone",
  "humanAttentionPreview": "page-module__kVQJJW__humanAttentionPreview",
  "humanAttentionTitle": "page-module__kVQJJW__humanAttentionTitle",
  "humanAttentionViewport": "page-module__kVQJJW__humanAttentionViewport",
  "humanQueueStat": "page-module__kVQJJW__humanQueueStat",
  "humanQueueStatActive": "page-module__kVQJJW__humanQueueStatActive",
  "impactCard": "page-module__kVQJJW__impactCard",
  "impactGrid": "page-module__kVQJJW__impactGrid",
  "importActions": "page-module__kVQJJW__importActions",
  "importIssues": "page-module__kVQJJW__importIssues",
  "importPreviewTable": "page-module__kVQJJW__importPreviewTable",
  "importPreviewWrap": "page-module__kVQJJW__importPreviewWrap",
  "inlineToggle": "page-module__kVQJJW__inlineToggle",
  "interactionActionBar": "page-module__kVQJJW__interactionActionBar",
  "interactionBadgeRow": "page-module__kVQJJW__interactionBadgeRow",
  "interactionChatPanel": "page-module__kVQJJW__interactionChatPanel",
  "interactionComposer": "page-module__kVQJJW__interactionComposer",
  "interactionComposerActions": "page-module__kVQJJW__interactionComposerActions",
  "interactionComposerHeader": "page-module__kVQJJW__interactionComposerHeader",
  "interactionDetail": "page-module__kVQJJW__interactionDetail",
  "interactionDetailGrid": "page-module__kVQJJW__interactionDetailGrid",
  "interactionDetailHeader": "page-module__kVQJJW__interactionDetailHeader",
  "interactionDetailIdentity": "page-module__kVQJJW__interactionDetailIdentity",
  "interactionDetailWrap": "page-module__kVQJJW__interactionDetailWrap",
  "interactionHuman": "page-module__kVQJJW__interactionHuman",
  "interactionInbound": "page-module__kVQJJW__interactionInbound",
  "interactionInfoCard": "page-module__kVQJJW__interactionInfoCard",
  "interactionInlineToggle": "page-module__kVQJJW__interactionInlineToggle",
  "interactionListToolbar": "page-module__kVQJJW__interactionListToolbar",
  "interactionMessage": "page-module__kVQJJW__interactionMessage",
  "interactionMessageList": "page-module__kVQJJW__interactionMessageList",
  "interactionOutbound": "page-module__kVQJJW__interactionOutbound",
  "interactionRow": "page-module__kVQJJW__interactionRow",
  "interactionRowActive": "page-module__kVQJJW__interactionRowActive",
  "interactionRowButton": "page-module__kVQJJW__interactionRowButton",
  "interactionRowTime": "page-module__kVQJJW__interactionRowTime",
  "interactionRowTop": "page-module__kVQJJW__interactionRowTop",
  "interactionSidePanel": "page-module__kVQJJW__interactionSidePanel",
  "interactionSystem": "page-module__kVQJJW__interactionSystem",
  "interactionsFilter": "page-module__kVQJJW__interactionsFilter",
  "interactionsHeaderStats": "page-module__kVQJJW__interactionsHeaderStats",
  "interactionsList": "page-module__kVQJJW__interactionsList",
  "interactionsListWrap": "page-module__kVQJJW__interactionsListWrap",
  "interactionsPanel": "page-module__kVQJJW__interactionsPanel",
  "interactionsRefreshSpinner": "page-module__kVQJJW__interactionsRefreshSpinner",
  "interactionsRefreshSpinnerActive": "page-module__kVQJJW__interactionsRefreshSpinnerActive",
  "interactionsRefreshStatus": "page-module__kVQJJW__interactionsRefreshStatus",
  "interactionsWorkspace": "page-module__kVQJJW__interactionsWorkspace",
  "layoutAxisButton": "page-module__kVQJJW__layoutAxisButton",
  "layoutAxisButtonActive": "page-module__kVQJJW__layoutAxisButtonActive",
  "layoutAxisSwitch": "page-module__kVQJJW__layoutAxisSwitch",
  "layoutCanvas": "page-module__kVQJJW__layoutCanvas",
  "layoutCanvasColumn": "page-module__kVQJJW__layoutCanvasColumn",
  "layoutCanvasSplitter": "page-module__kVQJJW__layoutCanvasSplitter",
  "layoutCanvasSplitterCol": "page-module__kVQJJW__layoutCanvasSplitterCol",
  "layoutCanvasSplitterRow": "page-module__kVQJJW__layoutCanvasSplitterRow",
  "layoutManagerCard": "page-module__kVQJJW__layoutManagerCard",
  "layoutQuickActions": "page-module__kVQJJW__layoutQuickActions",
  "layoutResetButton": "page-module__kVQJJW__layoutResetButton",
  "layoutSaveBar": "page-module__kVQJJW__layoutSaveBar",
  "layoutSaveButton": "page-module__kVQJJW__layoutSaveButton",
  "layoutSaveButtonDirty": "page-module__kVQJJW__layoutSaveButtonDirty",
  "layoutSavePulse": "page-module__kVQJJW__layoutSavePulse",
  "layoutStudioGrid": "page-module__kVQJJW__layoutStudioGrid",
  "layoutStudioHeader": "page-module__kVQJJW__layoutStudioHeader",
  "layoutStudioHelp": "page-module__kVQJJW__layoutStudioHelp",
  "layoutStudioMetric": "page-module__kVQJJW__layoutStudioMetric",
  "layoutStudioPanel": "page-module__kVQJJW__layoutStudioPanel",
  "layoutWindowAccent": "page-module__kVQJJW__layoutWindowAccent",
  "layoutWindowButton": "page-module__kVQJJW__layoutWindowButton",
  "layoutWindowPrimary": "page-module__kVQJJW__layoutWindowPrimary",
  "layoutWindowSecondary": "page-module__kVQJJW__layoutWindowSecondary",
  "messageHeader": "page-module__kVQJJW__messageHeader",
  "messageMeta": "page-module__kVQJJW__messageMeta",
  "messageTypeTag": "page-module__kVQJJW__messageTypeTag",
  "messageVariables": "page-module__kVQJJW__messageVariables",
  "metricRibbon": "page-module__kVQJJW__metricRibbon",
  "miniStat": "page-module__kVQJJW__miniStat",
  "monoCell": "page-module__kVQJJW__monoCell",
  "noticeClose": "page-module__kVQJJW__noticeClose",
  "noticeHistoryHeader": "page-module__kVQJJW__noticeHistoryHeader",
  "noticeHistoryItem": "page-module__kVQJJW__noticeHistoryItem",
  "noticeHistoryList": "page-module__kVQJJW__noticeHistoryList",
  "noticeHistoryPanel": "page-module__kVQJJW__noticeHistoryPanel",
  "noticeToast": "page-module__kVQJJW__noticeToast",
  "noticeViewport": "page-module__kVQJJW__noticeViewport",
  "paymentBillingCard": "page-module__kVQJJW__paymentBillingCard",
  "paymentBillingGrid": "page-module__kVQJJW__paymentBillingGrid",
  "paymentEmpty": "page-module__kVQJJW__paymentEmpty",
  "paymentHistoryList": "page-module__kVQJJW__paymentHistoryList",
  "paymentHistoryPanel": "page-module__kVQJJW__paymentHistoryPanel",
  "paymentRowAside": "page-module__kVQJJW__paymentRowAside",
  "paymentRowCard": "page-module__kVQJJW__paymentRowCard",
  "paymentStatusCard": "page-module__kVQJJW__paymentStatusCard",
  "paymentStatusCardActive": "page-module__kVQJJW__paymentStatusCardActive",
  "paymentStatusCards": "page-module__kVQJJW__paymentStatusCards",
  "paymentTotalCard": "page-module__kVQJJW__paymentTotalCard",
  "paymentTotalsGrid": "page-module__kVQJJW__paymentTotalsGrid",
  "previewHint": "page-module__kVQJJW__previewHint",
  "recovery-human-attention-pulse": "page-module__kVQJJW__recovery-human-attention-pulse",
  "recovery-human-stat-pulse": "page-module__kVQJJW__recovery-human-stat-pulse",
  "recovery-refresh-orbit": "page-module__kVQJJW__recovery-refresh-orbit",
  "recovery-tab-enter": "page-module__kVQJJW__recovery-tab-enter",
  "recovery-tab-exit": "page-module__kVQJJW__recovery-tab-exit",
  "recoveryDockActions": "page-module__kVQJJW__recoveryDockActions",
  "recoveryDockButton": "page-module__kVQJJW__recoveryDockButton",
  "recoveryDockButtonActive": "page-module__kVQJJW__recoveryDockButtonActive",
  "recoveryPanelHeader": "page-module__kVQJJW__recoveryPanelHeader",
  "recoveryPanelHeaderTitle": "page-module__kVQJJW__recoveryPanelHeaderTitle",
  "recoveryPanelMenuDropdown": "page-module__kVQJJW__recoveryPanelMenuDropdown",
  "recoveryPanelMenuItem": "page-module__kVQJJW__recoveryPanelMenuItem",
  "recoveryPanelMenuTitle": "page-module__kVQJJW__recoveryPanelMenuTitle",
  "recoveryPanelMenuTrigger": "page-module__kVQJJW__recoveryPanelMenuTrigger",
  "recoveryPanelMenuWrap": "page-module__kVQJJW__recoveryPanelMenuWrap",
  "recoveryResizeDivider": "page-module__kVQJJW__recoveryResizeDivider",
  "recoveryResizeDividerHorizontal": "page-module__kVQJJW__recoveryResizeDividerHorizontal",
  "reductionBadge": "page-module__kVQJJW__reductionBadge",
  "registerActions": "page-module__kVQJJW__registerActions",
  "registerCard": "page-module__kVQJJW__registerCard",
  "registerGrid": "page-module__kVQJJW__registerGrid",
  "registerInlineFields": "page-module__kVQJJW__registerInlineFields",
  "registerPanel": "page-module__kVQJJW__registerPanel",
  "registerTableCard": "page-module__kVQJJW__registerTableCard",
  "scoreBadge": "page-module__kVQJJW__scoreBadge",
  "scoreHigh": "page-module__kVQJJW__scoreHigh",
  "scoreLow": "page-module__kVQJJW__scoreLow",
  "scoreMedium": "page-module__kVQJJW__scoreMedium",
  "scoreTable": "page-module__kVQJJW__scoreTable",
  "sectionCard": "page-module__kVQJJW__sectionCard",
  "sectionDescription": "page-module__kVQJJW__sectionDescription",
  "sectionEyebrow": "page-module__kVQJJW__sectionEyebrow",
  "sectionHeader": "page-module__kVQJJW__sectionHeader",
  "sectionTitle": "page-module__kVQJJW__sectionTitle",
  "selectionMeta": "page-module__kVQJJW__selectionMeta",
  "senderTag": "page-module__kVQJJW__senderTag",
  "stateBadge": "page-module__kVQJJW__stateBadge",
  "stateBot": "page-module__kVQJJW__stateBot",
  "stateExpired": "page-module__kVQJJW__stateExpired",
  "stateGenerated": "page-module__kVQJJW__stateGenerated",
  "stateHuman": "page-module__kVQJJW__stateHuman",
  "statePaid": "page-module__kVQJJW__statePaid",
  "stateWaiting": "page-module__kVQJJW__stateWaiting",
  "switchButton": "page-module__kVQJJW__switchButton",
  "switchKnob": "page-module__kVQJJW__switchKnob",
  "switchTrack": "page-module__kVQJJW__switchTrack",
  "tabTransitionEnter": "page-module__kVQJJW__tabTransitionEnter",
  "tabTransitionExit": "page-module__kVQJJW__tabTransitionExit",
  "tabTransitionStage": "page-module__kVQJJW__tabTransitionStage",
  "tableRow": "page-module__kVQJJW__tableRow",
  "tableRowActive": "page-module__kVQJJW__tableRowActive",
  "tableToolbar": "page-module__kVQJJW__tableToolbar",
  "tableWrap": "page-module__kVQJJW__tableWrap",
  "templateActionRow": "page-module__kVQJJW__templateActionRow",
  "templateActive": "page-module__kVQJJW__templateActive",
  "templateAttachmentCard": "page-module__kVQJJW__templateAttachmentCard",
  "templateCatalogHeader": "page-module__kVQJJW__templateCatalogHeader",
  "templateCatalogInlineField": "page-module__kVQJJW__templateCatalogInlineField",
  "templateCatalogItem": "page-module__kVQJJW__templateCatalogItem",
  "templateCatalogList": "page-module__kVQJJW__templateCatalogList",
  "templateCatalogMeta": "page-module__kVQJJW__templateCatalogMeta",
  "templateCatalogResizeHandle": "page-module__kVQJJW__templateCatalogResizeHandle",
  "templateCatalogText": "page-module__kVQJJW__templateCatalogText",
  "templateChatCanvas": "page-module__kVQJJW__templateChatCanvas",
  "templateComposerForm": "page-module__kVQJJW__templateComposerForm",
  "templateComposerLayout": "page-module__kVQJJW__templateComposerLayout",
  "templateComposerLayoutStacked": "page-module__kVQJJW__templateComposerLayoutStacked",
  "templateComposerSplitter": "page-module__kVQJJW__templateComposerSplitter",
  "templateFieldMeta": "page-module__kVQJJW__templateFieldMeta",
  "templateHelperCard": "page-module__kVQJJW__templateHelperCard",
  "templateHiddenInput": "page-module__kVQJJW__templateHiddenInput",
  "templateHint": "page-module__kVQJJW__templateHint",
  "templateHistoryList": "page-module__kVQJJW__templateHistoryList",
  "templateHistoryRow": "page-module__kVQJJW__templateHistoryRow",
  "templateList": "page-module__kVQJJW__templateList",
  "templateMessageBody": "page-module__kVQJJW__templateMessageBody",
  "templateMessageBubble": "page-module__kVQJJW__templateMessageBubble",
  "templateMessageButton": "page-module__kVQJJW__templateMessageButton",
  "templateMessageButtons": "page-module__kVQJJW__templateMessageButtons",
  "templateMessageFooter": "page-module__kVQJJW__templateMessageFooter",
  "templateMessageHeaderText": "page-module__kVQJJW__templateMessageHeaderText",
  "templateMessageMedia": "page-module__kVQJJW__templateMessageMedia",
  "templateMessageMediaPlaceholder": "page-module__kVQJJW__templateMessageMediaPlaceholder",
  "templateMessageTime": "page-module__kVQJJW__templateMessageTime",
  "templateMetaComplianceCard": "page-module__kVQJJW__templateMetaComplianceCard",
  "templateMetaComplianceGrid": "page-module__kVQJJW__templateMetaComplianceGrid",
  "templateMetaComplianceHeader": "page-module__kVQJJW__templateMetaComplianceHeader",
  "templateMetaComplianceItem": "page-module__kVQJJW__templateMetaComplianceItem",
  "templateMetaComplianceItemError": "page-module__kVQJJW__templateMetaComplianceItemError",
  "templateMetaComplianceItemOk": "page-module__kVQJJW__templateMetaComplianceItemOk",
  "templateMetaContext": "page-module__kVQJJW__templateMetaContext",
  "templateMetaContextCode": "page-module__kVQJJW__templateMetaContextCode",
  "templateMetaHeader": "page-module__kVQJJW__templateMetaHeader",
  "templateMetaHeaderPills": "page-module__kVQJJW__templateMetaHeaderPills",
  "templateMetaIssueList": "page-module__kVQJJW__templateMetaIssueList",
  "templateMetaPill": "page-module__kVQJJW__templateMetaPill",
  "templateMetaTopGrid": "page-module__kVQJJW__templateMetaTopGrid",
  "templatePaneGrip": "page-module__kVQJJW__templatePaneGrip",
  "templatePhoneFrame": "page-module__kVQJJW__templatePhoneFrame",
  "templatePhoneTopBar": "page-module__kVQJJW__templatePhoneTopBar",
  "templatePreviewCloseButton": "page-module__kVQJJW__templatePreviewCloseButton",
  "templatePreviewEmpty": "page-module__kVQJJW__templatePreviewEmpty",
  "templatePreviewEyebrow": "page-module__kVQJJW__templatePreviewEyebrow",
  "templatePreviewHeader": "page-module__kVQJJW__templatePreviewHeader",
  "templatePreviewHeaderActions": "page-module__kVQJJW__templatePreviewHeaderActions",
  "templatePreviewLegend": "page-module__kVQJJW__templatePreviewLegend",
  "templatePreviewPanel": "page-module__kVQJJW__templatePreviewPanel",
  "templatePreviewPopup": "page-module__kVQJJW__templatePreviewPopup",
  "templatePreviewVariable": "page-module__kVQJJW__templatePreviewVariable",
  "templatePreviewVariables": "page-module__kVQJJW__templatePreviewVariables",
  "templatePreviewWindowHeader": "page-module__kVQJJW__templatePreviewWindowHeader",
  "templateRow": "page-module__kVQJJW__templateRow",
  "templateSectionGrip": "page-module__kVQJJW__templateSectionGrip",
  "templateSectionShell": "page-module__kVQJJW__templateSectionShell",
  "templateSectionShellAfter": "page-module__kVQJJW__templateSectionShellAfter",
  "templateSectionShellBefore": "page-module__kVQJJW__templateSectionShellBefore",
  "templateUploadPreview": "page-module__kVQJJW__templateUploadPreview",
  "templateUploadZone": "page-module__kVQJJW__templateUploadZone",
  "templateUploadZoneActive": "page-module__kVQJJW__templateUploadZoneActive",
  "templateVariableGuide": "page-module__kVQJJW__templateVariableGuide",
  "templateVariableGuideGrid": "page-module__kVQJJW__templateVariableGuideGrid",
  "templateVariableGuideHeader": "page-module__kVQJJW__templateVariableGuideHeader",
  "templateVariableGuideHeaderRow": "page-module__kVQJJW__templateVariableGuideHeaderRow",
  "templateVariableGuideMeta": "page-module__kVQJJW__templateVariableGuideMeta",
  "templateVariableGuideRow": "page-module__kVQJJW__templateVariableGuideRow",
  "templateVariableMap": "page-module__kVQJJW__templateVariableMap",
  "templateVariableMapGrid": "page-module__kVQJJW__templateVariableMapGrid",
  "templateVariableMapItem": "page-module__kVQJJW__templateVariableMapItem",
  "templateWindowDeck": "page-module__kVQJJW__templateWindowDeck",
  "templateWindowDeckCard": "page-module__kVQJJW__templateWindowDeckCard",
  "templateWindowDeckPreviewCard": "page-module__kVQJJW__templateWindowDeckPreviewCard",
  "templateWindowDeckSlot": "page-module__kVQJJW__templateWindowDeckSlot",
  "templateWindowGripButton": "page-module__kVQJJW__templateWindowGripButton",
  "templateWindowIntroActions": "page-module__kVQJJW__templateWindowIntroActions",
  "templateWindowOrganizerActions": "page-module__kVQJJW__templateWindowOrganizerActions",
  "templateWindowOrganizerCard": "page-module__kVQJJW__templateWindowOrganizerCard",
  "templateWindowOrganizerCardDragging": "page-module__kVQJJW__templateWindowOrganizerCardDragging",
  "templateWindowOrganizerDialog": "page-module__kVQJJW__templateWindowOrganizerDialog",
  "templateWindowOrganizerEyebrow": "page-module__kVQJJW__templateWindowOrganizerEyebrow",
  "templateWindowOrganizerFooter": "page-module__kVQJJW__templateWindowOrganizerFooter",
  "templateWindowOrganizerGrid": "page-module__kVQJJW__templateWindowOrganizerGrid",
  "templateWindowOrganizerHeader": "page-module__kVQJJW__templateWindowOrganizerHeader",
  "templateWindowOrganizerIndex": "page-module__kVQJJW__templateWindowOrganizerIndex",
  "templateWindowOrganizerIntro": "page-module__kVQJJW__templateWindowOrganizerIntro",
  "templateWindowOrganizerOverlay": "page-module__kVQJJW__templateWindowOrganizerOverlay",
  "templateWindowResizable": "page-module__kVQJJW__templateWindowResizable",
  "templateWindowResizeHandle": "page-module__kVQJJW__templateWindowResizeHandle",
  "templateWindowResizeHandleE": "page-module__kVQJJW__templateWindowResizeHandleE",
  "templateWindowResizeHandleN": "page-module__kVQJJW__templateWindowResizeHandleN",
  "templateWindowResizeHandleNE": "page-module__kVQJJW__templateWindowResizeHandleNE",
  "templateWindowResizeHandleNW": "page-module__kVQJJW__templateWindowResizeHandleNW",
  "templateWindowResizeHandleS": "page-module__kVQJJW__templateWindowResizeHandleS",
  "templateWindowResizeHandleSE": "page-module__kVQJJW__templateWindowResizeHandleSE",
  "templateWindowResizeHandleSW": "page-module__kVQJJW__templateWindowResizeHandleSW",
  "templateWindowResizeHandleW": "page-module__kVQJJW__templateWindowResizeHandleW",
  "templateWorkspaceCard": "page-module__kVQJJW__templateWorkspaceCard",
  "templateWorkspaceCardDragTarget": "page-module__kVQJJW__templateWorkspaceCardDragTarget",
  "templatesMetaGrid": "page-module__kVQJJW__templatesMetaGrid",
  "templatesMetaGridStacked": "page-module__kVQJJW__templatesMetaGridStacked",
  "templatesMetaPanel": "page-module__kVQJJW__templatesMetaPanel",
  "templatesPaneSplitter": "page-module__kVQJJW__templatesPaneSplitter",
  "templatesSectionFlow": "page-module__kVQJJW__templatesSectionFlow",
});
}),
"[project]/src/lib/window-layout-presets.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/src/lib/use-ui-preferences.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useUiPreferences",
    ()=>useUiPreferences
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/window-layout-presets.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const STORAGE_KEY = "hbx:ui-prefs";
function readFromStorage() {
    if ("TURBOPACK compile-time truthy", 1) return {};
    //TURBOPACK unreachable
    ;
}
function writeToStorage(prefs) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function useUiPreferences() {
    const [prefs, setPrefs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>readFromStorage());
    const syncTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const loadedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    // Load from backend once on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (loadedRef.current) return;
        loadedRef.current = true;
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/users/me/ui-preferences").then((data)=>{
            if (!data || typeof data !== "object" || Array.isArray(data)) return;
            setPrefs((prev)=>{
                // Backend wins for non-empty values; localStorage wins if backend is empty
                const merged = {
                    ...prev
                };
                for (const key of Object.keys(data)){
                    if (data[key] !== undefined) merged[key] = data[key];
                }
                writeToStorage(merged);
                return merged;
            });
        }).catch(()=>{
        // non-fatal: keep localStorage values
        });
    }, []);
    // Listen for global reset event
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        function handleReset() {
            setPrefs({});
            writeToStorage({});
        }
        window.addEventListener("hbx-reset-layout", handleReset);
        return ()=>window.removeEventListener("hbx-reset-layout", handleReset);
    }, []);
    /**
   * Partial update for a specific module's layout prefs.
   * Instantly commits to localStorage and debounces backend sync.
   */ const updateModule = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((module, patch)=>{
        setPrefs((prev)=>{
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
            syncTimerRef.current = setTimeout(()=>{
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/users/me/ui-preferences", {
                    method: "PATCH",
                    body: JSON.stringify({
                        [module]: next[module]
                    })
                }).catch(()=>{
                // non-fatal
                });
            }, 1500);
            return next;
        });
    }, []);
    /**
   * Reset all layout preferences to defaults.
   * Fires a global event so all mounted components react.
   */ const resetAll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setPrefs({});
        writeToStorage({});
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/users/me/ui-preferences/reset", {
            method: "PATCH"
        }).catch(()=>{});
        window.dispatchEvent(new CustomEvent("hbx-reset-layout"));
    }, []);
    const getModulePrefs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((module, roleRaw)=>{
        const preset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getRolePreset"])(module, roleRaw);
        const saved = prefs[module] ?? {};
        return {
            sidebarPercent: saved.sidebarPercent ?? preset.sidebarPercent,
            splitPercent: saved.splitPercent ?? preset.splitPercent ?? saved.sidebarPercent ?? preset.sidebarPercent,
            visiblePanels: saved.visiblePanels && saved.visiblePanels.length > 0 ? saved.visiblePanels : preset.visiblePanels,
            layoutMode: saved.layoutMode ?? preset.layoutMode,
            primaryPanelPosition: saved.primaryPanelPosition ?? preset.primaryPanelPosition
        };
    }, [
        prefs
    ]);
    const applyRolePreset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((module, roleRaw)=>{
        const role = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeRole"])(roleRaw);
        const preset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getRolePreset"])(module, role);
        updateModule(module, {
            visiblePanels: preset.visiblePanels,
            sidebarPercent: preset.sidebarPercent,
            splitPercent: preset.splitPercent ?? preset.sidebarPercent,
            layoutMode: preset.layoutMode,
            primaryPanelPosition: preset.primaryPanelPosition
        });
    }, [
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
}),
"[project]/src/app/dashboard/inbox/page.client.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>InboxClientPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/DashboardScaffold.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$use$2d$popup$2d$topbar$2d$lock$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/use-popup-topbar-lock.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$polling$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/polling.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/useRequireAuth.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$_components$2f$AgendaPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/_components/AgendaPanel.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$_components$2f$BotPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/_components/BotPanel.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/inbox-model.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/inbox/page.module.css [app-ssr] (css module)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/hbx-recovery/page.module.css [app-ssr] (css module)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$use$2d$ui$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/use-ui-preferences.ts [app-ssr] (ecmascript)");
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
;
;
;
;
;
const INBOX_PANELS = [
    {
        id: "conversations",
        label: "Lista de conversas",
        description: "Sidebar com todas as conversas"
    },
    {
        id: "chat",
        label: "Timeline de mensagens",
        description: "Janela de chat com a conversa"
    }
];
const ATENDIMENTO_PENDING_STORAGE_KEY = "atendimentoPendingHumanCount";
const TAB_ITEMS = [
    {
        id: "messages",
        label: "Mensagens",
        description: "Tela principal no estilo WhatsApp, com automacao embutida por conversa."
    },
    {
        id: "customers",
        label: "Tabela de clientes",
        description: "Leitura consolidada por telefone, com rota e prioridade operacional."
    },
    {
        id: "agenda",
        label: "Agenda",
        description: "Guias cadastraveis, agenda semanal e vinculo por e-mail para cada frente."
    }
];
const ACTION_KIND_LABELS = {
    reply: "Responder",
    human_handoff: "Humano",
    recovery_handoff: "Recovery",
    close: "Encerrar",
    show_menu: "Mostrar menu",
    agenda: "Agenda"
};
function makeClientId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function formatDateLabel(dateStr, mounted) {
    if (!dateStr) return "-";
    const parsed = new Date(dateStr);
    if (!mounted) return parsed.toISOString();
    return parsed.toLocaleString("pt-BR");
}
function formatTimeLabel(dateStr, mounted) {
    if (!dateStr) return "-";
    const parsed = new Date(dateStr);
    if (!mounted) return parsed.toISOString();
    return parsed.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}
function getBubbleClass(message) {
    const direction = String(message.direction || "").trim().toLowerCase();
    const senderType = String(message.senderType || "").trim().toLowerCase();
    if (senderType === "system") return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].systemBubble;
    if (direction === "outbound") return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].outboundBubble;
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inboundBubble;
}
function removeButtonFromSections(config, actionId) {
    return {
        ...config,
        welcomeButtons: config.welcomeButtons.filter((button)=>button.actionId !== actionId),
        mainMenuButtons: config.mainMenuButtons.filter((button)=>button.actionId !== actionId),
        recoveryDetectedButtons: config.recoveryDetectedButtons.filter((button)=>button.actionId !== actionId),
        postActionButtons: config.postActionButtons.filter((button)=>button.actionId !== actionId)
    };
}
function getConversationStatusMeta(conversation) {
    if (conversation.status === "blocked" || conversation.isBlocked) {
        return {
            label: "Bloqueado",
            shortLabel: "BLQ",
            tone: "blocked"
        };
    }
    if (conversation.routeTarget === "recovery") {
        return {
            label: "Recovery",
            shortLabel: "REC",
            tone: "recovery"
        };
    }
    if (conversation.status === "open") {
        return {
            label: "Humano",
            shortLabel: "HUM",
            tone: "human"
        };
    }
    if (conversation.status === "closed") {
        return {
            label: "Resolvido",
            shortLabel: "OK",
            tone: "closed"
        };
    }
    return {
        label: "No bot",
        shortLabel: "BOT",
        tone: "bot"
    };
}
function InboxClientPage() {
    const hasToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRequireAuth"])();
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [activeTab, setActiveTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("messages");
    const [conversations, setConversations] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [selectedId, setSelectedId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [selectedConversation, setSelectedConversation] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loadingList, setLoadingList] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [loadingConversation, setLoadingConversation] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loadingBot, setLoadingBot] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [savingBot, setSavingBot] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loadingAgenda, setLoadingAgenda] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [savingAgenda, setSavingAgenda] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [notice, setNotice] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [sendText, setSendText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [sending, setSending] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [botStudioOpen, setBotStudioOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [agendaStudioOpen, setAgendaStudioOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [botConfig, setBotConfig] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEFAULT_ATENDIMENTO_BOT_CONFIG"]);
    const [agendaConfig, setAgendaConfig] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEFAULT_ATENDIMENTO_AGENDA_CONFIG"]);
    const [currentUserProfile, setCurrentUserProfile] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [expandedAlerts, setExpandedAlerts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        human_queue: false,
        new_message: false,
        system_notice: false
    });
    const [dismissedAlerts, setDismissedAlerts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        human_queue: false,
        new_message: false
    });
    const previousHumanCountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const previousNewCountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const humanAlertTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const newAlertTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const noticeTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const chatTimelineRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [atendimentoCustomers, setAtendimentoCustomers] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loadingCustomers, setLoadingCustomers] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showCreateCustomerModal, setShowCreateCustomerModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [customerForm, setCustomerForm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        phone: "",
        name: "",
        route: "atendimento",
        notes: ""
    });
    const [savingCustomer, setSavingCustomer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [promoteTarget, setPromoteTarget] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [promoteForm, setPromoteForm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        openAmount: "",
        saleDate: "",
        companyName: ""
    });
    const [savingPromotion, setSavingPromotion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    // ── Layout / window manager ──────────────────────────────────────────────
    const { prefs, updateModule } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$use$2d$ui$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useUiPreferences"])();
    const [conversationQueue, setConversationQueue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("all");
    const [sidebarPercent, setSidebarPercent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(40);
    const [panelMenuOpen, setPanelMenuOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [visiblePanels, setVisiblePanels] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([
        "conversations",
        "chat"
    ]);
    const sidebarResizeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const whatsAppShellRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const panelMenuRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setMounted(true);
    }, []);
    // Sync layout prefs from backend/storage once loaded
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const inboxPrefs = prefs.inbox;
        if (inboxPrefs?.sidebarPercent != null) setSidebarPercent(inboxPrefs.sidebarPercent);
        if (Array.isArray(inboxPrefs?.visiblePanels) && inboxPrefs.visiblePanels.length > 0) {
            setVisiblePanels(inboxPrefs.visiblePanels);
        }
        // Listen for global reset
        function handleReset() {
            setSidebarPercent(40);
            setVisiblePanels([
                "conversations",
                "chat"
            ]);
        }
        window.addEventListener("hbx-reset-layout", handleReset);
        return ()=>window.removeEventListener("hbx-reset-layout", handleReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        prefs.inbox
    ]);
    // Close panel menu on outside click
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        function handleOutside(event) {
            if (panelMenuRef.current && !panelMenuRef.current.contains(event.target)) {
                setPanelMenuOpen(null);
            }
        }
        document.addEventListener("mousedown", handleOutside);
        return ()=>document.removeEventListener("mousedown", handleOutside);
    }, []);
    // Resize handlers (drag divider between sidebar and chat)
    const startSidebarResize = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((event)=>{
        event.currentTarget.setPointerCapture(event.pointerId);
        sidebarResizeRef.current = {
            startX: event.clientX,
            startPercent: sidebarPercent
        };
    }, [
        sidebarPercent
    ]);
    const onSidebarResizeMove = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((event)=>{
        if (!sidebarResizeRef.current || !whatsAppShellRef.current) return;
        const totalWidth = whatsAppShellRef.current.offsetWidth;
        if (!totalWidth) return;
        const deltaX = event.clientX - sidebarResizeRef.current.startX;
        const deltaPercent = deltaX / totalWidth * 100;
        const next = Math.min(70, Math.max(20, sidebarResizeRef.current.startPercent + deltaPercent));
        setSidebarPercent(next);
    }, []);
    const onSidebarResizeEnd = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (!sidebarResizeRef.current) return;
        sidebarResizeRef.current = null;
        setSidebarPercent((current)=>{
            updateModule("inbox", {
                sidebarPercent: current
            });
            return current;
        });
    }, [
        updateModule
    ]);
    // Toggle panel visibility
    const togglePanel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((panelId)=>{
        setVisiblePanels((prev)=>{
            // Prevent hiding all panels
            if (prev.includes(panelId) && prev.length <= 1) return prev;
            const next = prev.includes(panelId) ? prev.filter((id)=>id !== panelId) : [
                ...prev,
                panelId
            ];
            updateModule("inbox", {
                visiblePanels: next
            });
            return next;
        });
        setPanelMenuOpen(null);
    }, [
        updateModule
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$use$2d$popup$2d$topbar$2d$lock$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePopupTopbarLock"])(botStudioOpen || agendaStudioOpen || showCreateCustomerModal || Boolean(promoteTarget));
    const loadConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (id, options)=>{
        const silent = options?.silent ?? false;
        if (!silent) setLoadingConversation(true);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/inbox/conversations/${id}`);
            setSelectedConversation(data);
            setSelectedId(data.id);
        } catch (loadError) {
            setSelectedConversation(null);
            const message = loadError instanceof Error ? loadError.message : "Falha ao carregar conversa.";
            setError(message);
        } finally{
            if (!silent) setLoadingConversation(false);
        }
    }, []);
    const loadConversations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (options)=>{
        const silent = options?.silent ?? false;
        if (!silent) setLoadingList(true);
        setError(null);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/conversations");
            setConversations(data);
            const preferredId = options?.preferredId ?? selectedId;
            const availableId = preferredId && data.some((conversation)=>conversation.id === preferredId) ? preferredId : data[0]?.id ?? null;
            setSelectedId(availableId);
            if (availableId) {
                await loadConversation(availableId, {
                    silent: true
                });
            } else {
                setSelectedConversation(null);
            }
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
            setError(message);
        } finally{
            if (!silent) setLoadingList(false);
        }
    }, [
        loadConversation,
        selectedId
    ]);
    const loadBotConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        setLoadingBot(true);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/bot-config");
            setBotConfig((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeBotConfig"])(data));
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Falha ao carregar editor.";
            setError(message);
        } finally{
            setLoadingBot(false);
        }
    }, []);
    const loadAgendaConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        setLoadingAgenda(true);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/agenda");
            setAgendaConfig((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeAgendaConfig"])(data));
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Falha ao carregar agenda.";
            setError(message);
        } finally{
            setLoadingAgenda(false);
        }
    }, []);
    const loadCurrentUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user");
            setCurrentUserProfile(data || null);
        } catch  {
            setCurrentUserProfile(null);
        }
    }, []);
    const loadAtendimentoCustomers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        setLoadingCustomers(true);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/customers");
            setAtendimentoCustomers(data ?? []);
        } catch  {
        // non-fatal
        } finally{
            setLoadingCustomers(false);
        }
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (hasToken !== true) return;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$polling$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["startSmartPolling"])(()=>loadConversations({
                silent: true
            }), {
            intervalMs: 10000,
            immediate: true
        });
    }, [
        hasToken,
        loadConversations
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (hasToken !== true) return;
        void Promise.all([
            loadBotConfig(),
            loadAgendaConfig(),
            loadCurrentUser()
        ]);
    }, [
        hasToken,
        loadAgendaConfig,
        loadBotConfig,
        loadCurrentUser
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (hasToken !== true) return;
        if (activeTab === "customers") void loadAtendimentoCustomers();
    }, [
        activeTab,
        hasToken,
        loadAtendimentoCustomers
    ]);
    const filteredConversations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (conversationQueue === "closed") {
            return conversations.filter((c)=>c.status === "closed" && !c.isBlocked);
        }
        if (conversationQueue === "blocked") {
            return conversations.filter((c)=>c.status === "blocked" || c.isBlocked);
        }
        // "all" — show open/new/active, exclude fully closed and blocked
        return conversations.filter((c)=>!c.isBlocked && c.status !== "closed" && c.status !== "blocked");
    }, [
        conversations,
        conversationQueue
    ]);
    const pendingAtendimentoConversations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>[
            ...conversations
        ].filter((conversation)=>conversation.routeTarget === "atendimento" && (conversation.status === "new" || conversation.status === "open")).sort((left, right)=>new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()), [
        conversations
    ]);
    const pendingAtendimentoCount = pendingAtendimentoConversations.length;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
    }, [
        pendingAtendimentoCount
    ]);
    const humanAttentionConversations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>pendingAtendimentoConversations.filter((conversation)=>conversation.status === "open"), [
        pendingAtendimentoConversations
    ]);
    const newInboundConversations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>pendingAtendimentoConversations.filter((conversation)=>conversation.status === "new"), [
        pendingAtendimentoConversations
    ]);
    const actionOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const options = new Map();
        for (const action of botConfig.actionCatalog){
            options.set(action.actionId, {
                value: action.actionId,
                label: `${action.title} • ${ACTION_KIND_LABELS[action.kind] || action.kind}`
            });
        }
        for (const group of agendaConfig.groups){
            const actionId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildAgendaActionId"])(group.id);
            options.set(actionId, {
                value: actionId,
                label: `Agenda • ${group.title}`
            });
        }
        [
            ...botConfig.welcomeButtons,
            ...botConfig.mainMenuButtons,
            ...botConfig.recoveryDetectedButtons,
            ...botConfig.postActionButtons
        ].forEach((button)=>{
            if (!options.has(button.actionId)) {
                options.set(button.actionId, {
                    value: button.actionId,
                    label: `Acao atual • ${button.actionId}`
                });
            }
        });
        return Array.from(options.values());
    }, [
        agendaConfig.groups,
        botConfig.actionCatalog,
        botConfig.mainMenuButtons,
        botConfig.postActionButtons,
        botConfig.recoveryDetectedButtons,
        botConfig.welcomeButtons
    ]);
    const agendaOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>agendaConfig.groups.map((group)=>({
                id: group.id,
                title: group.title
            })), [
        agendaConfig.groups
    ]);
    const canManageAgenda = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (currentUserProfile?.isSystemMaster) return true;
        const role = String(currentUserProfile?.role || "").trim().toUpperCase();
        return role === "ADMIN" || role === "GERENTE";
    }, [
        currentUserProfile?.isSystemMaster,
        currentUserProfile?.role
    ]);
    const selectedStatus = selectedConversation?.status ?? "new";
    const selectedRouteIsRecovery = selectedConversation?.routeTarget === "recovery";
    const selectedBlocked = Boolean(selectedConversation?.isBlocked);
    const selectedConversationMetadata = selectedConversation?.metadata ?? null;
    const selectedConversationDisplayName = selectedConversation?.customer.name || String(selectedConversationMetadata?.waNickname || selectedConversationMetadata?.whatsappName || selectedConversationMetadata?.whatsappProfileName || "").trim() || selectedConversation?.customer.phone || "";
    const selectedConversationStatusMeta = selectedConversation ? getConversationStatusMeta(selectedConversation) : null;
    const humanAttentionPreview = humanAttentionConversations[0] || null;
    const newInboundPreview = newInboundConversations[0] || null;
    const humanQueueLabel = `${humanAttentionConversations.length} mensagem${humanAttentionConversations.length === 1 ? "" : "s"}`;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const summaryParts = undefined;
    }, [
        activeTab,
        botStudioOpen,
        agendaStudioOpen,
        conversations.length,
        humanAttentionConversations.length,
        loadingAgenda,
        loadingBot,
        loadingConversation,
        newInboundConversations.length,
        savingAgenda,
        savingBot,
        selectedBlocked,
        selectedConversation?.customer?.name,
        selectedConversation?.customer?.phone,
        selectedConversation?.routeTarget,
        selectedId,
        selectedStatus
    ]);
    const handleTabChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((nextTab)=>{
        setActiveTab(nextTab);
        if (nextTab === "agenda") {
            setAgendaStudioOpen(true);
            setBotStudioOpen(false);
            return;
        }
        setAgendaStudioOpen(false);
    }, []);
    const renderAgendaPanel = ()=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$_components$2f$AgendaPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
            agendaConfig: agendaConfig,
            loadingAgenda: loadingAgenda,
            savingAgenda: savingAgenda,
            currentUserEmail: String(currentUserProfile?.email || ""),
            currentUserName: String(currentUserProfile?.name || ""),
            currentUserRole: String(currentUserProfile?.role || ""),
            canManageAgenda: canManageAgenda,
            onAddGroup: addAgendaGroup,
            onMoveGroup: moveAgendaGroup,
            onRemoveGroup: removeAgendaGroup,
            onLinkCurrentUser: linkAgendaToCurrentUser,
            onSave: ()=>{
                setNotice(null);
                void saveAgenda();
            },
            onUpdateGroup: updateAgendaGroup,
            onAddSlot: addAgendaSlot,
            onRemoveSlot: removeAgendaSlot,
            onUpdateSlot: updateAgendaSlot,
            onUpdateHolidays: updateAgendaHolidays,
            onLoadHolidays: loadAgendaHolidaysFromAPI
        }, void 0, false, {
            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
            lineNumber: 637,
            columnNumber: 5
        }, this);
    const updateStatus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (status)=>{
        if (!selectedId) return;
        setError(null);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/inbox/conversations/${selectedId}/status`, {
                method: "PATCH",
                body: JSON.stringify({
                    status
                })
            });
            setSelectedConversation(data);
            setNotice({
                tone: "success",
                text: `Conversa atualizada para ${status}.`
            });
            await loadConversations({
                preferredId: data.id,
                silent: true
            });
        } catch (updateError) {
            const message = updateError instanceof Error ? updateError.message : "Falha ao atualizar status.";
            setError(message);
        }
    }, [
        loadConversations,
        selectedId
    ]);
    const blockConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (!selectedId) return;
        const reason = window.prompt("Motivo do bloqueio:", selectedConversation?.blockedReason || "Bloqueado manualmente pelo operador.");
        if (reason === null) return;
        setError(null);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/inbox/conversations/${selectedId}/block`, {
                method: "PATCH",
                body: JSON.stringify({
                    reason
                })
            });
            setSelectedConversation(data);
            setNotice({
                tone: "success",
                text: "Contato bloqueado no Atendimento."
            });
            await loadConversations({
                preferredId: data.id,
                silent: true
            });
        } catch (updateError) {
            const message = updateError instanceof Error ? updateError.message : "Falha ao bloquear contato.";
            setError(message);
        }
    }, [
        loadConversations,
        selectedConversation?.blockedReason,
        selectedId
    ]);
    const unblockConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (!selectedId) return;
        setError(null);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/inbox/conversations/${selectedId}/unblock`, {
                method: "PATCH"
            });
            setSelectedConversation(data);
            setNotice({
                tone: "success",
                text: "Contato desbloqueado no Atendimento."
            });
            await loadConversations({
                preferredId: data.id,
                silent: true
            });
        } catch (updateError) {
            const message = updateError instanceof Error ? updateError.message : "Falha ao desbloquear contato.";
            setError(message);
        }
    }, [
        loadConversations,
        selectedId
    ]);
    const sendMessage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (event)=>{
        event.preventDefault();
        if (!selectedId || !sendText.trim() || selectedRouteIsRecovery || selectedBlocked) return;
        setSending(true);
        setError(null);
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/inbox/conversations/${selectedId}/message`, {
                method: "POST",
                body: JSON.stringify({
                    content: sendText.trim()
                })
            });
            setSendText("");
            setSelectedConversation(data);
            setNotice({
                tone: "success",
                text: "Mensagem manual enfileirada com sucesso."
            });
            await loadConversations({
                preferredId: data.id,
                silent: true
            });
        } catch (sendError) {
            const message = sendError instanceof Error ? sendError.message : "Falha ao enviar mensagem.";
            setError(message);
        } finally{
            setSending(false);
        }
    }, [
        loadConversations,
        selectedBlocked,
        selectedId,
        selectedRouteIsRecovery,
        sendText
    ]);
    const addAgendaGroup = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setAgendaConfig((current)=>({
                ...current,
                groups: [
                    ...current.groups,
                    {
                        id: makeClientId("agenda_group"),
                        title: `Nova guia ${current.groups.length + 1}`,
                        description: "Explique rapidamente quando esse time deve ser usado.",
                        buttonLabel: "Nova guia",
                        introMessage: "Esses sao os horarios disponiveis para {{agenda_nome}}.\n\n{{agenda_slots}}",
                        emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
                        linkedEmail: String(currentUserProfile?.email || "").trim().toLowerCase(),
                        linkedUserName: String(currentUserProfile?.name || "").trim(),
                        connectionStatus: currentUserProfile?.email ? "pending" : "not_linked",
                        accentColor: [
                            "#4da36f",
                            "#5d83ff",
                            "#e57b47",
                            "#9b59b6"
                        ][current.groups.length % 4],
                        isActive: true,
                        slots: []
                    }
                ]
            }));
    }, [
        currentUserProfile?.email,
        currentUserProfile?.name
    ]);
    const removeAgendaGroup = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((groupId)=>{
        const actionId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildAgendaActionId"])(groupId);
        setAgendaConfig((current)=>({
                ...current,
                groups: current.groups.filter((group)=>group.id !== groupId)
            }));
        setBotConfig((current)=>{
            const next = removeButtonFromSections(current, actionId);
            return {
                ...next,
                actionCatalog: next.actionCatalog.map((action)=>action.agendaGroupId === groupId ? {
                        ...action,
                        agendaGroupId: null
                    } : action)
            };
        });
    }, []);
    const updateAgendaGroup = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((groupId, field, value)=>{
        setAgendaConfig((current)=>({
                ...current,
                groups: current.groups.map((group)=>group.id === groupId ? {
                        ...group,
                        [field]: value
                    } : group)
            }));
    }, []);
    const moveAgendaGroup = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((groupId, direction)=>{
        setAgendaConfig((current)=>{
            const index = current.groups.findIndex((group)=>group.id === groupId);
            const nextIndex = index + direction;
            if (index < 0 || nextIndex < 0 || nextIndex >= current.groups.length) return current;
            const groups = [
                ...current.groups
            ];
            const [group] = groups.splice(index, 1);
            groups.splice(nextIndex, 0, group);
            return {
                ...current,
                groups
            };
        });
    }, []);
    const linkAgendaToCurrentUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((groupId)=>{
        const email = String(currentUserProfile?.email || "").trim().toLowerCase();
        if (!email) return;
        setAgendaConfig((current)=>({
                ...current,
                groups: current.groups.map((group)=>group.id === groupId ? {
                        ...group,
                        linkedEmail: email,
                        linkedUserName: String(currentUserProfile?.name || "").trim(),
                        connectionStatus: "connected"
                    } : group)
            }));
    }, [
        currentUserProfile?.email,
        currentUserProfile?.name
    ]);
    const addAgendaSlot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((groupId)=>{
        setAgendaConfig((current)=>({
                ...current,
                groups: current.groups.map((group)=>group.id === groupId ? {
                        ...group,
                        slots: [
                            ...group.slots,
                            {
                                id: makeClientId(`${groupId}_slot`),
                                label: "Novo horario",
                                dayOfWeek: 1,
                                startTime: "09:00",
                                endTime: "10:00",
                                enabled: true
                            }
                        ]
                    } : group)
            }));
    }, []);
    const removeAgendaSlot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((groupId, slotId)=>{
        setAgendaConfig((current)=>({
                ...current,
                groups: current.groups.map((group)=>group.id === groupId ? {
                        ...group,
                        slots: group.slots.filter((slot)=>slot.id !== slotId)
                    } : group)
            }));
    }, []);
    const updateAgendaSlot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((groupId, slotId, field, value)=>{
        setAgendaConfig((current)=>({
                ...current,
                groups: current.groups.map((group)=>group.id === groupId ? {
                        ...group,
                        slots: group.slots.map((slot)=>slot.id === slotId ? {
                                ...slot,
                                [field]: value
                            } : slot)
                    } : group)
            }));
    }, []);
    const updateAgendaHolidays = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((holidays)=>{
        setAgendaConfig((current)=>({
                ...current,
                holidays: holidays.sort()
            }));
    }, []);
    const loadAgendaHolidaysFromAPI = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        const now = new Date();
        const currentYear = now.getFullYear();
        try {
            const holidays = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchBrazilianHolidays"])(currentYear);
            if (holidays.length === 0) {
                setError("Nenhum feriado encontrado para o ano atual.");
                return;
            }
            setAgendaConfig((current)=>({
                    ...current,
                    holidays: Array.from(new Set([
                        ...current.holidays,
                        ...holidays
                    ])).sort()
                }));
            setNotice({
                tone: "success",
                text: `${holidays.length} feriados carregados com sucesso.`
            });
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Falha ao carregar feriados.";
            setError(message);
        }
    }, []);
    const saveAgenda = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        setSavingAgenda(true);
        setError(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/agenda", {
                method: "PATCH",
                body: JSON.stringify(agendaConfig)
            });
            setAgendaConfig((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeAgendaConfig"])(payload));
            setNotice({
                tone: "success",
                text: "Agenda salva com sucesso."
            });
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : "Falha ao salvar agenda.";
            setError(message);
        } finally{
            setSavingAgenda(false);
        }
    }, [
        agendaConfig
    ]);
    const updateRoutingRule = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((field, value)=>{
        setBotConfig((current)=>({
                ...current,
                routingRules: {
                    ...current.routingRules,
                    [field]: value
                }
            }));
    }, []);
    const appendVariable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((field, variableKey)=>{
        const allowedFields = [
            "welcomeMessage",
            "returningCustomerMessage",
            "mainMenuPrompt",
            "recoveryDetectedMessage",
            "postActionPrompt",
            "humanAckMessage",
            "closeTopicMessage",
            "blockedMessage"
        ];
        if (!allowedFields.includes(field)) return;
        setBotConfig((current)=>{
            const safeField = field;
            const currentValue = String(current[safeField] || "");
            const suffix = currentValue && !currentValue.endsWith(" ") && !currentValue.endsWith("\n") ? " " : "";
            return {
                ...current,
                [safeField]: `${currentValue}${suffix}{{${variableKey}}}`
            };
        });
    }, []);
    const updateBotText = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((field, value)=>{
        setBotConfig((current)=>({
                ...current,
                [field]: value
            }));
    }, []);
    const updateButtonSection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((section, index, field, value)=>{
        setBotConfig((current)=>({
                ...current,
                [section]: current[section].map((button, buttonIndex)=>buttonIndex === index ? {
                        ...button,
                        [field]: field === "buttonId" ? String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_:-]/g, "").slice(0, 80) : value
                    } : button)
            }));
    }, []);
    const addButtonSection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((section)=>{
        const fallback = actionOptions[0] || {
            value: "talk_human",
            label: "Falar com atendente"
        };
        setBotConfig((current)=>({
                ...current,
                [section]: [
                    ...current[section],
                    {
                        buttonId: makeClientId(`${section}_button`),
                        actionId: fallback.value,
                        title: fallback.label.split(" • ")[0]
                    }
                ]
            }));
    }, [
        actionOptions
    ]);
    const removeButtonSection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((section, index)=>{
        setBotConfig((current)=>({
                ...current,
                [section]: current[section].filter((_, buttonIndex)=>buttonIndex !== index)
            }));
    }, []);
    const updateActionGuide = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((actionId, field, value)=>{
        setBotConfig((current)=>({
                ...current,
                actionCatalog: current.actionCatalog.map((action)=>{
                    if (action.actionId !== actionId) return action;
                    if (field === "enabled") return {
                        ...action,
                        enabled: Boolean(value)
                    };
                    if (field === "route") {
                        return {
                            ...action,
                            route: value
                        };
                    }
                    if (field === "kind") {
                        const nextKind = value;
                        return {
                            ...action,
                            kind: nextKind,
                            agendaGroupId: nextKind === "agenda" ? action.agendaGroupId || null : null,
                            responseMessage: nextKind === "reply" ? action.responseMessage || "" : ""
                        };
                    }
                    if (field === "agendaGroupId") {
                        return {
                            ...action,
                            agendaGroupId: String(value || "").trim() || null
                        };
                    }
                    if (field === "responseMessage") {
                        return {
                            ...action,
                            responseMessage: String(value || "")
                        };
                    }
                    return {
                        ...action,
                        [field]: String(value || "")
                    };
                })
            }));
    }, []);
    const addCustomAction = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setBotConfig((current)=>({
                ...current,
                actionCatalog: [
                    ...current.actionCatalog,
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createCustomAction"])(current)
                ]
            }));
    }, []);
    const removeCustomAction = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((actionId)=>{
        setBotConfig((current)=>{
            const next = removeButtonFromSections(current, actionId);
            return {
                ...next,
                actionCatalog: next.actionCatalog.filter((action)=>action.actionId !== actionId)
            };
        });
    }, []);
    const saveBot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        setSavingBot(true);
        setError(null);
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/bot-config", {
                method: "PATCH",
                body: JSON.stringify(botConfig)
            });
            setBotConfig((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeBotConfig"])(payload));
            setNotice({
                tone: "success",
                text: "Editor do bot salvo com sucesso."
            });
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : "Falha ao salvar editor.";
            setError(message);
        } finally{
            setSavingBot(false);
        }
    }, [
        botConfig
    ]);
    function scheduleAlertCollapse(key, timerRef) {
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!selectedConversation || !chatTimelineRef.current) return;
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const timeline = undefined;
    }, [
        selectedConversation,
        selectedConversation?.id,
        selectedConversation?.messages.length
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (humanAlertTimerRef.current !== null) {
            window.clearTimeout(humanAlertTimerRef.current);
            humanAlertTimerRef.current = null;
        }
        if (humanAttentionConversations.length === 0) {
            setExpandedAlerts((current)=>({
                    ...current,
                    human_queue: false
                }));
            setDismissedAlerts((current)=>({
                    ...current,
                    human_queue: false
                }));
            previousHumanCountRef.current = 0;
            return;
        }
        if (humanAttentionConversations.length > previousHumanCountRef.current) {
            setDismissedAlerts((current)=>({
                    ...current,
                    human_queue: false
                }));
            setExpandedAlerts((current)=>({
                    ...current,
                    human_queue: true
                }));
            scheduleAlertCollapse("human_queue", humanAlertTimerRef);
        }
        previousHumanCountRef.current = humanAttentionConversations.length;
    }, [
        humanAttentionConversations.length
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (newAlertTimerRef.current !== null) {
            window.clearTimeout(newAlertTimerRef.current);
            newAlertTimerRef.current = null;
        }
        if (newInboundConversations.length === 0) {
            setExpandedAlerts((current)=>({
                    ...current,
                    new_message: false
                }));
            setDismissedAlerts((current)=>({
                    ...current,
                    new_message: false
                }));
            previousNewCountRef.current = 0;
            return;
        }
        if (newInboundConversations.length > previousNewCountRef.current) {
            setDismissedAlerts((current)=>({
                    ...current,
                    new_message: false
                }));
            setExpandedAlerts((current)=>({
                    ...current,
                    new_message: true
                }));
            scheduleAlertCollapse("new_message", newAlertTimerRef);
        }
        previousNewCountRef.current = newInboundConversations.length;
    }, [
        newInboundConversations.length
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (noticeTimerRef.current !== null) {
            window.clearTimeout(noticeTimerRef.current);
            noticeTimerRef.current = null;
        }
        if (!notice) {
            setExpandedAlerts((current)=>({
                    ...current,
                    system_notice: false
                }));
            return;
        }
        setExpandedAlerts((current)=>({
                ...current,
                system_notice: true
            }));
        scheduleAlertCollapse("system_notice", noticeTimerRef);
    }, [
        notice
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>()=>{
            [
                humanAlertTimerRef,
                newAlertTimerRef,
                noticeTimerRef
            ].forEach((timerRef)=>{
                if (timerRef.current !== null) {
                    window.clearTimeout(timerRef.current);
                }
            });
        }, []);
    if (hasToken === null) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
            className: "app-shell",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "app-container",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "panel p-4 text-sm text-muted",
                    children: "Carregando..."
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                    lineNumber: 1234,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                lineNumber: 1233,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
            lineNumber: 1232,
            columnNumber: 7
        }, this);
    }
    if (!hasToken) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                title: "Atendimento",
                description: "Mensagens com costume visual de chat, automacao por engrenagem e agenda separada da operacao.",
                hideHeader: botStudioOpen || agendaStudioOpen,
                actions: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTabGroup,
                    role: "tablist",
                    "aria-label": "Guias do Atendimento",
                    children: TAB_ITEMS.map((tab)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            role: "tab",
                            "aria-selected": tab.id === activeTab,
                            className: tab.id === activeTab ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].heroTab,
                            onClick: ()=>handleTabChange(tab.id),
                            children: tab.label
                        }, tab.id, false, {
                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                            lineNumber: 1251,
                            columnNumber: 15
                        }, void 0))
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                    lineNumber: 1249,
                    columnNumber: 11
                }, void 0),
                children: [
                    error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "alert alert-error",
                        children: error
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                        lineNumber: 1265,
                        columnNumber: 18
                    }, this) : null,
                    activeTab === "messages" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].interactionsHeader,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].interactionsHeaderInfo,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                children: "Atendimento"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1272,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionTitle,
                                                children: "Mensagens"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1273,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1271,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].interactionsHeaderStats,
                                        children: [
                                            humanAttentionConversations.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].humanQueueStat} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].humanQueueStatActive}`,
                                                children: [
                                                    "Pendencias humanas: ",
                                                    humanAttentionConversations.length
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1277,
                                                columnNumber: 19
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].humanQueueStat,
                                                children: "Pendencias humanas: 0"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1281,
                                                columnNumber: 19
                                            }, this),
                                            selectedConversation ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "badge",
                                                children: [
                                                    "Status: ",
                                                    selectedConversationStatusMeta?.label ?? "-"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1284,
                                                columnNumber: 19
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1275,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1270,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].interactionsFilter,
                                style: {
                                    marginBottom: "0.65rem"
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: `btn btn-sm ${conversationQueue === "all" ? "btn-primary" : "btn-secondary"}`,
                                        onClick: ()=>setConversationQueue("all"),
                                        children: "Todas as conversas"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1293,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: `btn btn-sm ${conversationQueue === "closed" ? "btn-primary" : "btn-secondary"}`,
                                        onClick: ()=>setConversationQueue("closed"),
                                        children: "Conversas encerradas"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1300,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: `btn btn-sm ${conversationQueue === "blocked" ? "btn-primary" : "btn-secondary"}`,
                                        onClick: ()=>setConversationQueue("blocked"),
                                        children: "Clientes bloqueados"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1307,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1292,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                ref: whatsAppShellRef,
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].whatsAppShell,
                                style: {
                                    gridTemplateColumns: visiblePanels.includes("conversations") && visiblePanels.includes("chat") ? `${sidebarPercent}fr ${100 - sidebarPercent}fr` : visiblePanels.includes("conversations") ? "1fr" : "1fr"
                                },
                                onPointerMove: onSidebarResizeMove,
                                onPointerUp: onSidebarResizeEnd,
                                onPointerCancel: onSidebarResizeEnd,
                                children: [
                                    visiblePanels.includes("conversations") ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].workspaceCard} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatSidebarCard}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeader,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeaderTitle,
                                                        children: "Conversas"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1337,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeaderActions,
                                                        ref: panelMenuOpen === "conversations" ? panelMenuRef : undefined,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuTrigger,
                                                                "aria-label": "Gerenciar janelas",
                                                                onClick: ()=>setPanelMenuOpen(panelMenuOpen === "conversations" ? null : "conversations"),
                                                                children: "⋯"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1339,
                                                                columnNumber: 23
                                                            }, this),
                                                            panelMenuOpen === "conversations" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuDropdown,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuTitle,
                                                                        children: "Janelas disponíveis"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1349,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    INBOX_PANELS.map((panel)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuItem,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                                    type: "checkbox",
                                                                                    checked: visiblePanels.includes(panel.id),
                                                                                    onChange: ()=>togglePanel(panel.id)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                    lineNumber: 1352,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: [
                                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                            children: panel.label
                                                                                        }, void 0, false, {
                                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                            lineNumber: 1358,
                                                                                            columnNumber: 33
                                                                                        }, this),
                                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                                            children: panel.description
                                                                                        }, void 0, false, {
                                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                            lineNumber: 1359,
                                                                                            columnNumber: 33
                                                                                        }, this)
                                                                                    ]
                                                                                }, void 0, true, {
                                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                    lineNumber: 1357,
                                                                                    columnNumber: 31
                                                                                }, this)
                                                                            ]
                                                                        }, panel.id, true, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                            lineNumber: 1351,
                                                                            columnNumber: 29
                                                                        }, this))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1348,
                                                                columnNumber: 25
                                                            }, this) : null
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1338,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1336,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationList,
                                                children: loadingList ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                    children: "Carregando conversas..."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1370,
                                                    columnNumber: 23
                                                }, this) : filteredConversations.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                    children: "Nenhuma conversa encontrada para este filtro."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1372,
                                                    columnNumber: 23
                                                }, this) : filteredConversations.map((conversation)=>{
                                                    const active = conversation.id === selectedId;
                                                    const latestMessage = conversation.messages?.[0];
                                                    const statusMeta = getConversationStatusMeta(conversation);
                                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationItem} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationRow} ${active ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationItemActive : ""}`,
                                                        onClick: ()=>loadConversation(conversation.id),
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationAvatar,
                                                                "data-tone": statusMeta.tone,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        children: String(conversation.customer.name || conversation.customer.phone).slice(0, 2).toUpperCase()
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1386,
                                                                        columnNumber: 31
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationStatusDot,
                                                                        children: statusMeta.shortLabel
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1387,
                                                                        columnNumber: 31
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1385,
                                                                columnNumber: 29
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationContent,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationHead,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                        children: conversation.customer.name || conversation.customer.phone
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                        lineNumber: 1392,
                                                                                        columnNumber: 35
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                                        children: conversation.customer.phone
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                        lineNumber: 1393,
                                                                                        columnNumber: 35
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1391,
                                                                                columnNumber: 33
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].detailMeta,
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                                                                        children: statusMeta.label
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                        lineNumber: 1396,
                                                                                        columnNumber: 35
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                        type: "button",
                                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationQuickAction,
                                                                                        onClick: (event)=>{
                                                                                            event.stopPropagation();
                                                                                            setSelectedId(conversation.id);
                                                                                            void loadConversation(conversation.id);
                                                                                            setBotStudioOpen(true);
                                                                                        },
                                                                                        "aria-label": "Abrir automacao",
                                                                                        children: "⚙"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                        lineNumber: 1397,
                                                                                        columnNumber: 35
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1395,
                                                                                columnNumber: 33
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1390,
                                                                        columnNumber: 31
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMessagePreview"])(latestMessage)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1412,
                                                                        columnNumber: 31
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationFoot,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                children: conversation.routeReason
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1414,
                                                                                columnNumber: 33
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                children: formatTimeLabel(conversation.updatedAt, mounted)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1415,
                                                                                columnNumber: 33
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1413,
                                                                        columnNumber: 31
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1389,
                                                                columnNumber: 29
                                                            }, this)
                                                        ]
                                                    }, conversation.id, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1379,
                                                        columnNumber: 27
                                                    }, this);
                                                })
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1368,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1334,
                                        columnNumber: 17
                                    }, this) : null,
                                    visiblePanels.includes("conversations") && visiblePanels.includes("chat") ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].resizeDivider,
                                        onPointerDown: startSidebarResize,
                                        title: "Arraste para redimensionar",
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1428,
                                        columnNumber: 17
                                    }, this) : null,
                                    visiblePanels.includes("chat") ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].workspaceCard} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatWindowCard}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeader,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeaderTitle,
                                                        children: selectedConversation ? selectedConversation.customer.name || selectedConversation.customer.phone : "Timeline de mensagens"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1441,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelHeaderActions,
                                                        ref: panelMenuOpen === "chat" ? panelMenuRef : undefined,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuTrigger,
                                                                "aria-label": "Gerenciar janelas",
                                                                onClick: ()=>setPanelMenuOpen(panelMenuOpen === "chat" ? null : "chat"),
                                                                children: "⋯"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1447,
                                                                columnNumber: 23
                                                            }, this),
                                                            panelMenuOpen === "chat" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuDropdown,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuTitle,
                                                                        children: "Janelas disponíveis"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1457,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    INBOX_PANELS.map((panel)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].panelMenuItem,
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                                    type: "checkbox",
                                                                                    checked: visiblePanels.includes(panel.id),
                                                                                    onChange: ()=>togglePanel(panel.id)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                    lineNumber: 1460,
                                                                                    columnNumber: 31
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    children: [
                                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                            children: panel.label
                                                                                        }, void 0, false, {
                                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                            lineNumber: 1466,
                                                                                            columnNumber: 33
                                                                                        }, this),
                                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                                            children: panel.description
                                                                                        }, void 0, false, {
                                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                            lineNumber: 1467,
                                                                                            columnNumber: 33
                                                                                        }, this)
                                                                                    ]
                                                                                }, void 0, true, {
                                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                    lineNumber: 1465,
                                                                                    columnNumber: 31
                                                                                }, this)
                                                                            ]
                                                                        }, panel.id, true, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                            lineNumber: 1459,
                                                                            columnNumber: 29
                                                                        }, this))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1456,
                                                                columnNumber: 25
                                                            }, this) : null
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1446,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1440,
                                                columnNumber: 19
                                            }, this),
                                            loadingConversation ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                children: "Carregando conversa..."
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1477,
                                                columnNumber: 21
                                            }, this) : !selectedConversation ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                children: "Selecione uma conversa para ver timeline, status e automacao."
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1479,
                                                columnNumber: 21
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatHeaderMain,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatHeaderIdentity,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationAvatar,
                                                                        "data-tone": selectedConversationStatusMeta?.tone || "bot",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                children: String(selectedConversationDisplayName).slice(0, 2).toUpperCase()
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1485,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].conversationStatusDot,
                                                                                children: selectedConversationStatusMeta?.shortLabel || "BOT"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1486,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1484,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                                children: selectedConversationDisplayName
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1489,
                                                                                columnNumber: 29
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                                children: selectedConversation.customer.phone
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1490,
                                                                                columnNumber: 29
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1488,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1483,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatHeaderActions,
                                                                children: [
                                                                    selectedConversation.recoveryOpenAmount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatCurrency"])(selectedConversation.recoveryOpenAmount)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1495,
                                                                        columnNumber: 29
                                                                    }, this) : null,
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: "btn btn-secondary btn-sm",
                                                                        onClick: ()=>setBotStudioOpen(true),
                                                                        title: "Configuração de automação",
                                                                        children: "⚙"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1497,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1493,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1482,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].actionBar,
                                                        children: [
                                                            selectedConversation.routeTarget === "recovery" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                                href: "/hbx-recovery",
                                                                className: "btn btn-primary btn-sm",
                                                                children: "Abrir Recovery"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1510,
                                                                columnNumber: 27
                                                            }, this) : null,
                                                            !selectedBlocked ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: `btn btn-sm ${selectedStatus === "open" ? "btn-primary" : "btn-secondary"}`,
                                                                        onClick: ()=>updateStatus("open"),
                                                                        children: "Assumir humano"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1516,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: `btn btn-sm ${selectedStatus === "new" ? "btn-primary" : "btn-secondary"}`,
                                                                        onClick: ()=>updateStatus("new"),
                                                                        children: "Voltar ao bot"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1523,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        className: `btn btn-sm ${selectedStatus === "closed" ? "btn-primary" : "btn-secondary"}`,
                                                                        onClick: ()=>updateStatus("closed"),
                                                                        children: "Encerrar conversa"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1530,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                ]
                                                            }, void 0, true) : null,
                                                            selectedBlocked ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-secondary btn-sm",
                                                                onClick: unblockConversation,
                                                                children: "Desbloquear contato"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1540,
                                                                columnNumber: 27
                                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: "btn btn-danger btn-sm",
                                                                onClick: blockConversation,
                                                                children: "Bloquear contato"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1544,
                                                                columnNumber: 27
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1508,
                                                        columnNumber: 23
                                                    }, this),
                                                    selectedBlocked ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineNote} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].inlineError}`,
                                                        children: [
                                                            "Contato bloqueado em ",
                                                            formatDateLabel(selectedConversation.blockedAt, mounted),
                                                            ".",
                                                            selectedConversation.blockedReason ? ` Motivo: ${selectedConversation.blockedReason}` : ""
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1551,
                                                        columnNumber: 25
                                                    }, this) : null,
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        ref: chatTimelineRef,
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatTimeline,
                                                        children: selectedConversation.messages.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                                            children: "Sem mensagens nesta conversa."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1559,
                                                            columnNumber: 27
                                                        }, this) : selectedConversation.messages.map((message)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatBubble} ${getBubbleClass(message)}`,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMessagePreview"])(message)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1563,
                                                                        columnNumber: 31
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatMeta,
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].chatDate,
                                                                            children: formatDateLabel(message.createdAt, mounted)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                            lineNumber: 1565,
                                                                            columnNumber: 33
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1564,
                                                                        columnNumber: 31
                                                                    }, this)
                                                                ]
                                                            }, message.id, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1562,
                                                                columnNumber: 29
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1557,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].replyComposer,
                                                        onSubmit: sendMessage,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                                className: "field",
                                                                rows: 4,
                                                                value: sendText,
                                                                onChange: (event)=>setSendText(event.target.value),
                                                                placeholder: selectedBlocked ? "Contato bloqueado. Desbloqueie para responder." : "Digite uma resposta manual...",
                                                                disabled: selectedBlocked || sending
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1573,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].replyFooter,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                                        children: selectedRouteIsRecovery ? "Conversa tambem visivel no Recovery para acompanhamento operacional." : "Quando o cliente voltar a falar depois de encerrado, o bot pode reabrir a conversa automaticamente."
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1586,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "submit",
                                                                        className: "btn btn-primary",
                                                                        disabled: sending || !sendText.trim() || selectedBlocked,
                                                                        children: sending ? "Enviando..." : "Enviar resposta"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1591,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1585,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1572,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1438,
                                        columnNumber: 17
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1317,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                        lineNumber: 1268,
                        columnNumber: 11
                    }, this) : null,
                    activeTab === "customers" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stackSection,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: `panel ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionCard} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].registerTableCard}`,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionHeader,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                                    children: "Clientes cadastrados"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1613,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1612,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].footerActions,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "badge badge-brand",
                                                        children: [
                                                            atendimentoCustomers.length,
                                                            " clientes"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1616,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        className: "btn btn-primary btn-sm",
                                                        onClick: ()=>{
                                                            setCustomerForm({
                                                                phone: "",
                                                                name: "",
                                                                route: "atendimento",
                                                                notes: ""
                                                            });
                                                            setShowCreateCustomerModal(true);
                                                        },
                                                        children: "Novo cliente"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1617,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1615,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1611,
                                        columnNumber: 15
                                    }, this),
                                    loadingCustomers ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                        children: "Carregando clientes..."
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1631,
                                        columnNumber: 17
                                    }, this) : atendimentoCustomers.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].emptyState,
                                        children: "Nenhum cliente cadastrado ainda. Clientes aparecem aqui automaticamente ao interagir pelo WhatsApp."
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1633,
                                        columnNumber: 17
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].tableWrap,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].importPreviewTable,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                children: "Cliente"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1639,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                children: "Origem"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1640,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                children: "Recovery"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1641,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                children: "Ultima interacao"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1642,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                children: "Cadastrado em"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1643,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                children: "Acoes"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                lineNumber: 1644,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1638,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1637,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                    children: atendimentoCustomers.map((customer)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].customerCell,
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                            children: customer.name ?? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("em", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].mutedText,
                                                                                children: "Sem nome confirmado"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1651,
                                                                                columnNumber: 55
                                                                            }, this)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                            lineNumber: 1651,
                                                                            columnNumber: 29
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            children: customer.phone
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                            lineNumber: 1652,
                                                                            columnNumber: 29
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                    lineNumber: 1650,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: customer.registrationOrigin === "manual" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeManual : customer.registrationOrigin === "recovery" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeRecovery : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeWhatsapp,
                                                                        children: customer.registrationOrigin === "manual" ? "Manual" : customer.registrationOrigin === "recovery" ? "Recovery" : "WhatsApp"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1655,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                    lineNumber: 1654,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    children: customer.recoveryCustomerId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].customerCell,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: customer.recoveryStatus === "PAID" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeConfirmed : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].badgeDebt,
                                                                                children: customer.recoveryStatus === "PAID" ? "Pago" : "Inadimplente"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1667,
                                                                                columnNumber: 33
                                                                            }, this),
                                                                            customer.openAmount != null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].mutedText,
                                                                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatCurrency"])(customer.openAmount)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1671,
                                                                                columnNumber: 35
                                                                            }, this) : null
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1666,
                                                                        columnNumber: 31
                                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].mutedText,
                                                                        children: "-"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1675,
                                                                        columnNumber: 31
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                    lineNumber: 1664,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    children: formatDateLabel(customer.lastMessageAt, mounted)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                    lineNumber: 1678,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    children: formatDateLabel(customer.createdAt, mounted)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                    lineNumber: 1679,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].footerActions,
                                                                        children: [
                                                                            customer.conversationId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                type: "button",
                                                                                className: "btn btn-secondary btn-sm",
                                                                                onClick: ()=>{
                                                                                    setActiveTab("messages");
                                                                                    void loadConversation(String(customer.conversationId));
                                                                                },
                                                                                children: "Ver conversa"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1683,
                                                                                columnNumber: 33
                                                                            }, this) : null,
                                                                            !customer.recoveryCustomerId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                type: "button",
                                                                                className: "btn btn-warning btn-sm",
                                                                                onClick: ()=>{
                                                                                    setPromoteTarget(customer);
                                                                                    setPromoteForm({
                                                                                        openAmount: "",
                                                                                        saleDate: "",
                                                                                        companyName: customer.name ?? ""
                                                                                    });
                                                                                },
                                                                                children: "Enviar para Recovery"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                                lineNumber: 1695,
                                                                                columnNumber: 33
                                                                            }, this) : null
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                        lineNumber: 1681,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                                    lineNumber: 1680,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, customer.id, true, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1649,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1647,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 1636,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1635,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1610,
                                columnNumber: 13
                            }, this),
                            showCreateCustomerModal ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBackdrop,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalTitle,
                                            children: "Novo cliente"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 1723,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                            onSubmit: async (event)=>{
                                                event.preventDefault();
                                                if (!customerForm.phone.trim()) return;
                                                setSavingCustomer(true);
                                                try {
                                                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/customers", {
                                                        method: "POST",
                                                        body: JSON.stringify({
                                                            phone: customerForm.phone.trim(),
                                                            name: customerForm.name.trim() || undefined,
                                                            route: customerForm.route || "atendimento",
                                                            notes: customerForm.notes.trim() || undefined
                                                        })
                                                    });
                                                    setShowCreateCustomerModal(false);
                                                    setNotice({
                                                        tone: "success",
                                                        text: "Cliente cadastrado com sucesso."
                                                    });
                                                    void loadAtendimentoCustomers();
                                                } catch (saveError) {
                                                    setNotice({
                                                        tone: "error",
                                                        text: saveError instanceof Error ? saveError.message : "Erro ao cadastrar cliente."
                                                    });
                                                } finally{
                                                    setSavingCustomer(false);
                                                }
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGroup,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            htmlFor: "cust-phone",
                                                            children: "Telefone (WhatsApp) *"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1753,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            id: "cust-phone",
                                                            type: "tel",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formInput,
                                                            placeholder: "Ex: 5511999998888",
                                                            value: customerForm.phone,
                                                            onChange: (event)=>setCustomerForm((prev)=>({
                                                                        ...prev,
                                                                        phone: event.target.value
                                                                    })),
                                                            required: true
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1754,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1752,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGroup,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            htmlFor: "cust-name",
                                                            children: "Nome"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1765,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            id: "cust-name",
                                                            type: "text",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formInput,
                                                            placeholder: "Nome do cliente",
                                                            value: customerForm.name,
                                                            onChange: (event)=>setCustomerForm((prev)=>({
                                                                        ...prev,
                                                                        name: event.target.value
                                                                    }))
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1766,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1764,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGroup,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            htmlFor: "cust-notes",
                                                            children: "Observacoes"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1776,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                            id: "cust-notes",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formInput,
                                                            placeholder: "Informacoes adicionais",
                                                            value: customerForm.notes,
                                                            onChange: (event)=>setCustomerForm((prev)=>({
                                                                        ...prev,
                                                                        notes: event.target.value
                                                                    })),
                                                            rows: 3
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1777,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1775,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-secondary btn-sm",
                                                            onClick: ()=>setShowCreateCustomerModal(false),
                                                            disabled: savingCustomer,
                                                            children: "Cancelar"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1787,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "submit",
                                                            className: "btn btn-primary btn-sm",
                                                            disabled: savingCustomer,
                                                            children: savingCustomer ? "Salvando..." : "Salvar"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1795,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1786,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 1724,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                    lineNumber: 1722,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1721,
                                columnNumber: 15
                            }, this) : null,
                            promoteTarget ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalBackdrop,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalTitle,
                                            children: "Enviar para Recovery"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 1807,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalSubtitle,
                                            children: [
                                                "Cliente: ",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: promoteTarget.name ?? promoteTarget.phone
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1809,
                                                    columnNumber: 30
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 1808,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                            onSubmit: async (event)=>{
                                                event.preventDefault();
                                                const amount = parseFloat(promoteForm.openAmount.replace(",", "."));
                                                if (!amount || amount <= 0) return;
                                                setSavingPromotion(true);
                                                try {
                                                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])(`/inbox/customers/${promoteTarget.id}/promote-to-recovery`, {
                                                        method: "POST",
                                                        body: JSON.stringify({
                                                            openAmount: amount,
                                                            saleDate: promoteForm.saleDate || undefined,
                                                            companyName: promoteForm.companyName.trim() || undefined
                                                        })
                                                    });
                                                    setPromoteTarget(null);
                                                    setNotice({
                                                        tone: "success",
                                                        text: "Cliente enviado para o HBX Recovery."
                                                    });
                                                    void loadAtendimentoCustomers();
                                                } catch (saveError) {
                                                    setNotice({
                                                        tone: "error",
                                                        text: saveError instanceof Error ? saveError.message : "Erro ao promover cliente."
                                                    });
                                                } finally{
                                                    setSavingPromotion(false);
                                                }
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGroup,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            htmlFor: "rec-company",
                                                            children: "Empresa (opcional)"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1840,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            id: "rec-company",
                                                            type: "text",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formInput,
                                                            placeholder: "Nome da empresa",
                                                            value: promoteForm.companyName,
                                                            onChange: (event)=>setPromoteForm((prev)=>({
                                                                        ...prev,
                                                                        companyName: event.target.value
                                                                    }))
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1841,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1839,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGroup,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            htmlFor: "rec-amount",
                                                            children: "Valor em aberto (R$) *"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1853,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            id: "rec-amount",
                                                            type: "text",
                                                            inputMode: "decimal",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formInput,
                                                            placeholder: "Ex: 1500,00",
                                                            value: promoteForm.openAmount,
                                                            onChange: (event)=>setPromoteForm((prev)=>({
                                                                        ...prev,
                                                                        openAmount: event.target.value
                                                                    })),
                                                            required: true
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1854,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1852,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formGroup,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            htmlFor: "rec-date",
                                                            children: "Data do servico / venda"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1866,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            id: "rec-date",
                                                            type: "date",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].formInput,
                                                            value: promoteForm.saleDate,
                                                            onChange: (event)=>setPromoteForm((prev)=>({
                                                                        ...prev,
                                                                        saleDate: event.target.value
                                                                    }))
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1867,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1865,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].modalActions,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "btn btn-secondary btn-sm",
                                                            onClick: ()=>setPromoteTarget(null),
                                                            disabled: savingPromotion,
                                                            children: "Cancelar"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1876,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "submit",
                                                            className: "btn btn-warning btn-sm",
                                                            disabled: savingPromotion,
                                                            children: savingPromotion ? "Enviando..." : "Confirmar"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                            lineNumber: 1884,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                    lineNumber: 1875,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 1811,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                    lineNumber: 1806,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1805,
                                columnNumber: 15
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                        lineNumber: 1609,
                        columnNumber: 11
                    }, this) : null,
                    activeTab === "agenda" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stackSection,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].workspaceCard,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionHead,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                            children: "Agenda do grupo"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 1900,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1899,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-primary btn-sm",
                                        onClick: ()=>setAgendaStudioOpen(true),
                                        children: "Abrir"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1902,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1898,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                            lineNumber: 1897,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                        lineNumber: 1896,
                        columnNumber: 11
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationDock,
                        children: [
                            notice ? expandedAlerts.system_notice ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationCard} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationCardInfo}`,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationHeader,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionEyebrow,
                                                        children: "Atualizacao do sistema"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1916,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: notice.tone === "success" ? "Acao concluida" : "Falha na acao"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1917,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1915,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].closePopupButton,
                                                onClick: ()=>setNotice(null),
                                                children: "Fechar"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1919,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1914,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionPreview,
                                        children: notice.text
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1923,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1913,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationMinimized} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationMinimizedInfo}`,
                                onClick: ()=>{
                                    setExpandedAlerts((current)=>({
                                            ...current,
                                            system_notice: true
                                        }));
                                    scheduleAlertCollapse("system_notice", noticeTimerRef);
                                },
                                children: "Atualizacao do sistema"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1926,
                                columnNumber: 15
                            }, this) : null,
                            humanAttentionPreview && !dismissedAlerts.human_queue ? expandedAlerts.human_queue ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationCard,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationHeader,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionEyebrow,
                                                        children: humanQueueLabel
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1944,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationModule,
                                                        children: humanAttentionPreview.routeTarget === "recovery" ? "Recovery" : "Atendimento"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1945,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: humanAttentionPreview.customer.name || humanAttentionPreview.customer.phone
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1948,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationModule,
                                                        children: humanAttentionPreview.customer.phone
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1949,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1943,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].pulseBadge,
                                                children: "Fila humana"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1951,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1942,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionPreview,
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMessagePreview"])(humanAttentionPreview.messages?.[0])
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1953,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].footerActions,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-primary btn-sm",
                                                onClick: ()=>{
                                                    setActiveTab("messages");
                                                    setDismissedAlerts((current)=>({
                                                            ...current,
                                                            human_queue: true
                                                        }));
                                                    void loadConversation(humanAttentionPreview.id);
                                                },
                                                children: "Abrir conversa"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1955,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "btn btn-secondary btn-sm",
                                                onClick: ()=>setDismissedAlerts((current)=>({
                                                            ...current,
                                                            human_queue: true
                                                        })),
                                                children: "Dispensar"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1966,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1954,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1941,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationMinimized} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationUnread}`,
                                onClick: ()=>{
                                    setExpandedAlerts((current)=>({
                                            ...current,
                                            human_queue: true
                                        }));
                                    scheduleAlertCollapse("human_queue", humanAlertTimerRef);
                                },
                                children: [
                                    humanQueueLabel,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationCount,
                                        children: humanAttentionConversations.length
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1985,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1976,
                                columnNumber: 15
                            }, this) : null,
                            newInboundPreview && !dismissedAlerts.new_message ? expandedAlerts.new_message ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationCard,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationHeader,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionEyebrow,
                                                        children: "Nova mensagem no Atendimento"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1995,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: newInboundPreview.customer.name || newInboundPreview.customer.phone
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                        lineNumber: 1996,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1994,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].closePopupButton,
                                                onClick: ()=>setDismissedAlerts((current)=>({
                                                            ...current,
                                                            new_message: true
                                                        })),
                                                children: "Fechar"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                                lineNumber: 1998,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 1993,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].attentionPreview,
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$inbox$2d$model$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMessagePreview"])(newInboundPreview.messages?.[0])
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 2006,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].footerActions,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-primary btn-sm",
                                            onClick: ()=>{
                                                setActiveTab("messages");
                                                setDismissedAlerts((current)=>({
                                                        ...current,
                                                        new_message: true
                                                    }));
                                                void loadConversation(newInboundPreview.id);
                                            },
                                            children: "Abrir fila agora"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 2008,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 2007,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 1992,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationMinimized} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationUnread}`,
                                onClick: ()=>{
                                    setExpandedAlerts((current)=>({
                                            ...current,
                                            new_message: true
                                        }));
                                    scheduleAlertCollapse("new_message", newAlertTimerRef);
                                },
                                children: [
                                    "Nova mensagem no Atendimento",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].notificationCount,
                                        children: newInboundConversations.length
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 2031,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 2022,
                                columnNumber: 15
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                        lineNumber: 1910,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                lineNumber: 1244,
                columnNumber: 7
            }, this),
            botStudioOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioOverlay,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioFrame,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioChrome,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                        children: "Automacao do Atendimento"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 2043,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                    lineNumber: 2042,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                            children: selectedConversationStatusMeta?.label || "Fluxo geral"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 2047,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            onClick: ()=>setBotStudioOpen(false),
                                            children: "Fechar"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 2048,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                    lineNumber: 2046,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                            lineNumber: 2041,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioBody,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$_components$2f$BotPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                botConfig: botConfig,
                                loadingBot: loadingBot,
                                savingBot: savingBot,
                                actionOptions: actionOptions,
                                agendaOptions: agendaOptions,
                                onSave: ()=>{
                                    setNotice(null);
                                    void saveBot();
                                },
                                onUpdateRoutingRule: updateRoutingRule,
                                onAppendVariable: appendVariable,
                                onUpdateBotText: updateBotText,
                                onUpdateButtonSection: updateButtonSection,
                                onAddButtonSection: addButtonSection,
                                onRemoveButtonSection: removeButtonSection,
                                onUpdateActionGuide: updateActionGuide,
                                onAddCustomAction: addCustomAction,
                                onRemoveCustomAction: removeCustomAction
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                lineNumber: 2054,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                            lineNumber: 2053,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                    lineNumber: 2040,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                lineNumber: 2039,
                columnNumber: 9
            }, this) : null,
            agendaStudioOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioOverlay,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioFrame,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioChrome,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                        children: "Agenda do Atendimento"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                        lineNumber: 2084,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                    lineNumber: 2083,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].headerActions,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].metaBadge,
                                            children: [
                                                agendaConfig.groups.length,
                                                " guias ativas"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 2087,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            onClick: ()=>setAgendaStudioOpen(false),
                                            children: "Fechar"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                            lineNumber: 2088,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                                    lineNumber: 2086,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                            lineNumber: 2082,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$inbox$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioBody,
                            children: renderAgendaPanel()
                        }, void 0, false, {
                            fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                            lineNumber: 2093,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                    lineNumber: 2081,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/inbox/page.client.tsx",
                lineNumber: 2080,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true);
}
}),
];

//# sourceMappingURL=src_22ddafe3._.js.map
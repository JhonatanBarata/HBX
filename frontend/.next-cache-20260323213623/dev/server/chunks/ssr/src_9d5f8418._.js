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
"[project]/src/app/dashboard/layouts/page.client.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LayoutsClientPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/DashboardScaffold.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/useRequireAuth.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$use$2d$ui$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/use-ui-preferences.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/window-layout-presets.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
const ROLE_OPTIONS = [
    "USER",
    "GERENTE",
    "ADMIN"
];
function LayoutsClientPage() {
    const hasToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$useRequireAuth$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRequireAuth"])();
    const { getModulePrefs, updateModule, applyRolePreset, resetAll } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$use$2d$ui$2d$preferences$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useUiPreferences"])();
    const [role, setRole] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("USER");
    const [activeModule, setActiveModule] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("inbox");
    const [message, setMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (hasToken !== true) return;
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user").then((payload)=>setRole((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeRole"])(payload?.role))).catch(()=>setRole("USER"));
    }, [
        hasToken
    ]);
    const moduleKeys = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>Object.keys(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MODULE_WINDOW_CATALOG"]), []);
    const availablePanels = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MODULE_WINDOW_CATALOG"][activeModule] || [];
    const currentPrefs = getModulePrefs(activeModule, role);
    const visiblePanels = currentPrefs.visiblePanels || [];
    const layoutMode = currentPrefs.layoutMode || "horizontal";
    const primaryPanelPosition = currentPrefs.primaryPanelPosition || "left";
    const splitPercent = Math.min(80, Math.max(20, currentPrefs.splitPercent ?? currentPrefs.sidebarPercent ?? 40));
    function togglePanel(panelId) {
        const next = visiblePanels.includes(panelId) ? visiblePanels.filter((id)=>id !== panelId) : [
            ...visiblePanels,
            panelId
        ];
        if (next.length === 0) return;
        updateModule(activeModule, {
            visiblePanels: next
        });
    }
    if (hasToken === null) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
            className: "app-shell",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "app-container",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "panel p-4 text-sm text-muted",
                    children: "Carregando..."
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                    lineNumber: 58,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                lineNumber: 57,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
            lineNumber: 56,
            columnNumber: 7
        }, this);
    }
    if (!hasToken) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DashboardScaffold$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        title: "Layout ERP",
        description: "Gerencie janelas por módulo e aplique presets por função.",
        actions: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex gap-2",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: "btn btn-secondary btn-sm",
                    onClick: ()=>{
                        applyRolePreset(activeModule, role);
                        setMessage(`Preset ${role} aplicado em ${activeModule}.`);
                    },
                    children: "Aplicar preset da função"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                    lineNumber: 72,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: "btn btn-danger btn-sm",
                    onClick: ()=>{
                        resetAll();
                        setMessage("Layout resetado para o padrão.");
                    },
                    children: "Reset geral"
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                    lineNumber: 82,
                    columnNumber: 11
                }, void 0)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
            lineNumber: 71,
            columnNumber: 9
        }, void 0),
        children: [
            message ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "msg-info",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-sm",
                    children: message
                }, void 0, false, {
                    fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                    lineNumber: 95,
                    columnNumber: 44
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                lineNumber: 95,
                columnNumber: 18
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "panel p-4 grid gap-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-2 md:grid-cols-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "grid gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs uppercase tracking-[0.08em] text-muted font-semibold",
                                        children: "Módulo"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 100,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        className: "field",
                                        value: activeModule,
                                        onChange: (event)=>setActiveModule(event.target.value),
                                        children: moduleKeys.map((moduleKey)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: moduleKey,
                                                children: moduleKey
                                            }, moduleKey, false, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 107,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 101,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                lineNumber: 99,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "grid gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs uppercase tracking-[0.08em] text-muted font-semibold",
                                        children: "Função"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 115,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        className: "field",
                                        value: role,
                                        onChange: (event)=>setRole((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeRole"])(event.target.value)),
                                        children: ROLE_OPTIONS.map((roleOption)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: roleOption,
                                                children: roleOption
                                            }, roleOption, false, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 122,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 116,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                lineNumber: 114,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs uppercase tracking-[0.08em] text-muted font-semibold",
                                        children: "Preset disponível"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 130,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-[10px] border border-[var(--line)] px-3 py-2 text-sm bg-[var(--surface-soft)]",
                                        children: (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$window$2d$layout$2d$presets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WINDOW_ROLE_PRESETS"][activeModule]?.[role]?.visiblePanels || []).join(", ") || "-"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 131,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                lineNumber: 129,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                        lineNumber: 98,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs uppercase tracking-[0.08em] text-muted font-semibold m-0",
                                children: "Janelas disponíveis no módulo"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                lineNumber: 138,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-2 md:grid-cols-2",
                                children: availablePanels.map((panel)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "flex items-start gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: visiblePanels.includes(panel.id),
                                                onChange: ()=>togglePanel(panel.id)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 147,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "grid gap-0.5",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        className: "text-sm",
                                                        children: panel.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 153,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("small", {
                                                        className: "text-xs text-muted",
                                                        children: panel.description
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 154,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 152,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, panel.id, true, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 143,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                lineNumber: 141,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                        lineNumber: 137,
                        columnNumber: 9
                    }, this),
                    (activeModule === "inbox" || activeModule === "recovery") && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs uppercase tracking-[0.08em] text-muted font-semibold m-0",
                                children: "Docking e redimensionamento"
                            }, void 0, false, {
                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                lineNumber: 163,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-2 md:grid-cols-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "grid gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-muted",
                                                children: "Modo"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 168,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                className: "field",
                                                value: layoutMode,
                                                onChange: (event)=>updateModule(activeModule, {
                                                        layoutMode: event.target.value === "vertical" ? "vertical" : "horizontal"
                                                    }),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "horizontal",
                                                        children: "Lado a lado"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 178,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "vertical",
                                                        children: "Cima e baixo"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 179,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 169,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 167,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "grid gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-muted",
                                                children: "Posição da janela principal"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 184,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                className: "field",
                                                value: primaryPanelPosition,
                                                onChange: (event)=>updateModule(activeModule, {
                                                        primaryPanelPosition: [
                                                            "left",
                                                            "right",
                                                            "top",
                                                            "bottom"
                                                        ].includes(event.target.value) ? event.target.value : "left"
                                                    }),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "left",
                                                        children: "Esquerda"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 198,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "right",
                                                        children: "Direita"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 199,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "top",
                                                        children: "Cima"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 200,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "bottom",
                                                        children: "Baixo"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                        lineNumber: 201,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 185,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 183,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "grid gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-muted",
                                                children: [
                                                    "Split (",
                                                    splitPercent,
                                                    "%)"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 206,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: 20,
                                                max: 80,
                                                value: splitPercent,
                                                onChange: (event)=>{
                                                    const value = Number(event.target.value || 40);
                                                    updateModule(activeModule, {
                                                        splitPercent: value,
                                                        sidebarPercent: value
                                                    });
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                                lineNumber: 207,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                        lineNumber: 205,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                                lineNumber: 166,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                        lineNumber: 162,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
                lineNumber: 97,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/layouts/page.client.tsx",
        lineNumber: 67,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_9d5f8418._.js.map
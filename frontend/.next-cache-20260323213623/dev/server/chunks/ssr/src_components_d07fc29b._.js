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
];

//# sourceMappingURL=src_components_d07fc29b._.js.map
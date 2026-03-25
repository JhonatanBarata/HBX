module.exports = [
"[project]/src/app/hbx-recovery/_components/AnimatedNumber.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AnimatedNumber
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
function defaultFormatter(value) {
    return Math.round(value).toLocaleString("pt-BR");
}
function AnimatedNumber({ value, duration = 900, formatter = defaultFormatter }) {
    const [displayValue, setDisplayValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const lastValueRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let frameId = 0;
        const startValue = lastValueRef.current;
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        if (startValue === value) {
            return;
        }
        const startedAt = performance.now();
        const animate = (timestamp)=>{
            const progress = Math.min(1, (timestamp - startedAt) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            const nextValue = startValue + (value - startValue) * eased;
            lastValueRef.current = nextValue;
            setDisplayValue(nextValue);
            if (progress < 1) {
                frameId = window.requestAnimationFrame(animate);
            }
        };
        frameId = window.requestAnimationFrame(animate);
        return ()=>{
            window.cancelAnimationFrame(frameId);
        };
    }, [
        duration,
        value
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        lastValueRef.current = displayValue;
    }, [
        displayValue
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "aria-live": "polite",
        children: formatter(displayValue)
    }, void 0, false, {
        fileName: "[project]/src/app/hbx-recovery/_components/AnimatedNumber.tsx",
        lineNumber: 71,
        columnNumber: 10
    }, this);
}
}),
"[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ClientDrawer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/hbx-recovery/page.module.css [app-ssr] (css module)");
"use client";
;
;
;
function ClientDrawer({ open, customer, onClose, onAction, busyActionId = null, formatCurrency }) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) return;
        const handleKeyDown = (event)=>{
            if (event.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return ()=>{
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        onClose,
        open
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return ()=>{
            document.body.style.overflow = previousOverflow;
        };
    }, [
        open
    ]);
    if (!customer) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerRoot,
        "data-open": open,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerBackdrop,
                onClick: onClose,
                "aria-label": "Fechar detalhes do cliente"
            }, void 0, false, {
                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                lineNumber: 64,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerPanel,
                "aria-label": "Detalhes do cliente",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerHeader,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerEyebrow,
                                        children: "Perfil de cobranca"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 74,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerTitle,
                                        children: customer.name
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 75,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSubtitle,
                                        children: [
                                            "Ultimo contato: ",
                                            customer.lastContact
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 76,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSubtitle,
                                        children: [
                                            "WhatsApp: ",
                                            customer.whatsappNumber || "-"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 79,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSubtitle,
                                        children: [
                                            "Cobranca automatica: ",
                                            customer.automationEnabled ? "Ativa" : "Pausada"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 82,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 73,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-secondary btn-sm",
                                onClick: onClose,
                                children: "Fechar"
                            }, void 0, false, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 87,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                        lineNumber: 72,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerStats,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].miniStat,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: "Total pago"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 94,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: formatCurrency(customer.totalPaid)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 95,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 93,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].miniStat,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: "Dia trabalho/venda"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 98,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: [
                                            "Dia ",
                                            customer.workdaySaleDay
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 99,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 97,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].miniStat,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: "Em aberto"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 102,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: formatCurrency(customer.openAmount)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 103,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 101,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].miniStat,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: "Ciclos recorrentes"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 106,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: customer.recurringDelays
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 107,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 105,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                        lineNumber: 92,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSection,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSectionHeader,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        children: "Historico de pagamentos"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 113,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "badge badge-brand",
                                        children: [
                                            customer.paymentHistory.length,
                                            " registros"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 114,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 112,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyList,
                                children: customer.paymentHistory.map((payment)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyCard,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyTitle,
                                                        children: payment.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                        lineNumber: 123,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyMeta,
                                                        children: payment.date
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                        lineNumber: 124,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                lineNumber: 122,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyAside,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: formatCurrency(payment.amount)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                        lineNumber: 127,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyStatus,
                                                        children: payment.status
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                        lineNumber: 128,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                lineNumber: 126,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, payment.id, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 121,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 119,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                        lineNumber: 111,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSection,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSectionHeader,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        children: "Historico de atrasos"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 137,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "badge",
                                        children: [
                                            customer.delayHistory.length,
                                            " ciclos"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 138,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 136,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyList,
                                children: customer.delayHistory.map((delay)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyCard,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyTitle,
                                                        children: delay.period
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                        lineNumber: 145,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyMeta,
                                                        children: delay.outcome
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                        lineNumber: 146,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                lineNumber: 144,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].historyAside,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: [
                                                        delay.daysLate,
                                                        " dias"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                    lineNumber: 149,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                                lineNumber: 148,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, delay.id, true, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 143,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 141,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                        lineNumber: 135,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSection,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerSectionHeader,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        children: "Acoes sugeridas"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 158,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "badge badge-success",
                                        children: "HBX Assist"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 159,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 157,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].drawerActions,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-primary",
                                        onClick: ()=>onAction("send_charge"),
                                        disabled: Boolean(busyActionId) || customer.openAmount <= 0 || !customer.automationEnabled,
                                        children: busyActionId === "send_charge" ? "Enviando..." : customer.automationEnabled ? "Enviar cobranca automatica" : "Cobranca automatica pausada"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 163,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-secondary",
                                        onClick: ()=>onAction("send_pix"),
                                        disabled: Boolean(busyActionId) || customer.openAmount <= 0,
                                        children: busyActionId === "send_pix" ? "Enviando..." : "Gerar link Pix"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 177,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-ghost",
                                        onClick: ()=>onAction("offer_installment"),
                                        disabled: Boolean(busyActionId) || customer.openAmount <= 0,
                                        children: busyActionId === "offer_installment" ? "Enviando..." : "Oferecer parcelamento"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 185,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-secondary",
                                        onClick: ()=>onAction("mark_paid"),
                                        disabled: Boolean(busyActionId) || customer.openAmount <= 0,
                                        children: busyActionId === "mark_paid" ? "Atualizando..." : customer.openAmount > 0 ? "Marcar como pago" : "Conta ja quitada"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 193,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: "btn btn-ghost",
                                        onClick: ()=>onAction("toggle_automation"),
                                        disabled: Boolean(busyActionId),
                                        children: busyActionId === "toggle_automation" ? "Atualizando..." : customer.automationEnabled ? "Pausar cobranca automatica" : "Reativar cobranca automatica"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                        lineNumber: 205,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                                lineNumber: 162,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                        lineNumber: 156,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
                lineNumber: 71,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/hbx-recovery/_components/ClientDrawer.tsx",
        lineNumber: 63,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RecoveryBotStudio
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/bot-editor/BotMessageStudio.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/hbx-recovery/page.module.css [app-ssr] (css module)");
"use client";
;
;
;
;
const BOT_SCOPE_LABELS = {
    shared: "Compartilhado",
    recovery: "Recovery",
    atendimento: "Atendimento"
};
const BOT_SCENARIOS = [
    {
        id: "mainMenuPrompt",
        label: "Menu principal",
        description: "Mensagem enviada quando o cliente confirma que quer continuar.",
        badge: "Interativo",
        supportsButtons: true,
        buttonSection: "mainMenuButtons",
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "declineMenuPrompt",
        label: "Recusa inicial",
        description: "Fluxo de quem nao quer seguir agora.",
        badge: "Recusa",
        supportsButtons: true,
        buttonSection: "declineMenuButtons",
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "followupPrompt",
        label: "Follow-up",
        description: "Define o periodo de retorno quando o cliente quer falar depois.",
        badge: "Agenda",
        supportsButtons: true,
        buttonSection: "followupButtons",
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "valueMessageTemplate",
        label: "Valor pendente",
        description: "Mensagem que mostra valor, servico e data ao cliente.",
        badge: "Financeiro",
        supportsButtons: true,
        buttonSection: "valueButtons",
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "installmentsPrompt",
        label: "Parcelamento",
        description: "Abre o caminho de pagamento em credito.",
        badge: "Credito",
        supportsButtons: true,
        buttonSection: "installmentButtons",
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "installmentConfirmTemplate",
        label: "Confirmacao de parcela",
        description: "Confirma o que sera gerado antes do checkout.",
        badge: "Confirmacao",
        supportsButtons: true,
        buttonSection: "installmentConfirmButtons",
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "postLinkPrompt",
        label: "Pos-link",
        description: "Mensagem posterior ao envio do link de pagamento.",
        badge: "Pos-envio",
        supportsButtons: true,
        buttonSection: "postLinkButtons",
        scopes: [
            "shared",
            "recovery",
            "atendimento"
        ]
    },
    {
        id: "cashLinkMessageTemplate",
        label: "Link avista",
        description: "Texto da entrega do link Pix ou pagamento imediato.",
        badge: "Pix",
        supportsButtons: false,
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "installmentLinkMessageTemplate",
        label: "Link parcelado",
        description: "Texto da entrega do checkout em credito.",
        badge: "Checkout",
        supportsButtons: false,
        scopes: [
            "shared",
            "recovery"
        ]
    },
    {
        id: "closeTopicMessage",
        label: "Encerramento",
        description: "Fecha o assunto atual sem poluicao visual.",
        badge: "Saida",
        supportsButtons: false,
        scopes: [
            "shared",
            "atendimento"
        ]
    },
    {
        id: "paidClaimMessage",
        label: "Cliente diz que pagou",
        description: "Mensagem antes de encaminhar a validacao humana.",
        badge: "Pagamento",
        supportsButtons: false,
        scopes: [
            "shared",
            "atendimento",
            "recovery"
        ]
    },
    {
        id: "humanAckMessage",
        label: "Encaminhamento humano",
        description: "Confirma a saida do bot para a fila humana.",
        badge: "Humano",
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
function resolveRecoveryNextNodeId(actionId) {
    switch(actionId){
        case "view_amount":
            return "valueMessageTemplate";
        case "choose_installments":
            return "installmentsPrompt";
        case "pay_full":
            return "cashLinkMessageTemplate";
        case "talk_human":
            return "humanAckMessage";
        case "talk_later":
        case "followup_today":
        case "followup_tomorrow":
        case "followup_week":
            return "followupPrompt";
        case "installment_2":
        case "installment_3":
        case "installment_4":
        case "installment_5":
            return "installmentConfirmTemplate";
        case "generate_installment_link":
            return "installmentLinkMessageTemplate";
        case "paid_claim":
            return "paidClaimMessage";
        case "close_topic":
            return "closeTopicMessage";
        default:
            return "postLinkPrompt";
    }
}
function RecoveryBotStudio({ botConfig, loadingBotConfig, savingBotConfig, botActionOptions, templateStart, templateOptions = [], startTemplateReady = false, onSelectTemplateOption, onSave, onBotTextChange, onAppendVariable, onUpdateButton, onAddButton, onRemoveButton, onUpdateVariableGuide, onUpdateActionGuide, onAddCustomActionGuide, onRemoveCustomActionGuide, onUpdateRoutingRule }) {
    const [selectedScenarioId, setSelectedScenarioId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(templateStart?.id || "template_start");
    const selectedScenario = BOT_SCENARIOS.find((scenario)=>scenario.id === selectedScenarioId) || null;
    const selectedButtons = selectedScenario?.supportsButtons && selectedScenario.buttonSection ? botConfig[selectedScenario.buttonSection] : [];
    const messageType = selectedScenario?.supportsButtons && selectedButtons.length > 0 ? "buttons" : "simple";
    const actionById = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const next = {};
        for (const action of botConfig.actionCatalog){
            next[String(action.actionId)] = {
                actionId: String(action.actionId),
                title: action.title,
                description: action.description,
                routeLabel: BOT_SCOPE_LABELS[action.route],
                typeLabel: "Acao do bot",
                enabled: action.enabled
            };
        }
        return next;
    }, [
        botConfig.actionCatalog
    ]);
    const studioVariables = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>botConfig.variableCatalog.filter((item)=>!selectedScenario || selectedScenario.scopes.includes(item.scope) || item.scope === "shared").map((item)=>({
                key: item.key,
                label: item.label,
                example: item.example,
                scopeLabel: BOT_SCOPE_LABELS[item.scope],
                categoryLabel: item.key === "empresa" ? "Empresa" : item.key === "cliente" ? "Cliente" : item.scope === "recovery" ? "Recovery" : item.scope === "atendimento" ? "Atendimento" : "Sistema",
                originLabel: item.scope === "shared" ? "Contexto automatico da empresa logada" : item.scope === "recovery" ? "Dados financeiros do Recovery" : "Dados operacionais do Atendimento",
                required: item.required
            })), [
        botConfig.variableCatalog,
        selectedScenario
    ]);
    const flowScenarios = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const positions = {
            template_start: {
                x: 40,
                y: 120
            },
            mainMenuPrompt: {
                x: 340,
                y: 40
            },
            declineMenuPrompt: {
                x: 340,
                y: 260
            },
            valueMessageTemplate: {
                x: 680,
                y: 0
            },
            followupPrompt: {
                x: 680,
                y: 220
            },
            humanAckMessage: {
                x: 680,
                y: 440
            },
            installmentsPrompt: {
                x: 1020,
                y: 0
            },
            cashLinkMessageTemplate: {
                x: 1020,
                y: 220
            },
            paidClaimMessage: {
                x: 1020,
                y: 440
            },
            installmentConfirmTemplate: {
                x: 1360,
                y: 0
            },
            installmentLinkMessageTemplate: {
                x: 1360,
                y: 220
            },
            postLinkPrompt: {
                x: 1700,
                y: 120
            },
            closeTopicMessage: {
                x: 1700,
                y: 360
            }
        };
        const templateNode = {
            id: templateStart?.id || "template_start",
            label: "Template Meta inicial",
            description: templateStart?.description || "Primeiro no obrigatorio do fluxo Recovery.",
            badge: templateStart ? "Meta" : "Sem template",
            nodeKind: "template",
            supportsButtons: true,
            editable: false,
            messageText: templateStart?.body || "Nenhum template inicial ativo.",
            buttons: [
                {
                    buttonId: "template_yes",
                    actionId: "enter_recovery_flow",
                    title: templateStart?.buttons?.[0] || "Sim",
                    nextNodeId: "mainMenuPrompt",
                    nextLabel: "Entrar no menu principal do Recovery"
                },
                {
                    buttonId: "template_no",
                    actionId: "decline_recovery_flow",
                    title: templateStart?.buttons?.[1] || "Nao, obrigado",
                    nextNodeId: "declineMenuPrompt",
                    nextLabel: "Abrir recusa inicial"
                }
            ],
            position: positions.template_start,
            toneLabel: templateStart?.tone === "warning" ? "Template requer revisao" : "Template aprovado"
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
                        nextNodeId: resolveRecoveryNextNodeId(String(button.actionId)),
                        nextLabel: BOT_SCENARIOS.find((item)=>item.id === resolveRecoveryNextNodeId(String(button.actionId)))?.label || "Destino complementar do fluxo"
                    })) : [],
                position: positions[scenario.id] || {
                    x: 0,
                    y: 0
                }
            }));
        return [
            templateNode,
            ...scenarioNodes
        ];
    }, [
        botConfig,
        templateStart
    ]);
    const flowEdges = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>flowScenarios.flatMap((scenario)=>scenario.buttons.filter((button)=>button.nextNodeId).map((button)=>({
                    id: `${scenario.id}-${button.buttonId}-${button.nextNodeId}`,
                    from: scenario.id,
                    to: String(button.nextNodeId),
                    label: button.title
                }))), [
        flowScenarios
    ]);
    const catalogVariables = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>botConfig.variableCatalog.map((item)=>({
                key: item.key,
                label: item.label,
                example: item.example,
                scopeLabel: BOT_SCOPE_LABELS[item.scope],
                categoryLabel: item.key === "empresa" ? "Empresa" : item.key === "cliente" ? "Cliente" : item.scope === "recovery" ? "Recovery" : item.scope === "atendimento" ? "Atendimento" : "Sistema",
                originLabel: item.scope === "shared" ? "Contexto automatico da empresa logada" : item.scope === "recovery" ? "Dados financeiros do Recovery" : "Dados operacionais do Atendimento",
                required: item.required
            })), [
        botConfig.variableCatalog
    ]);
    const catalogActions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>botConfig.actionCatalog.map((action)=>({
                actionId: String(action.actionId),
                title: action.title,
                description: action.description,
                routeLabel: BOT_SCOPE_LABELS[action.route],
                typeLabel: "Acao do bot",
                enabled: action.enabled
            })), [
        botConfig.actionCatalog
    ]);
    const publicationChecks = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>[
            {
                id: "template",
                label: "Template inicial",
                description: "O bloco de entrada precisa permanecer pronto e compativel com a Meta.",
                ok: Boolean(templateStart) && startTemplateReady
            },
            {
                id: "entry_message",
                label: "Mensagem principal",
                description: "O menu principal do Recovery precisa ter texto claro para abrir o fluxo.",
                ok: String(botConfig.mainMenuPrompt || "").trim().length > 0
            },
            {
                id: "interactive_paths",
                label: "Ramificacoes por botoes",
                description: "Pelo menos um bloco interativo precisa ter botoes validos para o cliente seguir.",
                ok: flowScenarios.some((scenario)=>scenario.buttons.length > 0)
            },
            {
                id: "actions",
                label: "Acoes ativas",
                description: "O builder precisa ter pelo menos uma acao operacional ativa no catalogo.",
                ok: botConfig.actionCatalog.some((action)=>action.enabled)
            }
        ], [
        botConfig.actionCatalog,
        botConfig.mainMenuPrompt,
        flowScenarios,
        startTemplateReady,
        templateStart
    ]);
    const handleMessageTypeChange = (nextType)=>{
        if (!selectedScenario?.supportsButtons || !selectedScenario.buttonSection) return;
        if (nextType === "simple") {
            for(let index = selectedButtons.length - 1; index >= 0; index -= 1){
                onRemoveButton(selectedScenario.buttonSection, index);
            }
            return;
        }
        if (selectedButtons.length === 0) {
            onAddButton(selectedScenario.buttonSection);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStudioStack,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionHeader,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                                children: "Mensagens do fluxo"
                            }, void 0, false, {
                                fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                lineNumber: 502,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionTitle,
                                children: "Builder conversacional do Recovery"
                            }, void 0, false, {
                                fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                lineNumber: 503,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].sectionDescription,
                                children: "Fluxo completo, template Meta como primeiro no e navegacao visual por ramos reais do cliente."
                            }, void 0, false, {
                                fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                lineNumber: 504,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                        lineNumber: 501,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: "btn btn-primary btn-sm",
                        onClick: onSave,
                        disabled: savingBotConfig || loadingBotConfig,
                        children: savingBotConfig ? "Salvando..." : "Salvar editor"
                    }, void 0, false, {
                        fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                        lineNumber: 508,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                lineNumber: 500,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$bot$2d$editor$2f$BotMessageStudio$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                eyebrow: "Recovery",
                title: selectedScenario?.label || "Template Meta inicial",
                description: selectedScenario?.description || "Primeiro no fixo do fluxo de cobranca.",
                flowScenarios: flowScenarios,
                flowEdges: flowEdges,
                startNodeId: templateStart?.id || "template_start",
                selectedScenarioId: selectedScenarioId,
                onSelectScenario: (scenarioId)=>setSelectedScenarioId(scenarioId),
                messageText: selectedScenario ? String(botConfig[selectedScenario.id] || "") : "",
                onMessageTextChange: (value)=>{
                    if (!selectedScenario) return;
                    onBotTextChange(selectedScenario.id, value);
                },
                messageType: messageType,
                onMessageTypeChange: handleMessageTypeChange,
                buttons: selectedButtons,
                actionOptions: botActionOptions,
                actionById: actionById,
                catalogActions: catalogActions,
                onUpdateButton: (index, field, value)=>{
                    if (!selectedScenario?.buttonSection) return;
                    onUpdateButton(selectedScenario.buttonSection, index, field, value);
                },
                onAddButton: ()=>{
                    if (!selectedScenario?.buttonSection) return;
                    onAddButton(selectedScenario.buttonSection);
                },
                onRemoveButton: (index)=>{
                    if (!selectedScenario?.buttonSection) return;
                    onRemoveButton(selectedScenario.buttonSection, index);
                },
                variables: studioVariables,
                catalogVariables: catalogVariables,
                onAppendVariable: (variableKey)=>{
                    if (!selectedScenario) return;
                    onAppendVariable(selectedScenario.id, variableKey);
                },
                previewText: selectedScenario ? renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig) : templateStart?.body || "",
                previewFooter: botConfig.rootFooter || "HBX Recovery",
                previewFallbackText: selectedScenario ? buildFallbackText(renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig), selectedButtons) : templateStart?.body || "",
                previewNote: "O fallback textual tambem fica preparado para canais ou cenarios sem botoes.",
                templateStart: templateStart,
                templateOptions: templateOptions,
                onSelectTemplateOption: onSelectTemplateOption,
                publicationChecks: publicationChecks,
                publicationTitle: "Publicacao do fluxo Recovery",
                publicationDescription: "Valide entrada, menu principal e rotas de cobranca antes de salvar este rascunho.",
                primaryActionLabel: savingBotConfig ? "Salvando..." : "Salvar editor",
                onPrimaryAction: onSave,
                primaryActionDisabled: savingBotConfig || loadingBotConfig,
                variablesTabExtra: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStepCard,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStepHeader,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        children: "Variaveis e rodape"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                        lineNumber: 572,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: "Catalogo operacional do que pode entrar nas mensagens do fluxo."
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                        lineNumber: 573,
                                        columnNumber: 17
                                    }, void 0)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                lineNumber: 571,
                                columnNumber: 15
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                            lineNumber: 570,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botVariableGrid,
                            children: botConfig.variableCatalog.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botVariableCard,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botVariableHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: `{{${item.key}}}`
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 580,
                                                    columnNumber: 21
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].interactionBadgeRow,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateBadge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateBot}`,
                                                            children: BOT_SCOPE_LABELS[item.scope]
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 582,
                                                            columnNumber: 23
                                                        }, void 0),
                                                        item.required ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateBadge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statePaid}`,
                                                            children: "Obrigatoria"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 583,
                                                            columnNumber: 40
                                                        }, void 0) : null
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 581,
                                                    columnNumber: 21
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 579,
                                            columnNumber: 19
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Rotulo"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 587,
                                                    columnNumber: 21
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    className: "field",
                                                    value: item.label,
                                                    onChange: (event)=>onUpdateVariableGuide(item.key, "label", event.target.value)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 588,
                                                    columnNumber: 21
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 586,
                                            columnNumber: 19
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Exemplo"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 591,
                                                    columnNumber: 21
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    className: "field",
                                                    value: item.example,
                                                    onChange: (event)=>onUpdateVariableGuide(item.key, "example", event.target.value)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 592,
                                                    columnNumber: 21
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 590,
                                            columnNumber: 19
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Descricao"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 595,
                                                    columnNumber: 21
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    className: "field",
                                                    value: item.description,
                                                    onChange: (event)=>onUpdateVariableGuide(item.key, "description", event.target.value)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 596,
                                                    columnNumber: 21
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 594,
                                            columnNumber: 19
                                        }, void 0)
                                    ]
                                }, item.key, true, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 578,
                                    columnNumber: 17
                                }, void 0))
                        }, void 0, false, {
                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                            lineNumber: 576,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: "Rodape dos interativos"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 602,
                                    columnNumber: 15
                                }, void 0),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "field",
                                    value: botConfig.rootFooter,
                                    onChange: (event)=>onBotTextChange("rootFooter", event.target.value)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 603,
                                    columnNumber: 15
                                }, void 0)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                            lineNumber: 601,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                    lineNumber: 569,
                    columnNumber: 11
                }, void 0),
                actionsTabExtra: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStepCard,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botStepHeader,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                            children: "Acoes e roteamento"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 611,
                                            columnNumber: 17
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: "Base operacional do que cada botao do Recovery realmente dispara."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 612,
                                            columnNumber: 17
                                        }, void 0)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 610,
                                    columnNumber: 15
                                }, void 0),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: onAddCustomActionGuide,
                                    children: "Nova acao custom"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 614,
                                    columnNumber: 15
                                }, void 0)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                            lineNumber: 609,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botRoutingGrid,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botRoutingToggle,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "checkbox",
                                            checked: botConfig.routingRules.preferRecoveryForDebtors,
                                            onChange: (event)=>onUpdateRoutingRule("preferRecoveryForDebtors", event.target.checked)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 620,
                                            columnNumber: 17
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Priorizar Recovery para devedores ativos"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 622,
                                                    columnNumber: 19
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Conversa com debito aberto tende a permanecer no modulo de cobranca."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 623,
                                                    columnNumber: 19
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 621,
                                            columnNumber: 17
                                        }, void 0)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 619,
                                    columnNumber: 15
                                }, void 0),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botRoutingToggle,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "checkbox",
                                            checked: botConfig.routingRules.preferRecoveryForNegotiations,
                                            onChange: (event)=>onUpdateRoutingRule("preferRecoveryForNegotiations", event.target.checked)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 627,
                                            columnNumber: 17
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Preservar negociacoes do Recovery"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 629,
                                                    columnNumber: 19
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Mensagens de cobranca continuam com prioridade no modulo financeiro."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 630,
                                                    columnNumber: 19
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 628,
                                            columnNumber: 17
                                        }, void 0)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 626,
                                    columnNumber: 15
                                }, void 0),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botRoutingToggle,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "checkbox",
                                            checked: botConfig.routingRules.preferInboxForManualQueue,
                                            onChange: (event)=>onUpdateRoutingRule("preferInboxForManualQueue", event.target.checked)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 634,
                                            columnNumber: 17
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Fila humana vai para Atendimento"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 636,
                                                    columnNumber: 19
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Quando um humano assume, o destino sugerido passa a ser o Atendimento."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 637,
                                                    columnNumber: 19
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 635,
                                            columnNumber: 17
                                        }, void 0)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 633,
                                    columnNumber: 15
                                }, void 0)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                            lineNumber: 618,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botActionGuideList,
                            children: botConfig.actionCatalog.map((action)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botActionGuideItem,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].botActionGuideEditor,
                                            children: [
                                                action.custom ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Id tecnico"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 648,
                                                            columnNumber: 25
                                                        }, void 0),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            value: String(action.actionId),
                                                            onChange: (event)=>onUpdateActionGuide(String(action.actionId), "actionId", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 649,
                                                            columnNumber: 25
                                                        }, void 0)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 647,
                                                    columnNumber: 23
                                                }, void 0) : null,
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Titulo"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 653,
                                                            columnNumber: 23
                                                        }, void 0),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            className: "field",
                                                            value: action.title,
                                                            onChange: (event)=>onUpdateActionGuide(String(action.actionId), "title", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 654,
                                                            columnNumber: 23
                                                        }, void 0)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 652,
                                                    columnNumber: 21
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Descricao"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 657,
                                                            columnNumber: 23
                                                        }, void 0),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                            className: "field",
                                                            value: action.description,
                                                            onChange: (event)=>onUpdateActionGuide(String(action.actionId), "description", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 658,
                                                            columnNumber: 23
                                                        }, void 0)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 656,
                                                    columnNumber: 21
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Resposta automatica"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 661,
                                                            columnNumber: 23
                                                        }, void 0),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                            className: "field",
                                                            value: action.responseMessage || "",
                                                            onChange: (event)=>onUpdateActionGuide(String(action.actionId), "responseMessage", event.target.value)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 662,
                                                            columnNumber: 23
                                                        }, void 0)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 660,
                                                    columnNumber: 21
                                                }, void 0),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].fieldBlock,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Destino"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 665,
                                                            columnNumber: 23
                                                        }, void 0),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: action.route,
                                                            onChange: (event)=>onUpdateActionGuide(String(action.actionId), "route", event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "shared",
                                                                    children: "Compartilhado"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                                    lineNumber: 667,
                                                                    columnNumber: 25
                                                                }, void 0),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "recovery",
                                                                    children: "Recovery"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                                    lineNumber: 668,
                                                                    columnNumber: 25
                                                                }, void 0),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "atendimento",
                                                                    children: "Atendimento"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                                    lineNumber: 669,
                                                                    columnNumber: 25
                                                                }, void 0)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                            lineNumber: 666,
                                                            columnNumber: 23
                                                        }, void 0)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 664,
                                                    columnNumber: 21
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 645,
                                            columnNumber: 19
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].interactionBadgeRow,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateBadge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateBot}`,
                                                    children: BOT_SCOPE_LABELS[action.route]
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 674,
                                                    columnNumber: 21
                                                }, void 0),
                                                action.custom ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateBadge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateGenerated}`,
                                                    children: "Custom"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 675,
                                                    columnNumber: 38
                                                }, void 0) : null,
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateBadge} ${action.enabled ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].statePaid : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$hbx$2d$recovery$2f$page$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].stateWaiting}`,
                                                    onClick: ()=>onUpdateActionGuide(String(action.actionId), "enabled", !action.enabled),
                                                    children: action.enabled ? "Ativa" : "Legada"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 676,
                                                    columnNumber: 21
                                                }, void 0),
                                                action.custom ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-danger btn-sm",
                                                    onClick: ()=>onRemoveCustomActionGuide(String(action.actionId)),
                                                    children: "Remover"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                                    lineNumber: 684,
                                                    columnNumber: 23
                                                }, void 0) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                            lineNumber: 673,
                                            columnNumber: 19
                                        }, void 0)
                                    ]
                                }, action.actionId, true, {
                                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                                    lineNumber: 644,
                                    columnNumber: 17
                                }, void 0))
                        }, void 0, false, {
                            fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                            lineNumber: 642,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                    lineNumber: 608,
                    columnNumber: 11
                }, void 0),
                loading: loadingBotConfig
            }, void 0, false, {
                fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
                lineNumber: 513,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/hbx-recovery/_components/RecoveryBotStudio.tsx",
        lineNumber: 499,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_app_hbx-recovery__components_2885b315._.js.map
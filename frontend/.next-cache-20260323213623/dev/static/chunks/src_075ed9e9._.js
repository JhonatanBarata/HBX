(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/InterfaceTransitionProvider.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "InterfaceTransitionProvider",
    ()=>InterfaceTransitionProvider,
    "useInterfaceTransition",
    ()=>useInterfaceTransition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
const ENTER_READY_DELAY_MS = 24;
const EXIT_DURATION_MS = 2200;
const ROW_SNAP_PX = 18;
const SHUTDOWN_PARTICLE_COUNT = 72;
const REVEAL_TARGET_SELECTOR = [
    ".app-topbar__summary",
    ".app-brand",
    ".wa-health-wrap",
    ".app-topbar__queueLabel",
    ".app-topbar__metaPill",
    ".app-topbar__dockChip",
    ".theme-switcher__trigger",
    ".theme-switcher__panel",
    ".theme-card",
    ".app-user__trigger",
    ".incoming-alert",
    ".shell-card",
    ".panel",
    ".card",
    ".stat-card",
    ".btn",
    ".field",
    ".badge",
    ".alert",
    ".msg-info",
    ".msg-error",
    ".page-overline",
    '[data-ui-slot="module-card"]'
].join(", ");
function buildShutdownParticleStyle(index) {
    return {
        "--i": index,
        "--spread-x": `${index * 37 % 100}%`,
        "--size": `${6 + index % 5 * 2}px`,
        "--orbit-x": `${(index % 10 - 5) * 48}px`,
        "--orbit-y": `${(index % 8 - 4) * 36}px`,
        "--flare-x": `${(index % 11 - 6) * 86}px`,
        "--flare-y": `${(index % 9 - 4) * 92}px`,
        "--exit-x": `${(index % 13 - 6) * 132}px`,
        "--exit-y": `${(index % 10 - 5) * 132}px`,
        "--burst-x": `${(index % 2 * 2 - 1) * 80}px`,
        "--burst-y": `${-120 - index % 7 * 18}px`
    };
}
const InterfaceTransitionContext = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].createContext(null);
function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (element.hidden) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
}
function compareByVisualOrder(left, right) {
    if (Math.abs(left.top - right.top) > ROW_SNAP_PX) {
        return left.top - right.top;
    }
    if (Math.abs(left.right - right.right) > 6) {
        return right.right - left.right;
    }
    if (Math.abs(left.left - right.left) > 6) {
        return right.left - left.left;
    }
    return left.index - right.index;
}
function InterfaceTransitionProvider({ children }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const rootRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const frameRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const readyTimerRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const shutdownPromiseRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const [phase, setPhase] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState("boot");
    const applyRevealMap = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "InterfaceTransitionProvider.useCallback[applyRevealMap]": ()=>{
            const root = rootRef.current;
            if (!root) return;
            const targets = Array.from(root.querySelectorAll(REVEAL_TARGET_SELECTOR)).filter({
                "InterfaceTransitionProvider.useCallback[applyRevealMap].targets": (element)=>isVisibleElement(element)
            }["InterfaceTransitionProvider.useCallback[applyRevealMap].targets"]).map({
                "InterfaceTransitionProvider.useCallback[applyRevealMap].targets": (element, index)=>{
                    const rect = element.getBoundingClientRect();
                    return {
                        element,
                        top: rect.top,
                        left: rect.left,
                        right: rect.right,
                        index
                    };
                }
            }["InterfaceTransitionProvider.useCallback[applyRevealMap].targets"]).sort(compareByVisualOrder);
            const total = targets.length;
            root.style.setProperty("--ui-reveal-count", String(total));
            targets.forEach({
                "InterfaceTransitionProvider.useCallback[applyRevealMap]": (target, index)=>{
                    target.element.dataset.uiReveal = "true";
                    target.element.style.setProperty("--ui-reveal-order", String(index));
                    target.element.style.setProperty("--ui-reveal-exit-order", String(Math.max(total - index - 1, 0)));
                }
            }["InterfaceTransitionProvider.useCallback[applyRevealMap]"]);
        }
    }["InterfaceTransitionProvider.useCallback[applyRevealMap]"], []);
    const scheduleRevealMap = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "InterfaceTransitionProvider.useCallback[scheduleRevealMap]": ()=>{
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
            }
            frameRef.current = window.requestAnimationFrame({
                "InterfaceTransitionProvider.useCallback[scheduleRevealMap]": ()=>{
                    frameRef.current = null;
                    applyRevealMap();
                }
            }["InterfaceTransitionProvider.useCallback[scheduleRevealMap]"]);
        }
    }["InterfaceTransitionProvider.useCallback[scheduleRevealMap]"], [
        applyRevealMap
    ]);
    const startRevealCycle = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "InterfaceTransitionProvider.useCallback[startRevealCycle]": ()=>{
            if (shutdownPromiseRef.current) return;
            setPhase("boot");
            scheduleRevealMap();
            if (readyTimerRef.current !== null) {
                window.clearTimeout(readyTimerRef.current);
            }
            readyTimerRef.current = window.setTimeout({
                "InterfaceTransitionProvider.useCallback[startRevealCycle]": ()=>{
                    scheduleRevealMap();
                    setPhase("active");
                }
            }["InterfaceTransitionProvider.useCallback[startRevealCycle]"], ENTER_READY_DELAY_MS);
        }
    }["InterfaceTransitionProvider.useCallback[startRevealCycle]"], [
        scheduleRevealMap
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "InterfaceTransitionProvider.useEffect": ()=>{
            scheduleRevealMap();
            const handleResize = {
                "InterfaceTransitionProvider.useEffect.handleResize": ()=>{
                    scheduleRevealMap();
                }
            }["InterfaceTransitionProvider.useEffect.handleResize"];
            window.addEventListener("resize", handleResize);
            return ({
                "InterfaceTransitionProvider.useEffect": ()=>{
                    window.removeEventListener("resize", handleResize);
                    if (frameRef.current !== null) {
                        window.cancelAnimationFrame(frameRef.current);
                    }
                }
            })["InterfaceTransitionProvider.useEffect"];
        }
    }["InterfaceTransitionProvider.useEffect"], [
        scheduleRevealMap
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "InterfaceTransitionProvider.useEffect": ()=>{
            const root = rootRef.current;
            if (!root) return undefined;
            const observer = new MutationObserver({
                "InterfaceTransitionProvider.useEffect": ()=>{
                    scheduleRevealMap();
                }
            }["InterfaceTransitionProvider.useEffect"]);
            observer.observe(root, {
                childList: true,
                subtree: true
            });
            return ({
                "InterfaceTransitionProvider.useEffect": ()=>{
                    observer.disconnect();
                }
            })["InterfaceTransitionProvider.useEffect"];
        }
    }["InterfaceTransitionProvider.useEffect"], [
        scheduleRevealMap
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "InterfaceTransitionProvider.useEffect": ()=>{
            startRevealCycle();
            return ({
                "InterfaceTransitionProvider.useEffect": ()=>{
                    if (readyTimerRef.current !== null) {
                        window.clearTimeout(readyTimerRef.current);
                        readyTimerRef.current = null;
                    }
                }
            })["InterfaceTransitionProvider.useEffect"];
        }
    }["InterfaceTransitionProvider.useEffect"], [
        pathname,
        startRevealCycle
    ]);
    const runGlobalShutdown = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "InterfaceTransitionProvider.useCallback[runGlobalShutdown]": async (task)=>{
            if (shutdownPromiseRef.current) {
                await shutdownPromiseRef.current;
                return;
            }
            setPhase("shutdown");
            scheduleRevealMap();
            const pending = new Promise({
                "InterfaceTransitionProvider.useCallback[runGlobalShutdown]": (resolve)=>{
                    window.setTimeout(resolve, EXIT_DURATION_MS);
                }
            }["InterfaceTransitionProvider.useCallback[runGlobalShutdown]"]);
            shutdownPromiseRef.current = pending;
            try {
                await pending;
                await task();
            } finally{
                shutdownPromiseRef.current = null;
            }
        }
    }["InterfaceTransitionProvider.useCallback[runGlobalShutdown]"], [
        scheduleRevealMap
    ]);
    const value = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useMemo({
        "InterfaceTransitionProvider.useMemo[value]": ()=>({
                phase,
                isShuttingDown: phase === "shutdown",
                replayGlobalTransition: startRevealCycle,
                runGlobalShutdown
            })
    }["InterfaceTransitionProvider.useMemo[value]"], [
        phase,
        runGlobalShutdown,
        startRevealCycle
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(InterfaceTransitionContext.Provider, {
        value: value,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            ref: rootRef,
            className: "ui-orchestrator",
            "data-ui-phase": phase,
            children: [
                children,
                phase === "shutdown" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "ui-shutdown-overlay",
                    "aria-hidden": "true",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "ui-shutdown-overlay__backdrop"
                        }, void 0, false, {
                            fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                            lineNumber: 261,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "ui-shutdown-overlay__glow ui-shutdown-overlay__glow--1"
                        }, void 0, false, {
                            fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                            lineNumber: 262,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "ui-shutdown-overlay__glow ui-shutdown-overlay__glow--2"
                        }, void 0, false, {
                            fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                            lineNumber: 263,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "ui-shutdown-card",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "ui-shutdown-card__badge",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "ui-shutdown-card__dot"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                            lineNumber: 267,
                                            columnNumber: 17
                                        }, this),
                                        "Encerrando sessão com segurança"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                    lineNumber: 266,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "ui-shutdown-card__brand",
                                    children: "HBX Solutions"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                    lineNumber: 271,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                    className: "ui-shutdown-card__title",
                                    children: "Até já."
                                }, void 0, false, {
                                    fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                    lineNumber: 273,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "ui-shutdown-card__text",
                                    children: "Obrigado por usar o sistema HBX. Estamos finalizando a transição da interface."
                                }, void 0, false, {
                                    fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                    lineNumber: 275,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "ui-shutdown-card__progress",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "ui-shutdown-card__progressBar"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                        lineNumber: 280,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                    lineNumber: 279,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "shutdown-confetti",
                                    "aria-hidden": true,
                                    children: Array.from({
                                        length: SHUTDOWN_PARTICLE_COUNT
                                    }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "shutdown-confetti__piece",
                                            style: buildShutdownParticleStyle(i)
                                        }, i, false, {
                                            fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                            lineNumber: 285,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                                    lineNumber: 283,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                            lineNumber: 265,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
                    lineNumber: 260,
                    columnNumber: 11
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
            lineNumber: 256,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/InterfaceTransitionProvider.tsx",
        lineNumber: 255,
        columnNumber: 5
    }, this);
}
_s(InterfaceTransitionProvider, "cKLI2yaciLcVlrig3SMnYa9DbZA=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = InterfaceTransitionProvider;
function useInterfaceTransition() {
    _s1();
    const context = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useContext(InterfaceTransitionContext);
    if (!context) {
        throw new Error("useInterfaceTransition must be used inside InterfaceTransitionProvider.");
    }
    return context;
}
_s1(useInterfaceTransition, "b9L3QQ+jgeyIrH0NfHrJ8nn7VMU=");
var _c;
__turbopack_context__.k.register(_c, "InterfaceTransitionProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/PageTransition.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PageTransition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function PageTransition({ children }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "route-transition",
        children: children
    }, pathname, false, {
        fileName: "[project]/src/components/PageTransition.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
_s(PageTransition, "xbyQPtUVMO7MNj7WjJlpdWqRcTo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = PageTransition;
var _c;
__turbopack_context__.k.register(_c, "PageTransition");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
"use client";
const API_URL = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
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
function dispatchTechAssistantApiError(detail) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        window.dispatchEvent(new CustomEvent("hbx-tech-assistant:api-error", {
            detail
        }));
    } catch  {
    // ignore event dispatch errors
    }
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/theme-palettes.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
    "shadcn",
    "tailadmin",
    "mosaic",
    "flowbite",
    "tabler"
];
const HBX_THEME_MODES = [
    "light",
    "dark"
];
const HBX_THEME_PALETTES = {
    shadcn: {
        label: "HBX Shadcn",
        shortLabel: "SC",
        inspiration: "shadcn/ui",
        description: "Minimalista, premium e bem resolvido, com superficies suaves e contraste limpo.",
        personality: "Minimalismo premium com atmosfera SaaS limpa e silenciosa.",
        shellLabel: "Floating workspace",
        densityLabel: "Aireado",
        depthLabel: "Sombra suave",
        chrome: {
            radiusXs: "10px",
            radiusSm: "14px",
            radiusMd: "18px",
            radiusLg: "24px",
            radiusXl: "32px",
            topbarWidth: "1480px",
            contentWidth: "1540px",
            contentGutter: "18px",
            topbarBlur: "24px"
        },
        typography: {
            bodyFont: "var(--font-plus-jakarta)",
            displayFont: "var(--font-plus-jakarta)",
            monoFont: "var(--font-ibm-plex-mono)",
            eyebrowSpacing: "0.22em"
        },
        workspace: {
            railWidth: "292px",
            contextWidth: "286px",
            shellGap: "18px",
            shellPadding: "20px",
            heroColumns: "1.25fr 0.9fr",
            heroMinHeight: "196px"
        },
        light: {
            brand: "#111827",
            brandStrong: "#020617",
            brandSoft: "#e5ecf7",
            brandContrast: "#f8fafc",
            background: "#f4f7fb",
            backgroundAlt: "#ebf0f7",
            surface: "#ffffff",
            surfaceSoft: "#f8fbff",
            surfaceRaised: "#f2f6fb",
            headerSurface: "rgba(255,255,255,0.78)",
            navSurface: "rgba(248,250,252,0.92)",
            fieldSurface: "#ffffff",
            heroFrom: "rgba(255,255,255,0.96)",
            heroTo: "rgba(239,244,251,0.96)",
            heroSpotlight: "rgba(148,163,184,0.16)",
            tableHead: "#f7f9fc",
            chatInbound: "#ffffff",
            chatOutbound: "#e8eff8",
            chatSystem: "#f3f6fb",
            foreground: "#0f172a",
            foregroundSoft: "#1f2937",
            muted: "#5b6578",
            line: "#dde5ef",
            success: "#15803d",
            warning: "#b45309",
            danger: "#b91c1c",
            info: "#1d4ed8",
            shadow: "#0f172a",
            overlay: "rgba(15, 23, 42, 0.18)"
        },
        dark: {
            brand: "#e2e8f0",
            brandStrong: "#f8fafc",
            brandSoft: "#172030",
            brandContrast: "#020617",
            background: "#090e18",
            backgroundAlt: "#0d1420",
            surface: "#111827",
            surfaceSoft: "#172032",
            surfaceRaised: "#1c283b",
            headerSurface: "rgba(15,23,42,0.78)",
            navSurface: "rgba(17,24,39,0.94)",
            fieldSurface: "#111827",
            heroFrom: "rgba(17,24,39,0.94)",
            heroTo: "rgba(12,18,28,0.96)",
            heroSpotlight: "rgba(148,163,184,0.18)",
            tableHead: "#131d2c",
            chatInbound: "#141d2c",
            chatOutbound: "#1f2b40",
            chatSystem: "#1a2433",
            foreground: "#f8fafc",
            foregroundSoft: "#d8e1ee",
            muted: "#97a5ba",
            line: "#273244",
            success: "#4ade80",
            warning: "#f59e0b",
            danger: "#fb7185",
            info: "#93c5fd",
            shadow: "#020617",
            overlay: "rgba(2, 6, 23, 0.58)"
        }
    },
    tailadmin: {
        label: "HBX TailAdmin",
        shortLabel: "TA",
        inspiration: "TailAdmin",
        description: "Painel corporativo forte, com estrutura clara para operacao, filtros e tabelas.",
        personality: "Dashboard operacional com leitura empresarial e ritmo de controle.",
        shellLabel: "Control deck",
        densityLabel: "Equilibrado",
        depthLabel: "Corporativa",
        chrome: {
            radiusXs: "9px",
            radiusSm: "12px",
            radiusMd: "16px",
            radiusLg: "22px",
            radiusXl: "28px",
            topbarWidth: "1620px",
            contentWidth: "1680px",
            contentGutter: "18px",
            topbarBlur: "18px"
        },
        typography: {
            bodyFont: "var(--font-manrope)",
            displayFont: "var(--font-sora)",
            monoFont: "var(--font-ibm-plex-mono)",
            eyebrowSpacing: "0.18em"
        },
        workspace: {
            railWidth: "320px",
            contextWidth: "264px",
            shellGap: "16px",
            shellPadding: "18px",
            heroColumns: "1.35fr 0.85fr",
            heroMinHeight: "188px"
        },
        light: {
            brand: "#465fff",
            brandStrong: "#243fda",
            brandSoft: "#e1e8ff",
            brandContrast: "#f8faff",
            background: "#edf2ff",
            backgroundAlt: "#e4ebfb",
            surface: "#ffffff",
            surfaceSoft: "#f6f8ff",
            surfaceRaised: "#eff3ff",
            headerSurface: "rgba(255,255,255,0.82)",
            navSurface: "rgba(244,247,255,0.95)",
            fieldSurface: "#ffffff",
            heroFrom: "rgba(255,255,255,0.95)",
            heroTo: "rgba(232,238,255,0.98)",
            heroSpotlight: "rgba(70,95,255,0.18)",
            tableHead: "#f3f6ff",
            chatInbound: "#ffffff",
            chatOutbound: "#e4ebff",
            chatSystem: "#f0f4ff",
            foreground: "#111827",
            foregroundSoft: "#2a3550",
            muted: "#5e6a83",
            line: "#d8e1f4",
            success: "#0f9f73",
            warning: "#ca8a04",
            danger: "#c2410c",
            info: "#465fff",
            shadow: "#1d2954",
            overlay: "rgba(17, 24, 39, 0.2)"
        },
        dark: {
            brand: "#88a0ff",
            brandStrong: "#5b75ff",
            brandSoft: "#162353",
            brandContrast: "#060b1d",
            background: "#0a1224",
            backgroundAlt: "#101a31",
            surface: "#121e39",
            surfaceSoft: "#162542",
            surfaceRaised: "#1d2d50",
            headerSurface: "rgba(15,23,42,0.82)",
            navSurface: "rgba(18,30,57,0.96)",
            fieldSurface: "#13203a",
            heroFrom: "rgba(18,30,57,0.95)",
            heroTo: "rgba(13,23,42,0.98)",
            heroSpotlight: "rgba(91,117,255,0.2)",
            tableHead: "#172541",
            chatInbound: "#15223c",
            chatOutbound: "#20315b",
            chatSystem: "#1a2949",
            foreground: "#eef4ff",
            foregroundSoft: "#d4ddf8",
            muted: "#9daccc",
            line: "#243556",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#93c5fd",
            shadow: "#030712",
            overlay: "rgba(3, 7, 18, 0.58)"
        }
    },
    mosaic: {
        label: "HBX Mosaic",
        shortLabel: "MO",
        inspiration: "Mosaic / Cruip",
        description: "Mais refinado e polido, com camadas premium, brilho controlado e acabamento maduro.",
        personality: "Produto maduro com brilho controlado, hierarquia refinada e sensação editorial.",
        shellLabel: "Premium studio",
        densityLabel: "Respirado",
        depthLabel: "Refinada",
        chrome: {
            radiusXs: "11px",
            radiusSm: "15px",
            radiusMd: "19px",
            radiusLg: "26px",
            radiusXl: "34px",
            topbarWidth: "1520px",
            contentWidth: "1580px",
            contentGutter: "20px",
            topbarBlur: "22px"
        },
        typography: {
            bodyFont: "var(--font-plus-jakarta)",
            displayFont: "var(--font-space-grotesk)",
            monoFont: "var(--font-ibm-plex-mono)",
            eyebrowSpacing: "0.26em"
        },
        workspace: {
            railWidth: "278px",
            contextWidth: "320px",
            shellGap: "20px",
            shellPadding: "22px",
            heroColumns: "1.08fr 0.92fr",
            heroMinHeight: "208px"
        },
        light: {
            brand: "#0f766e",
            brandStrong: "#115e59",
            brandSoft: "#d9fbf2",
            brandContrast: "#f7fffe",
            background: "#eff8f6",
            backgroundAlt: "#e4f3f0",
            surface: "#ffffff",
            surfaceSoft: "#f8fffd",
            surfaceRaised: "#eefaf6",
            headerSurface: "rgba(255,255,255,0.8)",
            navSurface: "rgba(246,255,252,0.94)",
            fieldSurface: "#fbfffe",
            heroFrom: "rgba(255,255,255,0.96)",
            heroTo: "rgba(230,247,242,0.98)",
            heroSpotlight: "rgba(15,118,110,0.18)",
            tableHead: "#f2fbf8",
            chatInbound: "#ffffff",
            chatOutbound: "#daf7ef",
            chatSystem: "#edf8f4",
            foreground: "#0f172a",
            foregroundSoft: "#24413e",
            muted: "#536a67",
            line: "#d4e7e1",
            success: "#0f8a6f",
            warning: "#c47a09",
            danger: "#c2410c",
            info: "#0f766e",
            shadow: "#123635",
            overlay: "rgba(7, 24, 23, 0.2)"
        },
        dark: {
            brand: "#63d4c4",
            brandStrong: "#2cb7a4",
            brandSoft: "#0f3634",
            brandContrast: "#031312",
            background: "#061514",
            backgroundAlt: "#0c201f",
            surface: "#102624",
            surfaceSoft: "#16302e",
            surfaceRaised: "#1b3a37",
            headerSurface: "rgba(7,26,24,0.84)",
            navSurface: "rgba(16,38,36,0.96)",
            fieldSurface: "#102624",
            heroFrom: "rgba(16,38,36,0.95)",
            heroTo: "rgba(8,23,22,0.98)",
            heroSpotlight: "rgba(99,212,196,0.18)",
            tableHead: "#122a28",
            chatInbound: "#122a28",
            chatOutbound: "#18413d",
            chatSystem: "#16302e",
            foreground: "#effefb",
            foregroundSoft: "#d6f5ef",
            muted: "#9bbcb7",
            line: "#23514c",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#67e8f9",
            shadow: "#020d0d",
            overlay: "rgba(2, 13, 13, 0.58)"
        }
    },
    flowbite: {
        label: "HBX Flowbite",
        shortLabel: "FB",
        inspiration: "Flowbite",
        description: "Mais pratico e utilitario, com leitura direta, componentes fortes e operacao clara.",
        personality: "Utilitarismo moderno para operacao, CRUD e fluxos de execucao rapida.",
        shellLabel: "Utility board",
        densityLabel: "Compacto",
        depthLabel: "Pratica",
        chrome: {
            radiusXs: "8px",
            radiusSm: "11px",
            radiusMd: "14px",
            radiusLg: "18px",
            radiusXl: "24px",
            topbarWidth: "1640px",
            contentWidth: "1680px",
            contentGutter: "16px",
            topbarBlur: "14px"
        },
        typography: {
            bodyFont: "var(--font-manrope)",
            displayFont: "var(--font-manrope)",
            monoFont: "var(--font-ibm-plex-mono)",
            eyebrowSpacing: "0.18em"
        },
        workspace: {
            railWidth: "248px",
            contextWidth: "254px",
            shellGap: "14px",
            shellPadding: "16px",
            heroColumns: "1.42fr 0.78fr",
            heroMinHeight: "174px"
        },
        light: {
            brand: "#1d4ed8",
            brandStrong: "#1e40af",
            brandSoft: "#dbeafe",
            brandContrast: "#f8fbff",
            background: "#eff4ff",
            backgroundAlt: "#e7eefb",
            surface: "#ffffff",
            surfaceSoft: "#f7faff",
            surfaceRaised: "#eef3ff",
            headerSurface: "rgba(255,255,255,0.9)",
            navSurface: "rgba(248,250,255,0.96)",
            fieldSurface: "#ffffff",
            heroFrom: "rgba(255,255,255,0.98)",
            heroTo: "rgba(236,243,255,0.98)",
            heroSpotlight: "rgba(29,78,216,0.16)",
            tableHead: "#f4f8ff",
            chatInbound: "#ffffff",
            chatOutbound: "#e3edff",
            chatSystem: "#eff4ff",
            foreground: "#10203a",
            foregroundSoft: "#253658",
            muted: "#5e6f91",
            line: "#d6e0f3",
            success: "#0f8a6f",
            warning: "#d97706",
            danger: "#dc2626",
            info: "#1d4ed8",
            shadow: "#14284d",
            overlay: "rgba(7, 23, 54, 0.18)"
        },
        dark: {
            brand: "#7fb1ff",
            brandStrong: "#4c82ff",
            brandSoft: "#112c67",
            brandContrast: "#051025",
            background: "#071326",
            backgroundAlt: "#0c1b33",
            surface: "#10213f",
            surfaceSoft: "#142849",
            surfaceRaised: "#173057",
            headerSurface: "rgba(8,19,38,0.84)",
            navSurface: "rgba(16,33,63,0.96)",
            fieldSurface: "#10213f",
            heroFrom: "rgba(16,33,63,0.95)",
            heroTo: "rgba(9,19,37,0.98)",
            heroSpotlight: "rgba(127,177,255,0.18)",
            tableHead: "#132645",
            chatInbound: "#132645",
            chatOutbound: "#1c3c73",
            chatSystem: "#173057",
            foreground: "#f2f7ff",
            foregroundSoft: "#dae6fb",
            muted: "#9eb1cf",
            line: "#24436c",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#93c5fd",
            shadow: "#020817",
            overlay: "rgba(2, 8, 23, 0.58)"
        }
    },
    tabler: {
        label: "HBX Tabler",
        shortLabel: "TB",
        inspiration: "Tabler",
        description: "Mais robusto e estrutural, com leitura forte, bordas firmes e cara de sistema pesado.",
        personality: "Console administrativo robusto, mais estrutural e orientado a volume de dados.",
        shellLabel: "Operations console",
        densityLabel: "Denso",
        depthLabel: "Estrutural",
        chrome: {
            radiusXs: "7px",
            radiusSm: "9px",
            radiusMd: "12px",
            radiusLg: "16px",
            radiusXl: "22px",
            topbarWidth: "1720px",
            contentWidth: "1760px",
            contentGutter: "16px",
            topbarBlur: "10px"
        },
        typography: {
            bodyFont: "var(--font-sora)",
            displayFont: "var(--font-space-grotesk)",
            monoFont: "var(--font-ibm-plex-mono)",
            eyebrowSpacing: "0.16em"
        },
        workspace: {
            railWidth: "324px",
            contextWidth: "296px",
            shellGap: "16px",
            shellPadding: "16px",
            heroColumns: "1.4fr 0.82fr",
            heroMinHeight: "186px"
        },
        light: {
            brand: "#3151a4",
            brandStrong: "#213a80",
            brandSoft: "#dbe5ff",
            brandContrast: "#f7faff",
            background: "#eff2f8",
            backgroundAlt: "#e4e9f2",
            surface: "#ffffff",
            surfaceSoft: "#f6f8fb",
            surfaceRaised: "#edf1f7",
            headerSurface: "rgba(250,251,253,0.92)",
            navSurface: "rgba(243,246,251,0.96)",
            fieldSurface: "#fdfefe",
            heroFrom: "rgba(250,251,253,0.98)",
            heroTo: "rgba(233,238,247,0.98)",
            heroSpotlight: "rgba(49,81,164,0.14)",
            tableHead: "#eef2f8",
            chatInbound: "#ffffff",
            chatOutbound: "#e3ebff",
            chatSystem: "#eef2f7",
            foreground: "#111827",
            foregroundSoft: "#253246",
            muted: "#66758b",
            line: "#d4dce8",
            success: "#0f8a6f",
            warning: "#c47a09",
            danger: "#c2410c",
            info: "#3151a4",
            shadow: "#172030",
            overlay: "rgba(15, 23, 42, 0.2)"
        },
        dark: {
            brand: "#97abff",
            brandStrong: "#6884ff",
            brandSoft: "#1b2651",
            brandContrast: "#081127",
            background: "#0a101b",
            backgroundAlt: "#121a28",
            surface: "#172131",
            surfaceSoft: "#1b2739",
            surfaceRaised: "#223147",
            headerSurface: "rgba(13,19,31,0.88)",
            navSurface: "rgba(23,33,49,0.97)",
            fieldSurface: "#172131",
            heroFrom: "rgba(23,33,49,0.96)",
            heroTo: "rgba(13,19,31,0.98)",
            heroSpotlight: "rgba(151,171,255,0.16)",
            tableHead: "#1a2536",
            chatInbound: "#1a2536",
            chatOutbound: "#243555",
            chatSystem: "#202c41",
            foreground: "#f4f7fb",
            foregroundSoft: "#d7dfeb",
            muted: "#a0adbf",
            line: "#2b3c54",
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#fb7185",
            info: "#93c5fd",
            shadow: "#030712",
            overlay: "rgba(3, 7, 18, 0.62)"
        }
    }
};
function isHbxThemeId(value) {
    return HBX_THEME_IDS.includes(value);
}
function isHbxThemeMode(value) {
    return HBX_THEME_MODES.includes(value);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/design-tokens.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_THEME_SELECTION",
    ()=>DEFAULT_THEME_SELECTION,
    "applyThemeSelectionToDocument",
    ()=>applyThemeSelectionToDocument
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-palettes.ts [app-client] (ecmascript)");
;
const DEFAULT_THEME_SELECTION = {
    themeId: "shadcn",
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
    const theme = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][selection.themeId];
    const palette = theme[selection.mode];
    const root = document.documentElement;
    root.setAttribute("data-theme", selection.themeId);
    root.setAttribute("data-theme-mode", selection.mode);
    root.setAttribute("data-theme-shell", theme.shellLabel.toLowerCase().replace(/\s+/g, "-"));
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
        "--header-surface": palette.headerSurface,
        "--nav-surface": palette.navSurface,
        "--field-surface": palette.fieldSurface,
        "--hero-from": palette.heroFrom,
        "--hero-to": palette.heroTo,
        "--hero-spotlight": palette.heroSpotlight,
        "--table-head": palette.tableHead,
        "--chat-inbound": palette.chatInbound,
        "--chat-outbound": palette.chatOutbound,
        "--chat-system": palette.chatSystem,
        "--foreground": palette.foreground,
        "--foreground-soft": palette.foregroundSoft,
        "--muted": palette.muted,
        "--line": palette.line,
        "--success": palette.success,
        "--warning": palette.warning,
        "--danger": palette.danger,
        "--info": palette.info,
        "--overlay": palette.overlay,
        "--radius-xs": theme.chrome.radiusXs,
        "--radius-sm": theme.chrome.radiusSm,
        "--radius-md": theme.chrome.radiusMd,
        "--radius-lg": theme.chrome.radiusLg,
        "--radius-xl": theme.chrome.radiusXl,
        "--control-radius": theme.chrome.radiusSm,
        "--panel-radius": theme.chrome.radiusLg,
        "--hero-radius": theme.chrome.radiusXl,
        "--pill-radius": "999px",
        "--topbar-frame-width": theme.chrome.topbarWidth,
        "--app-max-width": theme.chrome.contentWidth,
        "--content-gutter": theme.chrome.contentGutter,
        "--topbar-blur": theme.chrome.topbarBlur,
        "--workspace-rail-width": theme.workspace.railWidth,
        "--workspace-context-width": theme.workspace.contextWidth,
        "--workspace-gap": theme.workspace.shellGap,
        "--workspace-padding": theme.workspace.shellPadding,
        "--workspace-hero-columns": theme.workspace.heroColumns,
        "--workspace-hero-min-height": theme.workspace.heroMinHeight,
        "--font-body": theme.typography.bodyFont,
        "--font-display": theme.typography.displayFont,
        "--font-mono-theme": theme.typography.monoFont,
        "--eyebrow-spacing": theme.typography.eyebrowSpacing,
        "--theme-density-label": `"${theme.densityLabel}"`,
        "--theme-depth-label": `"${theme.depthLabel}"`,
        "--theme-shell-label": `"${theme.shellLabel}"`,
        "--shadow-xs": `0 12px 24px -18px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.26 : 0.38)}`,
        "--shadow-sm": `0 18px 42px -24px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.32 : 0.46)}`,
        "--shadow-md": `0 30px 72px -32px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.38 : 0.54)}`,
        "--shadow-lg": `0 44px 96px -36px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.44 : 0.62)}`,
        "--shadow-inset": `inset 0 1px 0 ${selection.mode === "light" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.06)"}`,
        "--panel-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.12 : 0.2),
        "--hero-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.18 : 0.26),
        "--hero-outline": withAlpha(palette.brand, selection.mode === "light" ? 0.18 : 0.28),
        "--soft-ring": withAlpha(palette.brand, selection.mode === "light" ? 0.12 : 0.22),
        "--hairline": withAlpha(palette.foreground, selection.mode === "light" ? 0.06 : 0.12)
    };
    Object.entries(variables).forEach(([name, value])=>{
        root.style.setProperty(name, value);
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/theme-preferences.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/design-tokens.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-palettes.ts [app-client] (ecmascript)");
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
    if (normalized === "primary" || normalized === "blue" || normalized === "shadcn") {
        return "shadcn";
    }
    if (normalized === "secondary" || normalized === "green" || normalized === "tailadmin") {
        return "tailadmin";
    }
    if (normalized === "neutral" || normalized === "slate" || normalized === "grey") {
        return "tabler";
    }
    if (normalized === "pink" || normalized === "mosaic") return "mosaic";
    if (normalized === "flowbite") return "flowbite";
    if (normalized === "tabler") return "tabler";
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DEFAULT_THEME_SELECTION"].themeId;
}
function resolveStoredThemeId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isHbxThemeId"])(normalized) ? normalized : mapLegacyThemeId(value);
}
function resolveStoredThemeMode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isHbxThemeMode"])(normalized) ? normalized : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DEFAULT_THEME_SELECTION"].mode;
}
function getActiveThemeStorageUser(userId) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const explicit = normalizeUserId(userId);
    if (explicit) return explicit;
    try {
        return normalizeUserId(localStorage.getItem(ACTIVE_THEME_USER_STORAGE_KEY));
    } catch  {
        return "";
    }
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
function readStoredThemeSelection(userId) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const scopedUserId = getActiveThemeStorageUser(userId);
    try {
        const themeId = resolveStoredThemeId(localStorage.getItem(buildScopedKey(HBX_THEME_ID_STORAGE_KEY, scopedUserId)) || localStorage.getItem(HBX_THEME_ID_STORAGE_KEY) || localStorage.getItem("theme"));
        const mode = resolveStoredThemeMode(localStorage.getItem(buildScopedKey(HBX_THEME_MODE_STORAGE_KEY, scopedUserId)) || localStorage.getItem(HBX_THEME_MODE_STORAGE_KEY) || localStorage.getItem("theme-mode"));
        return {
            themeId,
            mode
        };
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DEFAULT_THEME_SELECTION"];
    }
}
function persistThemeSelection(selection, userId) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const scopedUserId = getActiveThemeStorageUser(userId);
    try {
        localStorage.setItem(HBX_THEME_ID_STORAGE_KEY, selection.themeId);
        localStorage.setItem(HBX_THEME_MODE_STORAGE_KEY, selection.mode);
        localStorage.setItem("theme", selection.themeId);
        localStorage.setItem("theme-mode", selection.mode);
        if (scopedUserId) {
            localStorage.setItem(buildScopedKey(HBX_THEME_ID_STORAGE_KEY, scopedUserId), selection.themeId);
            localStorage.setItem(buildScopedKey(HBX_THEME_MODE_STORAGE_KEY, scopedUserId), selection.mode);
            localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, scopedUserId);
        }
    } catch  {
    // ignore storage errors
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ThemeProvider.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ThemeProvider",
    ()=>ThemeProvider,
    "useHbxTheme",
    ()=>useHbxTheme
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/design-tokens.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-palettes.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-preferences.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const ThemeContext = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].createContext(null);
function ThemeProvider({ children }) {
    _s();
    const [storageUserId, setStorageUserIdState] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState(null);
    const [selection, setSelectionState] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DEFAULT_THEME_SELECTION"]);
    const [ready, setReady] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState(false);
    const applySelection = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "ThemeProvider.useCallback[applySelection]": (nextSelection, nextUserId = storageUserId)=>{
            setSelectionState(nextSelection);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyThemeSelectionToDocument"])(nextSelection);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["persistThemeSelection"])(nextSelection, nextUserId);
        }
    }["ThemeProvider.useCallback[applySelection]"], [
        storageUserId
    ]);
    const syncFromStorage = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffectEvent({
        "ThemeProvider.useEffectEvent[syncFromStorage]": (nextUserId)=>{
            const nextSelection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStoredThemeSelection"])(nextUserId ?? storageUserId);
            setSelectionState(nextSelection);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$design$2d$tokens$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyThemeSelectionToDocument"])(nextSelection);
            setReady(true);
        }
    }["ThemeProvider.useEffectEvent[syncFromStorage]"]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "ThemeProvider.useEffect": ()=>{
            syncFromStorage(storageUserId);
        }
    }["ThemeProvider.useEffect"], [
        storageUserId
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "ThemeProvider.useEffect": ()=>{
            const handleStorage = {
                "ThemeProvider.useEffect.handleStorage": (event)=>{
                    if (event.key && !event.key.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HBX_THEME_ID_STORAGE_KEY"]) && !event.key.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HBX_THEME_MODE_STORAGE_KEY"]) && event.key !== "theme" && event.key !== "theme-mode") {
                        return;
                    }
                    syncFromStorage(storageUserId);
                }
            }["ThemeProvider.useEffect.handleStorage"];
            window.addEventListener("storage", handleStorage);
            return ({
                "ThemeProvider.useEffect": ()=>{
                    window.removeEventListener("storage", handleStorage);
                }
            })["ThemeProvider.useEffect"];
        }
    }["ThemeProvider.useEffect"], [
        storageUserId
    ]);
    const setThemeId = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "ThemeProvider.useCallback[setThemeId]": (themeId)=>{
            applySelection({
                themeId,
                mode: selection.mode
            });
        }
    }["ThemeProvider.useCallback[setThemeId]"], [
        applySelection,
        selection.mode
    ]);
    const setMode = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "ThemeProvider.useCallback[setMode]": (mode)=>{
            applySelection({
                themeId: selection.themeId,
                mode
            });
        }
    }["ThemeProvider.useCallback[setMode]"], [
        applySelection,
        selection.themeId
    ]);
    const setSelection = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "ThemeProvider.useCallback[setSelection]": (nextSelection)=>{
            applySelection(nextSelection);
        }
    }["ThemeProvider.useCallback[setSelection]"], [
        applySelection
    ]);
    const setStorageUserId = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "ThemeProvider.useCallback[setStorageUserId]": (userId)=>{
            setStorageUserIdState(userId);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$preferences$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["setActiveThemeUser"])(userId);
        }
    }["ThemeProvider.useCallback[setStorageUserId]"], []);
    const value = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useMemo({
        "ThemeProvider.useMemo[value]": ()=>({
                selection,
                activeTheme: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][selection.themeId],
                storageUserId,
                ready,
                setThemeId,
                setMode,
                setSelection,
                setStorageUserId
            })
    }["ThemeProvider.useMemo[value]"], [
        ready,
        selection,
        setMode,
        setSelection,
        setStorageUserId,
        setThemeId,
        storageUserId
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ThemeContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/src/components/ThemeProvider.tsx",
        lineNumber: 117,
        columnNumber: 10
    }, this);
}
_s(ThemeProvider, "8HbA33jv9vVNltw0NWTsaC0aRUk=");
_c = ThemeProvider;
function useHbxTheme() {
    _s1();
    const context = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useContext(ThemeContext);
    if (!context) {
        throw new Error("useHbxTheme must be used inside ThemeProvider.");
    }
    return context;
}
_s1(useHbxTheme, "b9L3QQ+jgeyIrH0NfHrJ8nn7VMU=");
var _c;
__turbopack_context__.k.register(_c, "ThemeProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/masterContextEvents.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MASTER_CONTEXT_CHANGED_EVENT",
    ()=>MASTER_CONTEXT_CHANGED_EVENT,
    "dispatchMasterContextChanged",
    ()=>dispatchMasterContextChanged
]);
const MASTER_CONTEXT_CHANGED_EVENT = "hbx-master-context-changed";
function dispatchMasterContextChanged(detail) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    window.dispatchEvent(new CustomEvent(MASTER_CONTEXT_CHANGED_EVENT, {
        detail
    }));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ThemeSwitcher.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThemeSwitcher
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$InterfaceTransitionProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/InterfaceTransitionProvider.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ThemeProvider.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/theme-palettes.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function ThemeSwitcher() {
    _s();
    const rootRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const [open, setOpen] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState(false);
    const { replayGlobalTransition } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$InterfaceTransitionProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useInterfaceTransition"])();
    const { selection, activeTheme, setMode, setThemeId } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHbxTheme"])();
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "ThemeSwitcher.useEffect": ()=>{
            if (!open) return undefined;
            const handlePointerDown = {
                "ThemeSwitcher.useEffect.handlePointerDown": (event)=>{
                    if (!rootRef.current?.contains(event.target)) {
                        setOpen(false);
                    }
                }
            }["ThemeSwitcher.useEffect.handlePointerDown"];
            const handleKeyDown = {
                "ThemeSwitcher.useEffect.handleKeyDown": (event)=>{
                    if (event.key === "Escape") setOpen(false);
                }
            }["ThemeSwitcher.useEffect.handleKeyDown"];
            window.addEventListener("pointerdown", handlePointerDown);
            window.addEventListener("keydown", handleKeyDown);
            return ({
                "ThemeSwitcher.useEffect": ()=>{
                    window.removeEventListener("pointerdown", handlePointerDown);
                    window.removeEventListener("keydown", handleKeyDown);
                }
            })["ThemeSwitcher.useEffect"];
        }
    }["ThemeSwitcher.useEffect"], [
        open
    ]);
    function handleThemeSelection(themeId) {
        setThemeId(themeId);
        replayGlobalTransition();
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "theme-switcher-wrap",
        ref: rootRef,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: `theme-switcher__trigger ${open ? "is-open" : ""}`,
                onClick: ()=>setOpen((value)=>!value),
                "aria-haspopup": "dialog",
                "aria-expanded": open,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "theme-switcher__trigger-preview",
                        style: {
                            background: `linear-gradient(145deg, ${activeTheme[selection.mode].brand}, ${activeTheme[selection.mode].brandStrong})`
                        },
                        "aria-hidden": "true"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 49,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "theme-switcher__trigger-copy",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "theme-switcher__label",
                                children: "Tema visual"
                            }, void 0, false, {
                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                lineNumber: 57,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: activeTheme.label
                            }, void 0, false, {
                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                lineNumber: 58,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 56,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "theme-switcher__modeBadge",
                        children: selection.mode === "dark" ? "Escuro" : "Claro"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 60,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                lineNumber: 42,
                columnNumber: 7
            }, this),
            open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "theme-switcher__panel",
                role: "dialog",
                "aria-label": "Selecionar tema visual",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "theme-switcher__panelHeader",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "theme-switcher__eyebrow",
                                        children: "5 temas HBX"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                        lineNumber: 69,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        className: "theme-switcher__title",
                                        children: "Escolha a experiência visual"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                        lineNumber: 70,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                lineNumber: 68,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "theme-switcher__modeRow",
                                role: "group",
                                "aria-label": "Modo de tema",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: `theme-mode-chip ${selection.mode === "light" ? "is-selected" : ""}`,
                                        onClick: ()=>{
                                            setMode("light");
                                            replayGlobalTransition();
                                        },
                                        children: "Claro"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                        lineNumber: 73,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        className: `theme-mode-chip ${selection.mode === "dark" ? "is-selected" : ""}`,
                                        onClick: ()=>{
                                            setMode("dark");
                                            replayGlobalTransition();
                                        },
                                        children: "Escuro"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                        lineNumber: 83,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                lineNumber: 72,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 67,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "theme-switcher__grid",
                        children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HBX_THEME_IDS"].map((themeId)=>{
                            const theme = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$theme$2d$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HBX_THEME_PALETTES"][themeId];
                            const palette = theme[selection.mode];
                            const active = selection.themeId === themeId;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>handleThemeSelection(themeId),
                                className: `theme-card ${active ? "is-selected" : ""}`,
                                "aria-pressed": active,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "theme-card__preview",
                                        style: {
                                            background: `linear-gradient(155deg, ${palette.heroFrom}, ${palette.heroTo})`
                                        },
                                        "aria-hidden": "true",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "theme-card__previewTop",
                                                style: {
                                                    background: palette.headerSurface
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                lineNumber: 117,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "theme-card__previewBody",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "theme-card__previewNav",
                                                        style: {
                                                            background: palette.navSurface
                                                        }
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                        lineNumber: 122,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "theme-card__previewStack",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "theme-card__previewMetric",
                                                                style: {
                                                                    background: palette.surface
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                                lineNumber: 127,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "theme-card__previewMetric",
                                                                style: {
                                                                    background: palette.surfaceRaised
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                                lineNumber: 131,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "theme-card__previewCta",
                                                                style: {
                                                                    background: `linear-gradient(145deg, ${palette.brand}, ${palette.brandStrong})`
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                                lineNumber: 135,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                        lineNumber: 126,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                lineNumber: 121,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                        lineNumber: 110,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "theme-card__copy",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "theme-card__headline",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                children: theme.label
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                                lineNumber: 147,
                                                columnNumber: 23
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                            lineNumber: 146,
                                            columnNumber: 21
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                        lineNumber: 145,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, themeId, true, {
                                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                                lineNumber: 103,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/src/components/ThemeSwitcher.tsx",
                        lineNumber: 96,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ThemeSwitcher.tsx",
                lineNumber: 66,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ThemeSwitcher.tsx",
        lineNumber: 41,
        columnNumber: 5
    }, this);
}
_s(ThemeSwitcher, "uqarAhvKn6ksWrRRlXy0g0BIeXw=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$InterfaceTransitionProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useInterfaceTransition"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHbxTheme"]
    ];
});
_c = ThemeSwitcher;
var _c;
__turbopack_context__.k.register(_c, "ThemeSwitcher");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/TechAssistantGlobalDrawer.module.css [app-client] (css module)", ((__turbopack_context__) => {

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
"[project]/src/components/TechAssistantGlobalDrawer.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TechAssistantGlobalDrawer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2d$dom$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react-dom/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/TechAssistantGlobalDrawer.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [minimized, setMinimized] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [copyStatus, setCopyStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [message, setMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [technicalContent, setTechnicalContent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [analysisType, setAnalysisType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("manual");
    const [environment, setEnvironment] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("desconhecido");
    const [expectedBehavior, setExpectedBehavior] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [currentBehavior, setCurrentBehavior] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [promptDraft, setPromptDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [viewport, setViewport] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("desconhecido");
    const [promptTarget, setPromptTarget] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("chatgpt");
    const [pageContext, setPageContext] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [runtimeSignals, setRuntimeSignals] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [result, setResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [history, setHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [historyVisible, setHistoryVisible] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showAdvanced, setShowAdvanced] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showPromptPreview, setShowPromptPreview] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [historyRouteFilter, setHistoryRouteFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [historyAnalysisTypeFilter, setHistoryAnalysisTypeFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [operationAction, setOperationAction] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("reprocessar_evento_teste");
    const [operationDetails, setOperationDetails] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [operationConfirmationText, setOperationConfirmationText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [operationResult, setOperationResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const moduleKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TechAssistantGlobalDrawer.useMemo[moduleKey]": ()=>deriveModuleFromPath(pathname || "")
    }["TechAssistantGlobalDrawer.useMemo[moduleKey]"], [
        pathname
    ]);
    const operationMode = masterContext?.active ? "empresa_assumida" : "master_puro";
    const activeCompanyName = masterContext?.companyName || null;
    const selectedGuide = ANALYSIS_GUIDES[analysisType] || ANALYSIS_GUIDES.manual;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TechAssistantGlobalDrawer.useEffect": ()=>{
            setMounted(true);
            const updateRuntimeDetails = {
                "TechAssistantGlobalDrawer.useEffect.updateRuntimeDetails": ()=>{
                    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
                    ;
                    setEnvironment(inferEnvironment(window.location.hostname));
                    setViewport(`${window.innerWidth}x${window.innerHeight}`);
                }
            }["TechAssistantGlobalDrawer.useEffect.updateRuntimeDetails"];
            updateRuntimeDetails();
            window.addEventListener("resize", updateRuntimeDetails);
            return ({
                "TechAssistantGlobalDrawer.useEffect": ()=>window.removeEventListener("resize", updateRuntimeDetails)
            })["TechAssistantGlobalDrawer.useEffect"];
        }
    }["TechAssistantGlobalDrawer.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TechAssistantGlobalDrawer.useEffect": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            const pushSignal = {
                "TechAssistantGlobalDrawer.useEffect.pushSignal": (signal)=>{
                    setRuntimeSignals({
                        "TechAssistantGlobalDrawer.useEffect.pushSignal": (current)=>[
                                signal,
                                ...current
                            ].slice(0, 8)
                    }["TechAssistantGlobalDrawer.useEffect.pushSignal"]);
                }
            }["TechAssistantGlobalDrawer.useEffect.pushSignal"];
            const handlePageContext = {
                "TechAssistantGlobalDrawer.useEffect.handlePageContext": (event)=>{
                    const customEvent = event;
                    setPageContext(customEvent.detail || null);
                }
            }["TechAssistantGlobalDrawer.useEffect.handlePageContext"];
            const handleApiError = {
                "TechAssistantGlobalDrawer.useEffect.handleApiError": (event)=>{
                    const customEvent = event;
                    const detail = customEvent.detail || {};
                    pushSignal(toSignal("api", `${formatUnknown(detail.method, "GET")} ${formatUnknown(detail.path || detail.url, "/")} -> ${formatUnknown(detail.status, "erro")}: ${formatUnknown(detail.message, "Falha de API")}`, formatUnknown(detail.response, "")));
                }
            }["TechAssistantGlobalDrawer.useEffect.handleApiError"];
            const handleWindowError = {
                "TechAssistantGlobalDrawer.useEffect.handleWindowError": (event)=>{
                    pushSignal(toSignal("window", event.message || "Erro de janela nao identificado.", `${event.filename || "arquivo_desconhecido"}:${event.lineno || 0}:${event.colno || 0}`));
                }
            }["TechAssistantGlobalDrawer.useEffect.handleWindowError"];
            const handlePromiseError = {
                "TechAssistantGlobalDrawer.useEffect.handlePromiseError": (event)=>{
                    pushSignal(toSignal("promise", formatUnknown(event.reason?.message || event.reason, "Promise rejeitada sem detalhe.")));
                }
            }["TechAssistantGlobalDrawer.useEffect.handlePromiseError"];
            const originalConsoleError = console.error;
            console.error = ({
                "TechAssistantGlobalDrawer.useEffect": (...args)=>{
                    pushSignal(toSignal("console", formatUnknown(args[0], "console.error"), args.slice(1).map({
                        "TechAssistantGlobalDrawer.useEffect": (item)=>formatUnknown(item, "")
                    }["TechAssistantGlobalDrawer.useEffect"]).filter(Boolean).join(" | ")));
                    originalConsoleError(...args);
                }
            })["TechAssistantGlobalDrawer.useEffect"];
            window.addEventListener("hbx-tech-assistant:page-context", handlePageContext);
            window.addEventListener("hbx-tech-assistant:api-error", handleApiError);
            window.addEventListener("error", handleWindowError);
            window.addEventListener("unhandledrejection", handlePromiseError);
            return ({
                "TechAssistantGlobalDrawer.useEffect": ()=>{
                    console.error = originalConsoleError;
                    window.removeEventListener("hbx-tech-assistant:page-context", handlePageContext);
                    window.removeEventListener("hbx-tech-assistant:api-error", handleApiError);
                    window.removeEventListener("error", handleWindowError);
                    window.removeEventListener("unhandledrejection", handlePromiseError);
                }
            })["TechAssistantGlobalDrawer.useEffect"];
        }
    }["TechAssistantGlobalDrawer.useEffect"], []);
    const briefingAssessment = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TechAssistantGlobalDrawer.useMemo[briefingAssessment]": ()=>buildBriefingAssessment({
                route: pathname || "",
                moduleKey,
                activeCompanyName,
                message,
                currentBehavior,
                expectedBehavior,
                technicalContent,
                promptDraft
            })
    }["TechAssistantGlobalDrawer.useMemo[briefingAssessment]"], [
        activeCompanyName,
        currentBehavior,
        expectedBehavior,
        message,
        moduleKey,
        pathname,
        promptDraft,
        technicalContent
    ]);
    const contextSnapshot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TechAssistantGlobalDrawer.useMemo[contextSnapshot]": ()=>buildContextSnapshot({
                route: pathname || "",
                moduleKey,
                activeCompanyName,
                operationMode,
                environment,
                viewport
            })
    }["TechAssistantGlobalDrawer.useMemo[contextSnapshot]"], [
        activeCompanyName,
        environment,
        moduleKey,
        operationMode,
        pathname,
        viewport
    ]);
    const currentModuleHints = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TechAssistantGlobalDrawer.useMemo[currentModuleHints]": ()=>MODULE_PROMPT_HINTS[pageContext?.moduleKey || moduleKey] || []
    }["TechAssistantGlobalDrawer.useMemo[currentModuleHints]"], [
        moduleKey,
        pageContext?.moduleKey
    ]);
    const pageContextSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TechAssistantGlobalDrawer.useMemo[pageContextSummary]": ()=>{
            if (!pageContext) return "";
            const tags = (pageContext.tags || []).filter(Boolean).join(", ");
            const details = Object.entries(pageContext.details || {}).slice(0, 8).map({
                "TechAssistantGlobalDrawer.useMemo[pageContextSummary].details": ([key, value])=>`${key}: ${formatUnknown(value)}`
            }["TechAssistantGlobalDrawer.useMemo[pageContextSummary].details"]).join(" | ");
            return [
                pageContext.summary,
                tags ? `Tags: ${tags}` : "",
                details
            ].filter(Boolean).join(" | ");
        }
    }["TechAssistantGlobalDrawer.useMemo[pageContextSummary]"], [
        pageContext
    ]);
    const runtimeSignalSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TechAssistantGlobalDrawer.useMemo[runtimeSignalSummary]": ()=>runtimeSignals.slice(0, 5).map({
                "TechAssistantGlobalDrawer.useMemo[runtimeSignalSummary]": (signal)=>[
                        signal.kind.toUpperCase(),
                        signal.message,
                        signal.meta ? `meta: ${signal.meta}` : ""
                    ].filter(Boolean).join(" | ")
            }["TechAssistantGlobalDrawer.useMemo[runtimeSignalSummary]"]).join("\n")
    }["TechAssistantGlobalDrawer.useMemo[runtimeSignalSummary]"], [
        runtimeSignals
    ]);
    const externalPrompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TechAssistantGlobalDrawer.useMemo[externalPrompt]": ()=>buildExternalPrompt(promptTarget, {
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
            })
    }["TechAssistantGlobalDrawer.useMemo[externalPrompt]"], [
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
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/tech-assistant/analyze", {
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
            const rows = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])(`/tech-assistant/history?${params.toString()}`);
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
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/tech-assistant/operation/confirm-action", {
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2d$dom$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createPortal"])(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: `btn btn-primary btn-sm ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].assistantLauncher}`,
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: `panel ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].assistantShell}`,
                "data-open": open,
                "data-minimized": minimized,
                "aria-hidden": !open,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].assistantHeader,
                        style: {
                            borderBottom: minimized ? "none" : "1px solid var(--line)"
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].headerRow,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].headerEyebrow,
                                            children: "Assistente global MASTER"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 798,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].headerTitle,
                                            children: "Afinador tecnico sem API externa"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 799,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].headerMeta,
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].headerMeta,
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].headerActions,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            onClick: ()=>setMinimized((value)=>!value),
                                            children: minimized ? "Expandir" : "Minimizar"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 808,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                    !minimized ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].assistantBody,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionStack,
                            children: [
                                error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "alert alert-error",
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 825,
                                    columnNumber: 24
                                }, this) : null,
                                copyStatus ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "alert alert-info",
                                    children: copyStatus
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                    lineNumber: 826,
                                    columnNumber: 29
                                }, this) : null,
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].formCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Problema da pagina atual"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 831,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].scoreBadge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"][`score${briefingAssessment.tone}`]}`,
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: "O contexto da tela ja foi capturado automaticamente. Aqui voce pode focar so em descrever o problema desta pagina, sem montar um prompt inteiro."
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 839,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].badgeRow,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-brand",
                                                    children: moduleKey
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 845,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-neutral",
                                                    children: operationMode
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 846,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge badge-neutral",
                                                    children: environment
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 847,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: pageContext?.summary || "Contexto automatico da tela"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 852,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                "Rota atual: ",
                                                                pathname || "-"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 854,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                "Empresa ativa: ",
                                                                activeCompanyName || "MASTER puro"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 855,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "Descricao do problema",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "O que deveria acontecer? (opcional)",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                                        briefingAssessment.missing.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].missingBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Se quiser deixar a analise melhor, voce ainda pode complementar com:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 884,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: briefingAssessment.missing.slice(0, 4).map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>setShowAdvanced((value)=>!value),
                                                    children: showAdvanced ? "Esconder detalhes" : "Mostrar detalhes"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 990,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>setShowPromptPreview((value)=>!value),
                                                    children: showPromptPreview ? `Esconder pacote ${promptPreviewLabel}` : `Ver pacote ${promptPreviewLabel}`
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 997,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: clearSession,
                                                    children: "Limpar sessao"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1004,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
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
                                showAdvanced ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].contextCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Detalhes opcionais"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1030,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: "Abra esta area quando quiser aprofundar a analise, anexar evidencias ou ajustar o pacote que sera enviado ao ChatGPT, Gemini ou Codex."
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1036,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].fieldGridTwo,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Tipo de analise",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: analysisType,
                                                            onChange: (event)=>setAnalysisType(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "manual",
                                                                    children: "Mensagem manual"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1049,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "page_analysis",
                                                                    children: "Analisar pagina atual"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1050,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "error_analysis",
                                                                    children: "Analisar erro"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1051,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "ctrl_u",
                                                                    children: "Ctrl+U / HTML"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1052,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "codex_prompt",
                                                                    children: "Gerar prompt para Codex"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1053,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "prompt_review",
                                                                    children: "Revisar prompt"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1054,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Ambiente",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: environment,
                                                            onChange: (event)=>setEnvironment(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "localhost",
                                                                    children: "localhost"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1066,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "homologacao",
                                                                    children: "homologacao"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1067,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "producao",
                                                                    children: "producao"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1068,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Perguntas que o chat deve afunilar"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1075,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: selectedGuide.questions.map((question)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        pageContext ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Contexto da pagina"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1085,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: [
                                                        (pageContext.tags || []).slice(0, 6).map((tag)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                                children: tag
                                                            }, tag, false, {
                                                                fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                lineNumber: 1088,
                                                                columnNumber: 27
                                                            }, this)),
                                                        Object.entries(pageContext.details || {}).slice(0, 8).map(([key, value])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        runtimeSignals.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].warningBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Sinais automaticos recentes"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1103,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: runtimeSignals.slice(0, 5).map((signal)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].fieldGridTwo,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Comportamento atual",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Comportamento esperado",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "Evidencia tecnica",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "grid gap-1 text-sm",
                                            children: [
                                                "Rascunho / prompt atual",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "btn btn-secondary btn-sm",
                                                    onClick: ()=>copyText(contextSnapshot, "Contexto automatico copiado."),
                                                    children: "Copiar contexto"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1162,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                showPromptPreview ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].promptCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Prompt pronto"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1184,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].providerTabs,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: promptTarget === "chatgpt" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].providerTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].providerTab,
                                                            onClick: ()=>setPromptTarget("chatgpt"),
                                                            children: "ChatGPT"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1188,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: promptTarget === "gemini" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].providerTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].providerTab,
                                                            onClick: ()=>setPromptTarget("gemini"),
                                                            children: "Gemini"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1195,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: promptTarget === "codex" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].providerTabActive : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].providerTab,
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: "Cole este pacote no chat escolhido. Para ChatGPT/Gemini, ele ja pede perguntas curtas antes de tentar resolver. Para Codex, ele sai mais objetivo para patch."
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1212,
                                            columnNumber: 17
                                        }, this),
                                        currentModuleHints.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].questionBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Foco sugerido para este modulo"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1219,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: currentModuleHints.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].promptPreview,
                                            children: externalPrompt
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                            lineNumber: 1228,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                showAdvanced ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].operationCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                        children: "Operacao sensivel"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                        lineNumber: 1246,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Acao sensivel",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: operationAction,
                                                            onChange: (event)=>setOperationAction(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "reprocessar_evento_teste",
                                                                    children: "Reprocessar evento de teste"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1258,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "validar_canal_em_producao",
                                                                    children: "Validar canal em producao"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1259,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Detalhes",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Digite CONFIRMAR",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex gap-2",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                                operationResult ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].mutedText,
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
                                result ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].resultCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                            children: "Analise HBX"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1299,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardText,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        result.blocks.checkNow?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].listBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Conferir agora"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1312,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: result.blocks.checkNow.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        result.nextActions?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].listBlock,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Proximos passos"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1323,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: result.nextActions.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        result.warnings?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].warningBox,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Alertas"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                    lineNumber: 1334,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    children: result.warnings.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                historyVisible ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `panel panel-soft ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].historyCard}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardHeader,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cardEyebrow,
                                                        children: "Historico recente"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                        lineNumber: 1364,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].fieldGridTwo,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Filtro por rota",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "grid gap-1 text-sm",
                                                    children: [
                                                        "Filtro por tipo",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                            className: "field",
                                                            value: historyAnalysisTypeFilter,
                                                            onChange: (event)=>setHistoryAnalysisTypeFilter(event.target.value),
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "",
                                                                    children: "Todos"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1385,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "manual",
                                                                    children: "manual"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1386,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "page_analysis",
                                                                    children: "page_analysis"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1387,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "error_analysis",
                                                                    children: "error_analysis"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1388,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "ctrl_u",
                                                                    children: "ctrl_u"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1389,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "codex_prompt",
                                                                    children: "codex_prompt"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1390,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                    value: "prompt_review",
                                                                    children: "prompt_review"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                                    lineNumber: 1391,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inlineActions,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].historyList,
                                            children: history.length ? history.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].historyButton,
                                                    onClick: ()=>setResult(item.response),
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: item.title || "Analise"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TechAssistantGlobalDrawer.tsx",
                                                            lineNumber: 1409,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].mutedText,
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
_s(TechAssistantGlobalDrawer, "1KoDOurJR4mfNeNq4/d5fH4HBC4=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = TechAssistantGlobalDrawer;
var _c;
__turbopack_context__.k.register(_c, "TechAssistantGlobalDrawer");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/TopBar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TopBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$InterfaceTransitionProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/InterfaceTransitionProvider.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ThemeProvider.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/masterContextEvents.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ThemeSwitcher.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/TechAssistantGlobalDrawer.tsx [app-client] (ecmascript)");
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
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const topbarFrameRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const userMenuRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const { isShuttingDown, runGlobalShutdown } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$InterfaceTransitionProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useInterfaceTransition"])();
    const { setStorageUserId } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHbxTheme"])();
    const [authenticated, setAuthenticated] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [modules, setModules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [curPass, setCurPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [newPass, setNewPass] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [changing, setChanging] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [changeMsg, setChangeMsg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [whatsAppHealth, setWhatsAppHealth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("yellow");
    const [whatsAppHealthLabel, setWhatsAppHealthLabel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("WhatsApp status: sem validacao");
    const [recoveryPendingHumanCount, setRecoveryPendingHumanCount] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [atendimentoPendingHumanCount, setAtendimentoPendingHumanCount] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [incomingPopup, setIncomingPopup] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [masterContextModalOpen, setMasterContextModalOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [masterContextActionBusy, setMasterContextActionBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [masterContextMessage, setMasterContextMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [masterCompanyOptions, setMasterCompanyOptions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [selectedMasterCompanyId, setSelectedMasterCompanyId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [masterContextReason, setMasterContextReason] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [masterContextToast, setMasterContextToast] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [topbarHiddenByScroll, setTopbarHiddenByScroll] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const recoveryLastSeenRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const recoveryHumanQueueRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const recoveryAlertReadyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const atendimentoLastSeenRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const atendimentoAlertReadyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const audioContextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioArmedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const masterContextToastTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const lastScrollYRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const refreshMasterAwareState = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "TopBar.useCallback[refreshMasterAwareState]": async ()=>{
            const [profile, myModules] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
            ]);
            setUser(profile);
            setModules(myModules || []);
        }
    }["TopBar.useCallback[refreshMasterAwareState]"], []);
    const showMasterContextToast = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "TopBar.useCallback[showMasterContextToast]": (detail)=>{
            const mode = detail?.mode;
            const companyName = String(detail?.companyName || "").trim();
            const nextMessage = mode === "assumed" ? `Contexto alterado para ${companyName || "a empresa selecionada"}.` : "Contexto MASTER encerrado.";
            if (masterContextToastTimerRef.current) {
                clearTimeout(masterContextToastTimerRef.current);
            }
            setMasterContextToast(nextMessage);
            masterContextToastTimerRef.current = setTimeout({
                "TopBar.useCallback[showMasterContextToast]": ()=>{
                    setMasterContextToast(null);
                    masterContextToastTimerRef.current = null;
                }
            }["TopBar.useCallback[showMasterContextToast]"], 3200);
        }
    }["TopBar.useCallback[showMasterContextToast]"], []);
    const playIncomingAlertTone = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "TopBar.useCallback[playIncomingAlertTone]": ()=>{
            if (("TURBOPACK compile-time value", "object") === "undefined" || !audioArmedRef.current) return;
            const AudioContextCtor = window.AudioContext;
            if (!AudioContextCtor) return;
            const audioContext = audioContextRef.current || new AudioContextCtor();
            audioContextRef.current = audioContext;
            if (audioContext.state === "suspended") {
                void audioContext.resume().catch({
                    "TopBar.useCallback[playIncomingAlertTone]": ()=>undefined
                }["TopBar.useCallback[playIncomingAlertTone]"]);
            }
            const now = audioContext.currentTime;
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, now);
            oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(now);
            oscillator.stop(now + 0.26);
        }
    }["TopBar.useCallback[playIncomingAlertTone]"], []);
    const presentIncomingPopup = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "TopBar.useCallback[presentIncomingPopup]": (nextPopup)=>{
            setIncomingPopup({
                "TopBar.useCallback[presentIncomingPopup]": (current)=>{
                    if (current && current.id === nextPopup.id && new Date(current.lastAt).getTime() >= new Date(nextPopup.lastAt).getTime()) {
                        return current;
                    }
                    return nextPopup;
                }
            }["TopBar.useCallback[presentIncomingPopup]"]);
            playIncomingAlertTone();
        }
    }["TopBar.useCallback[presentIncomingPopup]"], [
        playIncomingAlertTone
    ]);
    const accessibleModules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            function refreshAuthState() {
                setAuthenticated(Boolean((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getToken"])()));
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            const armAudio = {
                "TopBar.useEffect.armAudio": ()=>{
                    audioArmedRef.current = true;
                }
            }["TopBar.useEffect.armAudio"];
            window.addEventListener("pointerdown", armAudio, {
                once: true
            });
            window.addEventListener("keydown", armAudio, {
                once: true
            });
            return ({
                "TopBar.useEffect": ()=>{
                    if (masterContextToastTimerRef.current) {
                        clearTimeout(masterContextToastTimerRef.current);
                    }
                    window.removeEventListener("pointerdown", armAudio);
                    window.removeEventListener("keydown", armAudio);
                    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
                        void audioContextRef.current.close().catch({
                            "TopBar.useEffect": ()=>undefined
                        }["TopBar.useEffect"]);
                    }
                    audioContextRef.current = null;
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            if (!authenticated) {
                setUser(null);
                setModules([]);
                setWhatsAppHealth("yellow");
                setWhatsAppHealthLabel("WhatsApp status: sem validacao");
                setRecoveryPendingHumanCount(0);
                setAtendimentoPendingHumanCount(0);
                setStorageUserId(null);
                return;
            }
            let mounted = true;
            async function loadUser() {
                try {
                    const [profile, myModules] = await Promise.all([
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
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
            void loadUser();
            function handleMasterContextChanged(event) {
                const customEvent = event;
                void refreshMasterAwareState().catch({
                    "TopBar.useEffect.handleMasterContextChanged": ()=>undefined
                }["TopBar.useEffect.handleMasterContextChanged"]);
                showMasterContextToast(customEvent.detail);
            }
            window.addEventListener(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MASTER_CONTEXT_CHANGED_EVENT"], handleMasterContextChanged);
            return ({
                "TopBar.useEffect": ()=>{
                    mounted = false;
                    window.removeEventListener(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MASTER_CONTEXT_CHANGED_EVENT"], handleMasterContextChanged);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], [
        authenticated,
        refreshMasterAwareState,
        setStorageUserId,
        showMasterContextToast
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            setStorageUserId(user?.id ?? null);
        }
    }["TopBar.useEffect"], [
        setStorageUserId,
        user?.id
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
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
                        const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/companies/me/whatsapp-status");
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
        user,
        user?.id,
        user?.company?.id,
        user?.isSystemMaster
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            if (!authenticated) {
                setRecoveryPendingHumanCount(0);
                setAtendimentoPendingHumanCount(0);
                return;
            }
            const applyCount = {
                "TopBar.useEffect.applyCount": (setter, value)=>{
                    const next = Number(value);
                    setter(Number.isFinite(next) ? Math.max(0, Math.trunc(next)) : 0);
                }
            }["TopBar.useEffect.applyCount"];
            const readStoredCount = {
                "TopBar.useEffect.readStoredCount": ()=>{
                    try {
                        applyCount(setRecoveryPendingHumanCount, window.localStorage.getItem(RECOVERY_QUEUE_STORAGE_KEY) || 0);
                        applyCount(setAtendimentoPendingHumanCount, window.localStorage.getItem(ATENDIMENTO_QUEUE_STORAGE_KEY) || 0);
                    } catch  {
                        applyCount(setRecoveryPendingHumanCount, 0);
                        applyCount(setAtendimentoPendingHumanCount, 0);
                    }
                }
            }["TopBar.useEffect.readStoredCount"];
            const handleRecoveryQueueEvent = {
                "TopBar.useEffect.handleRecoveryQueueEvent": (event)=>{
                    applyCount(setRecoveryPendingHumanCount, event.detail?.count ?? 0);
                }
            }["TopBar.useEffect.handleRecoveryQueueEvent"];
            const handleAtendimentoQueueEvent = {
                "TopBar.useEffect.handleAtendimentoQueueEvent": (event)=>{
                    applyCount(setAtendimentoPendingHumanCount, event.detail?.count ?? 0);
                }
            }["TopBar.useEffect.handleAtendimentoQueueEvent"];
            readStoredCount();
            window.addEventListener(RECOVERY_HUMAN_QUEUE_EVENT, handleRecoveryQueueEvent);
            window.addEventListener(ATENDIMENTO_HUMAN_QUEUE_EVENT, handleAtendimentoQueueEvent);
            window.addEventListener("storage", readStoredCount);
            return ({
                "TopBar.useEffect": ()=>{
                    window.removeEventListener(RECOVERY_HUMAN_QUEUE_EVENT, handleRecoveryQueueEvent);
                    window.removeEventListener(ATENDIMENTO_HUMAN_QUEUE_EVENT, handleAtendimentoQueueEvent);
                    window.removeEventListener("storage", readStoredCount);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], [
        authenticated
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
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
            const pollIncomingAlerts = {
                "TopBar.useEffect.pollIncomingAlerts": async ()=>{
                    const popupCandidates = [];
                    if (accessibleModules.has("hbx_recovery")) {
                        try {
                            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/hbx-recovery/interactions?queue=all");
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
                            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/inbox/conversations");
                            if (cancelled) return;
                            const rows = Array.isArray(payload) ? payload : [];
                            const pendingRows = rows.filter({
                                "TopBar.useEffect.pollIncomingAlerts.pendingRows": (conversation)=>conversation.routeTarget === "atendimento" && !conversation.isBlocked && (conversation.status === "new" || conversation.status === "open")
                            }["TopBar.useEffect.pollIncomingAlerts.pendingRows"]);
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
                    ].sort({
                        "TopBar.useEffect.pollIncomingAlerts": (left, right)=>new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime()
                    }["TopBar.useEffect.pollIncomingAlerts"])[0];
                    if (newestPopup) {
                        presentIncomingPopup(newestPopup);
                    }
                }
            }["TopBar.useEffect.pollIncomingAlerts"];
            void pollIncomingAlerts();
            const timer = window.setInterval({
                "TopBar.useEffect.timer": ()=>{
                    void pollIncomingAlerts();
                }
            }["TopBar.useEffect.timer"], 15000);
            return ({
                "TopBar.useEffect": ()=>{
                    cancelled = true;
                    window.clearInterval(timer);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], [
        authenticated,
        accessibleModules,
        presentIncomingPopup,
        user
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            setOpen(false);
        }
    }["TopBar.useEffect"], [
        pathname
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLayoutEffect"])({
        "TopBar.useLayoutEffect": ()=>{
            const root = document.documentElement;
            const topbar = topbarFrameRef.current;
            if (!root || !topbar) return;
            const setVar = {
                "TopBar.useLayoutEffect.setVar": ()=>{
                    const rect = topbar.getBoundingClientRect();
                    root.style.setProperty("--topbar-total-height", `${Math.ceil(rect.height)}px`);
                }
            }["TopBar.useLayoutEffect.setVar"];
            setVar();
            let observer = null;
            try {
                observer = new ResizeObserver(setVar);
                observer.observe(topbar);
            } catch  {
                window.addEventListener("resize", setVar);
            }
            return ({
                "TopBar.useLayoutEffect": ()=>{
                    observer?.disconnect();
                    window.removeEventListener("resize", setVar);
                }
            })["TopBar.useLayoutEffect"];
        }
    }["TopBar.useLayoutEffect"], [
        authenticated,
        incomingPopup,
        open,
        pathname
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TopBar.useEffect": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            lastScrollYRef.current = window.scrollY || 0;
            const handleScroll = {
                "TopBar.useEffect.handleScroll": ()=>{
                    const currentY = window.scrollY || 0;
                    const delta = currentY - lastScrollYRef.current;
                    if (currentY <= 24) {
                        setTopbarHiddenByScroll(false);
                        lastScrollYRef.current = currentY;
                        return;
                    }
                    if (delta > 8) {
                        setTopbarHiddenByScroll(true);
                    } else if (delta < -8) {
                        setTopbarHiddenByScroll(false);
                    }
                    lastScrollYRef.current = currentY;
                }
            }["TopBar.useEffect.handleScroll"];
            window.addEventListener("scroll", handleScroll, {
                passive: true
            });
            return ({
                "TopBar.useEffect": ()=>{
                    window.removeEventListener("scroll", handleScroll);
                }
            })["TopBar.useEffect"];
        }
    }["TopBar.useEffect"], []);
    async function handleLogout() {
        await runGlobalShutdown(async ()=>{
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clearToken"])();
            setAuthenticated(false);
            setUser(null);
            router.push("/login");
        });
    }
    function clearQueueBadge(moduleKey, options) {
        if ("TURBOPACK compile-time truthy", 1) {
            try {
                const storageKey = moduleKey === "atendimento" ? ATENDIMENTO_QUEUE_STORAGE_KEY : RECOVERY_QUEUE_STORAGE_KEY;
                const eventName = moduleKey === "atendimento" ? ATENDIMENTO_HUMAN_QUEUE_EVENT : RECOVERY_HUMAN_QUEUE_EVENT;
                window.localStorage.setItem(storageKey, "0");
                window.dispatchEvent(new CustomEvent(eventName, {
                    detail: {
                        count: 0
                    }
                }));
            } catch  {
            // ignore storage/event errors
            }
        }
        if (moduleKey === "atendimento") {
            setAtendimentoPendingHumanCount(0);
        } else {
            setRecoveryPendingHumanCount(0);
        }
        if (options?.dismissPopup && incomingPopup && (moduleKey === "atendimento" && incomingPopup.href === "/dashboard/inbox" || moduleKey === "recovery" && incomingPopup.href === "/hbx-recovery")) {
            setIncomingPopup(null);
        }
    }
    function handleQueueShortcut(moduleKey) {
        clearQueueBadge(moduleKey, {
            dismissPopup: true
        });
        router.push(moduleKey === "atendimento" ? "/dashboard/inbox" : "/hbx-recovery");
    }
    async function openMasterContextModal() {
        setMasterContextMessage(null);
        setMasterContextModalOpen(true);
        if (masterCompanyOptions.length) return;
        try {
            const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/master/companies");
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
        const selectedCompany = masterCompanyOptions.find((company)=>company.id === companyId) || null;
        if (!companyId) {
            setMasterContextMessage("Selecione uma empresa para assumir contexto.");
            return;
        }
        setMasterContextActionBusy(true);
        setMasterContextMessage(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/master-context/assume", {
                method: "POST",
                body: JSON.stringify({
                    companyId,
                    reason: masterContextReason || undefined
                })
            });
            const [profile, myModules] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
            ]);
            setUser(profile);
            setModules(myModules || []);
            setMasterContextModalOpen(false);
            setMasterContextReason("");
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dispatchMasterContextChanged"])({
                mode: "assumed",
                companyName: profile.masterContext?.companyName || selectedCompany?.name || null
            });
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
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/master-context/exit", {
                method: "POST",
                body: JSON.stringify({
                    reason: "manual_exit"
                })
            });
            const [profile, myModules] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/current-user"),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/modules/me")
            ]);
            setUser(profile);
            setModules(myModules || []);
            setMasterContextModalOpen(false);
            setMasterContextReason("");
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$masterContextEvents$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dispatchMasterContextChanged"])({
                mode: "exited",
                companyName: profile.masterContext?.companyName || null
            });
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
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/profile/password", {
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
    const accountContext = authenticated ? user?.isSystemMaster ? user.masterContext?.active ? `MASTER em ${user.masterContext.companyName || "Empresa"}` : "MASTER GLOBAL" : user?.company?.name || "Operacao sem empresa" : "Plataforma operacional HBX";
    const workspaceBadge = pendingHumanCount > 0 ? `${pendingHumanCount} na fila` : "Fila sob controle";
    if (hiddenRoutes.has(pathname)) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: `app-topbar${topbarHiddenByScroll ? " app-topbar--hidden" : ""}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: topbarFrameRef,
                className: "app-topbar__frame",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "app-topbar__inner",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "app-topbar__left",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: authenticated ? "/dashboard" : "/login",
                                    className: "app-brand",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-brand__mark",
                                            children: "HB"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 867,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-brand__body",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-brand__text",
                                                    children: "HBX Control Center"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 869,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-brand__context",
                                                    children: accountContext
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 870,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 868,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 866,
                                    columnNumber: 13
                                }, this),
                                authenticated && user && !user.isSystemMaster && user.company?.id ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "app-topbar__signals",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: `wa-health-wrap ${atendimentoPendingHumanCount > 0 ? "wa-health-wrap--alert" : ""}`,
                                            onClick: ()=>handleQueueShortcut("atendimento"),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `wa-health wa-health--${whatsAppHealth}`,
                                                    title: `${whatsAppHealthLabel} · Atendimento: ${atendimentoPendingHumanCount}`,
                                                    "aria-label": `${whatsAppHealthLabel} · Atendimento: ${atendimentoPendingHumanCount}`,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                        viewBox: "0 0 24 24",
                                                        "aria-hidden": "true",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                            d: "M19.1 4.9A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 19.1 4.9Zm-7.1 15.4a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.2c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1-.1.2-.5.7-.6.8-.1.1-.2.1-.4 0s-.9-.3-1.7-1a6.4 6.4 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.3.2-.3c.1-.1.1-.3 0-.4L10.4 8c-.1-.2-.3-.2-.4-.2h-.4c-.1 0-.4.1-.5.3-.2.2-.7.7-.7 1.6 0 1 .7 1.9.8 2 .1.1 1.3 2 3.2 2.8.5.2.9.4 1.2.5.5.1 1 .1 1.4.1.4-.1 1.2-.5 1.4-1 .2-.6.2-1 .1-1.1 0-.1-.2-.1-.4-.2Z"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 887,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TopBar.tsx",
                                                        lineNumber: 886,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 881,
                                                    columnNumber: 19
                                                }, this),
                                                atendimentoPendingHumanCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "wa-health__queue-badge",
                                                    "aria-hidden": "true",
                                                    children: atendimentoPendingHumanCount
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 891,
                                                    columnNumber: 21
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 876,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: `wa-health-wrap ${recoveryPendingHumanCount > 0 ? "wa-health-wrap--alert" : ""}`,
                                            onClick: ()=>handleQueueShortcut("recovery"),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `wa-health wa-health--${whatsAppHealth}`,
                                                    title: `${whatsAppHealthLabel} · Recovery: ${recoveryPendingHumanCount}`,
                                                    "aria-label": `${whatsAppHealthLabel} · Recovery: ${recoveryPendingHumanCount}`,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                        viewBox: "0 0 24 24",
                                                        "aria-hidden": "true",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                            d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 14.5V18h-2v-1.5A4 4 0 1 1 13 16.5z"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 908,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/TopBar.tsx",
                                                        lineNumber: 907,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 902,
                                                    columnNumber: 19
                                                }, this),
                                                recoveryPendingHumanCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "wa-health__queue-badge",
                                                    "aria-hidden": "true",
                                                    children: recoveryPendingHumanCount
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 912,
                                                    columnNumber: 21
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 897,
                                            columnNumber: 17
                                        }, this),
                                        queueLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "app-topbar__queueLabel",
                                            children: queueLabel
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 918,
                                            columnNumber: 31
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 875,
                                    columnNumber: 15
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 865,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "app-topbar__center",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "app-topbar__summary",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "app-topbar__summaryLabel",
                                            children: "Workspace ativo"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 925,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            children: "HBX Workspace"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 926,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 924,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "app-topbar__metaGrid",
                                    "aria-label": "Resumo rapido do shell",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "app-topbar__metaPill",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                children: workspaceBadge
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/TopBar.tsx",
                                                lineNumber: 930,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: "Fila"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/TopBar.tsx",
                                                lineNumber: 931,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/TopBar.tsx",
                                        lineNumber: 929,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 928,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 923,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "app-topbar__right",
                            children: [
                                authenticated && user?.isSystemMaster ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: openMasterContextModal,
                                    children: "Contexto"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 938,
                                    columnNumber: 15
                                }, this) : null,
                                authenticated && user?.isSystemMaster && user.masterContext?.active ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: exitMasterContext,
                                    disabled: masterContextActionBusy,
                                    children: "Sair contexto"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 947,
                                    columnNumber: 15
                                }, this) : null,
                                authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeSwitcher$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 956,
                                    columnNumber: 30
                                }, this) : null,
                                user ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    ref: userMenuRef,
                                    className: "app-user",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "app-user__trigger",
                                            onClick: ()=>setOpen((value)=>!value),
                                            "aria-expanded": open,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-user__avatar",
                                                    children: user.username ? user.username.charAt(0).toUpperCase() : "U"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 965,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "app-user__meta",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "app-user__name",
                                                            children: user.username
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 969,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "app-user__company",
                                                            children: user.isSystemMaster ? user.masterContext?.active ? `MASTER em ${user.masterContext.companyName || "Empresa"}` : "MASTER" : user.company?.name ?? "Sem empresa"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 970,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 968,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 959,
                                            columnNumber: 17
                                        }, this),
                                        open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "app-user__menu",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "app-user__menu-title",
                                                    children: "Editar senha"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 982,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                                    onSubmit: handlePasswordSubmit,
                                                    className: "app-user__form",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            type: "password",
                                                            placeholder: "Senha atual",
                                                            value: curPass,
                                                            onChange: (event)=>setCurPass(event.target.value),
                                                            className: "field"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 984,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            type: "password",
                                                            placeholder: "Nova senha (min. 4)",
                                                            value: newPass,
                                                            onChange: (event)=>setNewPass(event.target.value),
                                                            className: "field"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 991,
                                                            columnNumber: 23
                                                        }, this),
                                                        changeMsg ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-muted leading-5",
                                                            children: changeMsg
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 998,
                                                            columnNumber: 36
                                                        }, this) : null,
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "app-user__menu-actions",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "submit",
                                                                    className: "btn btn-primary btn-sm",
                                                                    disabled: changing || newPass.length < 4,
                                                                    children: changing ? "Salvando..." : "Salvar senha"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                                    lineNumber: 1000,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    className: "btn btn-secondary btn-sm",
                                                                    onClick: ()=>setOpen(false),
                                                                    children: "Fechar"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                                    lineNumber: 1007,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/TopBar.tsx",
                                                            lineNumber: 999,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 983,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 981,
                                            columnNumber: 19
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 958,
                                    columnNumber: 15
                                }, this) : null,
                                authenticated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            title: "Restaurar layout original de todas as janelas",
                                            onClick: ()=>{
                                                if ("TURBOPACK compile-time truthy", 1) {
                                                    window.localStorage.removeItem("hbx:ui-prefs");
                                                    void (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/users/me/ui-preferences/reset", {
                                                        method: "PATCH"
                                                    }).catch(()=>undefined);
                                                    window.dispatchEvent(new CustomEvent("hbx-reset-layout"));
                                                }
                                            },
                                            style: {
                                                fontSize: "0.7rem",
                                                padding: "0.2rem 0.55rem",
                                                minHeight: "28px",
                                                opacity: 0.72
                                            },
                                            children: "ResetLayout"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1023,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>{
                                                void handleLogout();
                                            },
                                            className: "btn btn-secondary btn-sm",
                                            disabled: isShuttingDown,
                                            children: isShuttingDown ? "Saindo..." : "Sair"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1038,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/login",
                                    className: "btn btn-secondary btn-sm",
                                    children: "Entrar"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1050,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 936,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/TopBar.tsx",
                    lineNumber: 864,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 863,
                columnNumber: 7
            }, this),
            incomingPopup ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "incoming-alert",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "incoming-alert__header",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "incoming-alert__eyebrow",
                                        children: incomingPopup.moduleLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/TopBar.tsx",
                                        lineNumber: 1064,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "incoming-alert__title",
                                        children: incomingPopup.attentionLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/TopBar.tsx",
                                        lineNumber: 1065,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "incoming-alert__customer",
                                        children: incomingPopup.customerLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/TopBar.tsx",
                                        lineNumber: 1066,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 1063,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-secondary btn-sm",
                                onClick: ()=>setIncomingPopup(null),
                                children: "Fechar"
                            }, void 0, false, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 1068,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 1062,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "incoming-alert__meta",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                children: [
                                    "Contato: ",
                                    incomingPopup.contactPhone
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 1078,
                                columnNumber: 13
                            }, this),
                            incomingPopup.entryNumberLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                children: [
                                    "Recebido em: ",
                                    incomingPopup.entryNumberLabel
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 1080,
                                columnNumber: 15
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 1077,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "incoming-alert__preview",
                        children: incomingPopup.preview
                    }, void 0, false, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 1084,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "incoming-alert__actions",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                href: incomingPopup.href,
                                className: "btn btn-primary btn-sm",
                                onClick: ()=>setIncomingPopup(null),
                                children: "Abrir módulo"
                            }, void 0, false, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 1087,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn btn-secondary btn-sm",
                                onClick: ()=>setIncomingPopup(null),
                                children: "Dispensar"
                            }, void 0, false, {
                                fileName: "[project]/src/components/TopBar.tsx",
                                lineNumber: 1094,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 1086,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 1061,
                columnNumber: 9
            }, this) : null,
            masterContextToast ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    position: "fixed",
                    top: 84,
                    right: 20,
                    zIndex: 145,
                    maxWidth: 360,
                    padding: "12px 14px",
                    borderRadius: 18,
                    border: "1px solid rgba(20, 122, 108, 0.18)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(238,247,244,0.98))",
                    boxShadow: "0 18px 40px rgba(14, 30, 37, 0.14)",
                    color: "#17313a",
                    display: "grid",
                    gap: 4
                },
                "aria-live": "polite",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: "#147a6c"
                        },
                        children: "Contexto atualizado"
                    }, void 0, false, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 1124,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                        style: {
                            fontSize: 14,
                            lineHeight: 1.4
                        },
                        children: masterContextToast
                    }, void 0, false, {
                        fileName: "[project]/src/components/TopBar.tsx",
                        lineNumber: 1127,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 1106,
                columnNumber: 9
            }, this) : null,
            masterContextModalOpen && authenticated && user?.isSystemMaster ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    position: "fixed",
                    inset: 0,
                    zIndex: 150,
                    background: "rgba(6, 19, 38, 0.42)",
                    display: "grid",
                    placeItems: "center",
                    padding: "16px"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "panel",
                    style: {
                        width: "min(620px, 100%)",
                        padding: 16
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-start justify-between gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs uppercase tracking-[0.12em] text-muted",
                                            children: "Suporte interno MASTER"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1146,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "mt-1 text-lg font-semibold",
                                            children: "Assumir contexto da empresa"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1147,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1145,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "btn btn-secondary btn-sm",
                                    onClick: ()=>setMasterContextModalOpen(false),
                                    children: "Fechar"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1149,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 1144,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-4 grid gap-3",
                            children: [
                                masterContextMessage ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "alert alert-error",
                                    children: masterContextMessage
                                }, void 0, false, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1156,
                                    columnNumber: 17
                                }, this) : null,
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "grid gap-1 text-sm",
                                    children: [
                                        "Empresa",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            className: "field",
                                            value: selectedMasterCompanyId,
                                            onChange: (event)=>setSelectedMasterCompanyId(event.target.value),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "",
                                                    children: "Selecione..."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/TopBar.tsx",
                                                    lineNumber: 1166,
                                                    columnNumber: 19
                                                }, this),
                                                masterCompanyOptions.map((company)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
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
                                                        lineNumber: 1168,
                                                        columnNumber: 21
                                                    }, this))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1161,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1159,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "grid gap-1 text-sm",
                                    children: [
                                        "Motivo (opcional)",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                            className: "field",
                                            rows: 3,
                                            value: masterContextReason,
                                            onChange: (event)=>setMasterContextReason(event.target.value),
                                            placeholder: "Ex.: diagnostico de webhook Meta para empresa X"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1177,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1175,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-primary btn-sm",
                                            onClick: assumeMasterContext,
                                            disabled: masterContextActionBusy,
                                            children: masterContextActionBusy ? "Aplicando..." : "Assumir contexto"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1187,
                                            columnNumber: 17
                                        }, this),
                                        user.masterContext?.active ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "btn btn-secondary btn-sm",
                                            onClick: exitMasterContext,
                                            disabled: masterContextActionBusy,
                                            children: "Sair do contexto atual"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/TopBar.tsx",
                                            lineNumber: 1196,
                                            columnNumber: 19
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/TopBar.tsx",
                                    lineNumber: 1186,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/TopBar.tsx",
                            lineNumber: 1154,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/TopBar.tsx",
                    lineNumber: 1143,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 1132,
                columnNumber: 9
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$TechAssistantGlobalDrawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                isSystemMaster: Boolean(user?.isSystemMaster),
                masterContext: user?.masterContext || null
            }, void 0, false, {
                fileName: "[project]/src/components/TopBar.tsx",
                lineNumber: 1211,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/TopBar.tsx",
        lineNumber: 862,
        columnNumber: 5
    }, this);
}
_s(TopBar, "+amP42AbSJYVccE5GZF11dtwaac=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$InterfaceTransitionProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useInterfaceTransition"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ThemeProvider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHbxTheme"]
    ];
});
_c = TopBar;
var _c;
__turbopack_context__.k.register(_c, "TopBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_075ed9e9._.js.map
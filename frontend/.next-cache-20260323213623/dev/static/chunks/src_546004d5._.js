(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/useLoginColdStart.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useLoginColdStart",
    ()=>useLoginColdStart
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
;
function useLoginColdStart(options) {
    _s();
    const { apiUrl, wakingThresholdMs = 3000, maxRetries = 3, retryBackoffMs = 1000 } = options;
    const timeoutRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const abortControllerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const retryCountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    // Limpar resources ao desmontar
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useLoginColdStart.useEffect": ()=>{
            return ({
                "useLoginColdStart.useEffect": ()=>{
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    if (abortControllerRef.current) abortControllerRef.current.abort();
                }
            })["useLoginColdStart.useEffect"];
        }
    }["useLoginColdStart.useEffect"], []);
    /**
   * Faz health check rápido do backend
   */ const checkHealth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useLoginColdStart.useCallback[checkHealth]": async (timeoutMs = 2000)=>{
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout({
                    "useLoginColdStart.useCallback[checkHealth].timeoutId": ()=>controller.abort()
                }["useLoginColdStart.useCallback[checkHealth].timeoutId"], timeoutMs);
                const res = await fetch(`${apiUrl}/health`, {
                    signal: controller.signal
                }).catch({
                    "useLoginColdStart.useCallback[checkHealth]": ()=>null
                }["useLoginColdStart.useCallback[checkHealth]"]);
                clearTimeout(timeoutId);
                return res?.ok ?? false;
            } catch  {
                return false;
            }
        }
    }["useLoginColdStart.useCallback[checkHealth]"], [
        apiUrl
    ]);
    /**
   * Realiza tentativa de login com controle de tempo
   */ const attemptLogin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useLoginColdStart.useCallback[attemptLogin]": async (username, password, getCurrentState)=>{
            const startTime = Date.now();
            try {
                abortControllerRef.current = new AbortController();
                const loginPromise = fetch(`${apiUrl}/auth/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username,
                        password
                    }),
                    signal: abortControllerRef.current.signal
                }).then({
                    "useLoginColdStart.useCallback[attemptLogin].loginPromise": async (res)=>{
                        const elapsedMs = Date.now() - startTime;
                        const data = await res.json().catch({
                            "useLoginColdStart.useCallback[attemptLogin].loginPromise": ()=>null
                        }["useLoginColdStart.useCallback[attemptLogin].loginPromise"]);
                        if (!res.ok) {
                            // Erros transitórios típicos de cold start
                            if ([
                                502,
                                503,
                                504
                            ].includes(res.status)) {
                                return {
                                    state: "waking_server",
                                    message: "Servidor acordando...",
                                    needsRetry: true,
                                    data: null
                                };
                            }
                            // Erros de autenticação
                            if (res.status === 404) {
                                return {
                                    state: "error",
                                    message: "Usuário inexistente",
                                    data: null
                                };
                            }
                            if (res.status === 401) {
                                return {
                                    state: "error",
                                    message: data?.message ?? "Senha incorreta",
                                    data: null
                                };
                            }
                            // Outros erros
                            return {
                                state: "error",
                                message: data?.message || data?.error || "Erro ao autenticar. Verifique suas credenciais.",
                                data: null
                            };
                        }
                        // Sucesso
                        const token = data?.access_token || data?.accessToken || data?.token;
                        if (!token) {
                            return {
                                state: "error",
                                message: "Login falhou: token não recebido",
                                data: null
                            };
                        }
                        return {
                            state: "success",
                            message: undefined,
                            data: {
                                token,
                                elapsedMs
                            }
                        };
                    }
                }["useLoginColdStart.useCallback[attemptLogin].loginPromise"]);
                // Aguardar a resposta com timeout
                const result = await Promise.race([
                    loginPromise,
                    new Promise({
                        "useLoginColdStart.useCallback[attemptLogin]": (resolve)=>{
                            timeoutRef.current = setTimeout({
                                "useLoginColdStart.useCallback[attemptLogin]": ()=>{
                                    resolve({
                                        state: "waking_server",
                                        message: "Servidor acordando...",
                                        needsRetry: true
                                    });
                                }
                            }["useLoginColdStart.useCallback[attemptLogin]"], wakingThresholdMs);
                        }
                    }["useLoginColdStart.useCallback[attemptLogin]"])
                ]);
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
                return result;
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") {
                    return {
                        state: "error",
                        message: "Login cancelado",
                        data: null
                    };
                }
                return {
                    state: "waking_server",
                    message: "Falha ao conectar. Tentando reconectar...",
                    needsRetry: true,
                    data: null
                };
            }
        }
    }["useLoginColdStart.useCallback[attemptLogin]"], [
        apiUrl,
        wakingThresholdMs
    ]);
    /**
   * Realiza login com retry automático para cold start
   */ const executeLoginWithRetry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useLoginColdStart.useCallback[executeLoginWithRetry]": async (username, password, onPhaseUpdate)=>{
            retryCountRef.current = 0;
            onPhaseUpdate?.({
                state: "submitting"
            });
            while(retryCountRef.current < maxRetries){
                const response = await attemptLogin(username, password, {
                    "useLoginColdStart.useCallback[executeLoginWithRetry]": ()=>"submitting"
                }["useLoginColdStart.useCallback[executeLoginWithRetry]"]);
                if (response.state === "success" || response.state === "error") {
                    retryCountRef.current = 0;
                    return response;
                }
                // Se for "waking_server" e temos retries
                if (response.needsRetry && retryCountRef.current < maxRetries - 1) {
                    onPhaseUpdate?.({
                        state: "waking_server",
                        message: response.message ?? "Estamos iniciando o ambiente seguro. A primeira conexao pode levar alguns segundos."
                    });
                    retryCountRef.current++;
                    // Aguardar com backoff exponencial
                    const delay = retryBackoffMs * Math.pow(1.5, retryCountRef.current - 1);
                    await new Promise({
                        "useLoginColdStart.useCallback[executeLoginWithRetry]": (resolve)=>{
                            timeoutRef.current = setTimeout(resolve, delay);
                        }
                    }["useLoginColdStart.useCallback[executeLoginWithRetry]"]);
                    // Fazer health check antes de retry
                    const isHealthy = await checkHealth(2000);
                    if (!isHealthy) {
                        continue;
                    }
                } else {
                    break;
                }
            }
            retryCountRef.current = 0;
            return {
                state: "error",
                message: "Servidor ainda está iniciando. Tente novamente em alguns segundos.",
                data: null
            };
        }
    }["useLoginColdStart.useCallback[executeLoginWithRetry]"], [
        attemptLogin,
        checkHealth,
        maxRetries,
        retryBackoffMs
    ]);
    /**
   * Cancelar requisição em progresso
   */ const cancel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useLoginColdStart.useCallback[cancel]": ()=>{
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        }
    }["useLoginColdStart.useCallback[cancel]"], []);
    return {
        executeLoginWithRetry,
        checkHealth,
        cancel
    };
}
_s(useLoginColdStart, "8EvJLPKxkWpocvkB7flBuFR6SJM=");
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
"[project]/src/app/login/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LoginPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$useLoginColdStart$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/useLoginColdStart.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$websiteLaunch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/websiteLaunch.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
const API_URL = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
function buildLoginParticleStyle(index) {
    return {
        "--i": index,
        "--home-x": `${(index % 13 - 6) * 44}px`,
        "--home-y": `${(index % 9 - 4) * 44}px`,
        "--far-x": `${(index % 13 - 6) * 160}px`,
        "--far-y": `${(index % 9 - 4) * 140}px`,
        "--near-x": `${(index % 7 - 3) * 28}px`,
        "--near-y": `${(index % 6 - 3) * 28}px`,
        "--drift-x": `${(index % 11 - 5) * 62}px`,
        "--drift-y": `${(index % 8 - 4) * 62}px`,
        "--exit-x": `${(index % 13 - 6) * 122}px`,
        "--exit-y": `${(index % 10 - 5) * 122}px`
    };
}
function getErrorMessage(data) {
    if (!data || typeof data !== "object") return null;
    const payload = data;
    if (Array.isArray(payload.message)) return payload.message.join(", ");
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
    return null;
}
function LoginPage() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const { executeLoginWithRetry, cancel: cancelLogin } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$useLoginColdStart$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLoginColdStart"])({
        apiUrl: API_URL,
        wakingThresholdMs: 3000,
        maxRetries: 3,
        retryBackoffMs: 1000
    });
    const [username, setUsername] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [recoveryEmail, setRecoveryEmail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [password, setPassword] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [info, setInfo] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [wakingMessage, setWakingMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loginState, setLoginState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("idle");
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [playingWelcome, setPlayingWelcome] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [visualsPlayOnLoad, setVisualsPlayOnLoad] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [mode, setMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("login");
    const [preRegistered, setPreRegistered] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [countdown, setCountdown] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const countdownRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const countdownIntervalRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Helper para traduzir estado de login para UI
    const isSubmitting = loginState === "submitting" || loginState === "waking_server";
    const isWakingServer = loginState === "waking_server";
    const isSuccess = loginState === "success";
    async function handleLogin(event) {
        event.preventDefault();
        setError(null);
        setInfo(null);
        setWakingMessage(null);
        setLoginState("submitting");
        try {
            const result = await executeLoginWithRetry(username, password, (phase)=>{
                if (phase.state === "waking_server") {
                    setWakingMessage(phase.message ?? "Estamos iniciando o ambiente seguro. A primeira conexao pode levar alguns segundos.");
                    setLoginState("waking_server");
                    return;
                }
                if (phase.state === "submitting") {
                    setLoginState("submitting");
                }
            });
            if (result.state === "success") {
                const token = result.data?.token;
                if (!token) {
                    setError("Login falhou: token não recebido");
                    setLoginState("error");
                    return;
                }
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["setToken"])(token);
                setLoginState("success");
                // Play welcome animation
                let handledRedirect = false;
                try {
                    setPlayingWelcome(true);
                    await new Promise((res)=>setTimeout(res, 900));
                    const destination = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$websiteLaunch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveWebsiteOnlyDestination"])();
                    if (destination) {
                        handledRedirect = true;
                        if (/^https?:\/\//i.test(destination)) {
                            window.location.assign(destination);
                        } else {
                            router.replace(destination);
                        }
                        return;
                    }
                } finally{
                    if (!handledRedirect) {
                        router.replace("/dashboard");
                    }
                }
                // Programmatic login routine used after reload/auto-login
                async function doLoginProgrammatic(u, p) {
                    setError(null);
                    setInfo(null);
                    setWakingMessage(null);
                    setLoginState("submitting");
                    try {
                        const result = await executeLoginWithRetry(u, p, (phase)=>{
                            if (phase.state === "waking_server") {
                                setWakingMessage(phase.message ?? "Estamos iniciando o ambiente seguro. A primeira conexao pode levar alguns segundos.");
                                setLoginState("waking_server");
                                return;
                            }
                            if (phase.state === "submitting") {
                                setLoginState("submitting");
                            }
                        });
                        if (result.state === "success") {
                            const token = result.data?.token;
                            if (!token) {
                                setError("Login falhou: token não recebido");
                                setLoginState("error");
                                return;
                            }
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["setToken"])(token);
                            setLoginState("success");
                            let handledRedirect = false;
                            try {
                                setPlayingWelcome(true);
                                await new Promise((res)=>setTimeout(res, 900));
                                const destination = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$websiteLaunch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveWebsiteOnlyDestination"])();
                                if (destination) {
                                    handledRedirect = true;
                                    if (/^https?:\/\//i.test(destination)) {
                                        window.location.assign(destination);
                                    } else {
                                        router.replace(destination);
                                    }
                                    return;
                                }
                            } finally{
                                if (!handledRedirect) {
                                    router.replace("/dashboard");
                                }
                            }
                        } else if (result.state === "error") {
                            setError(result.message ?? "Erro ao autenticar");
                            setLoginState("error");
                        } else if (result.state === "waking_server") {
                            setWakingMessage(result.message ?? "Estamos iniciando o ambiente seguro. A primeira conexão pode levar alguns segundos.");
                            setLoginState("waking_server");
                        }
                    } catch (err) {
                        setError("Falha ao conectar no backend");
                        setLoginState("error");
                    }
                }
                // Inicia contagem regressiva quando detectamos waking_server
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
                    "LoginPage.handleLogin.useEffect": ()=>{
                        if (loginState !== "waking_server") {
                            // limpar contagem se não estiver em waking
                            if (countdownIntervalRef.current) {
                                window.clearInterval(countdownIntervalRef.current);
                                countdownIntervalRef.current = null;
                            }
                            countdownRef.current = null;
                            setCountdown(null);
                            return;
                        }
                        // já rodando
                        if (countdownRef.current !== null) return;
                        // iniciar 49s
                        countdownRef.current = 49;
                        setCountdown(49);
                        countdownIntervalRef.current = window.setInterval({
                            "LoginPage.handleLogin.useEffect": ()=>{
                                if (countdownRef.current === null) return;
                                countdownRef.current = countdownRef.current - 1;
                                setCountdown(countdownRef.current);
                                if (countdownRef.current <= 0) {
                                    // salvar credenciais temporariamente e recarregar a página para tentar novamente
                                    try {
                                        sessionStorage.setItem("hbx_auto_login", JSON.stringify({
                                            username: username || "",
                                            password: password || ""
                                        }));
                                    } catch  {
                                    // ignore
                                    }
                                    window.location.reload();
                                }
                            }
                        }["LoginPage.handleLogin.useEffect"], 1000);
                        return ({
                            "LoginPage.handleLogin.useEffect": ()=>{
                                if (countdownIntervalRef.current) {
                                    window.clearInterval(countdownIntervalRef.current);
                                    countdownIntervalRef.current = null;
                                }
                            }
                        })["LoginPage.handleLogin.useEffect"];
                    }
                }["LoginPage.handleLogin.useEffect"], [
                    loginState,
                    password,
                    username
                ]);
                // Ao montar, verificar se tem auto-login pendente (de reload)
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
                    "LoginPage.handleLogin.useEffect": ()=>{
                        try {
                            const raw = sessionStorage.getItem("hbx_auto_login");
                            if (!raw) return;
                            sessionStorage.removeItem("hbx_auto_login");
                            const parsed = JSON.parse(raw || "{}");
                            if (parsed?.username) {
                                const restoredUsername = parsed.username;
                                setUsername(restoredUsername);
                                setPassword(parsed.password ?? "");
                                // aguardar um tick para o componente estabilizar
                                setTimeout({
                                    "LoginPage.handleLogin.useEffect": ()=>{
                                        doLoginProgrammatic(restoredUsername, parsed.password ?? "");
                                    }
                                }["LoginPage.handleLogin.useEffect"], 200);
                            }
                        } catch  {
                        // ignore parse errors
                        }
                    }
                }["LoginPage.handleLogin.useEffect"], []);
            } else if (result.state === "error") {
                setError(result.message ?? "Erro ao autenticar");
                setLoginState("error");
                // Verificar se precisa de primeiro acesso
                if (result.data && typeof result.data === "object" && Boolean(result.data.needsRegistration)) {
                    try {
                        localStorage.setItem("firstAccess", JSON.stringify({
                            username,
                            message: result.message ?? "Complete seu cadastro."
                        }));
                    } catch  {
                    // ignore localStorage errors
                    }
                    setTimeout(()=>router.push("/register"), 2000);
                }
            } else if (result.state === "waking_server") {
                setWakingMessage(result.message ?? "Estamos iniciando o ambiente seguro. A primeira conexão pode levar alguns segundos.");
                setLoginState("waking_server");
            }
        } catch (err) {
            setError("Falha ao conectar no backend");
            setLoginState("error");
        }
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "LoginPage.useEffect": ()=>{
            let cancelled = false;
            const normalized = username.trim();
            if (!normalized) {
                setPreRegistered(false);
                return;
            }
            const timeout = setTimeout({
                "LoginPage.useEffect.timeout": async ()=>{
                    try {
                        const res = await fetch(`${API_URL}/users/check-username?username=${encodeURIComponent(normalized)}`);
                        if (!res.ok) {
                            if (!cancelled) setPreRegistered(false);
                            return;
                        }
                        const data = await res.json().catch({
                            "LoginPage.useEffect.timeout": ()=>null
                        }["LoginPage.useEffect.timeout"]);
                        if (!cancelled && data && typeof data === "object") {
                            setPreRegistered(Boolean(data.preRegistered));
                        }
                    } catch  {
                        if (!cancelled) setPreRegistered(false);
                    }
                }
            }["LoginPage.useEffect.timeout"], 300);
            return ({
                "LoginPage.useEffect": ()=>{
                    cancelled = true;
                    clearTimeout(timeout);
                }
            })["LoginPage.useEffect"];
        }
    }["LoginPage.useEffect"], [
        username
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "LoginPage.useEffect": ()=>{
            setMounted(true);
            // trigger visuals animation when the page first mounts
            setVisualsPlayOnLoad(true);
            const t = setTimeout({
                "LoginPage.useEffect.t": ()=>setVisualsPlayOnLoad(false)
            }["LoginPage.useEffect.t"], 2200);
            return ({
                "LoginPage.useEffect": ()=>{
                    clearTimeout(t);
                    setMounted(false);
                    // Cleanup login if component unmounts
                    if (loginState === "submitting" || loginState === "waking_server") {
                        cancelLogin();
                    }
                }
            })["LoginPage.useEffect"];
        }
    }["LoginPage.useEffect"], [
        cancelLogin,
        loginState
    ]);
    async function handleRecoverByEmail(event) {
        event.preventDefault();
        setError(null);
        setInfo(null);
        setLoginState("submitting");
        try {
            const res = await fetch(`${API_URL}/auth/recover-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: recoveryEmail
                })
            });
            const data = await res.json().catch(()=>null);
            if (!res.ok) {
                setError(getErrorMessage(data) ?? "Erro na recuperação.");
                setLoginState("error");
                return;
            }
            setInfo("Se o e-mail existir, enviaremos um link de redefinição.");
            setLoginState("idle");
            setMode("login");
        } catch  {
            setError("Falha ao conectar no backend");
            setLoginState("error");
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "min-h-screen flex items-center justify-center p-6 relative overflow-hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "login-visuals",
                "aria-hidden": true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `login-visuals ${playingWelcome || visualsPlayOnLoad ? "play" : ""}`,
                    "aria-hidden": true,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "login-drop"
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 393,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "login-drop login-drop-bottom"
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 394,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "login-drop login-drop-left"
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 395,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "login-drop login-drop-right"
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 396,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "login-meteor",
                            style: {
                                left: "12%",
                                animationDelay: "120ms"
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 397,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "login-meteor",
                            style: {
                                left: "28%",
                                animationDelay: "420ms"
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 398,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "login-meteor",
                            style: {
                                left: "68%",
                                animationDelay: "220ms"
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 399,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "login-meteor",
                            style: {
                                left: "84%",
                                animationDelay: "640ms"
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 400,
                            columnNumber: 11
                        }, this),
                        Array.from({
                            length: 60
                        }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                className: "login-confetti__piece",
                                style: buildLoginParticleStyle(i)
                            }, i, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 402,
                                columnNumber: 13
                            }, this))
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/login/page.tsx",
                    lineNumber: 392,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/login/page.tsx",
                lineNumber: 391,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `container-sm login-card w-full p-6 card transition-all duration-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"} ${playingWelcome ? "is-exploding" : ""}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mb-2 flex justify-end",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "page-overline",
                            children: "Acesso seguro HBX"
                        }, void 0, false, {
                            fileName: "[project]/src/app/login/page.tsx",
                            lineNumber: 413,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/login/page.tsx",
                        lineNumber: 412,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-2xl font-bold mb-6",
                        children: "Login"
                    }, void 0, false, {
                        fileName: "[project]/src/app/login/page.tsx",
                        lineNumber: 415,
                        columnNumber: 9
                    }, this),
                    mode === "login" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                        onSubmit: handleLogin,
                        className: "space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-sm font-medium",
                                        children: "Usuário"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/login/page.tsx",
                                        lineNumber: 420,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        className: "input mt-1",
                                        value: username,
                                        onChange: (event)=>setUsername(event.target.value),
                                        placeholder: "meuusuario",
                                        required: true,
                                        autoComplete: "username"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/login/page.tsx",
                                        lineNumber: 421,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 419,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-sm font-medium",
                                        children: "Senha"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/login/page.tsx",
                                        lineNumber: 432,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "password",
                                        className: "input mt-1",
                                        value: password,
                                        onChange: (event)=>setPassword(event.target.value),
                                        placeholder: "1234",
                                        required: true,
                                        autoComplete: "current-password"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/login/page.tsx",
                                        lineNumber: 433,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 431,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "text-sm underline text-foreground/70",
                                    onClick: ()=>setMode("forgot"),
                                    children: "Esqueci minha senha"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 445,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 444,
                                columnNumber: 13
                            }, this),
                            info ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "msg-info",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm",
                                    children: info
                                }, void 0, false, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 456,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 455,
                                columnNumber: 15
                            }, this) : null,
                            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "msg-error",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm",
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 462,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 461,
                                columnNumber: 15
                            }, this) : null,
                            isWakingServer ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "msg-waking-server",
                                "aria-live": "polite",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "spinner-waking",
                                            "aria-hidden": true
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/login/page.tsx",
                                            lineNumber: 469,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm font-medium",
                                                    children: "Ambiente em inicialização"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/login/page.tsx",
                                                    lineNumber: 471,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs opacity-75",
                                                    children: wakingMessage
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/login/page.tsx",
                                                    lineNumber: 472,
                                                    columnNumber: 21
                                                }, this),
                                                countdown !== null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs opacity-60",
                                                    children: [
                                                        "Recarregando em ",
                                                        countdown,
                                                        "s"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/login/page.tsx",
                                                    lineNumber: 474,
                                                    columnNumber: 23
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/login/page.tsx",
                                            lineNumber: 470,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 468,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 467,
                                columnNumber: 15
                            }, this) : null,
                            preRegistered ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "msg-info",
                                "aria-live": "polite",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm",
                                    children: [
                                        "Encontramos um primeiro acesso pendente para este usuário. Continue em ",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            children: "Registrar"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/login/page.tsx",
                                            lineNumber: 484,
                                            columnNumber: 90
                                        }, this),
                                        " para finalizar seu cadastro sem perder o contexto."
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 483,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 482,
                                columnNumber: 15
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                disabled: isSubmitting,
                                type: preRegistered ? "button" : "submit",
                                onClick: preRegistered ? ()=>{
                                    try {
                                        localStorage.setItem("firstAccess", JSON.stringify({
                                            username,
                                            message: "Complete seu registro"
                                        }));
                                    } catch  {
                                    // ignore localStorage errors
                                    }
                                    router.push("/register");
                                } : undefined,
                                className: `btn ${preRegistered ? "btn-secondary w-full mt-2" : "btn btn-primary w-full mt-2 transition-all duration-300"} ${isWakingServer ? "opacity-75" : ""} ${isSuccess ? "btn-auth-success" : ""}`,
                                "aria-live": "polite",
                                children: !preRegistered && isSuccess ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "btn-auth-success__content",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "btn-auth-success__bar",
                                            "aria-hidden": true
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/login/page.tsx",
                                            lineNumber: 515,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "btn-auth-success__label",
                                            children: "Autenticado"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/login/page.tsx",
                                            lineNumber: 516,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 514,
                                    columnNumber: 17
                                }, this) : isWakingServer ? "Iniciando ambiente..." : isSubmitting ? preRegistered ? "Aguarde..." : "Autenticando..." : preRegistered ? "Registrar" : "Entrar"
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 489,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/login/page.tsx",
                        lineNumber: 418,
                        columnNumber: 11
                    }, this),
                    mode === "forgot" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                        onSubmit: handleRecoverByEmail,
                        className: "space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-sm text-foreground/80",
                                children: "Digite seu e-mail para receber o link de redefinição."
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 533,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-sm font-medium",
                                        children: "E-mail"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/login/page.tsx",
                                        lineNumber: 537,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        className: "input mt-1",
                                        value: recoveryEmail,
                                        onChange: (event)=>setRecoveryEmail(event.target.value),
                                        placeholder: "email@exemplo.com",
                                        required: true,
                                        autoComplete: "email"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/login/page.tsx",
                                        lineNumber: 538,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 536,
                                columnNumber: 13
                            }, this),
                            info ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "msg-info",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm",
                                    children: info
                                }, void 0, false, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 550,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 549,
                                columnNumber: 15
                            }, this) : null,
                            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "msg-error",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm",
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/src/app/login/page.tsx",
                                    lineNumber: 556,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 555,
                                columnNumber: 15
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                disabled: isSubmitting,
                                className: "btn btn-primary w-full mt-2",
                                children: isSubmitting ? "Enviando..." : "Enviar recuperação"
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 560,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "btn w-full mt-2",
                                onClick: ()=>setMode("login"),
                                children: "Voltar"
                            }, void 0, false, {
                                fileName: "[project]/src/app/login/page.tsx",
                                lineNumber: 563,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/login/page.tsx",
                        lineNumber: 532,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/login/page.tsx",
                lineNumber: 407,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/login/page.tsx",
        lineNumber: 390,
        columnNumber: 5
    }, this);
}
_s(LoginPage, "zgOFyn3Mj8P1OosjvEA1wFxHABc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$useLoginColdStart$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLoginColdStart"]
    ];
});
_c = LoginPage;
var _c;
__turbopack_context__.k.register(_c, "LoginPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_546004d5._.js.map
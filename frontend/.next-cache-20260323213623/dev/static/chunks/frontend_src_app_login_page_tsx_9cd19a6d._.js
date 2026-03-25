(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/frontend/src/app/login/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LoginPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/frontend/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/frontend/src/app/dashboard/_lib/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
const API_URL = __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
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
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [username, setUsername] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [recoveryEmail, setRecoveryEmail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [password, setPassword] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [info, setInfo] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [mode, setMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("login");
    const [preRegistered, setPreRegistered] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    async function handleLogin(event) {
        event.preventDefault();
        setError(null);
        setInfo(null);
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username,
                    password
                })
            });
            const data = await res.json().catch(()=>null);
            if (!res.ok) {
                if (data && typeof data === "object" && Boolean(data.needsRegistration)) {
                    try {
                        localStorage.setItem("firstAccess", JSON.stringify({
                            username,
                            message: getErrorMessage(data) ?? "Complete seu cadastro."
                        }));
                    } catch  {
                    // ignore localStorage errors
                    }
                    router.push("/register");
                    return;
                }
                if (res.status === 404) {
                    setError("Usuario inexistente");
                    return;
                }
                if (res.status === 401) {
                    setError(getErrorMessage(data) ?? "Senha incorreta");
                    return;
                }
                setError(getErrorMessage(data) ?? "Nao foi possivel autenticar. Verifique suas credenciais e tente novamente.");
                return;
            }
            const payload = data ?? null;
            const token = typeof payload?.access_token === "string" && payload.access_token || typeof payload?.accessToken === "string" && payload.accessToken || typeof payload?.token === "string" && payload.token;
            if (!token) {
                setError(getErrorMessage(data) ?? "Login nao retornou token.");
                return;
            }
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$src$2f$app$2f$dashboard$2f$_lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["setToken"])(token);
            router.push("/dashboard");
        } catch  {
            setError("Falha ao conectar no backend");
        } finally{
            setLoading(false);
        }
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "LoginPage.useEffect": ()=>{
            setMounted(true);
            return ({
                "LoginPage.useEffect": ()=>setMounted(false)
            })["LoginPage.useEffect"];
        }
    }["LoginPage.useEffect"], []);
    async function handleRecoverByEmail(event) {
        event.preventDefault();
        setError(null);
        setInfo(null);
        setLoading(true);
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
                setError(getErrorMessage(data) ?? "Erro na recuperacao.");
                return;
            }
            setInfo("Se o e-mail existir, enviamos um link de redefinicao.");
            setMode("login");
        } catch  {
            setError("Falha ao conectar no backend");
        } finally{
            setLoading(false);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "min-h-screen flex items-center justify-center p-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: `container-sm w-full p-6 card transition-all duration-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                    className: "text-2xl font-bold mb-6",
                    children: "Login"
                }, void 0, false, {
                    fileName: "[project]/frontend/src/app/login/page.tsx",
                    lineNumber: 183,
                    columnNumber: 9
                }, this),
                mode === "login" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                    onSubmit: handleLogin,
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm font-medium",
                                    children: "Usuario"
                                }, void 0, false, {
                                    fileName: "[project]/frontend/src/app/login/page.tsx",
                                    lineNumber: 188,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "input mt-1",
                                    value: username,
                                    onChange: (event)=>setUsername(event.target.value),
                                    placeholder: "meuusuario",
                                    required: true,
                                    autoComplete: "username"
                                }, void 0, false, {
                                    fileName: "[project]/frontend/src/app/login/page.tsx",
                                    lineNumber: 189,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 187,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm font-medium",
                                    children: "Senha"
                                }, void 0, false, {
                                    fileName: "[project]/frontend/src/app/login/page.tsx",
                                    lineNumber: 200,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "password",
                                    className: "input mt-1",
                                    value: password,
                                    onChange: (event)=>setPassword(event.target.value),
                                    placeholder: "1234",
                                    required: true,
                                    autoComplete: "current-password"
                                }, void 0, false, {
                                    fileName: "[project]/frontend/src/app/login/page.tsx",
                                    lineNumber: 201,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 199,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-between",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "text-sm underline text-foreground/70",
                                onClick: ()=>setMode("forgot"),
                                children: "Esqueci minha senha"
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/app/login/page.tsx",
                                lineNumber: 213,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 212,
                            columnNumber: 13
                        }, this),
                        info ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "msg-info",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm",
                                children: info
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/app/login/page.tsx",
                                lineNumber: 224,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 223,
                            columnNumber: 15
                        }, this) : null,
                        error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "msg-error",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/app/login/page.tsx",
                                lineNumber: 230,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 229,
                            columnNumber: 15
                        }, this) : null,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            disabled: loading,
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
                            className: `btn ${preRegistered ? "btn-secondary w-full mt-2" : "btn btn-primary w-full mt-2"}`,
                            children: loading ? preRegistered ? "Aguarde..." : "Entrando..." : preRegistered ? "Registrar" : "Entrar"
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 234,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/frontend/src/app/login/page.tsx",
                    lineNumber: 186,
                    columnNumber: 11
                }, this),
                mode === "forgot" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                    onSubmit: handleRecoverByEmail,
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm text-foreground/80",
                            children: "Digite seu e-mail para receber o link de redefinicao."
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 270,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm font-medium",
                                    children: "E-mail"
                                }, void 0, false, {
                                    fileName: "[project]/frontend/src/app/login/page.tsx",
                                    lineNumber: 274,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "input mt-1",
                                    value: recoveryEmail,
                                    onChange: (event)=>setRecoveryEmail(event.target.value),
                                    placeholder: "email@exemplo.com",
                                    required: true,
                                    autoComplete: "email"
                                }, void 0, false, {
                                    fileName: "[project]/frontend/src/app/login/page.tsx",
                                    lineNumber: 275,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 273,
                            columnNumber: 13
                        }, this),
                        info ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "msg-info",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm",
                                children: info
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/app/login/page.tsx",
                                lineNumber: 287,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 286,
                            columnNumber: 15
                        }, this) : null,
                        error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "msg-error",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/frontend/src/app/login/page.tsx",
                                lineNumber: 293,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 292,
                            columnNumber: 15
                        }, this) : null,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            disabled: loading,
                            className: "btn btn-primary w-full mt-2",
                            children: loading ? "Enviando..." : "Enviar recuperacao"
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 297,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "btn w-full mt-2",
                            onClick: ()=>setMode("login"),
                            children: "Voltar"
                        }, void 0, false, {
                            fileName: "[project]/frontend/src/app/login/page.tsx",
                            lineNumber: 300,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/frontend/src/app/login/page.tsx",
                    lineNumber: 269,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/frontend/src/app/login/page.tsx",
            lineNumber: 178,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/frontend/src/app/login/page.tsx",
        lineNumber: 177,
        columnNumber: 5
    }, this);
}
_s(LoginPage, "yv/KItXz4Zx/7XlNBlqAM/EoVN4=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$frontend$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
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

//# sourceMappingURL=frontend_src_app_login_page_tsx_9cd19a6d._.js.map
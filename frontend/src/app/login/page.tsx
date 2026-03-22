"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "../dashboard/_lib/api";
import { useLoginColdStart, type LoginState } from "../../lib/useLoginColdStart";
import { resolveWebsiteOnlyDestination } from "../../lib/websiteLaunch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  needsRegistration?: boolean;
};

type LoginParticleStyle = CSSProperties & {
  "--i"?: number;
  "--home-x"?: string;
  "--home-y"?: string;
  "--far-x"?: string;
  "--far-y"?: string;
  "--near-x"?: string;
  "--near-y"?: string;
  "--drift-x"?: string;
  "--drift-y"?: string;
  "--exit-x"?: string;
  "--exit-y"?: string;
};

function buildLoginParticleStyle(index: number): LoginParticleStyle {
  return {
    "--i": index,
    "--home-x": `${((index % 13) - 6) * 44}px`,
    "--home-y": `${((index % 9) - 4) * 44}px`,
    "--far-x": `${((index % 13) - 6) * 160}px`,
    "--far-y": `${((index % 9) - 4) * 140}px`,
    "--near-x": `${((index % 7) - 3) * 28}px`,
    "--near-y": `${((index % 6) - 3) * 28}px`,
    "--drift-x": `${((index % 11) - 5) * 62}px`,
    "--drift-y": `${((index % 8) - 4) * 62}px`,
    "--exit-x": `${((index % 13) - 6) * 122}px`,
    "--exit-y": `${((index % 10) - 5) * 122}px`,
  };
}

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as ApiErrorPayload;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const { executeLoginWithRetry, cancel: cancelLogin } = useLoginColdStart({
    apiUrl: API_URL,
    wakingThresholdMs: 3000,
    maxRetries: 3,
    retryBackoffMs: 1000,
  });

  const [username, setUsername] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wakingMessage, setWakingMessage] = useState<string | null>(null);
  const [loginState, setLoginState] = useState<LoginState>("idle");
  const [mounted, setMounted] = useState(false);
  const [playingWelcome, setPlayingWelcome] = useState(false);
  const [visualsPlayOnLoad, setVisualsPlayOnLoad] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [preRegistered, setPreRegistered] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // Helper para traduzir estado de login para UI
  const isSubmitting = loginState === "submitting" || loginState === "waking_server";
  const isWakingServer = loginState === "waking_server";
  const isSuccess = loginState === "success";

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setWakingMessage(null);
    setLoginState("submitting");

    try {
      const result = await executeLoginWithRetry(username, password, (phase) => {
        if (phase.state === "waking_server") {
          setWakingMessage(
            phase.message ??
              "Estamos iniciando o ambiente seguro. A primeira conexao pode levar alguns segundos."
          );
          setLoginState("waking_server");
          return;
        }

        if (phase.state === "submitting") {
          setLoginState("submitting");
        }
      });

      if (result.state === "success") {
        const token = (result.data as any)?.token;
        if (!token) {
          setError("Login falhou: token não recebido");
          setLoginState("error");
          return;
        }

        setToken(token);
        setLoginState("success");

        // Play welcome animation
        let handledRedirect = false;
        try {
          setPlayingWelcome(true);
          await new Promise((res) => setTimeout(res, 900));
          const destination = await resolveWebsiteOnlyDestination();
          if (destination) {
            handledRedirect = true;
            if (/^https?:\/\//i.test(destination)) {
              window.location.assign(destination);
            } else {
              router.replace(destination);
            }
            return;
          }
        } finally {
          if (!handledRedirect) {
            router.replace("/dashboard");
          }
        }

          // Programmatic login routine used after reload/auto-login
          async function doLoginProgrammatic(u: string, p: string) {
            setError(null);
            setInfo(null);
            setWakingMessage(null);
            setLoginState("submitting");

            try {
              const result = await executeLoginWithRetry(u, p, (phase) => {
                if (phase.state === "waking_server") {
                  setWakingMessage(
                    phase.message ??
                      "Estamos iniciando o ambiente seguro. A primeira conexao pode levar alguns segundos."
                  );
                  setLoginState("waking_server");
                  return;
                }

                if (phase.state === "submitting") {
                  setLoginState("submitting");
                }
              });

              if (result.state === "success") {
                const token = (result.data as any)?.token;
                if (!token) {
                  setError("Login falhou: token não recebido");
                  setLoginState("error");
                  return;
                }

                setToken(token);
                setLoginState("success");
                let handledRedirect = false;
                try {
                  setPlayingWelcome(true);
                  await new Promise((res) => setTimeout(res, 900));
                  const destination = await resolveWebsiteOnlyDestination();
                  if (destination) {
                    handledRedirect = true;
                    if (/^https?:\/\//i.test(destination)) {
                      window.location.assign(destination);
                    } else {
                      router.replace(destination);
                    }
                    return;
                  }
                } finally {
                  if (!handledRedirect) {
                    router.replace("/dashboard");
                  }
                }
              } else if (result.state === "error") {
                setError(result.message ?? "Erro ao autenticar");
                setLoginState("error");
              } else if (result.state === "waking_server") {
                setWakingMessage(
                  result.message ??
                    "Estamos iniciando o ambiente seguro. A primeira conexão pode levar alguns segundos."
                );
                setLoginState("waking_server");
              }
            } catch (err) {
              setError("Falha ao conectar no backend");
              setLoginState("error");
            }
          }

          // Inicia contagem regressiva quando detectamos waking_server
          useEffect(() => {
            if (loginState !== "waking_server") {
              // limpar contagem se não estiver em waking
              if (countdownIntervalRef.current) {
                window.clearInterval(countdownIntervalRef.current as any);
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
            countdownIntervalRef.current = window.setInterval(() => {
              if (countdownRef.current === null) return;
              countdownRef.current = countdownRef.current - 1;
              setCountdown(countdownRef.current);
              if (countdownRef.current <= 0) {
                // salvar credenciais temporariamente e recarregar a página para tentar novamente
                try {
                  sessionStorage.setItem(
                    "hbx_auto_login",
                    JSON.stringify({ username: username || "", password: password || "" })
                  );
                } catch {
                  // ignore
                }
                window.location.reload();
              }
            }, 1000);

            return () => {
              if (countdownIntervalRef.current) {
                window.clearInterval(countdownIntervalRef.current as any);
                countdownIntervalRef.current = null;
              }
            };
          }, [loginState, password, username]);

          // Ao montar, verificar se tem auto-login pendente (de reload)
          useEffect(() => {
            try {
              const raw = sessionStorage.getItem("hbx_auto_login");
              if (!raw) return;
              sessionStorage.removeItem("hbx_auto_login");
              const parsed = JSON.parse(raw || "{}") as { username?: string; password?: string };
              if (parsed?.username) {
                const restoredUsername = parsed.username;
                setUsername(restoredUsername);
                setPassword(parsed.password ?? "");
                // aguardar um tick para o componente estabilizar
                setTimeout(() => {
                  doLoginProgrammatic(restoredUsername, parsed.password ?? "");
                }, 200);
              }
            } catch {
              // ignore parse errors
            }
          }, []);
      } else if (result.state === "error") {
        setError(result.message ?? "Erro ao autenticar");
        setLoginState("error");

        // Verificar se precisa de primeiro acesso
        if (
          result.data &&
          typeof result.data === "object" &&
          Boolean((result.data as ApiErrorPayload).needsRegistration)
        ) {
          try {
            localStorage.setItem(
              "firstAccess",
              JSON.stringify({
                username,
                message: result.message ?? "Complete seu cadastro.",
              })
            );
          } catch {
            // ignore localStorage errors
          }
          setTimeout(() => router.push("/register"), 2000);
        }
      } else if (result.state === "waking_server") {
        setWakingMessage(
          result.message ??
            "Estamos iniciando o ambiente seguro. A primeira conexão pode levar alguns segundos."
        );
        setLoginState("waking_server");
      }
    } catch (err) {
      setError("Falha ao conectar no backend");
      setLoginState("error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const normalized = username.trim();

    if (!normalized) {
      setPreRegistered(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/users/check-username?username=${encodeURIComponent(normalized)}`
        );
        if (!res.ok) {
          if (!cancelled) setPreRegistered(false);
          return;
        }

        const data: unknown = await res.json().catch(() => null);
        if (!cancelled && data && typeof data === "object") {
          setPreRegistered(Boolean((data as { preRegistered?: boolean }).preRegistered));
        }
      } catch {
        if (!cancelled) setPreRegistered(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [username]);

  useEffect(() => {
    setMounted(true);
    // trigger visuals animation when the page first mounts
    setVisualsPlayOnLoad(true);
    const t = setTimeout(() => setVisualsPlayOnLoad(false), 2200);
    return () => {
      clearTimeout(t);
      setMounted(false);
      // Cleanup login if component unmounts
      if (loginState === "submitting" || loginState === "waking_server") {
        cancelLogin();
      }
    };
  }, [cancelLogin, loginState]);

  async function handleRecoverByEmail(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoginState("submitting");

    try {
      const res = await fetch(`${API_URL}/auth/recover-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data) ?? "Erro na recuperação.");
        setLoginState("error");
        return;
      }

      setInfo("Se o e-mail existir, enviaremos um link de redefinição.");
      setLoginState("idle");
      setMode("login");
    } catch {
      setError("Falha ao conectar no backend");
      setLoginState("error");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="login-visuals" aria-hidden>
        <div className={`login-visuals ${playingWelcome || visualsPlayOnLoad ? "play" : ""}`} aria-hidden>
          <div className="login-drop" />
          <div className="login-drop login-drop-bottom" />
          <div className="login-drop login-drop-left" />
          <div className="login-drop login-drop-right" />
          <span className="login-meteor" style={{ left: "12%", animationDelay: "120ms" }} />
          <span className="login-meteor" style={{ left: "28%", animationDelay: "420ms" }} />
          <span className="login-meteor" style={{ left: "68%", animationDelay: "220ms" }} />
          <span className="login-meteor" style={{ left: "84%", animationDelay: "640ms" }} />
          {Array.from({ length: 60 }).map((_, i) => (
            <i key={i} className="login-confetti__piece" style={buildLoginParticleStyle(i)} />
          ))}
        </div>
      </div>

      <div
          className={`container-sm login-card w-full p-6 card transition-all duration-200 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          } ${playingWelcome ? "is-exploding" : ""}`}
      >
        <div className="mb-2 flex justify-end">
          <div className="page-overline">Acesso seguro HBX</div>
        </div>
        <h1 className="text-2xl font-bold mb-6">Login</h1>

        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Usuário</label>
              <input
                className="input mt-1"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="meuusuario"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Senha</label>
              <input
                type="password"
                className="input mt-1"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="1234"
                required
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm underline text-foreground/70"
                onClick={() => setMode("forgot")}
              >
                Esqueci minha senha
              </button>
            </div>

            {info ? (
              <div className="msg-info">
                <div className="text-sm">{info}</div>
              </div>
            ) : null}

            {error ? (
              <div className="msg-error">
                <div className="text-sm">{error}</div>
              </div>
            ) : null}

            {isWakingServer ? (
              <div className="msg-waking-server" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="spinner-waking" aria-hidden />
                  <div>
                    <div className="text-sm font-medium">Ambiente em inicialização</div>
                    <div className="text-xs opacity-75">{wakingMessage}</div>
                    {countdown !== null ? (
                      <div className="text-xs opacity-60">Recarregando em {countdown}s</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {preRegistered ? (
              <div className="msg-info" aria-live="polite">
                <div className="text-sm">
                  Encontramos um primeiro acesso pendente para este usuário. Continue em <strong>Registrar</strong> para finalizar seu cadastro sem perder o contexto.
                </div>
              </div>
            ) : null}

            <button
              disabled={isSubmitting}
              type={preRegistered ? "button" : "submit"}
              onClick={
                preRegistered
                  ? () => {
                      try {
                        localStorage.setItem(
                          "firstAccess",
                          JSON.stringify({
                            username,
                            message: "Complete seu registro",
                          })
                        );
                      } catch {
                        // ignore localStorage errors
                      }
                      router.push("/register");
                    }
                  : undefined
              }
              className={`btn ${preRegistered ? "btn-secondary w-full mt-2" : "btn btn-primary w-full mt-2 transition-all duration-300"} ${isWakingServer ? "opacity-75" : ""} ${isSuccess ? "btn-auth-success" : ""}`}
              aria-live="polite"
            >
              {!preRegistered && isSuccess ? (
                <span className="btn-auth-success__content">
                  <span className="btn-auth-success__bar" aria-hidden />
                  <span className="btn-auth-success__label">Autenticado</span>
                </span>
              ) : isWakingServer ? (
                "Iniciando ambiente..."
              ) : isSubmitting ? (
                preRegistered ? "Aguarde..." : "Autenticando..."
              ) : preRegistered ? (
                "Registrar"
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleRecoverByEmail} className="space-y-4">
            <p className="text-sm text-foreground/80">
              Digite seu e-mail para receber o link de redefinição.
            </p>
            <div>
              <label className="text-sm font-medium">E-mail</label>
              <input
                className="input mt-1"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                placeholder="email@exemplo.com"
                required
                autoComplete="email"
              />
            </div>

            {info ? (
              <div className="msg-info">
                <div className="text-sm">{info}</div>
              </div>
            ) : null}

            {error ? (
              <div className="msg-error">
                <div className="text-sm">{error}</div>
              </div>
            ) : null}

              <button disabled={isSubmitting} className="btn btn-primary w-full mt-2">
              {isSubmitting ? "Enviando..." : "Enviar recuperação"}
            </button>
            <button type="button" className="btn w-full mt-2" onClick={() => setMode("login")}>
              Voltar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

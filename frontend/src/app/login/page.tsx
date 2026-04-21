"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "../dashboard/_lib/api";
import { useHbxTheme } from "../../components/ThemeProvider";
import { useLoginColdStart, type LoginState } from "../../lib/useLoginColdStart";
import { resolveWebsiteOnlyDestination } from "../../lib/websiteLaunch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const AUTO_LOGIN_STORAGE_KEY = "hbx_auto_login";
const AUTO_LOGIN_RELOAD_SECONDS = 49;
const LOGIN_SUCCESS_DELAY_MS = 1700;
const LOGIN_VIDEO_EXPERIENCE_ENABLED = true;
const LOGIN_IDLE_VIDEO_SRC = "/login-media/login-looping.mp4";
const LOGIN_AUTH_VIDEO_SRC = "/login-media/login-afterauth.mp4";
const DEFAULT_WAKING_MESSAGE =
  "Estamos iniciando o ambiente seguro. A primeira conexão pode levar alguns segundos.";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  needsRegistration?: boolean;
  needsEmailConfirmation?: boolean;
  email?: string | null;
  code?: string;
  previewLink?: string | null;
  mailPreviewUrl?: string | null;
  delivery?: {
    previewUrl?: string | null;
    confirmUrl?: string | null;
    failed?: boolean;
  } | null;
};

type RecoverPasswordResponse = {
  message?: string;
  previewLink?: string | null;
  mailPreviewUrl?: string | null;
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

function getAccessToken(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as {
    token?: unknown;
    access_token?: unknown;
    accessToken?: unknown;
  };
  const token = payload.token ?? payload.access_token ?? payload.accessToken;
  return typeof token === "string" && token.trim() ? token : null;
}

function getInternalLoginDestination(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as {
    next?: unknown;
    redirectTo?: unknown;
  };
  const destination = payload.next ?? payload.redirectTo;
  if (typeof destination !== "string") return null;

  const trimmed = destination.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export default function LoginPage() {
  const router = useRouter();
  const { selection, activeTheme } = useHbxTheme();
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
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [pendingConfirmationMessage, setPendingConfirmationMessage] = useState<string | null>(null);
  const [pendingConfirmationBusy, setPendingConfirmationBusy] = useState(false);
  const [pendingConfirmationPreviewUrl, setPendingConfirmationPreviewUrl] = useState<string | null>(null);
  const [pendingConfirmationConfirmUrl, setPendingConfirmationConfirmUrl] = useState<string | null>(null);
  const [recoverPreviewLink, setRecoverPreviewLink] = useState<string | null>(null);
  const [recoverMailPreviewUrl, setRecoverMailPreviewUrl] = useState<string | null>(null);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const authVideoRef = useRef<HTMLVideoElement | null>(null);
  const countdownRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const isSubmitting = loginState === "submitting" || loginState === "waking_server";
  const isWakingServer = loginState === "waking_server";
  const isSuccess = loginState === "success";
  const themeModeLabel = selection.mode === "dark" ? "Escuro" : "Claro";

  async function completeSuccessfulLogin(token: string, data?: unknown) {
    setToken(token);
    setLoginState("success");

    let redirected = false;
    const fallbackDestination = getInternalLoginDestination(data) || "/dashboard";

    try {
      setPlayingWelcome(true);
      await new Promise((resolve) => window.setTimeout(resolve, LOGIN_SUCCESS_DELAY_MS));

      if (fallbackDestination !== "/dashboard") {
        redirected = true;
        router.replace(fallbackDestination);
        return;
      }

      const destination = await resolveWebsiteOnlyDestination();

      if (destination) {
        redirected = true;

        if (/^https?:\/\//i.test(destination)) {
          window.location.assign(destination);
        } else {
          router.replace(destination);
        }

        return;
      }
    } finally {
      if (!redirected) {
        router.replace(fallbackDestination);
      }
    }
  }

  async function authenticate(nextUsername: string, nextPassword: string) {
    setError(null);
    setInfo(null);
    setWakingMessage(null);
    setPendingConfirmationEmail(null);
    setPendingConfirmationMessage(null);
    setPendingConfirmationPreviewUrl(null);
    setPendingConfirmationConfirmUrl(null);
    setLoginState("submitting");

    try {
      const result = await executeLoginWithRetry(nextUsername, nextPassword, (phase) => {
        if (phase.state === "waking_server") {
          setWakingMessage(phase.message ?? DEFAULT_WAKING_MESSAGE);
          setLoginState("waking_server");
          return;
        }

        if (phase.state === "submitting") {
          setLoginState("submitting");
        }
      });

      if (result.state === "success") {
        const token = getAccessToken(result.data);

        if (!token) {
          setError("Login falhou: token não recebido.");
          setLoginState("error");
          return;
        }

        await completeSuccessfulLogin(token, result.data);
        return;
      }

      if (result.state === "error") {
        const payload = result.data && typeof result.data === "object" ? (result.data as ApiErrorPayload) : null;
        setError(result.message ?? "Erro ao autenticar.");
        setLoginState("error");

        if (payload?.needsEmailConfirmation) {
          setPendingConfirmationEmail(
            typeof payload.email === "string" && payload.email.trim() ? payload.email.trim() : null,
          );
          setPendingConfirmationMessage(result.message ?? "Confirme seu e-mail antes de entrar.");
        }

        if (
          payload &&
          Boolean(payload.needsRegistration)
        ) {
          try {
            localStorage.setItem(
              "firstAccess",
              JSON.stringify({
                username: nextUsername,
                message: result.message ?? "Conclua seu cadastro para liberar o acesso.",
              }),
            );
          } catch {
            // ignore localStorage errors
          }

          window.setTimeout(() => router.push("/register"), 2000);
        }

        return;
      }

      if (result.state === "waking_server") {
        setWakingMessage(result.message ?? DEFAULT_WAKING_MESSAGE);
        setLoginState("waking_server");
      }
    } catch {
      setError("Falha ao conectar no backend.");
      setLoginState("error");
    }
  }

  async function resendPendingConfirmation() {
    if (!pendingConfirmationEmail) {
      return;
    }

    setPendingConfirmationBusy(true);
    setInfo(null);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/auth/resend-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingConfirmationEmail }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(getErrorMessage(data) ?? "Não foi possível reenviar a confirmação agora.");
        return;
      }

      const payload = data && typeof data === "object" ? (data as ApiErrorPayload) : null;
      setPendingConfirmationMessage(
        getErrorMessage(data) || "Se existir uma conta com confirmação pendente, enviaremos um novo link em instantes.",
      );
      setPendingConfirmationPreviewUrl(
        typeof payload?.delivery?.previewUrl === "string" && payload.delivery.previewUrl.trim()
          ? payload.delivery.previewUrl
          : null,
      );
      setPendingConfirmationConfirmUrl(
        typeof payload?.delivery?.confirmUrl === "string" && payload.delivery.confirmUrl.trim()
          ? payload.delivery.confirmUrl
          : null,
      );
    } catch {
      setError("Falha ao conectar no backend.");
    } finally {
      setPendingConfirmationBusy(false);
    }
  }

  const triggerAutoLogin = useEffectEvent((nextUsername: string, nextPassword: string) => {
    void authenticate(nextUsername, nextPassword);
  });

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void authenticate(username, password);
  }

  useEffect(() => {
    if (loginState !== "waking_server") {
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      countdownRef.current = null;
      setCountdown(null);
      return;
    }

    if (countdownRef.current !== null) {
      return;
    }

    countdownRef.current = AUTO_LOGIN_RELOAD_SECONDS;
    setCountdown(AUTO_LOGIN_RELOAD_SECONDS);
    countdownIntervalRef.current = window.setInterval(() => {
      if (countdownRef.current === null) {
        return;
      }

      countdownRef.current -= 1;
      setCountdown(countdownRef.current);

      if (countdownRef.current <= 0) {
        try {
          sessionStorage.setItem(
            AUTO_LOGIN_STORAGE_KEY,
            JSON.stringify({
              username,
              password,
            }),
          );
        } catch {
          // ignore sessionStorage errors
        }

        window.location.reload();
      }
    }, 1000);

    return () => {
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [loginState, password, username]);

  useEffect(() => {
    let timeoutId: number | null = null;

    try {
      const raw = sessionStorage.getItem(AUTO_LOGIN_STORAGE_KEY);

      if (!raw) {
        return;
      }

      sessionStorage.removeItem(AUTO_LOGIN_STORAGE_KEY);
      const parsed = JSON.parse(raw) as { username?: string; password?: string };

      if (!parsed.username) {
        return;
      }

      const restoredUsername = parsed.username;
      const restoredPassword = parsed.password ?? "";
      setUsername(restoredUsername);
      setPassword(restoredPassword);
      timeoutId = window.setTimeout(() => {
        triggerAutoLogin(restoredUsername, restoredPassword);
      }, 200);
    } catch {
      // ignore parse errors
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  // Prefill username from `email` query param when provided (visual only).
  const searchParams = useSearchParams();
  useEffect(() => {
    try {
      const emailParam = searchParams?.get("email") ?? "";
      if (emailParam && !username) {
        setUsername(String(emailParam).trim());
      }
    } catch {
      // ignore
    }
  }, [searchParams, username]);

  useEffect(() => {
    let cancelled = false;
    const normalized = username.trim();

    if (!normalized) {
      setPreRegistered(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_URL}/users/check-username?username=${encodeURIComponent(normalized)}`,
        );

        if (!response.ok) {
          if (!cancelled) {
            setPreRegistered(false);
          }

          return;
        }

        const data: unknown = await response.json().catch(() => null);

        if (!cancelled && data && typeof data === "object") {
          setPreRegistered(Boolean((data as { preRegistered?: boolean }).preRegistered));
        }
      } catch {
        if (!cancelled) {
          setPreRegistered(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [username]);

  useEffect(() => {
    setMounted(true);
    setVisualsPlayOnLoad(true);
    const timeout = window.setTimeout(() => setVisualsPlayOnLoad(false), 2200);

    return () => {
      window.clearTimeout(timeout);
      cancelLogin();
    };
  }, [cancelLogin]);

  useEffect(() => {
    if (!LOGIN_VIDEO_EXPERIENCE_ENABLED) return;
    const idleVideo = idleVideoRef.current;
    if (!idleVideo) return;

    idleVideo.play().catch(() => undefined);
  }, [mounted, selection.mode, selection.themeId]);

  useEffect(() => {
    if (!LOGIN_VIDEO_EXPERIENCE_ENABLED) return;
    const authVideo = authVideoRef.current;
    if (!authVideo) return;

    if (isSuccess || playingWelcome) {
      // Seek to frame 0 first so the first rendered frame is ready,
      // then play — avoids the brief black-frame flicker at crossfade start.
      authVideo.currentTime = 0;
      const playPromise = authVideo.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => undefined);
      }
      return;
    }

    authVideo.pause();
    authVideo.currentTime = 0;
  }, [isSuccess, playingWelcome]);

  async function handleRecoverByEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setRecoverPreviewLink(null);
    setRecoverMailPreviewUrl(null);
    setLoginState("submitting");

    try {
      const response = await fetch(`${API_URL}/auth/recover-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(getErrorMessage(data) ?? "Erro na recuperação.");
        setLoginState("error");
        return;
      }

      const payload = (data as RecoverPasswordResponse | null) ?? null;
      setInfo(
        String(payload?.message || "").trim() ||
          "Se o e-mail existir, enviaremos um link de redefinição.",
      );
      setRecoverPreviewLink(
        payload?.previewLink && String(payload.previewLink).trim()
          ? String(payload.previewLink)
          : null,
      );
      setRecoverMailPreviewUrl(
        payload?.mailPreviewUrl && String(payload.mailPreviewUrl).trim()
          ? String(payload.mailPreviewUrl)
          : null,
      );
      setLoginState("idle");
    } catch {
      setError("Falha ao conectar no backend.");
      setLoginState("error");
    }
  }

  return (
    <main
      className="login-stage"
      data-login-theme={selection.themeId}
      data-login-mode={selection.mode}
      data-login-state={loginState}
      data-login-video={LOGIN_VIDEO_EXPERIENCE_ENABLED ? "on" : "off"}
    >
      <div className="login-stage__grid" aria-hidden />
      {LOGIN_VIDEO_EXPERIENCE_ENABLED ? (
        <div className="login-video-layer" aria-hidden="true">
          <video
            ref={idleVideoRef}
            className="login-video-layer__clip login-video-layer__clip--idle"
            src={LOGIN_IDLE_VIDEO_SRC}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onCanPlay={(event) => {
              event.currentTarget.play().catch(() => undefined);
            }}
          />
          <video
            ref={authVideoRef}
            className="login-video-layer__clip login-video-layer__clip--auth"
            src={LOGIN_AUTH_VIDEO_SRC}
            muted
            playsInline
            preload="auto"
            onLoadedData={(event) => {
              // Pre-seek to frame 0 so first frame is decoded and ready
              event.currentTarget.currentTime = 0;
            }}
            onEnded={(event) => {
              event.currentTarget.pause();
            }}
          />
          <div className="login-video-layer__veil" />
        </div>
      ) : null}
      <div className="login-visuals" aria-hidden>
        <div
          className={`login-visuals ${playingWelcome || visualsPlayOnLoad ? "play" : ""}`}
          aria-hidden
        >
          <div className="login-core">
            <span className="login-core__halo" />
            <span className="login-core__pulse" />
            <span className="login-core__ring login-core__ring--outer" />
            <span className="login-core__ring login-core__ring--mid" />
            <span className="login-core__beam login-core__beam--left" />
            <span className="login-core__beam login-core__beam--right" />
          </div>
          <div className="login-drop" />
          <div className="login-drop login-drop-bottom" />
          <div className="login-drop login-drop-left" />
          <div className="login-drop login-drop-right" />
          <span className="login-meteor" style={{ left: "12%", animationDelay: "120ms" }} />
          <span className="login-meteor" style={{ left: "28%", animationDelay: "420ms" }} />
          <span className="login-meteor" style={{ left: "68%", animationDelay: "220ms" }} />
          <span className="login-meteor" style={{ left: "84%", animationDelay: "640ms" }} />
          {Array.from({ length: 60 }).map((_, index) => (
            <i
              key={index}
              className="login-confetti__piece"
              style={buildLoginParticleStyle(index)}
            />
          ))}
        </div>
      </div>

      <div className="login-shell">
        <div
          className={`login-card card transition-all duration-300 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          } ${playingWelcome ? "is-exploding" : ""}`}
        >
          <div className="login-card__chrome" aria-hidden />

          <header className="login-card__header">
            <div className="login-card__themeRow">
              <div className="page-overline login-card__overline">Acesso seguro HBX</div>
              <span className="login-card__modeBadge">{themeModeLabel}</span>
            </div>
            <div className="login-card__brandBlock">
              <div className="login-card__brandMark" aria-hidden>
                <span className="login-card__brandMarkCore">HBX</span>
              </div>
              <div className="login-card__themeCopy">
                <p className="login-card__themeLabel">{activeTheme.label}</p>
                <p className="login-card__themeHint">
                  {mode === "login"
                    ? "Acesse sua conta com segurança e continue de onde parou."
                    : "Recupere o acesso sem perder o contexto da sua operação."}
                </p>
              </div>
            </div>
            <h1 className="login-card__title">
              {mode === "login" ? "Entrar no HBX" : "Recuperar acesso"}
            </h1>
            {mode === "forgot" ? (
              <p className="login-card__copy login-card__copy--compact">
                {"Informe o e-mail da conta para receber um link seguro de redefinição."}
              </p>
            ) : null}
          </header>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="login-form">
              <div className="login-field">
                <label className="login-label" htmlFor="login-username">
                  E-mail
                </label>
                <input
                  id="login-username"
                  className="input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Digite seu e-mail"
                  required
                  autoComplete="username"
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="login-password">
                  Senha
                </label>
                <input
                  id="login-password"
                  type="password"
                  className="input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  required
                  autoComplete="current-password"
                />
              </div>

              <div className="login-actionsRow">
                <button
                  type="button"
                  className="login-link"
                  onClick={() => {
                    setError(null);
                    setInfo(null);
                    setMode("forgot");
                  }}
                >
                  Esqueci minha senha
                </button>
                <button
                  type="button"
                  className="btn btn-secondary login-cta"
                  onClick={() => router.push("/register")}
                  style={{ marginLeft: 12 }}
                >
                  Criar conta
                </button>
              </div>

              {info ? (
                <div className="msg-info">
                  <div className="text-sm">{info}</div>
                  {recoverPreviewLink ? (
                    <a className="btn btn-secondary mt-3" href={recoverPreviewLink}>
                      Abrir link de redefinição
                    </a>
                  ) : null}
                  {recoverMailPreviewUrl ? (
                    <a className="btn btn-secondary mt-3" href={recoverMailPreviewUrl} target="_blank" rel="noreferrer">
                      Abrir preview do e-mail
                    </a>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <div className="msg-error">
                  <div className="text-sm">{error}</div>
                </div>
              ) : null}

              {pendingConfirmationEmail ? (
                <div className="msg-info" aria-live="polite">
                  <div className="text-sm">
                    {pendingConfirmationMessage || "Confirme seu e-mail antes de entrar."}
                  </div>
                  <div className="text-xs opacity-75 mt-2">Conta pendente: {pendingConfirmationEmail}</div>
                  <div className="flex flex-col gap-2 mt-3">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void resendPendingConfirmation()}
                      disabled={pendingConfirmationBusy}
                    >
                      {pendingConfirmationBusy ? "Reenviando confirmação..." : "Reenviar confirmação"}
                    </button>
                    {pendingConfirmationConfirmUrl ? (
                      <a className="btn btn-secondary" href={pendingConfirmationConfirmUrl}>
                        Abrir confirmação
                      </a>
                    ) : null}
                    {pendingConfirmationPreviewUrl ? (
                      <a className="btn btn-secondary" href={pendingConfirmationPreviewUrl} target="_blank" rel="noreferrer">
                        Abrir preview do e-mail
                      </a>
                    ) : null}
                  </div>
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
                    Encontramos um primeiro acesso pendente para este usuário. Continue no cadastro para concluir a ativação sem perder o contexto.
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
                              message: "Conclua seu cadastro para ativar o acesso.",
                            }),
                          );
                        } catch {
                          // ignore localStorage errors
                        }

                        router.push("/register");
                      }
                    : undefined
                }
                className={`btn ${
                  preRegistered ? "btn-secondary" : "btn-primary"
                } login-button ${isWakingServer ? "opacity-75" : ""} ${
                  isSuccess && !preRegistered ? "btn-auth-success" : ""
                }`}
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
                  "Autenticando..."
                ) : preRegistered ? (
                  "Concluir cadastro"
                ) : (
                  "Entrar"
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecoverByEmail} className="login-form">
              <p className="login-card__copy login-card__copy--compact">
                Digite seu e-mail para receber o link de redefinição.
              </p>

              <div className="login-field">
                <label className="login-label" htmlFor="recovery-email">
                  E-mail
                </label>
                <input
                  id="recovery-email"
                  className="input"
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

              <button disabled={isSubmitting} className="btn btn-primary login-button">
                {isSubmitting ? "Enviando..." : "Enviar link de recuperação"}
              </button>

              <button
                type="button"
                className="btn btn-secondary login-button"
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setRecoverPreviewLink(null);
                  setRecoverMailPreviewUrl(null);
                  setMode("login");
                }}
              >
                Voltar para o login
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

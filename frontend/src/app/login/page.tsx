"use client";

import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, setToken } from "@/app/_lib/api";
import { useHbxTheme } from "../../components/ThemeProvider";
import {
  LOGIN_VIDEO_PREFERENCE_EVENT,
  LOGIN_VIDEO_PREFERENCE_STORAGE_KEY,
  persistLoginVideoEnabled,
  readStoredLoginVideoEnabled,
} from "../../lib/login-visual-preferences";
import { normalizeInternalRouteAlias } from "../../lib/route-aliases";
import { useLoginColdStart, type LoginState } from "../../lib/useLoginColdStart";
import { resolveWebsiteOnlyDestination } from "../../lib/websiteLaunch";

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.hbxsystem.com.br"
    : "http://localhost:3000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
const AUTO_LOGIN_STORAGE_KEY = "hbx_auto_login";
const AUTO_LOGIN_RELOAD_SECONDS = 49;
const LOGIN_SUCCESS_DELAY_MS = 3500;
const LOGIN_VIDEO_EXPERIENCE_AVAILABLE = true;
const LOGIN_IDLE_VIDEO_SRC = "/login-media/login-looping.mp4";
const LOGIN_AUTH_VIDEO_SRC = "/login-media/login-afterauth.mp4";
const DEFAULT_WAKING_MESSAGE =
  "Estamos iniciando o ambiente seguro. A primeira conexão pode levar alguns segundos.";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  needsRegistration?: boolean;
  needsEmailConfirmation?: boolean;
  forceAvailable?: boolean;
  email?: string | null;
  code?: string;
  activeSession?: {
    createdAt?: string | null;
    lastSeenAt?: string | null;
    expiresAt?: string | null;
    userAgent?: string | null;
  } | null;
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

type LoginCurrentUser = {
  isSystemMaster?: boolean;
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

type LoginSideIcon = "headset" | "recovery" | "website" | "shield" | "building" | "pulse" | "theme";

const LOGIN_SOLUTIONS: Array<{
  icon: LoginSideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: "headset",
    title: "Atendimento",
    description: "Suporte rápido e humanizado sempre que precisar.",
  },
  {
    icon: "recovery",
    title: "Recovery",
    description: "Recuperação de dados ágil e segura.",
  },
  {
    icon: "website",
    title: "Website",
    description: "Acesse informações e novidades online.",
  },
];

const LOGIN_TRUST_ITEMS: Array<{
  icon: LoginSideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: "shield",
    title: "Modo seguro ativo",
    description: "Seus dados protegidos 24/7 com criptografia.",
  },
  {
    icon: "building",
    title: "Multiempresa",
    description: "Gerencie múltiplas empresas em um único ambiente.",
  },
  {
    icon: "pulse",
    title: "Tempo real",
    description: "Informações sempre atualizadas para decisões.",
  },
  {
    icon: "theme",
    title: "Light / Dark ready",
    description: "Interface adaptável ao seu estilo.",
  },
];

function LoginSideIconGlyph({ icon }: { icon: LoginSideIcon }) {
  if (icon === "headset") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 13.8v-2.2a7.5 7.5 0 0 1 15 0v2.2" />
        <path d="M7.5 17.5h-1a2 2 0 0 1-2-2v-1.1a2 2 0 0 1 2-2h1v5.1Z" />
        <path d="M16.5 17.5h1a2 2 0 0 0 2-2v-1.1a2 2 0 0 0-2-2h-1v5.1Z" />
        <path d="M16.5 17.5c0 1.2-1.2 2-3.4 2h-1" />
      </svg>
    );
  }

  if (icon === "recovery") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 12a8 8 0 0 1-13.5 5.8" />
        <path d="M4 12A8 8 0 0 1 17.5 6.2" />
        <path d="M17.5 2.8v3.4h-3.4" />
        <path d="M6.5 21.2v-3.4h3.4" />
      </svg>
    );
  }

  if (icon === "website") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="M3.5 12h17" />
        <path d="M12 3a14 14 0 0 1 0 18" />
        <path d="M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  }

  if (icon === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s7-3.4 7-9.4V5.8L12 3 5 5.8v5.8c0 6 7 9.4 7 9.4Z" />
        <path d="m9.2 12 1.9 1.9 4-4.2" />
      </svg>
    );
  }

  if (icon === "building") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 20.5h15" />
        <path d="M6 20.5V7l6-2.5 6 2.5v13.5" />
        <path d="M9 10h.1M12 10h.1M15 10h.1M9 14h.1M12 14h.1M15 14h.1" />
      </svg>
    );
  }

  if (icon === "pulse") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 13h4l2.2-5.5L14 18l2.5-5H21" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v3M12 18v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M3 12h3M18 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
      <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
    </svg>
  );
}

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
  return normalizeInternalRouteAlias(trimmed);
}

async function resolvePostLoginDestination(data: unknown) {
  const explicitDestination = getInternalLoginDestination(data);
  if (explicitDestination && explicitDestination !== "/boasvindas") {
    return explicitDestination;
  }

  try {
    const currentUser = await apiFetch<LoginCurrentUser>("/profile/current-user");
    if (currentUser?.isSystemMaster) {
      return "/master";
    }
  } catch {
    // Keep the login flow moving; /boasvindas still resolves the safest fallback.
  }

  try {
    const websiteDestination = await resolveWebsiteOnlyDestination();
    if (websiteDestination) {
      return websiteDestination;
    }
  } catch {
    // ignore website-only resolution failures
  }

  return explicitDestination || "/boasvindas";
}

export default function LoginPage() {
  const router = useRouter();
  const { selection, activeTheme, setMode: setThemeMode } = useHbxTheme();
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
  const [isUiReady, setIsUiReady] = useState(false);
  const [playingWelcome, setPlayingWelcome] = useState(false);
  const [visualsPlayOnLoad, setVisualsPlayOnLoad] = useState(false);
  const [isLoginVideoEnabled, setIsLoginVideoEnabled] = useState<boolean>(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [registerTransitioning, setRegisterTransitioning] = useState(false);
  const [preRegistered, setPreRegistered] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [pendingConfirmationMessage, setPendingConfirmationMessage] = useState<string | null>(null);
  const [pendingConfirmationBusy, setPendingConfirmationBusy] = useState(false);
  const [pendingConfirmationPreviewUrl, setPendingConfirmationPreviewUrl] = useState<string | null>(null);
  const [pendingConfirmationConfirmUrl, setPendingConfirmationConfirmUrl] = useState<string | null>(null);
  const [activeSessionConflict, setActiveSessionConflict] = useState(false);
  const [forceActiveSession, setForceActiveSession] = useState(false);
  const [recoverPreviewLink, setRecoverPreviewLink] = useState<string | null>(null);
  const [recoverMailPreviewUrl, setRecoverMailPreviewUrl] = useState<string | null>(null);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const authVideoRef = useRef<HTMLVideoElement | null>(null);
  const countdownRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerPositionRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const isSubmitting = loginState === "submitting" || loginState === "waking_server";
  const isWakingServer = loginState === "waking_server";
  const isSuccess = loginState === "success";
  const isLoginVideoExperienceEnabled = LOGIN_VIDEO_EXPERIENCE_AVAILABLE && isLoginVideoEnabled;
  const shouldRenderLoginVideo = isLoginVideoExperienceEnabled && isUiReady;
  const themeModeLabel = selection.mode === "dark" ? "Escuro" : "Claro";
  const visualModeLabel = isLoginVideoExperienceEnabled ? "Vídeo ativo" : "Vídeo suave";
  const loginCardVideoStyle: CSSProperties = {
    backdropFilter: "blur(2px) saturate(1.01)",
    WebkitBackdropFilter: "blur(2px) saturate(1.01)",
  };

  function handleThemeModeToggle() {
    setThemeMode(selection.mode === "dark" ? "light" : "dark");
  }

  function handleLoginVideoToggle() {
    const nextEnabled = !isLoginVideoExperienceEnabled;
    setIsLoginVideoEnabled(nextEnabled);
    persistLoginVideoEnabled(nextEnabled);
  }

  function openRegisterWithTransition() {
    if (registerTransitioning) return;
    setRegisterTransitioning(true);
    try {
      sessionStorage.setItem("hbx_register_transition", "from-login");
    } catch {
      // ignore sessionStorage errors
    }
    window.setTimeout(() => {
      router.push("/register?from=login");
    }, 500);
  }

  function setStagePointerStyles(nextX: number, nextY: number) {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const clampedX = Math.max(0, Math.min(1, nextX));
    const clampedY = Math.max(0, Math.min(1, nextY));
    const driftX = (clampedX - 0.5) * 40;
    const driftY = (clampedY - 0.5) * 26;

    stage.style.setProperty("--login-pointer-x", `${(clampedX * 100).toFixed(2)}%`);
    stage.style.setProperty("--login-pointer-y", `${(clampedY * 100).toFixed(2)}%`);
    stage.style.setProperty("--login-pointer-drift-x", `${driftX.toFixed(2)}px`);
    stage.style.setProperty("--login-pointer-drift-y", `${driftY.toFixed(2)}px`);
    stage.style.setProperty("--login-pointer-drift-x-inverse", `${(-driftX).toFixed(2)}px`);
    stage.style.setProperty("--login-pointer-drift-y-inverse", `${(-driftY).toFixed(2)}px`);
  }

  function flushStagePointerPosition() {
    pointerFrameRef.current = null;

    const stage = stageRef.current;
    const pointer = pointerPositionRef.current;

    if (!stage || !pointer) {
      return;
    }

    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const relativeX = (pointer.clientX - rect.left) / rect.width;
    const relativeY = (pointer.clientY - rect.top) / rect.height;
    setStagePointerStyles(relativeX, relativeY);
  }

  function queueStagePointerPosition(clientX: number, clientY: number) {
    pointerPositionRef.current = { clientX, clientY };

    if (pointerFrameRef.current !== null) {
      return;
    }

    pointerFrameRef.current = window.requestAnimationFrame(() => {
      flushStagePointerPosition();
    });
  }

  function resetStagePointerPosition() {
    setStagePointerStyles(0.5, 0.5);
  }

  function handleStagePointerMove(event: ReactPointerEvent<HTMLElement>) {
    queueStagePointerPosition(event.clientX, event.clientY);
  }

  function handleStagePointerLeave() {
    resetStagePointerPosition();
  }

  async function completeSuccessfulLogin(token: string, data?: unknown) {
    setToken(token, { notify: false });
    setLoginState("success");

    setPlayingWelcome(true);
    const destinationPromise = resolvePostLoginDestination(data);
    await new Promise((resolve) => window.setTimeout(resolve, LOGIN_SUCCESS_DELAY_MS));
    const destination = await destinationPromise;

    setToken(token);

    if (/^https?:\/\//i.test(destination)) {
      window.location.assign(destination);
      return;
    }

    router.replace(destination);
  }

  async function authenticate(nextUsername: string, nextPassword: string, forceSession = false) {
    setError(null);
    setInfo(null);
    setWakingMessage(null);
    setPendingConfirmationEmail(null);
    setPendingConfirmationMessage(null);
    setPendingConfirmationPreviewUrl(null);
    setPendingConfirmationConfirmUrl(null);
    if (!forceSession) {
      setActiveSessionConflict(false);
    }
    setLoginState("submitting");

    try {
      const result = await executeLoginWithRetry(nextUsername, nextPassword, forceSession, (phase) => {
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
        setActiveSessionConflict(false);
        setForceActiveSession(false);
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

        if (payload?.code === "SESSION_ALREADY_ACTIVE" || payload?.forceAvailable) {
          setActiveSessionConflict(true);
          setForceActiveSession(false);
          setError("Usuário conectado em outra máquina.");
        }

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

          window.setTimeout(() => {
            try {
              sessionStorage.setItem("hbx_register_transition", "from-login");
            } catch {
              // ignore sessionStorage errors
            }
            router.push("/register?from=login");
          }, 2000);
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
    void authenticate(username, password, activeSessionConflict && forceActiveSession);
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
    if (!LOGIN_VIDEO_EXPERIENCE_AVAILABLE) {
      return;
    }

    const syncStoredVideoPreference = () => {
      setIsLoginVideoEnabled(readStoredLoginVideoEnabled());
    };

    const handlePreferenceChange = () => {
      syncStoredVideoPreference();
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === LOGIN_VIDEO_PREFERENCE_STORAGE_KEY ||
        event.key.startsWith(`${LOGIN_VIDEO_PREFERENCE_STORAGE_KEY}:`)
      ) {
        syncStoredVideoPreference();
      }
    };

    syncStoredVideoPreference();
    window.addEventListener(LOGIN_VIDEO_PREFERENCE_EVENT, handlePreferenceChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(LOGIN_VIDEO_PREFERENCE_EVENT, handlePreferenceChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const timeoutIds: number[] = [];
    const removeListeners: Array<() => void> = [];
    let cancelled = false;

    const withTimeout = (promise: Promise<unknown>, timeoutMs: number) =>
      Promise.race([
        promise,
        new Promise<void>((resolve) => {
          const timeoutId = window.setTimeout(resolve, timeoutMs);
          timeoutIds.push(timeoutId);
        }),
      ]);

    const waitForLoad = () => {
      if (document.readyState === "complete") {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const handleLoad = () => {
          resolve();
        };

        window.addEventListener("load", handleLoad, { once: true });
        removeListeners.push(() => window.removeEventListener("load", handleLoad));
      });
    };

    const waitForFonts = () => {
      if (!("fonts" in document) || !document.fonts?.ready) {
        return Promise.resolve();
      }

      return document.fonts.ready.catch(() => undefined);
    };

    const waitForSettledPaint = () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      });

    const armLoginUi = async () => {
      setMounted(true);

      await Promise.all([
        waitForSettledPaint(),
        withTimeout(waitForFonts(), 900),
        withTimeout(waitForLoad(), 1400),
      ]);

      if (cancelled) {
        return;
      }

      setIsUiReady(true);
      setVisualsPlayOnLoad(true);

      const timeoutId = window.setTimeout(() => {
        if (!cancelled) {
          setVisualsPlayOnLoad(false);
        }
      }, 1600);
      timeoutIds.push(timeoutId);
    };

    void armLoginUi();

    return () => {
      cancelled = true;
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      removeListeners.forEach((removeListener) => removeListener());
      cancelLogin();
    };
  }, [cancelLogin]);

  useEffect(() => {
    if (!shouldRenderLoginVideo) return;
    const idleVideo = idleVideoRef.current;
    if (!idleVideo) return;

    try {
      idleVideo.playbackRate = 0.65; // slow idle/login looping video to 50%
    } catch {}

    idleVideo.play().catch(() => undefined);
  }, [shouldRenderLoginVideo, mounted, selection.mode, selection.themeId]);

  useEffect(() => {
    if (!shouldRenderLoginVideo) return;
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
  }, [shouldRenderLoginVideo, isSuccess, playingWelcome]);

  useEffect(() => {
    const stage = stageRef.current;

    if (stage) {
      stage.style.setProperty("--login-pointer-x", "50%");
      stage.style.setProperty("--login-pointer-y", "50%");
      stage.style.setProperty("--login-pointer-drift-x", "0px");
      stage.style.setProperty("--login-pointer-drift-y", "0px");
      stage.style.setProperty("--login-pointer-drift-x-inverse", "0px");
      stage.style.setProperty("--login-pointer-drift-y-inverse", "0px");
    }

    return () => {
      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current);
      }
    };
  }, []);

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
      ref={stageRef}
      className="login-stage"
      data-login-theme={selection.themeId}
      data-login-mode={selection.mode}
      data-login-ready={isUiReady ? "true" : "false"}
      data-login-state={loginState}
      data-login-video={isLoginVideoExperienceEnabled ? "on" : "off"}
      data-register-transition={registerTransitioning ? "true" : "false"}
      onPointerMove={isUiReady ? handleStagePointerMove : undefined}
      onPointerLeave={isUiReady ? handleStagePointerLeave : undefined}
    >
      <div className="login-stage__grid" aria-hidden />
      {shouldRenderLoginVideo ? (
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
          className={`login-visuals ${isUiReady && (playingWelcome || visualsPlayOnLoad) ? "play" : ""}`}
          aria-hidden
        >
          <div className="login-side-theme login-side-theme--left">
            <span className="login-side-theme__ambient" />
            <span className="login-side-theme__helix" />
          </div>
          <div className="login-side-theme login-side-theme--right">
            <span className="login-side-theme__ambient" />
            <span className="login-side-theme__helix" />
          </div>
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

      <div className="login-console">
        <aside className="login-side login-side--left" aria-label="Soluções integradas">
          <div className="login-side__panel">
            <div className="login-side__header">
              <span>Soluções integradas</span>
            </div>
            <div className="login-side__stack">
              {LOGIN_SOLUTIONS.map((item) => (
                <article key={item.title} className="login-microcard">
                  <span className="login-microcard__icon">
                    <LoginSideIconGlyph icon={item.icon} />
                  </span>
                  <span className="login-microcard__copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                  <span className="login-status-dot" aria-label="Operacional" />
                </article>
              ))}
            </div>
            <div className="login-themePreview login-themePreview--visual" data-preview="visual" aria-label={visualModeLabel}>
              <span>Visual</span>
              <button
                type="button"
                className="login-themePreview__switch"
                data-preview="visual"
                data-state={isLoginVideoExperienceEnabled ? "on" : "off"}
                role="switch"
                aria-checked={isLoginVideoExperienceEnabled}
                aria-label={isLoginVideoExperienceEnabled ? "Desativar vídeo de fundo" : "Ativar vídeo de fundo"}
                onClick={handleLoginVideoToggle}
              >
                <span className="login-themePreview__thumb" />
              </button>
              <span className="login-themePreview__moon" data-preview="visual" aria-hidden="true" />
            </div>
            <div className="login-side__footer">
              <span>Todos os serviços operacionais</span>
              <LoginSideIconGlyph icon="shield" />
            </div>
          </div>
        </aside>

        <div className="login-shell">
        <div
          className={`login-card card transition-all duration-300 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          } ${playingWelcome ? "is-exploding" : ""}`}
          style={loginCardVideoStyle}
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
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setActiveSessionConflict(false);
                    setForceActiveSession(false);
                  }}
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
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setActiveSessionConflict(false);
                    setForceActiveSession(false);
                  }}
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
                  onClick={openRegisterWithTransition}
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
                  {activeSessionConflict ? (
                    <label className="mt-3 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={forceActiveSession}
                        onChange={(event) => setForceActiveSession(event.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        Forçar entrada e desconectar a sessão aberta em outra máquina.
                      </span>
                    </label>
                  ) : null}
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

                        openRegisterWithTransition();
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
                ) : activeSessionConflict && forceActiveSession ? (
                  "Forçar entrada"
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

        <aside className="login-side login-side--right" aria-label="Confiança e tecnologia">
          <div className="login-side__panel">
            <div className="login-side__header">
              <span>Confiança e tecnologia</span>
            </div>
            <div className="login-trustList">
              {LOGIN_TRUST_ITEMS.map((item) => (
                <article key={item.title} className="login-trustItem">
                  <span className="login-trustItem__icon">
                    <LoginSideIconGlyph icon={item.icon} />
                  </span>
                  <span className="login-trustItem__copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                  <span className="login-status-dot" aria-label="Ativo" />
                </article>
              ))}
            </div>
            <div className="login-themePreview" data-preview="theme" aria-label={`Tema ${themeModeLabel}`}>
              <span>Tema</span>
              <button
                type="button"
                className="login-themePreview__switch"
                data-preview="theme"
                data-mode={selection.mode}
                role="switch"
                aria-checked={selection.mode === "dark"}
                aria-label={selection.mode === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
                onClick={handleThemeModeToggle}
              >
                <span className="login-themePreview__thumb" />
              </button>
              <span className="login-themePreview__moon" data-preview="theme" aria-hidden="true" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, clearToken, getToken } from "../app/dashboard/_lib/api";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";
import { useHbxTheme } from "@/components/ThemeProvider";
import ThemeSwitcher from "./ThemeSwitcher";
import TechAssistantGlobalDrawer from "./TechAssistantGlobalDrawer";

type User = {
  id: number;
  username: string;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: { id: number; name?: string | null } | null;
  masterContext?: {
    active: boolean;
    mode: "master_puro" | "empresa_assumida";
    sessionId: string | null;
    companyId: number | null;
    companyName: string | null;
    reason?: string | null;
    startedAt?: string | null;
    expiresAt?: string | null;
  } | null;
};

type MasterOverviewCompany = {
  id: number;
  name: string;
  isActive: boolean;
  paymentStatus: string;
};

type MasterOverviewCompanyPayload = {
  id?: number | string | null;
  name?: string | null;
  isActive?: boolean | null;
  paymentStatus?: string | null;
};

type UserModule = { key: string; accessible: boolean };
type WhatsAppStatusPayload = {
  connected: boolean;
  status: string;
  displayNumber?: string | null;
};
type WhatsAppHealth = "green" | "yellow" | "red";
type RecoveryAlertConversation = {
  conversationId: number;
  customerName: string;
  customerWhatsapp: string;
  conversationWhatsapp: string;
  humanQueue: boolean;
  humanAssigned: boolean;
  isClosed: boolean;
  isBlocked: boolean;
  lastMessage: string;
  lastDirection: string;
  lastAt: string;
  metadata?: Record<string, unknown> | null;
};
type RecoveryAlertSummary = {
  pendingHumanCount: number;
  conversations: RecoveryAlertConversation[];
};
type InboxAlertMessage = {
  direction: string;
  content: string;
  createdAt: string;
};
type InboxAlertConversation = {
  id: string;
  status: string;
  routeTarget: string;
  isBlocked: boolean;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
  customer: {
    name: string | null;
    phone: string;
  };
  messages: InboxAlertMessage[];
};
type TopBarIncomingPopup = {
  id: string;
  moduleLabel: string;
  attentionLabel: string;
  customerLabel: string;
  contactPhone: string;
  entryNumberLabel: string | null;
  preview: string;
  href: string;
  lastAt: string;
};

const RECOVERY_HUMAN_QUEUE_EVENT = "hbx-recovery-human-queue";
const ATENDIMENTO_HUMAN_QUEUE_EVENT = "atendimento-human-queue";
const RECOVERY_QUEUE_STORAGE_KEY = "hbxRecoveryPendingHumanCount";
const ATENDIMENTO_QUEUE_STORAGE_KEY = "atendimentoPendingHumanCount";

const hiddenRoutes = new Set(["/login", "/register", "/reset-password"]);

function extractEntryNumberLabel(metadata?: Record<string, unknown> | null) {
  const endpointLabel = String(metadata?.whatsappEntryEndpointLabel || "").trim();
  const displayNumber = String(metadata?.whatsappEntryDisplayNumber || "").trim();
  if (endpointLabel && displayNumber) return `${endpointLabel} (${displayNumber})`;
  if (endpointLabel) return endpointLabel;
  if (displayNumber) return displayNumber;
  return null;
}

function formatInboxPreview(conversation: InboxAlertConversation) {
  const latestMessage = conversation.messages?.[0];
  const content = String(latestMessage?.content || "").trim();
  if (content) return content;
  return "Nova mensagem aguardando resposta.";
}

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const topbarFrameRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const { isShuttingDown, runGlobalShutdown } = useInterfaceTransition();
  const { setStorageUserId } = useHbxTheme();

  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeMsg, setChangeMsg] = useState<string | null>(null);
  const [whatsAppHealth, setWhatsAppHealth] = useState<WhatsAppHealth>("yellow");
  const [whatsAppHealthLabel, setWhatsAppHealthLabel] = useState("WhatsApp status: sem validacao");
  const [recoveryPendingHumanCount, setRecoveryPendingHumanCount] = useState(0);
  const [atendimentoPendingHumanCount, setAtendimentoPendingHumanCount] = useState(0);
  const [incomingPopup, setIncomingPopup] = useState<TopBarIncomingPopup | null>(null);
  const [masterContextModalOpen, setMasterContextModalOpen] = useState(false);
  const [masterContextActionBusy, setMasterContextActionBusy] = useState(false);
  const [masterContextMessage, setMasterContextMessage] = useState<string | null>(null);
  const [masterCompanyOptions, setMasterCompanyOptions] = useState<MasterOverviewCompany[]>([]);
  const [selectedMasterCompanyId, setSelectedMasterCompanyId] = useState<string>("");
  const [masterContextReason, setMasterContextReason] = useState("");
  const recoveryLastSeenRef = useRef<Map<number, string>>(new Map());
  const recoveryHumanQueueRef = useRef<Map<number, boolean>>(new Map());
  const recoveryAlertReadyRef = useRef(false);
  const atendimentoLastSeenRef = useRef<Map<string, string>>(new Map());
  const atendimentoAlertReadyRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioArmedRef = useRef(false);

  const playIncomingAlertTone = React.useCallback(() => {
    if (typeof window === "undefined" || !audioArmedRef.current) return;
    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) return;

    const audioContext =
      audioContextRef.current || new AudioContextCtor();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
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
  }, []);

  const presentIncomingPopup = React.useCallback((nextPopup: TopBarIncomingPopup) => {
    setIncomingPopup((current) => {
      if (
        current &&
        current.id === nextPopup.id &&
        new Date(current.lastAt).getTime() >= new Date(nextPopup.lastAt).getTime()
      ) {
        return current;
      }
      return nextPopup;
    });
    playIncomingAlertTone();
  }, [playIncomingAlertTone]);

  const accessibleModules = useMemo(() => {
    return new Set((modules || []).filter((m) => m.accessible).map((m) => m.key));
  }, [modules]);

  useEffect(() => {
    function refreshAuthState() {
      setAuthenticated(Boolean(getToken()));
    }

    refreshAuthState();
    window.addEventListener("auth-change", refreshAuthState);
    window.addEventListener("storage", refreshAuthState);
    return () => {
      window.removeEventListener("auth-change", refreshAuthState);
      window.removeEventListener("storage", refreshAuthState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const armAudio = () => {
      audioArmedRef.current = true;
    };

    window.addEventListener("pointerdown", armAudio, { once: true });
    window.addEventListener("keydown", armAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", armAudio);
      window.removeEventListener("keydown", armAudio);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => undefined);
      }
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setUser(null);
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
          apiFetch<User>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
        ]);
        if (mounted) {
          setUser(profile);
          setModules(myModules || []);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setModules([]);
        }
      }
    }

    loadUser();
    return () => {
      mounted = false;
    };
  }, [authenticated, setStorageUserId]);

  useEffect(() => {
    setStorageUserId(user?.id ?? null);
  }, [setStorageUserId, user?.id]);

  useEffect(() => {
    if (!authenticated || !user) return;
    if (user.isSystemMaster || !user.company?.id) return;

    let mounted = true;

    const applyStatus = (payload: WhatsAppStatusPayload | null, failed = false) => {
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
    };

    const loadStatus = async () => {
      try {
        const payload = await apiFetch<WhatsAppStatusPayload>("/companies/me/whatsapp-status");
        applyStatus(payload, false);
      } catch {
        applyStatus(null, true);
      }
    };

    loadStatus();
    const timer = window.setInterval(loadStatus, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [authenticated, user, user?.id, user?.company?.id, user?.isSystemMaster]);

  useEffect(() => {
    if (!authenticated) {
      setRecoveryPendingHumanCount(0);
      setAtendimentoPendingHumanCount(0);
      return;
    }

    const applyCount = (
      setter: React.Dispatch<React.SetStateAction<number>>,
      value: unknown,
    ) => {
      const next = Number(value);
      setter(Number.isFinite(next) ? Math.max(0, Math.trunc(next)) : 0);
    };

    const readStoredCount = () => {
      try {
        applyCount(setRecoveryPendingHumanCount, window.localStorage.getItem(RECOVERY_QUEUE_STORAGE_KEY) || 0);
        applyCount(
          setAtendimentoPendingHumanCount,
          window.localStorage.getItem(ATENDIMENTO_QUEUE_STORAGE_KEY) || 0,
        );
      } catch {
        applyCount(setRecoveryPendingHumanCount, 0);
        applyCount(setAtendimentoPendingHumanCount, 0);
      }
    };

    const handleRecoveryQueueEvent = (event: Event) => {
      applyCount(
        setRecoveryPendingHumanCount,
        (event as CustomEvent<{ count?: number }>).detail?.count ?? 0,
      );
    };

    const handleAtendimentoQueueEvent = (event: Event) => {
      applyCount(
        setAtendimentoPendingHumanCount,
        (event as CustomEvent<{ count?: number }>).detail?.count ?? 0,
      );
    };

    readStoredCount();
    window.addEventListener(RECOVERY_HUMAN_QUEUE_EVENT, handleRecoveryQueueEvent as EventListener);
    window.addEventListener(
      ATENDIMENTO_HUMAN_QUEUE_EVENT,
      handleAtendimentoQueueEvent as EventListener,
    );
    window.addEventListener("storage", readStoredCount);

    return () => {
      window.removeEventListener(
        RECOVERY_HUMAN_QUEUE_EVENT,
        handleRecoveryQueueEvent as EventListener,
      );
      window.removeEventListener(
        ATENDIMENTO_HUMAN_QUEUE_EVENT,
        handleAtendimentoQueueEvent as EventListener,
      );
      window.removeEventListener("storage", readStoredCount);
    };
  }, [authenticated]);

  useEffect(() => {
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

    const pollIncomingAlerts = async () => {
      const popupCandidates: TopBarIncomingPopup[] = [];

      if (accessibleModules.has("hbx_recovery")) {
        try {
          const payload = await apiFetch<RecoveryAlertSummary>("/hbx-recovery/interactions?queue=all");
          if (cancelled) return;

          setRecoveryPendingHumanCount(
            Number.isFinite(Number(payload?.pendingHumanCount))
              ? Math.max(0, Math.trunc(Number(payload?.pendingHumanCount)))
              : 0,
          );

          const previousLastSeen = recoveryLastSeenRef.current;
          const previousHumanQueue = recoveryHumanQueueRef.current;
          const nextLastSeen = new Map<number, string>();
          const nextHumanQueue = new Map<number, boolean>();

          for (const item of Array.isArray(payload?.conversations) ? payload.conversations : []) {
            nextLastSeen.set(item.conversationId, item.lastAt);
            nextHumanQueue.set(item.conversationId, Boolean(item.humanQueue));
            const previousTimestamp = previousLastSeen.get(item.conversationId);
            const previousQueued = previousHumanQueue.get(item.conversationId);
            const isInbound = String(item.lastDirection || "").trim().toUpperCase() === "INBOUND";
            const requiresHumanAttention = Boolean(item.humanQueue || item.humanAssigned);
            const becameHumanQueue = Boolean(item.humanQueue) && previousQueued !== true;
            const hasNewInbound = Boolean(
              previousTimestamp &&
                isInbound &&
                new Date(item.lastAt).getTime() > new Date(previousTimestamp).getTime(),
            );
            const isNewConversation = !previousTimestamp && isInbound && requiresHumanAttention;
            if (
              recoveryAlertReadyRef.current &&
              !item.isClosed &&
              !item.isBlocked &&
              (becameHumanQueue || hasNewInbound || isNewConversation)
            ) {
              popupCandidates.push({
                id: `recovery:${item.conversationId}:${item.lastAt}:${becameHumanQueue ? "human_queue" : "new_message"}`,
                moduleLabel: "Recovery",
                attentionLabel: becameHumanQueue ? "Fila humana" : "Nova mensagem",
                customerLabel: item.customerName || item.customerWhatsapp || "Cliente Recovery",
                contactPhone: item.customerWhatsapp || item.conversationWhatsapp || "-",
                entryNumberLabel: extractEntryNumberLabel(item.metadata),
                preview:
                  String(item.lastMessage || "").trim() ||
                  (becameHumanQueue
                    ? "Cliente solicitou atendimento humano."
                    : "Nova mensagem aguardando resposta no Recovery."),
                href: "/hbx-recovery",
                lastAt: item.lastAt,
              });
            }
          }

          recoveryLastSeenRef.current = nextLastSeen;
          recoveryHumanQueueRef.current = nextHumanQueue;
          recoveryAlertReadyRef.current = true;
        } catch {
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
          const payload = await apiFetch<InboxAlertConversation[]>("/inbox/conversations");
          if (cancelled) return;

          const rows = Array.isArray(payload) ? payload : [];
          const pendingRows = rows.filter(
            (conversation) =>
              conversation.routeTarget === "atendimento" &&
              !conversation.isBlocked &&
              (conversation.status === "new" || conversation.status === "open"),
          );
          setAtendimentoPendingHumanCount(pendingRows.length);

          const previousLastSeen = atendimentoLastSeenRef.current;
          const nextLastSeen = new Map<string, string>();

          for (const conversation of pendingRows) {
            const latestMessage = conversation.messages?.[0];
            const lastAt = String(latestMessage?.createdAt || conversation.updatedAt || "");
            if (!lastAt) continue;
            nextLastSeen.set(conversation.id, lastAt);

            const previousTimestamp = previousLastSeen.get(conversation.id);
            const isInbound =
              String(latestMessage?.direction || "").trim().toLowerCase() === "inbound";
            const hasNewInbound = Boolean(
              previousTimestamp &&
                isInbound &&
                new Date(lastAt).getTime() > new Date(previousTimestamp).getTime(),
            );
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
                lastAt,
              });
            }
          }

          atendimentoLastSeenRef.current = nextLastSeen;
          atendimentoAlertReadyRef.current = true;
        } catch {
          // keep local counters when polling fails
        }
      } else {
        setAtendimentoPendingHumanCount(0);
        atendimentoLastSeenRef.current = new Map();
        atendimentoAlertReadyRef.current = false;
      }

      const newestPopup = [...popupCandidates].sort(
        (left, right) =>
          new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime(),
      )[0];
      if (newestPopup) {
        presentIncomingPopup(newestPopup);
      }
    };

    void pollIncomingAlerts();
    const timer = window.setInterval(() => {
      void pollIncomingAlerts();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authenticated, accessibleModules, presentIncomingPopup, user]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (!userMenuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const topbar = topbarFrameRef.current;
    if (!root || !topbar) return;

    const setVar = () => {
      const rect = topbar.getBoundingClientRect();
      root.style.setProperty("--topbar-total-height", `${Math.ceil(rect.height)}px`);
    };

    setVar();

    let observer: ResizeObserver | null = null;
    try {
      observer = new ResizeObserver(setVar);
      observer.observe(topbar);
    } catch {
      window.addEventListener("resize", setVar);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", setVar);
    };
  }, [authenticated, incomingPopup, open, pathname]);

  async function handleLogout() {
    await runGlobalShutdown(async () => {
      clearToken();
      setAuthenticated(false);
      setUser(null);
      router.push("/login");
    });
  }

  function clearQueueBadge(
    moduleKey: "atendimento" | "recovery",
    options?: { dismissPopup?: boolean },
  ) {
    if (typeof window !== "undefined") {
      try {
        const storageKey =
          moduleKey === "atendimento"
            ? ATENDIMENTO_QUEUE_STORAGE_KEY
            : RECOVERY_QUEUE_STORAGE_KEY;
        const eventName =
          moduleKey === "atendimento"
            ? ATENDIMENTO_HUMAN_QUEUE_EVENT
            : RECOVERY_HUMAN_QUEUE_EVENT;
        window.localStorage.setItem(storageKey, "0");
        window.dispatchEvent(
          new CustomEvent<{ count: number }>(eventName, {
            detail: { count: 0 },
          }),
        );
      } catch {
        // ignore storage/event errors
      }
    }

    if (moduleKey === "atendimento") {
      setAtendimentoPendingHumanCount(0);
    } else {
      setRecoveryPendingHumanCount(0);
    }

    if (
      options?.dismissPopup &&
      incomingPopup &&
      ((moduleKey === "atendimento" && incomingPopup.href === "/dashboard/inbox") ||
        (moduleKey === "recovery" && incomingPopup.href === "/hbx-recovery"))
    ) {
      setIncomingPopup(null);
    }
  }

  function handleQueueShortcut(moduleKey: "atendimento" | "recovery") {
    clearQueueBadge(moduleKey, { dismissPopup: true });
    router.push(moduleKey === "atendimento" ? "/dashboard/inbox" : "/hbx-recovery");
  }

  async function openMasterContextModal() {
    setMasterContextMessage(null);
    setMasterContextModalOpen(true);
    if (masterCompanyOptions.length) return;
    try {
      const payload = await apiFetch<MasterOverviewCompanyPayload[]>("/modules/master/companies");
      const normalized = (Array.isArray(payload) ? payload : []).map((item) => ({
        id: Number(item?.id || 0),
        name: String(item?.name || `Empresa ${item?.id || ""}`),
        isActive: Boolean(item?.isActive),
        paymentStatus: String(item?.paymentStatus || "PENDING"),
      })).filter((item) => item.id > 0);
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
    if (!companyId) {
      setMasterContextMessage("Selecione uma empresa para assumir contexto.");
      return;
    }

    setMasterContextActionBusy(true);
    setMasterContextMessage(null);
    try {
      await apiFetch("/master-context/assume", {
        method: "POST",
        body: JSON.stringify({
          companyId,
          reason: masterContextReason || undefined,
        }),
      });

      const [profile, myModules] = await Promise.all([
        apiFetch<User>("/profile/current-user"),
        apiFetch<UserModule[]>("/modules/me"),
      ]);
      setUser(profile);
      setModules(myModules || []);
      setMasterContextModalOpen(false);
      setMasterContextReason("");
      // reload to ensure all modules and routes update for the new context
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao assumir contexto da empresa.";
      setMasterContextMessage(message);
    } finally {
      setMasterContextActionBusy(false);
    }
  }

  async function exitMasterContext() {
    setMasterContextActionBusy(true);
    setMasterContextMessage(null);
    try {
      await apiFetch("/master-context/exit", {
        method: "POST",
        body: JSON.stringify({ reason: "manual_exit" }),
      });

      const [profile, myModules] = await Promise.all([
        apiFetch<User>("/profile/current-user"),
        apiFetch<UserModule[]>("/modules/me"),
      ]);
      setUser(profile);
      setModules(myModules || []);
      setMasterContextModalOpen(false);
      setMasterContextReason("");
      // reload to refresh available modules after exiting context
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sair do contexto assumido.";
      setMasterContextMessage(message);
    } finally {
      setMasterContextActionBusy(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChanging(true);
    setChangeMsg(null);

    try {
      await apiFetch("/profile/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: curPass,
          newPassword: newPass,
        }),
      });
      setChangeMsg("Senha atualizada com sucesso.");
      setCurPass("");
      setNewPass("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar senha.";
      setChangeMsg(message);
    } finally {
      setChanging(false);
    }
  }

  const pendingHumanCount = recoveryPendingHumanCount + atendimentoPendingHumanCount;
  const queueLabel =
    pendingHumanCount > 0
      ? `Atendimento: ${atendimentoPendingHumanCount} | Recovery: ${recoveryPendingHumanCount}`
      : null;
  const accountContext = authenticated
    ? user?.isSystemMaster
      ? user.masterContext?.active
        ? `MASTER em ${user.masterContext.companyName || "Empresa"}`
        : "MASTER GLOBAL"
      : user?.company?.name || "Operacao sem empresa"
    : "Plataforma operacional HBX";
  const workspaceBadge = pendingHumanCount > 0 ? `${pendingHumanCount} na fila` : "Fila sob controle";
  if (hiddenRoutes.has(pathname)) {
    return null;
  }

  return (
    <header className="app-topbar">
      <div ref={topbarFrameRef} className="app-topbar__frame">
        <div className="app-topbar__inner">
          <div className="app-topbar__left">
            <Link href={authenticated ? "/dashboard" : "/login"} className="app-brand">
              <span className="app-brand__mark">HB</span>
              <span className="app-brand__body">
                <span className="app-brand__text">HBX Control Center</span>
                <span className="app-brand__context">{accountContext}</span>
              </span>
            </Link>

            {authenticated && user && !user.isSystemMaster && user.company?.id ? (
              <div className="app-topbar__signals">
                <button
                  type="button"
                  className={`wa-health-wrap ${atendimentoPendingHumanCount > 0 ? "wa-health-wrap--alert" : ""}`}
                  onClick={() => handleQueueShortcut("atendimento")}
                >
                  <span
                    className={`wa-health wa-health--${whatsAppHealth}`}
                    title={`${whatsAppHealthLabel} · Atendimento: ${atendimentoPendingHumanCount}`}
                    aria-label={`${whatsAppHealthLabel} · Atendimento: ${atendimentoPendingHumanCount}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19.1 4.9A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 19.1 4.9Zm-7.1 15.4a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.2c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1-.1.2-.5.7-.6.8-.1.1-.2.1-.4 0s-.9-.3-1.7-1a6.4 6.4 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.3.2-.3c.1-.1.1-.3 0-.4L10.4 8c-.1-.2-.3-.2-.4-.2h-.4c-.1 0-.4.1-.5.3-.2.2-.7.7-.7 1.6 0 1 .7 1.9.8 2 .1.1 1.3 2 3.2 2.8.5.2.9.4 1.2.5.5.1 1 .1 1.4.1.4-.1 1.2-.5 1.4-1 .2-.6.2-1 .1-1.1 0-.1-.2-.1-.4-.2Z" />
                    </svg>
                  </span>
                  {atendimentoPendingHumanCount > 0 ? (
                    <span className="wa-health__queue-badge" aria-hidden="true">
                      {atendimentoPendingHumanCount}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  className={`wa-health-wrap ${recoveryPendingHumanCount > 0 ? "wa-health-wrap--alert" : ""}`}
                  onClick={() => handleQueueShortcut("recovery")}
                >
                  <span
                    className={`wa-health wa-health--${whatsAppHealth}`}
                    title={`${whatsAppHealthLabel} · Recovery: ${recoveryPendingHumanCount}`}
                    aria-label={`${whatsAppHealthLabel} · Recovery: ${recoveryPendingHumanCount}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 14.5V18h-2v-1.5A4 4 0 1 1 13 16.5z" />
                    </svg>
                  </span>
                  {recoveryPendingHumanCount > 0 ? (
                    <span className="wa-health__queue-badge" aria-hidden="true">
                      {recoveryPendingHumanCount}
                    </span>
                  ) : null}
                </button>

                {queueLabel ? <span className="app-topbar__queueLabel">{queueLabel}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="app-topbar__center">
            <div className="app-topbar__summary">
              <p className="app-topbar__summaryLabel">Workspace ativo</p>
              <strong>HBX Workspace</strong>
            </div>
            <div className="app-topbar__metaGrid" aria-label="Resumo rapido do shell">
              <span className="app-topbar__metaPill">
                <strong>{workspaceBadge}</strong>
                <span>Fila</span>
              </span>
            </div>
          </div>

          <div className="app-topbar__right">
            {authenticated && user?.isSystemMaster ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={openMasterContextModal}
              >
                Contexto
              </button>
            ) : null}
            {authenticated && user?.isSystemMaster && user.masterContext?.active ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={exitMasterContext}
                disabled={masterContextActionBusy}
              >
                Sair contexto
              </button>
            ) : null}
            {authenticated ? <ThemeSwitcher /> : null}
            {user ? (
              <div ref={userMenuRef} className="app-user">
                <button
                  type="button"
                  className="app-user__trigger"
                  onClick={() => setOpen((value) => !value)}
                  aria-expanded={open}
                >
                  <span className="app-user__avatar">
                    {user.username ? user.username.charAt(0).toUpperCase() : "U"}
                  </span>
                  <span className="app-user__meta">
                    <span className="app-user__name">{user.username}</span>
                    <span className="app-user__company">
                      {user.isSystemMaster
                        ? user.masterContext?.active
                          ? `MASTER em ${user.masterContext.companyName || "Empresa"}`
                          : "MASTER"
                        : user.company?.name ?? "Sem empresa"}
                    </span>
                  </span>
                </button>

                {open ? (
                  <div className="app-user__menu">
                    <p className="app-user__menu-title">Editar senha</p>
                    <form onSubmit={handlePasswordSubmit} className="app-user__form">
                      <input
                        type="password"
                        placeholder="Senha atual"
                        value={curPass}
                        onChange={(event) => setCurPass(event.target.value)}
                        className="field"
                      />
                      <input
                        type="password"
                        placeholder="Nova senha (min. 4)"
                        value={newPass}
                        onChange={(event) => setNewPass(event.target.value)}
                        className="field"
                      />
                      {changeMsg ? <p className="text-xs text-muted leading-5">{changeMsg}</p> : null}
                      <div className="app-user__menu-actions">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={changing || newPass.length < 4}
                        >
                          {changing ? "Salvando..." : "Salvar senha"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setOpen(false)}
                        >
                          Fechar
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : null}

            {authenticated ? (
              <button
                type="button"
                onClick={() => {
                  void handleLogout();
                }}
                className="btn btn-secondary btn-sm"
                disabled={isShuttingDown}
              >
                {isShuttingDown ? "Saindo..." : "Sair"}
              </button>
            ) : (
              <Link href="/login" className="btn btn-secondary btn-sm">
                Entrar
              </Link>
            )}
          </div>
        </div>

        {/* dock removed: counter is shown on individual icons (wa-health__queue-badge) */}
      </div>

      {incomingPopup ? (
        <div className="incoming-alert">
          <div className="incoming-alert__header">
            <div>
              <p className="incoming-alert__eyebrow">{incomingPopup.moduleLabel}</p>
              <p className="incoming-alert__title">{incomingPopup.attentionLabel}</p>
              <p className="incoming-alert__customer">{incomingPopup.customerLabel}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIncomingPopup(null)}
            >
              Fechar
            </button>
          </div>

          <div className="incoming-alert__meta">
            <p>Contato: {incomingPopup.contactPhone}</p>
            {incomingPopup.entryNumberLabel ? (
              <p>Recebido em: {incomingPopup.entryNumberLabel}</p>
            ) : null}
          </div>

          <p className="incoming-alert__preview">{incomingPopup.preview}</p>

          <div className="incoming-alert__actions">
            <Link
              href={incomingPopup.href}
              className="btn btn-primary btn-sm"
              onClick={() => setIncomingPopup(null)}
            >
              Abrir módulo
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIncomingPopup(null)}
            >
              Dispensar
            </button>
          </div>
        </div>
      ) : null}

      {masterContextModalOpen && authenticated && user?.isSystemMaster ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            background: "rgba(6, 19, 38, 0.42)",
            display: "grid",
            placeItems: "center",
            padding: "16px",
          }}
        >
          <div className="panel" style={{ width: "min(620px, 100%)", padding: 16 }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Suporte interno MASTER</p>
                <h3 className="mt-1 text-lg font-semibold">Assumir contexto da empresa</h3>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMasterContextModalOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {masterContextMessage ? (
                <div className="alert alert-error">{masterContextMessage}</div>
              ) : null}

              <label className="grid gap-1 text-sm">
                Empresa
                <select
                  className="field"
                  value={selectedMasterCompanyId}
                  onChange={(event) => setSelectedMasterCompanyId(event.target.value)}
                >
                  <option value="">Selecione...</option>
                  {masterCompanyOptions.map((company) => (
                    <option key={company.id} value={String(company.id)}>
                      {company.name} | {company.isActive ? "ativa" : "inativa"} | {company.paymentStatus}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                Motivo (opcional)
                <textarea
                  className="field"
                  rows={3}
                  value={masterContextReason}
                  onChange={(event) => setMasterContextReason(event.target.value)}
                  placeholder="Ex.: diagnostico de webhook Meta para empresa X"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={assumeMasterContext}
                  disabled={masterContextActionBusy}
                >
                  {masterContextActionBusy ? "Aplicando..." : "Assumir contexto"}
                </button>
                {user.masterContext?.active ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={exitMasterContext}
                    disabled={masterContextActionBusy}
                  >
                    Sair do contexto atual
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <TechAssistantGlobalDrawer
        isSystemMaster={Boolean(user?.isSystemMaster)}
        masterContext={user?.masterContext || null}
      />
    </header>
  );
}

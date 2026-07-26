"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch, getToken } from "@/lib/api";
import { setMobileCallMode, useMobileCallMode } from "@/lib/mobile-call-mode";
import { setWaOpenMode, useWaOpenMode } from "@/lib/wa-open-mode";

import styles from "./mobile-device-topbar.module.css";

const MOBILE_APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "/download/android-logistica").trim();
const ONLINE_WINDOW_MS = 90_000;
const MOBILE_ICON = [
  "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
  "M10 18h4",
];

type MobileDevice = {
  id: string;
  name?: string | null;
  platform?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  active: boolean;
};

type MobileAction = {
  id: string;
  kind: "call" | "whatsapp";
  phone: string;
  contactName?: string | null;
  status: string;
  requestedAt: string;
  estimatedDurationSeconds?: number | null;
  result?: string | null;
};

type MobileHistoryResponse = { actions?: MobileAction[] };

function formatDate(value?: string | null) {
  if (!value) return "Ainda não conectado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(value?: number | null) {
  if (value == null || value < 0) return null;
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function actionStatus(action: MobileAction) {
  if (action.result) return action.result.replaceAll("_", " ");
  const labels: Record<string, string> = {
    queued: "aguardando celular",
    delivering: "enviando ao celular",
    delivered: "recebido no celular",
    opened: "aberto",
    started: "ação iniciada",
    returned: "voltou ao HBX",
    completed: "concluído",
    canceled: "cancelado",
    failed: "falhou",
    expired: "expirada",
  };
  return labels[action.status] || action.status;
}

function isOnline(device: MobileDevice | undefined, now: number) {
  if (!device?.active || !device.lastUsedAt) return false;
  const last = new Date(device.lastUsedAt).getTime();
  return Number.isFinite(last) && now - last <= ONLINE_WINDOW_MS;
}

function MobileDeviceAction() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  // A ponte HBX Logística é exclusiva de contas de EMPRESA (vendedor/entregador).
  // O MASTER — puro ou com contexto de empresa assumido pelo /master — mantém o
  // próprio JWT (isSystemMaster); o backend rejeita essa conta por design em
  // /mobile/devices (resolvePairingOwner → 400) e /mobile/actions/history
  // (resolveWebOwner → 401). Sem este guard, "assumir contexto" dispara esse par
  // de erros a cada navegação e a cada 30s, e o ícone do topo fica no estado de
  // erro (vermelho) — a origem do "assumir contexto enche de bug".
  const isSystemMaster = Boolean(currentUser?.isSystemMaster)
    || String(currentUser?.userKind || "").toLowerCase() === "system_master";
  const callMode = useMobileCallMode();
  const waMode = useWaOpenMode();
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [history, setHistory] = useState<MobileAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLSpanElement | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const [deviceResult, historyResult] = await Promise.all([
        apiFetch<MobileDevice[]>("/mobile/devices"),
        apiFetch<MobileHistoryResponse>("/mobile/actions/history?take=5").catch(() => ({ actions: [] })),
      ]);
      setDevices(Array.isArray(deviceResult) ? deviceResult : []);
      setHistory(Array.isArray(historyResult?.actions) ? historyResult.actions : []);
      setFailed(false);
      setNow(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Só consulta quando já sabemos o papel e NÃO é master: evita disparar o par
    // 400/401 antes de o /profile/current-user responder (e para sempre no master).
    if (!currentUser || isSystemMaster) return;
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load, currentUser, isSystemMaster]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeDevices = useMemo(() => devices
    .filter(device => device.active)
    .sort((left, right) => {
      const leftAt = left.lastUsedAt ? new Date(left.lastUsedAt).getTime() : 0;
      const rightAt = right.lastUsedAt ? new Date(right.lastUsedAt).getTime() : 0;
      return rightAt - leftAt;
    }), [devices]);
  const primary = activeDevices[0];
  const online = isOnline(primary, now);
  const linked = activeDevices.length > 0;
  const state = failed ? "error" : online ? "active" : "off";
  const title = failed
    ? "HBX Logística — não foi possível consultar o aparelho"
    : online
      ? "HBX Logística — online"
      : linked
        ? "HBX Logística — aparelho offline"
        : "HBX Logística — vincular aparelho";
  const buttonClass = "round-btn wa-action-btn"
    + (state === "active" ? " wa-action-btn--active" : "")
    + (state === "error" ? " wa-action-btn--error" : "");

  // Master não pareia celular: nem renderiza o botão (some o ícone de erro).
  if (isSystemMaster) return null;

  return (
    <span ref={rootRef} className={styles.actionRoot}>
      <button
        className={buttonClass}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(value => !value)}
      >
        <I d={MOBILE_ICON} size={17} />
        {!loading && !linked && <span className={styles.plusBadge}>+</span>}
        {!loading && linked && <span className={`${styles.statusDot} ${online ? styles.statusDotOnline : ""}`} />}
      </button>
      {open && (
        <div className={`hbx-pop ${styles.popover}`} role="dialog" aria-label="HBX Logística">
          <div className={styles.heading}>
            <span className={styles.deviceGlyph}><I d={MOBILE_ICON} size={18} /></span>
            <div>
              <strong>HBX Logística</strong>
              <span className={online ? styles.onlineText : styles.mutedText}>
                {online ? "Online agora" : linked ? "Offline" : "Nenhum aparelho vinculado"}
              </span>
            </div>
            <button className={styles.refreshButton} disabled={loading} onClick={() => void load()}>
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>

          <div className={styles.scrollArea}>
            {primary && (
              <div className={styles.deviceCard}>
                <strong>{primary.name || "Aparelho Android"}</strong>
                <span>{primary.platform || "android"}</span>
                <small>Último acesso: {formatDate(primary.lastUsedAt)}</small>
              </div>
            )}

            {linked && (
              <div className={styles.preferences}>
                <span className={styles.sectionLabel}>Usar o celular para</span>
                <button
                  type="button"
                  className={`${styles.preference} ${callMode === "mobile" ? styles.preferenceOn : ""}`}
                  onClick={() => setMobileCallMode(callMode === "mobile" ? "local" : "mobile")}
                >
                  <span><I d={ICONS.phone} size={15} /> Ligações</span>
                  <b>{callMode === "mobile" ? "Celular" : "Neste dispositivo"}</b>
                </button>
                <button
                  type="button"
                  className={`${styles.preference} ${waMode === "mobile" ? styles.preferenceOn : ""}`}
                  onClick={() => setWaOpenMode(waMode === "mobile" ? "external" : "mobile")}
                >
                  <span><I d={ICONS.msg} size={15} /> WhatsApp pessoal</span>
                  <b>{waMode === "mobile" ? "Celular" : "Direto daqui"}</b>
                </button>
                <small className={styles.preferenceNote}>
                  O HBX prepara a ação. A ligação e o envio da mensagem ainda são confirmados pela pessoa no celular.
                </small>
              </div>
            )}

            {history.length > 0 && (
              <div className={styles.history}>
                <span className={styles.sectionLabel}>Histórico recente</span>
                {history.map(action => {
                  const duration = formatDuration(action.estimatedDurationSeconds);
                  return (
                    <div className={styles.historyItem} key={action.id}>
                      <span className={styles.historyIcon}>
                        <I d={action.kind === "call" ? ICONS.phone : ICONS.msg} size={13} />
                      </span>
                      <span className={styles.historyCopy}>
                        <strong>{action.contactName || action.phone}</strong>
                        <small>{actionStatus(action)}{duration ? ` · ${duration}` : ""}</small>
                      </span>
                      <time>{new Date(action.requestedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  );
                })}
              </div>
            )}

            {failed && <div className={styles.errorText}>Não foi possível atualizar o status agora.</div>}
          </div>

          <div className={styles.actions}>
            <button
              className="btn-ghost"
              onClick={() => {
                setOpen(false);
                router.push("/configuracoes/aplicativo");
              }}
            >
              {linked ? "Gerenciar aparelho" : "Vincular aparelho"}
            </button>
            <div className={styles.downloads}>
              <a className="btn-ghost" href={MOBILE_APK_URL} target="_blank" rel="noreferrer">
                Baixar HBX Logística
              </a>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

export function MobileDeviceTopbarBridge() {
  const currentUser = useCurrentUser();
  // Mesmo motivo do guard interno: o master não usa a ponte HBX Logística. Nem
  // inserimos o host no topo — um <span> vazio viraria item-flex e somaria o
  // gap de 12px do `.top-actions` (buraco no topo só pro master).
  const isSystemMaster = Boolean(currentUser?.isSystemMaster)
    || String(currentUser?.userKind || "").toLowerCase() === "system_master";
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (isSystemMaster) return;
    const actions = document.querySelector<HTMLElement>(".top-actions");
    if (!actions || actions.querySelector("[data-hbx-mobile-topbar-host]")) return;

    const host = document.createElement("span");
    host.dataset.hbxMobileTopbarHost = "true";
    host.className = styles.portalHost;

    const accountButton = actions.querySelector<HTMLElement>('[aria-label="Conta"]');
    const accountWrapper = accountButton?.parentElement || null;
    actions.insertBefore(host, accountWrapper);

    const frame = window.requestAnimationFrame(() => setTarget(host));
    return () => {
      window.cancelAnimationFrame(frame);
      host.remove();
      setTarget(null);
    };
  }, [isSystemMaster]);

  return target && !isSystemMaster ? createPortal(<MobileDeviceAction />, target) : null;
}

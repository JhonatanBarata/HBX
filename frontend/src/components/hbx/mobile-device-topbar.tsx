"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { I } from "@/components/hbx/shell";
import { apiFetch, getToken } from "@/lib/api";

import styles from "./mobile-device-topbar.module.css";

const APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();
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

function formatDate(value?: string | null) {
  if (!value) return "Ainda não conectado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function isOnline(device: MobileDevice | undefined, now: number) {
  if (!device?.active || !device.lastUsedAt) return false;
  const last = new Date(device.lastUsedAt).getTime();
  return Number.isFinite(last) && now - last <= ONLINE_WINDOW_MS;
}

function MobileDeviceAction() {
  const router = useRouter();
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLSpanElement | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const result = await apiFetch<MobileDevice[]>("/mobile/devices");
      setDevices(Array.isArray(result) ? result : []);
      setFailed(false);
      setNow(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

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

  const activeDevices = useMemo(() => devices.filter(device => device.active), [devices]);
  const primary = activeDevices[0];
  const online = isOnline(primary, now);
  const linked = activeDevices.length > 0;
  const state = failed ? "error" : online ? "active" : "off";
  const title = failed
    ? "HBX Mobile — não foi possível consultar o aparelho"
    : online
      ? "HBX Mobile — online"
      : linked
        ? "HBX Mobile — aparelho offline"
        : "HBX Mobile — vincular aparelho";
  const buttonClass = "round-btn wa-action-btn"
    + (state === "active" ? " wa-action-btn--active" : "")
    + (state === "error" ? " wa-action-btn--error" : "");

  return (
    <span ref={rootRef} className={styles.actionRoot}>
      <button
        className={buttonClass}
        title={title}
        aria-label={title}
        onClick={() => setOpen(value => !value)}
      >
        <I d={MOBILE_ICON} size={17} />
        {!loading && !linked && <span className={styles.plusBadge}>+</span>}
        {!loading && linked && <span className={`${styles.statusDot} ${online ? styles.statusDotOnline : ""}`} />}
      </button>
      {open && (
        <div className={`hbx-pop ${styles.popover}`}>
          <div className={styles.heading}>
            <span className={styles.deviceGlyph}><I d={MOBILE_ICON} size={18} /></span>
            <div>
              <strong>HBX Mobile</strong>
              <span className={online ? styles.onlineText : styles.mutedText}>
                {online ? "Online agora" : linked ? "Offline" : "Nenhum aparelho vinculado"}
              </span>
            </div>
          </div>

          {primary && (
            <div className={styles.deviceCard}>
              <strong>{primary.name || "Aparelho Android"}</strong>
              <span>{primary.platform || "android"}</span>
              <small>Último acesso: {formatDate(primary.lastUsedAt)}</small>
            </div>
          )}

          {failed && <div className={styles.errorText}>Não foi possível atualizar o status agora.</div>}

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
            {APK_URL && (
              <a className="btn-ghost" href={APK_URL} target="_blank" rel="noreferrer">
                Baixar APK
              </a>
            )}
            <button className="btn-ghost" disabled={loading} onClick={() => void load()}>
              {loading ? "Atualizando…" : "Atualizar status"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

export function MobileDeviceTopbarBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const actions = document.querySelector<HTMLElement>(".top-actions");
    if (!actions || actions.querySelector("[data-hbx-mobile-topbar-host]")) return;

    const host = document.createElement("span");
    host.dataset.hbxMobileTopbarHost = "true";
    host.className = styles.portalHost;

    const accountButton = actions.querySelector<HTMLElement>('[aria-label="Conta"]');
    const accountWrapper = accountButton?.parentElement || null;
    actions.insertBefore(host, accountWrapper);
    setTarget(host);

    return () => {
      setTarget(null);
      host.remove();
    };
  }, []);

  return target ? createPortal(<MobileDeviceAction />, target) : null;
}

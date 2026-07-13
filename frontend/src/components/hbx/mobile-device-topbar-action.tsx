"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch, getToken } from "@/lib/api";

type MobileDevice = {
  id: string;
  name?: string | null;
  platform?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  active: boolean;
};

type DeviceState = "unlinked" | "offline" | "online";

const ONLINE_WINDOW_MS = 120_000;
const APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();

function isOnline(device: MobileDevice | null, now: number) {
  if (!device?.active || !device.lastUsedAt) return false;
  const lastSeen = new Date(device.lastUsedAt).getTime();
  return Number.isFinite(lastSeen) && now - lastSeen <= ONLINE_WINDOW_MS;
}

function formatLastSeen(value?: string | null) {
  if (!value) return "Ainda não se comunicou";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Último acesso indisponível";
  return `Último acesso: ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)}`;
}

export function MobileDeviceTopbarAction() {
  const router = useRouter();
  const [host, setHost] = useState<Element | null>(null);
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const result = await apiFetch<MobileDevice[]>("/mobile/devices");
      setDevices(Array.isArray(result) ? result.filter(device => device.active) : []);
    } catch {
      // O botão continua neutro se o endpoint estiver temporariamente indisponível.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const findHost = () => {
      if (cancelled) return;
      const target = document.querySelector(".top-actions");
      if (target) setHost(target);
      else window.setTimeout(findHost, 100);
    };
    findHost();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 30_000);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const primary = useMemo(() => {
    return [...devices].sort((a, b) => {
      const aTime = new Date(a.lastUsedAt || a.createdAt).getTime();
      const bTime = new Date(b.lastUsedAt || b.createdAt).getTime();
      return bTime - aTime;
    })[0] || null;
  }, [devices]);

  const state: DeviceState = !primary ? "unlinked" : isOnline(primary, now) ? "online" : "offline";
  const title = loading
    ? "HBX Mobile — verificando"
    : state === "online"
      ? "HBX Mobile — online"
      : state === "offline"
        ? "HBX Mobile — offline"
        : "HBX Mobile — vincular aparelho";

  if (!host) return null;

  return createPortal(
    <span ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className={`round-btn wa-action-btn${state === "online" ? " wa-action-btn--active" : ""}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <I d={ICONS.phone} size={17} />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 3,
            bottom: 3,
            width: 7,
            height: 7,
            borderRadius: 999,
            border: "1.5px solid var(--surface, white)",
            background: state === "online" ? "var(--hbx-brand)" : state === "offline" ? "var(--text-muted)" : "transparent",
          }}
        />
      </button>

      {open && (
        <div
          className="hbx-pop"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 40,
            minWidth: 270,
            padding: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 4px" }}>
            <span className={state === "online" ? "wa-action-btn wa-action-btn--active" : "round-btn"} style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <I d={ICONS.phone} size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: "0.76rem" }}>HBX Mobile</strong>
              <small style={{ color: "var(--text-muted)", fontSize: "0.64rem" }}>
                {state === "online" ? "Aparelho online" : state === "offline" ? "Aparelho vinculado, mas offline" : "Nenhum aparelho vinculado"}
              </small>
            </div>
          </div>

          {primary && (
            <div style={{ padding: "7px 8px", borderRadius: 10, background: "var(--surface-soft, rgba(127,127,127,.08))", display: "grid", gap: 3 }}>
              <strong style={{ fontSize: "0.7rem" }}>{primary.name || "Aparelho Android"}</strong>
              <small style={{ color: "var(--text-muted)", fontSize: "0.62rem" }}>{formatLastSeen(primary.lastUsedAt)}</small>
            </div>
          )}

          <button
            type="button"
            className="btn-ghost"
            style={{ width: "100%", minHeight: 34, fontSize: "0.7rem" }}
            onClick={() => {
              setOpen(false);
              router.push("/configuracoes/aplicativo");
            }}
          >
            {primary ? "Gerenciar aparelho" : "Vincular aparelho"}
          </button>

          {APK_URL && (
            <a
              className="btn-ghost"
              href={APK_URL}
              target="_blank"
              rel="noreferrer"
              style={{ width: "100%", minHeight: 34, fontSize: "0.7rem", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              Baixar APK atual
            </a>
          )}

          <small style={{ color: "var(--text-muted)", fontSize: "0.6rem", lineHeight: 1.45, padding: "0 3px 2px" }}>
            Quando o app estiver online, as próximas ações de telefone poderão ser encaminhadas para ele.
          </small>
        </div>
      )}
    </span>,
    host,
  );
}

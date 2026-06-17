"use client";

// Sellers Brains Host (17/06/2026): vive no app-shell (persistente entre rotas).
// Warm-up de 30min após login → dispara POST /pulse/nudge a cada ~30min ±jitter.
// Quando recebe um aviso: escurece a tela (.hbx-veil) e abre o modal polido.
// "Não exibir mais" → ícone voa pro sino (getBoundingClientRect + nó fixo animado)
// → push mutado → sino fica vermelho. Só renderiza para vendedor (role USER).

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

const WARMUP_MS = 30 * 60 * 1000;
const BASE_INTERVAL_MS = 30 * 60 * 1000;
const JITTER_MS = 10 * 60 * 1000;
const SESSION_KEY = "hbx:brain:session-start";
const POPPED_KEY = "hbx:brain:popped";

type BrainNotice = {
  id: string;
  title: string;
  body: string;
  tone: string;
  forceSeconds: number;
  source: string;
  nudgeKey?: string | null;
  payload?: { kind?: string; poolId?: string; href?: string; name?: string; city?: string } | null;
};

function toneIcon(tone: string) {
  if (tone === "success") return "✦";
  if (tone === "warning") return "⚠";
  if (tone === "urgent") return "🔴";
  return "ℹ";
}

function getPoppedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(POPPED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}

function addPopped(id: string) {
  try {
    const s = getPoppedSet();
    s.add(id);
    localStorage.setItem(POPPED_KEY, JSON.stringify([...s].slice(-40)));
  } catch { /* sem storage */ }
}

export function SellersBrainsHost() {
  const user = useCurrentUser();
  const router = useRouter();
  const [notice, setNotice] = useState<BrainNotice | null>(null);
  const [visible, setVisible] = useState(false);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kind = String(user?.userKind || "");
  const role = String(user?.role || "").toUpperCase();
  const isSeller = (kind === "seller" || kind === "user") && role === "USER" && !user?.isSystemMaster;

  // Gravar início de sessão ao montar (se vendedor e logado)
  useEffect(() => {
    if (!isSeller) return;
    try {
      if (!localStorage.getItem(SESSION_KEY)) {
        localStorage.setItem(SESSION_KEY, String(Date.now()));
      }
    } catch { /* sem storage */ }
  }, [isSeller]);

  function close() {
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    setVisible(false);
    setTimeout(() => setNotice(null), 300);
  }

  async function requestNudge() {
    if (document.hidden) return;
    try {
      const res = await apiFetch<{ notice?: BrainNotice | null }>("/pulse/nudge", { method: "POST" });
      if (!res?.notice) return;
      const n = res.notice;
      const popped = getPoppedSet();
      if (popped.has(n.id)) return;
      addPopped(n.id);
      setNotice(n);
      setVisible(true);
      if (n.forceSeconds > 0) {
        if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
        autoCloseRef.current = setTimeout(() => close(), n.forceSeconds * 1000);
      }
    } catch { /* falha de rede — continua */ }
  }

  useEffect(() => {
    if (!isSeller) return;
    let alive = true;
    let nextTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleNext() {
      const jitter = Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
      const delay = Math.max(5 * 60 * 1000, BASE_INTERVAL_MS + jitter);
      nextTimer = setTimeout(() => {
        if (!alive) return;
        requestNudge();
        scheduleNext();
      }, delay);
    }

    function boot() {
      if (!alive) return;
      let start = 0;
      try { start = Number(localStorage.getItem(SESSION_KEY) || "0"); } catch { /* */ }
      const elapsed = start ? Date.now() - start : 0;
      const remaining = Math.max(0, WARMUP_MS - elapsed);
      nextTimer = setTimeout(() => {
        if (!alive) return;
        requestNudge();
        scheduleNext();
      }, remaining);
    }

    boot();
    return () => {
      alive = false;
      if (nextTimer) clearTimeout(nextTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller]);

  async function handleCta() {
    if (!notice) return;
    if (notice.payload?.kind === "lead" && notice.payload?.poolId) {
      try {
        await apiFetch("/webscraping/radar/pull-to-vendas", {
          method: "POST",
          body: JSON.stringify({ leadIds: [notice.payload.poolId] }),
        });
      } catch { /* falha silenciosa */ }
      await ackNotice(notice.id);
      close();
      router.push("/vendas");
    } else {
      await ackNotice(notice.id);
      close();
      router.push(notice.payload?.href || "/vendas");
    }
  }

  async function ackNotice(id: string) {
    try {
      await apiFetch(`/vendas/master-notices/${encodeURIComponent(id)}/ack`, { method: "POST", body: "{}" });
    } catch { /* mantém */ }
  }

  async function handleMute() {
    if (!notice) return;
    // Animação: voa do ícone do modal para o sino
    flyToBell();
    try {
      await apiFetch("/pulse/push-mute", { method: "POST" });
      // Avisa o sino (Topbar) pra ficar vermelho na hora, sem esperar refetch do usuário
      window.dispatchEvent(new CustomEvent("hbx:brain-push-changed", { detail: { muted: true } }));
    } catch { /* mantém */ }
    close();
  }

  function flyToBell() {
    if (!iconRef.current) return;
    const bellEl = document.querySelector<HTMLElement>("[data-hbx-bell]");
    if (!bellEl) return;
    const from = iconRef.current.getBoundingClientRect();
    const to = bellEl.getBoundingClientRect();

    const clone = document.createElement("span");
    clone.textContent = toneIcon(notice?.tone || "info");
    clone.setAttribute("aria-hidden", "true");
    clone.style.cssText = `
      position:fixed;
      left:${from.left + from.width / 2}px;
      top:${from.top + from.height / 2}px;
      font-size:1.1rem;
      pointer-events:none;
      z-index:200;
      transform:translate(-50%,-50%);
      transition:left .42s cubic-bezier(.4,0,.2,1), top .42s cubic-bezier(.4,0,.2,1), opacity .42s;
    `;
    document.body.appendChild(clone);
    // Forçar reflow antes de animar
    void clone.offsetWidth;
    clone.style.left = `${to.left + to.width / 2}px`;
    clone.style.top = `${to.top + to.height / 2}px`;
    clone.style.opacity = "0";
    setTimeout(() => clone.remove(), 500);
  }

  if (!isSeller || !notice || !visible) return null;

  const ctaLabel = notice.payload?.kind === "lead" ? "Puxar pra carteira" : "Abrir tela";

  return createPortal(
    <div className="hbx-veil" role="dialog" aria-modal="true" aria-label={notice.title}>
      <div className="hbx-modal" style={{ width: "min(460px, 100%)", padding: "28px 28px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <span
            ref={iconRef}
            aria-hidden="true"
            style={{ fontSize: "1.5rem", lineHeight: 1, flexShrink: 0, marginTop: 2 }}
          >
            {toneIcon(notice.tone)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 800, marginBottom: 6 }}>
              {notice.title}
            </strong>
            <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.55, color: "var(--text-body)", whiteSpace: "pre-line" }}>
              {notice.body.replace(/\*\*/g, "")}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn-teal" style={{ width: "100%" }} onClick={handleCta}>
            {ctaLabel}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={async () => { await ackNotice(notice.id); close(); }}>
              Marcar lido
            </button>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={handleMute}>
              Não exibir mais
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

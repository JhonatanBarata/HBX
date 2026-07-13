"use client";

import { useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { getMobileCallMode } from "@/lib/mobile-call-mode";
import { getWaOpenMode } from "@/lib/wa-open-mode";

import styles from "./mobile-action-bridge-host.module.css";

type MobileActionKind = "call" | "whatsapp";

type MobileActionResponse = {
  ok?: boolean;
  device?: { name?: string | null };
  delivery?: "push" | "queue";
};

type ToastState = {
  kind: MobileActionKind;
  title: string;
  detail: string;
  error?: boolean;
};

function isPhoneLikeDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px) and (pointer: coarse)").matches;
}

function digits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function phoneFromHref(href: string | null) {
  if (!href) return "";
  if (href.toLowerCase().startsWith("tel:")) return digits(href.slice(4));
  try {
    const url = new URL(href, window.location.href);
    const waMatch = url.pathname.match(/\/(?:send\/)?(\d{8,15})(?:\/|$)/);
    const queryPhone = digits(url.searchParams.get("phone"));
    return queryPhone || digits(waMatch?.[1]);
  } catch {
    return "";
  }
}

function messageFromHref(href: string | null) {
  if (!href) return "";
  try {
    const url = new URL(href, window.location.href);
    return String(url.searchParams.get("text") || "").trim();
  } catch {
    return "";
  }
}

function leadIdFromLocation() {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/leads\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function directWhatsappUrl(phone: string, message: string) {
  const normalized = phone.length === 10 || phone.length === 11 ? `55${phone}` : phone;
  const text = message || "Olá, tudo bem?";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

function fallbackOpen(kind: MobileActionKind, phone: string, message: string, originalHref: string | null) {
  if (kind === "call") {
    window.location.href = originalHref?.startsWith("tel:") ? originalHref : `tel:${phone}`;
    return;
  }
  window.open(originalHref || directWhatsappUrl(phone, message), "_blank", "noopener,noreferrer");
}

/**
 * Ponte global do desktop: captura os atalhos já existentes do card sem duplicar
 * toda a UI de Vendas/Leads. Em celular real, deixa tel:/wa.me seguirem direto.
 */
export function MobileActionBridgeHost() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const clearTimer = useRef<number | null>(null);

  useEffect(() => {
    function show(next: ToastState) {
      setToast(next);
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setToast(null), 5_500);
    }

    async function dispatch(
      kind: MobileActionKind,
      phone: string,
      contactName: string,
      message: string,
      originalHref: string | null,
    ) {
      show({
        kind,
        title: kind === "call" ? "Enviando ligação ao celular…" : "Enviando conversa ao celular…",
        detail: contactName || phone,
      });
      try {
        const result = await apiFetch<MobileActionResponse>("/mobile/actions", {
          method: "POST",
          body: JSON.stringify({
            kind,
            phone,
            contactName: contactName || undefined,
            message: kind === "whatsapp" ? (message || "Olá, tudo bem?") : undefined,
            leadId: leadIdFromLocation() || undefined,
          }),
        });
        const device = result?.device?.name || "seu celular";
        show({
          kind,
          title: kind === "call" ? "Ligação enviada" : "WhatsApp preparado",
          detail: result?.delivery === "push"
            ? `${device} recebeu uma notificação.`
            : `${device} receberá ao abrir o HBX Mobile.`,
        });
      } catch (error) {
        show({
          kind,
          title: "Não foi possível usar o HBX Mobile",
          detail: error instanceof Error ? error.message : "Abrindo neste dispositivo.",
          error: true,
        });
        fallbackOpen(kind, phone, message, originalHref);
      }
    }

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (isPhoneLikeDevice()) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      const href = anchor?.getAttribute("href") || null;
      const lowerHref = String(href || "").toLowerCase();
      const detailRoot = target.closest<HTMLElement>(".dn-root");
      const label = `${target.closest<HTMLElement>("[aria-label]")?.getAttribute("aria-label") || ""} ${target.closest<HTMLElement>("[title]")?.getAttribute("title") || ""}`.toLowerCase();

      const isCall = lowerHref.startsWith("tel:");
      const isWaHref = lowerHref.includes("wa.me/") || lowerHref.includes("api.whatsapp.com/");
      const isWaDetailAction = Boolean(detailRoot && label.includes("whatsapp"));
      const isWhatsapp = isWaHref || isWaDetailAction;

      if (isCall && getMobileCallMode() !== "mobile") return;
      if (isWhatsapp && getWaOpenMode() !== "mobile") return;
      if (!isCall && !isWhatsapp) return;

      let phone = phoneFromHref(href);
      if (!phone && detailRoot) {
        const phoneAnchor = detailRoot.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
        phone = phoneFromHref(phoneAnchor?.getAttribute("href") || null);
      }
      if (!phone) return;

      const kind: MobileActionKind = isCall ? "call" : "whatsapp";
      const contactName = String(
        detailRoot?.querySelector<HTMLElement>(".company")?.textContent ||
          detailRoot?.querySelector<HTMLElement>(".dn-person__name")?.textContent ||
          "Lead",
      ).trim();
      const message = kind === "whatsapp"
        ? (messageFromHref(href) || `Olá, tudo bem? Estou entrando em contato sobre ${contactName || "sua empresa"}.`)
        : "";

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void dispatch(kind, phone, contactName, message, href);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className={`${styles.toast} ${toast.error ? styles.error : ""}`} role="status" aria-live="polite">
      <span className={styles.icon}>
        <I d={toast.kind === "call" ? ICONS.phone : ICONS.msg} size={17} />
      </span>
      <span className={styles.copy}>
        <strong>{toast.title}</strong>
        <span>{toast.detail}</span>
      </span>
    </div>
  );
}

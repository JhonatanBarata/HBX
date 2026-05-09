"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import type { WhatsAppLiveHealthPayload } from "@/lib/whatsapp-center";

type UseWhatsAppLiveHealthOptions = {
  enabled: boolean;
  intervalMs: number;
  refreshOnMount?: boolean;
};

export const WHATSAPP_LIVE_HEALTH_EVENT = "hbx:whatsapp-live-health";

export function useWhatsAppLiveHealth({
  enabled,
  intervalMs,
  refreshOnMount = true,
}: UseWhatsAppLiveHealthOptions) {
  const [health, setHealth] = useState<WhatsAppLiveHealthPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (!enabled || inFlightRef.current) return null;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const suffix = force ? "?refresh=true" : "";
      const payload = await apiFetch<WhatsAppLiveHealthPayload>(`/companies/me/whatsapp-live-health${suffix}`, {
        requireAuth: true,
        timeoutMs: force ? 12000 : 9000,
      });
      setHealth(payload);
      setError(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(WHATSAPP_LIVE_HEALTH_EVENT, { detail: payload }));
      }
      return payload;
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "Falha ao verificar o WhatsApp.";
      setError(message);
      return null;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setHealth(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    if (refreshOnMount) {
      void refresh(false);
    }

    const safeInterval = Math.max(10_000, Number(intervalMs || 30_000));
    const timer = window.setInterval(() => {
      void refresh(false);
    }, safeInterval);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, refresh, refreshOnMount]);

  return {
    health,
    loading,
    error,
    refresh,
  };
}

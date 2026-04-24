"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InlineLaunchNoticeState } from "./InlineLaunchNotice";

type LaunchConfig = {
  loadingTitle: string;
  loadingDescription: string;
  successTitle: string;
  successDescription: string;
  ctaLabel: string;
  autoOpenDelayMs?: number;
  onOpen: () => void;
};

type SuccessOverride = Partial<Pick<LaunchConfig, "successTitle" | "successDescription">>;

const DEFAULT_AUTO_OPEN_DELAY_MS = 900;

export function useQuickLaunchNotice() {
  const [notice, setNotice] = useState<InlineLaunchNoticeState | null>(null);
  const configRef = useRef<LaunchConfig | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const autoOpenTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (autoOpenTimerRef.current !== null) {
      window.clearTimeout(autoOpenTimerRef.current);
      autoOpenTimerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearTimers();
    configRef.current = null;
    setNotice(null);
  }, [clearTimers]);

  const openNow = useCallback(() => {
    const config = configRef.current;
    clearTimers();
    if (!config) return;
    config.onOpen();
  }, [clearTimers]);

  const start = useCallback((config: LaunchConfig) => {
    clearTimers();
    configRef.current = config;
    setNotice({
      phase: "loading",
      progress: 0,
      title: config.loadingTitle,
      description: config.loadingDescription,
      ctaLabel: config.ctaLabel,
    });

    progressTimerRef.current = window.setInterval(() => {
      setNotice((current) => {
        if (!current || current.phase !== "loading") return current;
        const increment = current.progress < 36 ? 12 : current.progress < 72 ? 8 : 4;
        return {
          ...current,
          progress: Math.min(current.progress + increment, 92),
        };
      });
    }, 90);
  }, [clearTimers]);

  const markSuccess = useCallback((override?: SuccessOverride) => {
    const config = configRef.current;
    if (!config) return;
    clearTimers();
    setNotice({
      phase: "success",
      progress: 100,
      title: override?.successTitle || config.successTitle,
      description: override?.successDescription || config.successDescription,
      ctaLabel: config.ctaLabel,
    });
    autoOpenTimerRef.current = window.setTimeout(() => {
      config.onOpen();
    }, config.autoOpenDelayMs ?? DEFAULT_AUTO_OPEN_DELAY_MS);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return useMemo(
    () => ({
      notice,
      start,
      markSuccess,
      clear,
      openNow,
    }),
    [notice, start, markSuccess, clear, openNow],
  );
}

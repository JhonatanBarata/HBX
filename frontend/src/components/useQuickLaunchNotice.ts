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
  progressSteps?: string[];
};

type SuccessOverride = Partial<Pick<LaunchConfig, "successTitle" | "successDescription">>;

const DEFAULT_AUTO_OPEN_DELAY_MS = 900;
const DEFAULT_PROGRESS_STEPS = [
  "Iniciando consulta...",
  "Buscando fontes...",
  "Lendo informações públicas...",
  "Processando resultados...",
  "Validando dados...",
  "Preparando cards...",
  "Finalizando...",
  "Aguardando confirmação final...",
];

function getProgressStep(progress: number, steps: string[]) {
  if (!steps.length) return "";
  const clamped = Math.max(0, Math.min(99, progress));
  const index = Math.min(steps.length - 1, Math.floor((clamped / 100) * steps.length));
  return steps[index] || steps[steps.length - 1] || "";
}

function getNextProgress(current: number) {
  const cap = 97;
  if (current >= cap) return cap;

  const distance = cap - current;
  const randomFactor = 0.72 + Math.random() * 0.62;
  let baseIncrement = 1.2;

  if (current < 18) baseIncrement = 7.5;
  else if (current < 42) baseIncrement = 5.2;
  else if (current < 68) baseIncrement = 3.5;
  else if (current < 86) baseIncrement = 2.1;
  else if (current < 94) baseIncrement = 1.1;
  else baseIncrement = 0.45;

  return Math.min(cap, Math.round((current + Math.min(distance, baseIncrement * randomFactor)) * 10) / 10);
}

function getNextDelay(progress: number) {
  if (progress < 18) return 180 + Math.floor(Math.random() * 90);
  if (progress < 42) return 260 + Math.floor(Math.random() * 140);
  if (progress < 68) return 420 + Math.floor(Math.random() * 180);
  if (progress < 86) return 620 + Math.floor(Math.random() * 240);
  return 860 + Math.floor(Math.random() * 420);
}

export function useQuickLaunchNotice() {
  const [notice, setNotice] = useState<InlineLaunchNoticeState | null>(null);
  const configRef = useRef<LaunchConfig | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const autoOpenTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
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
    const progressSteps = config.progressSteps?.length ? config.progressSteps : DEFAULT_PROGRESS_STEPS;
    setNotice({
      phase: "loading",
      progress: 3,
      title: config.loadingTitle,
      description: config.loadingDescription,
      ctaLabel: config.ctaLabel,
      statusLabel: getProgressStep(3, progressSteps),
      activityTick: 0,
    });

    const scheduleNextProgress = (delay: number) => {
      progressTimerRef.current = window.setTimeout(() => {
        const activeConfig = configRef.current;
        const activeSteps = activeConfig?.progressSteps?.length ? activeConfig.progressSteps : DEFAULT_PROGRESS_STEPS;
        let nextDelay = getNextDelay(97);
        let shouldContinue = false;
        setNotice((current) => {
          if (!current || current.phase !== "loading") return current;
          const nextProgress = getNextProgress(current.progress);
          nextDelay = getNextDelay(nextProgress);
          shouldContinue = true;
          return {
            ...current,
            progress: nextProgress,
            statusLabel: getProgressStep(nextProgress, activeSteps),
            activityTick: (current.activityTick || 0) + 1,
          };
        });
        if (shouldContinue) scheduleNextProgress(nextDelay);
      }, delay);
    };

    scheduleNextProgress(getNextDelay(3));
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
      statusLabel: "Concluído.",
      activityTick: Date.now(),
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

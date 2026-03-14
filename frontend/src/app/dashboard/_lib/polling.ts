"use client";

type PollingOptions = {
  intervalMs: number;
  immediate?: boolean;
  pauseWhenHidden?: boolean;
};

export function startSmartPolling(
  task: () => Promise<void> | void,
  options: PollingOptions
) {
  const intervalMs = Math.max(1000, options.intervalMs);
  const immediate = options.immediate ?? true;
  const pauseWhenHidden = options.pauseWhenHidden ?? true;

  let disposed = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delay: number) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void run();
    }, delay);
  };

  const run = async () => {
    if (disposed) return;
    if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
      schedule(intervalMs);
      return;
    }
    if (inFlight) {
      schedule(intervalMs);
      return;
    }

    inFlight = true;
    try {
      await task();
    } finally {
      inFlight = false;
      schedule(intervalMs);
    }
  };

  const onVisibilityChange = () => {
    if (disposed || !pauseWhenHidden || typeof document === "undefined") return;
    if (!document.hidden) {
      schedule(0);
    }
  };

  if (pauseWhenHidden && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  if (immediate) {
    void run();
  } else {
    schedule(intervalMs);
  }

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (pauseWhenHidden && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

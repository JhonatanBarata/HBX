"use client";

import React from "react";

type SeamlessLoopVideoProps = {
  src: string;
  className: string;
  enabled?: boolean;
  switchIntervalMs?: number;
  fadeDurationMs?: number;
  onPulseChange?: (active: boolean) => void;
};

function stopVideo(video: HTMLVideoElement | null) {
  if (!video) return;

  video.pause();
  try {
    video.currentTime = 0;
  } catch {
    // ignore currentTime reset errors while metadata is still unavailable
  }
}

function startVideo(video: HTMLVideoElement | null, restart = false) {
  if (!video) return;

  if (restart) {
    try {
      video.currentTime = 0;
    } catch {
      // ignore currentTime reset errors while metadata is still unavailable
    }
  }

  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => undefined);
  }
}

export default function SeamlessLoopVideo({
  src,
  className,
  enabled = true,
  switchIntervalMs = 2500,
  fadeDurationMs = 900,
  onPulseChange,
}: SeamlessLoopVideoProps) {
  const primaryRef = React.useRef<HTMLVideoElement | null>(null);
  const secondaryRef = React.useRef<HTMLVideoElement | null>(null);
  const activeSlotRef = React.useRef<"a" | "b">("a");
  const switchTimerRef = React.useRef<number | null>(null);
  const pulseTimerRef = React.useRef<number | null>(null);
  const [activeSlot, setActiveSlot] = React.useState<"a" | "b">("a");

  const clearTimers = React.useCallback(() => {
    if (switchTimerRef.current !== null) {
      window.clearInterval(switchTimerRef.current);
      switchTimerRef.current = null;
    }

    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  React.useEffect(() => {
    if (!enabled) {
      clearTimers();
      onPulseChange?.(false);
      activeSlotRef.current = "a";
      setActiveSlot("a");
      stopVideo(primaryRef.current);
      stopVideo(secondaryRef.current);
      return;
    }

    const primaryVideo = primaryRef.current;
    const secondaryVideo = secondaryRef.current;

    if (!primaryVideo || !secondaryVideo) {
      return;
    }

    activeSlotRef.current = "a";
    setActiveSlot("a");
    onPulseChange?.(false);
    startVideo(primaryVideo, true);
    stopVideo(secondaryVideo);

    const switchVisibleVideo = () => {
      const nextSlot = activeSlotRef.current === "a" ? "b" : "a";
      const incomingVideo = nextSlot === "a" ? primaryRef.current : secondaryRef.current;
      const outgoingVideo = nextSlot === "a" ? secondaryRef.current : primaryRef.current;

      onPulseChange?.(true);
      startVideo(incomingVideo, true);
      activeSlotRef.current = nextSlot;
      setActiveSlot(nextSlot);

      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }

      pulseTimerRef.current = window.setTimeout(() => {
        onPulseChange?.(false);
        stopVideo(outgoingVideo);
      }, fadeDurationMs);
    };

    switchTimerRef.current = window.setInterval(switchVisibleVideo, switchIntervalMs);

    return () => {
      clearTimers();
      onPulseChange?.(false);
      stopVideo(primaryRef.current);
      stopVideo(secondaryRef.current);
    };
  }, [clearTimers, enabled, fadeDurationMs, onPulseChange, src, switchIntervalMs]);

  return (
    <>
      <video
        ref={primaryRef}
        className={className}
        data-loop-active={activeSlot === "a" ? "true" : "false"}
        src={src}
        muted
        playsInline
        preload="auto"
      />
      <video
        ref={secondaryRef}
        className={className}
        data-loop-active={activeSlot === "b" ? "true" : "false"}
        src={src}
        muted
        playsInline
        preload="auto"
      />
    </>
  );
}
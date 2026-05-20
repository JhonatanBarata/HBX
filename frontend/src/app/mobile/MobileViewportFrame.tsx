"use client";

import { type ReactNode, useEffect, useState } from "react";

import styles from "./MobileViewportShell.module.css";

const FRAME_PARAM = "hbxMobileFrame";
const DESKTOP_QUERY = "(min-width: 768px)";

type FrameState = {
  ready: boolean;
  isDesktop: boolean;
  isFramed: boolean;
  frameSrc: string;
};

function buildFrameState(): FrameState {
  if (typeof window === "undefined") {
    return {
      ready: false,
      isDesktop: false,
      isFramed: false,
      frameSrc: "",
    };
  }

  const url = new URL(window.location.href);
  const isFramed = url.searchParams.get(FRAME_PARAM) === "1";
  const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;

  url.searchParams.set(FRAME_PARAM, "1");

  return {
    ready: true,
    isDesktop,
    isFramed,
    frameSrc: `${url.pathname}${url.search}${url.hash}`,
  };
}

export default function MobileViewportFrame({ children }: { children: ReactNode }) {
  const [frameState, setFrameState] = useState<FrameState>(() => ({
    ready: false,
    isDesktop: false,
    isFramed: false,
    frameSrc: "",
  }));

  useEffect(() => {
    const syncFrameState = () => {
      setFrameState(buildFrameState());
    };

    syncFrameState();

    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    mediaQuery.addEventListener("change", syncFrameState);
    window.addEventListener("popstate", syncFrameState);

    return () => {
      mediaQuery.removeEventListener("change", syncFrameState);
      window.removeEventListener("popstate", syncFrameState);
    };
  }, []);

  if (!frameState.ready) {
    return (
      <div className={styles.mobilePreviewPage} data-frame="false">
        <main className={styles.mobileViewport} aria-label="HBX mobile">
          {children}
        </main>
      </div>
    );
  }

  if (frameState.isDesktop && !frameState.isFramed) {
    return (
      <div className={styles.mobilePreviewPage} data-frame="true">
        <iframe
          className={styles.mobilePreviewFrame}
          src={frameState.frameSrc}
          title="HBX mobile preview"
        />
      </div>
    );
  }

  return (
    <div className={styles.mobilePreviewPage} data-frame="false">
      <main className={styles.mobileViewport} aria-label="HBX mobile">
        {children}
      </main>
    </div>
  );
}

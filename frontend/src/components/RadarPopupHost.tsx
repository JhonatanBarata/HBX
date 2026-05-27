"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HbxPopup4 } from "./HbxPopup";
import styles from "./RadarPopupHost.module.css";

type RadarPopupDetail = {
  query?: string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;
};

function isMobilePath(pathname: string | null) {
  return String(pathname || "").startsWith("/mobile");
}

function buildRadarFrameSrc(search: string, detail?: RadarPopupDetail | null, popupNonce = 0) {
  const currentParams = new URLSearchParams(search);
  const params = new URLSearchParams();
  ["state", "city", "segment", "radiusKm", "engine", "targetType"].forEach((key) => {
    const value = currentParams.get(key);
    if (value) params.set(key, value);
  });
  params.set("hbxPopup4", "1");
  params.set("hbxMobileFrame", "1");
  params.set("hbxPopupTick", String(popupNonce));
  if (detail?.query instanceof URLSearchParams) {
    detail.query.forEach((value, key) => params.set(key, value));
  } else if (typeof detail?.query === "string") {
    const extra = new URLSearchParams(detail.query);
    extra.forEach((value, key) => params.set(key, value));
  } else if (detail?.query && typeof detail.query === "object") {
    Object.entries(detail.query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      params.set(key, String(value));
    });
  }
  const qs = params.toString();
  return `/mobile/radar-digital${qs ? `?${qs}` : ""}`;
}

export default function RadarPopupHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<RadarPopupDetail | null>(null);
  const [popupNonce, setPopupNonce] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const search = searchParams?.toString() || "";
  const frameSrc = useMemo(() => buildRadarFrameSrc(search, detail, popupNonce), [detail, popupNonce, search]);

  const resetRadarFrameScroll = useCallback(() => {
    const frame = frameRef.current;
    const frameWindow = frame?.contentWindow;
    const frameDocument = frame?.contentDocument;
    if (!frameWindow || !frameDocument) return;

    frameWindow.scrollTo(0, 0);
    frameDocument.documentElement.scrollTop = 0;
    if (frameDocument.body) frameDocument.body.scrollTop = 0;
    frameDocument
      .querySelectorAll<HTMLElement>(".hbx-mobile-page, main, [data-popup-frame='true']")
      .forEach((element) => {
        element.scrollTop = 0;
      });
  }, []);

  useEffect(() => {
    if (isMobilePath(pathname)) return undefined;
    const handleOpen = (event: Event) => {
      const payload = event instanceof CustomEvent ? (event.detail as RadarPopupDetail | undefined) : undefined;
      setDetail(payload || null);
      setPopupNonce(Date.now());
      setFrameReady(false);
      setOpen(true);
    };
    window.addEventListener("hbx:radar-popup", handleOpen);
    window.addEventListener("hbx:vendas-radar-popup", handleOpen);
    return () => {
      window.removeEventListener("hbx:radar-popup", handleOpen);
      window.removeEventListener("hbx:vendas-radar-popup", handleOpen);
    };
  }, [pathname]);

  useEffect(() => {
    if (isMobilePath(pathname)) return undefined;
    const radarParam = String(searchParams?.get("radar") || "").trim().toLowerCase();
    if (radarParam !== "1" && radarParam !== "open" && radarParam !== "true") return undefined;
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.delete("radar");
    next.delete("radarTick");
    const nextUrl = `${pathname || "/"}${next.toString() ? `?${next.toString()}` : ""}`;
    router.replace(nextUrl, { scroll: false });

    const timer = window.setTimeout(() => {
      setDetail(null);
      setPopupNonce(Date.now());
      setFrameReady(false);
      setOpen(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timers = [window.setTimeout(resetRadarFrameScroll, 0), window.setTimeout(resetRadarFrameScroll, 250)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, frameSrc, resetRadarFrameScroll]);

  if (isMobilePath(pathname) || typeof document === "undefined") return null;

  return (
    <HbxPopup4
      open={open}
      className={styles.radarPhonePopup}
      closeLabel="Fechar Radar Digital"
      showCloseButton={false}
      onClose={() => setOpen(false)}
    >
      {!frameReady ? <div className={styles.radarPopupLoading} aria-hidden="true" /> : null}
      <iframe
        ref={frameRef}
        src={frameSrc}
        title="Radar Digital"
        className={styles.radarPopupFrame}
        data-ready={frameReady ? "true" : "false"}
        onLoad={() => {
          resetRadarFrameScroll();
          window.setTimeout(() => {
            resetRadarFrameScroll();
            setFrameReady(true);
          }, 120);
        }}
      />
    </HbxPopup4>
  );
}

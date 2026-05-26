"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./RadarPopupHost.module.css";

type RadarPopupDetail = {
  query?: string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;
};

function isMobilePath(pathname: string | null) {
  return String(pathname || "").startsWith("/mobile");
}

function buildRadarFrameSrc(search: string, detail?: RadarPopupDetail | null) {
  const params = new URLSearchParams(search);
  params.delete("radar");
  params.delete("radarTick");
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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<RadarPopupDetail | null>(null);
  const search = searchParams?.toString() || "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isMobilePath(pathname)) return undefined;
    const handleOpen = (event: Event) => {
      const payload = event instanceof CustomEvent ? (event.detail as RadarPopupDetail | undefined) : undefined;
      setDetail(payload || null);
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
    if (isMobilePath(pathname)) return;
    const radarParam = String(searchParams?.get("radar") || "").trim().toLowerCase();
    if (radarParam !== "1" && radarParam !== "open" && radarParam !== "true") return;
    setDetail(null);
    setOpen(true);
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.delete("radar");
    next.delete("radarTick");
    const nextUrl = `${pathname || "/"}${next.toString() ? `?${next.toString()}` : ""}`;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const frameSrc = useMemo(() => buildRadarFrameSrc(search, detail), [detail, search]);

  if (!mounted || !open || isMobilePath(pathname) || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.radarPopupBackdrop} role="presentation" onClick={() => setOpen(false)}>
      <section
        className={styles.radarPopup}
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-radar-popup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.radarPopupHeader}>
          <div>
            <span>Radar Digital</span>
            <strong id="global-radar-popup-title">Buscar cards</strong>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar Radar Digital">
            X
          </button>
        </header>
        <div className={styles.radarPopupBody}>
          <iframe src={frameSrc} title="Radar Digital" className={styles.radarPopupFrame} />
        </div>
      </section>
    </div>,
    document.body,
  );
}

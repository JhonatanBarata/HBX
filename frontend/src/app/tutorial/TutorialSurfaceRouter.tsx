"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DesktopTutorialClient from "./desktop.client";
import MobileTutorialClient from "./page.client";

type TutorialSurface = "mobile" | "desktop";

function resolveTutorialSurface(params: URLSearchParams | ReadonlyURLSearchParams | null): TutorialSurface {
  const surface = String(params?.get("surface") || params?.get("mode") || "").trim().toLowerCase();
  if (surface === "desktop" || surface === "advanced" || surface === "completo") return "desktop";
  if (surface === "mobile" || surface === "simple" || surface === "simples") return "mobile";
  return "desktop";
}

type ReadonlyURLSearchParams = ReturnType<typeof useSearchParams>;

export default function TutorialSurfaceRouter() {
  const searchParams = useSearchParams();
  const [surface, setSurface] = useState<TutorialSurface | null>(null);

  useEffect(() => {
    setSurface(resolveTutorialSurface(searchParams));
  }, [searchParams]);

  if (surface === null) return null;
  return surface === "desktop" ? <DesktopTutorialClient /> : <MobileTutorialClient />;
}

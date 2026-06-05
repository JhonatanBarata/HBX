"use client";

import { useEffect, useState } from "react";
import FinanceiroClientPage from "./page.client";
import MobilePaymentCheckoutPage from "./page.mobile.client";

export default function ResponsivePagamentoPage() {
  const [view, setView] = useState<"mobile" | "desktop" | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const sync = () => setView(query.matches ? "mobile" : "desktop");

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  if (view === null) return null;

  return view === "mobile" ? <MobilePaymentCheckoutPage /> : <FinanceiroClientPage />;
}

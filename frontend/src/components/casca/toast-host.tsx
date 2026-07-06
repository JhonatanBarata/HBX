"use client";

// MOBILE-CASCA/W1 — Host do toast central da casca. Montado 1× na MobileShell.
// Lê a store (casca-toast.ts) e renderiza o toast; some sozinho pelo timer.
// Zero visual solto — classe .casca-toast (casca.css).

import React from "react";

import { useCascaToast } from "@/lib/casca-toast";

export function CascaToastHost() {
  const toast = useCascaToast();
  if (!toast) return null;
  return (
    <div key={toast.id} className="casca-toast" role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}

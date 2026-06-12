import type { Metadata } from "next";
import { Suspense } from "react";

import { ConfirmEmailClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Confirmar e-mail" };

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailClient />
    </Suspense>
  );
}

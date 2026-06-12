import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Recuperar senha" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordClient />
    </Suspense>
  );
}

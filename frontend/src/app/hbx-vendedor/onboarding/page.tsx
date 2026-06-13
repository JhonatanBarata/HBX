import type { Metadata } from "next";
import { Suspense } from "react";

import { SellerOnboardingClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Documentos do cadastro" };

export default function SellerOnboardingPage() {
  return (
    <Suspense fallback={null}>
      <SellerOnboardingClient />
    </Suspense>
  );
}

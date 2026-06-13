import type { Metadata } from "next";

import { PeleSpecimenClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Prova de Pele" };

export default function PeleSpecimenPage() {
  return <PeleSpecimenClient />;
}

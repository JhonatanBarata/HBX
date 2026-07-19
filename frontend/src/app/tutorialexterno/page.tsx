import type { Metadata } from "next";

import { TutorialExternoClient } from "./page.client";

export const metadata: Metadata = {
  title: "HBX System — Tutorial",
  description: "Passo a passo do HBX no computador, no Android e no iPhone.",
};

export default function TutorialExternoPage() {
  return <TutorialExternoClient />;
}

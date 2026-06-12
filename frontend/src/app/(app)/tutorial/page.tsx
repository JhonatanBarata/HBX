import type { Metadata } from "next";

import { TutorialClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Tutorial" };

export default function TutorialPage() {
  return <TutorialClient />;
}

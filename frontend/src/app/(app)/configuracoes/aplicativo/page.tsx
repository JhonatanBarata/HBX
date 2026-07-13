import type { Metadata } from "next";

import { MobileDevicePanel } from "./mobile-device-panel";

export const metadata: Metadata = { title: "HBX — Aplicativo móvel" };

export default function AplicativoMovelPage() {
  return <MobileDevicePanel />;
}

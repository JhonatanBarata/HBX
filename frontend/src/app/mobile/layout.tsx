import type { ReactNode } from "react";

import MobileViewportFrame from "./MobileViewportFrame";

export default function MobileLayout({ children }: { children: ReactNode }) {
  return <MobileViewportFrame>{children}</MobileViewportFrame>;
}

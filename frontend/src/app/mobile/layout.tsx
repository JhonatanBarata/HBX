import type { ReactNode } from "react";

import styles from "./MobileViewportShell.module.css";

export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.mobilePreviewPage}>
      <main className={styles.mobileViewport} aria-label="HBX mobile">
        {children}
      </main>
    </div>
  );
}

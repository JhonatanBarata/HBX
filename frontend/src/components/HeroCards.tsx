"use client";

import React from "react";
import styles from "./HeroCards.module.css";

export default function HeroCards(): React.ReactElement {
  const verticalCount = 20;
  const half = Math.floor(verticalCount / 2);
  const smalls = Array.from({ length: verticalCount }, (_, i) => i);

  return (
    <div className={styles.container} aria-hidden>
      <div className={styles.row}>
        {smalls.slice(0, half).map((i) => (
          <div className={styles.smallCard} key={`left-${i}`}>
            <div className={styles.smallInner} />
          </div>
        ))}

        <div className={styles.mainCard}>
          <div className={styles.mainInner}>
            <div className={styles.mainTitle}>HBX Control Center</div>
            <div className={styles.mainMeta}>Central operacional</div>
          </div>
        </div>

        {smalls.slice(half).map((i) => (
          <div className={styles.smallCard} key={`right-${i}`}>
            <div className={styles.smallInner} />
          </div>
        ))}
      </div>
    </div>
  );
}

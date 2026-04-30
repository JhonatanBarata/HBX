"use client";

import { useMemo, useState } from "react";
import styles from "./PremiumPaymentCard.module.css";

type CardBrand = "mastercard" | "visa" | "amex" | "elo" | "card";

type PremiumPaymentCardProps = {
  holderName?: string;
  cardNumber?: string;
  expirationLabel?: string;
  brand?: CardBrand;
  billingLabel?: string;
  planLabel?: string;
  amountLabel?: string;
  isSecurityFocused?: boolean;
};

function brandLabel(brand: CardBrand) {
  if (brand === "mastercard") return "Mastercard";
  if (brand === "visa") return "Visa";
  if (brand === "amex") return "Amex";
  if (brand === "elo") return "Elo";
  return "Cartão";
}

export default function PremiumPaymentCard({
  cardNumber = "",
  brand = "card",
  amountLabel = "R$ 109,90",
}: PremiumPaymentCardProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const displayNumberGroups = useMemo(() => {
    const digits = cardNumber.replace(/\D/g, "").slice(0, 16);
    const padded = `${digits}${"•".repeat(16)}`.slice(0, 16);
    return padded.match(/.{1,4}/g) || ["••••", "••••", "••••", "••••"];
  }, [cardNumber]);

  return (
    <div
      className={styles.cardStage}
      aria-hidden="true"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * -12;
        setTilt({ x, y });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div
        className={styles.card}
        style={{
          transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
        }}
      >
        <section className={styles.frontFace}>
          <div className={styles.glow} />
          <div className={styles.topRow}>
            <div className={styles.chip} />
            <div className={styles.brandPill} data-brand={brand}>
              <span className={styles.brandIcon} />
              <strong>{brandLabel(brand)}</strong>
            </div>
          </div>

          <div className={styles.cardNumber}>
            {displayNumberGroups.map((group, index) => (
              <span key={`${group}-${index}`}>{group}</span>
            ))}
          </div>

          <div className={styles.amountBadge}>
            <span>Assinatura</span>
            <strong>{amountLabel}</strong>
          </div>
        </section>
      </div>
    </div>
  );
}

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
  holderName = "",
  cardNumber = "",
  expirationLabel = "",
  brand = "card",
  billingLabel = "Mensal",
  planLabel = "HBX",
  amountLabel = "R$ 109,90",
}: PremiumPaymentCardProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const displayName = useMemo(() => {
    const clean = holderName.trim();
    return clean ? clean.toUpperCase().slice(0, 30) : "NOME NO CARTÃO";
  }, [holderName]);

  const displayNumberGroups = useMemo(() => {
    const digits = cardNumber.replace(/\D/g, "").slice(0, 16);
    const padded = `${digits}${"•".repeat(16)}`.slice(0, 16);
    return padded.match(/.{1,4}/g) || ["••••", "••••", "••••", "••••"];
  }, [cardNumber]);

  const displayExpiration = useMemo(() => {
    const clean = expirationLabel.trim();
    return clean ? clean.slice(0, 7) : "MM/AA";
  }, [expirationLabel]);

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

          <div className={styles.bottomRow}>
            <div>
              <small>Nome no cartão</small>
              <strong>{displayName}</strong>
            </div>

            <div className={styles.rightInfo}>
              <small>{planLabel}</small>
              <strong>{billingLabel}</strong>
            </div>
          </div>

          <div className={styles.amountBadge}>
            <span>Assinatura</span>
            <strong>{amountLabel}</strong>
          </div>
        </section>

        <section className={styles.backFace}>
          <div className={styles.backGlow} />
          <div className={styles.magneticBar} />

          <div className={styles.backDetails}>
            <div>
              <small>Validade</small>
              <strong>{displayExpiration}</strong>
            </div>
            <div>
              <small>Segurança</small>
              <strong>•••</strong>
            </div>
          </div>

          <div className={styles.signatureArea}>
            <div>
              <small>Assinatura autorizada</small>
              <div className={styles.signatureLine} />
            </div>

            <div className={styles.cvvBox}>•••</div>
          </div>

          <p className={styles.securityText}>
            Pagamento protegido por tokenização Mercado Pago. O HBX não armazena número completo nem código de segurança.
          </p>
        </section>
      </div>
    </div>
  );
}

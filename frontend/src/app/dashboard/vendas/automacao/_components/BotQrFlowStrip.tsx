import type { BotQrFlowStripItem } from "../model";
import styles from "../page.module.css";

type BotQrFlowStripProps = {
  items: BotQrFlowStripItem[];
};

export default function BotQrFlowStrip({ items }: BotQrFlowStripProps) {
  return (
    <section className={styles.flowStripSection}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Flow strip 10/10</span>
          <h2 className={styles.sectionTitle}>Leitura do produto em 10 segundos</h2>
        </div>
        <p className={styles.sectionText}>
          O cliente bate o olho, entende o trilho QR-first e enxerga onde o humano entra sem ruído técnico.
        </p>
      </div>

      <div className={styles.flowStripScroller}>
        {items.map((item) => (
          <article key={item.id} className={styles.flowCard} data-tone={item.tone}>
            <div className={styles.flowCardTop}>
              <span className={styles.flowStep}>{String(item.step).padStart(2, "0")}</span>
              <span className={styles.flowMicroCard}>{item.microLabel}</span>
            </div>
            <div className={styles.flowCardBody}>
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
              <p>{item.happens}</p>
            </div>
            <div className={styles.flowCardFoot}>{item.note}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
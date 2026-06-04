import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxSectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  density?: "default" | "compact";
  tone?: "default" | "plain";
};

export default function HbxSection({
  eyebrow,
  title,
  description,
  aside,
  density = "default",
  tone = "default",
  children,
  className,
  ...props
}: HbxSectionProps) {
  const hasHeader = Boolean(eyebrow || title || description || aside);

  return (
    <section className={cx(styles.section, className)} data-density={density} data-tone={tone} {...props}>
      {hasHeader ? (
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
            {title ? <h3>{title}</h3> : null}
            {description ? <p className={styles.sectionDescription}>{description}</p> : null}
          </div>
          {aside ? <div className={styles.actionBar}>{aside}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

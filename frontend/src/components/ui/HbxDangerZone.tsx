import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxDangerZoneProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
};

export default function HbxDangerZone({
  title,
  description,
  children,
  className,
  ...props
}: HbxDangerZoneProps) {
  return (
    <section className={cx(styles.dangerZone, className)} {...props}>
      <header className={styles.dangerZoneHeader}>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

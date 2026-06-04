import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxStatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  dot?: boolean;
  children: ReactNode;
};

export default function HbxStatusBadge({
  tone = "neutral",
  dot = true,
  children,
  className,
  ...props
}: HbxStatusBadgeProps) {
  return (
    <span className={cx(styles.statusBadge, className)} data-tone={tone} data-dot={dot ? "true" : "false"} {...props}>
      {children}
    </span>
  );
}

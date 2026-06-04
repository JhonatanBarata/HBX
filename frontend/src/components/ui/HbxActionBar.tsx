import type { HTMLAttributes } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxActionBarProps = HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "center" | "end";
};

export default function HbxActionBar({
  align = "start",
  className,
  children,
  ...props
}: HbxActionBarProps) {
  return (
    <div className={cx(styles.actionBar, className)} data-align={align} {...props}>
      {children}
    </div>
  );
}

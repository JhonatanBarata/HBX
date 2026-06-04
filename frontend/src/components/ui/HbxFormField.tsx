import type { LabelHTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxFormFieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  requiredMark?: boolean;
};

export default function HbxFormField({
  label,
  hint,
  error,
  requiredMark = false,
  children,
  className,
  ...props
}: HbxFormFieldProps) {
  return (
    <label className={cx(styles.formField, className)} {...props}>
      <span className={styles.formLabelRow}>
        <span>{label}</span>
        {requiredMark ? <span className={styles.fieldRequired}>Obrigatorio</span> : null}
      </span>
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </label>
  );
}

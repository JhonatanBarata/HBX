import type { CSSProperties, ReactNode } from "react";

type PanelShellBaseProps = {
  main: ReactNode;
  className?: string;
  mainClassName?: string;
  contentClassName?: string;
  ariaLabel?: string;
  style?: CSSProperties;
};

type PanelShellCommonProps = PanelShellBaseProps & {
  variant?: "common";
  context?: never;
  contextLabel?: never;
  contextClassName?: never;
};

type PanelShellContextProps = PanelShellBaseProps & {
  variant: "context";
  context: ReactNode;
  contextLabel: string;
  contextClassName?: string;
};

export type HbxPanelShellProps = PanelShellCommonProps | PanelShellContextProps;

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * Casca estrutural das telas operacionais.
 *
 * A variante comum mantém uma superfície única. A contextual reserva uma
 * coluna estável à direita, sem ensinar à casca nada sobre os dados da tela.
 */
export function HbxPanelShell(props: HbxPanelShellProps) {
  const variant = props.variant ?? "common";
  const contextual = variant === "context";

  return (
    <section
      className={classes(
        "hbx-panel-shell",
        contextual && "hbx-panel-shell--context",
        props.className,
      )}
      data-variant={variant}
      aria-label={props.ariaLabel}
      style={props.style}
    >
      <div className={classes("hbx-panel-shell__main", props.mainClassName)}>
        <div className={classes("hbx-panel-shell__content", props.contentClassName)}>
          {props.main}
        </div>
      </div>

      {contextual ? (
        <aside
          className={classes("hbx-panel-shell__context", props.contextClassName)}
          aria-label={props.contextLabel}
        >
          {props.context}
        </aside>
      ) : null}
    </section>
  );
}

export function HbxContextHeader({
  eyebrow,
  title,
  subtitle,
  status,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="hbx-panel-context__header">
      <div className="hbx-panel-context__header-copy">
        {eyebrow ? <span className="hbx-panel-context__eyebrow">{eyebrow}</span> : null}
        <strong className="hbx-panel-context__title">{title}</strong>
        {subtitle ? <span className="hbx-panel-context__subtitle">{subtitle}</span> : null}
      </div>
      {status || actions ? (
        <div className="hbx-panel-context__header-actions">
          {status}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function HbxContextEmpty({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="hbx-panel-context__empty">
      {icon ? <span className="hbx-panel-context__empty-icon">{icon}</span> : null}
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

export function HbxContextHero({
  visual,
  title,
  subtitle,
  meta,
  trailing,
}: {
  visual?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <section className="hbx-panel-context__hero">
      {visual ? <span className="hbx-panel-context__hero-visual">{visual}</span> : null}
      <span className="hbx-panel-context__hero-copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
        {meta ? <small>{meta}</small> : null}
      </span>
      {trailing ? <span className="hbx-panel-context__hero-trailing">{trailing}</span> : null}
    </section>
  );
}

export function HbxContextMetrics({ children }: { children: ReactNode }) {
  return (
    <div className="hbx-panel-context__metrics" role="list">
      {children}
    </div>
  );
}

export function HbxContextMetric({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="hbx-panel-context__metric" role="listitem">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function HbxContextFacts({ children }: { children: ReactNode }) {
  return <dl className="hbx-panel-context__facts">{children}</dl>;
}

export function HbxContextFact({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="hbx-panel-context__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

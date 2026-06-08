import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxMobileEmptyState.module.css";

export type HbxMobileEmptyStateKind = "cards" | "referral" | "commission" | "connection";

type HbxMobileEmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  kind: HbxMobileEmptyStateKind;
  title?: ReactNode;
  description?: ReactNode | null;
  actions?: ReactNode;
  surface?: "card" | "inline";
};

const MOBILE_EMPTY_COPY: Record<HbxMobileEmptyStateKind, { title: string; description: string }> = {
  cards: {
    title: "Você ainda não recebeu cards.",
    description: "Escolha segmentos preferidos para melhorar a distribuição.",
  },
  referral: {
    title: "Sem indicação para aprovar.",
    description: "Indicações enviadas aparecem para aprovação do responsável.",
  },
  commission: {
    title: "Sem comissão aberta.",
    description: "Quando uma venda for confirmada, os valores aparecem aqui com prazo e status.",
  },
  connection: {
    title: "Sem conexão ativa.",
    description: "Atualize a tela para tentar carregar os dados operacionais novamente.",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function HbxMobileEmptyState({
  kind,
  title,
  description,
  actions,
  surface = "card",
  className,
  ...props
}: HbxMobileEmptyStateProps) {
  const copy = MOBILE_EMPTY_COPY[kind];
  const resolvedDescription = description === undefined ? copy.description : description;

  return (
    <div
      className={cx(
        surface === "card" && "hbx-mobile-empty",
        styles.emptyState,
        surface === "card" ? styles.surfaceCard : styles.surfaceInline,
        className,
      )}
      data-empty-kind={kind}
      role="status"
      {...props}
    >
      <span className={styles.marker} aria-hidden="true" />
      <div className={styles.copy}>
        <strong>{title ?? copy.title}</strong>
        {resolvedDescription ? <span>{resolvedDescription}</span> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

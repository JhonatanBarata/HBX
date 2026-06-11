import type { HTMLAttributes, ReactNode } from "react";
import HbxEmptyState from "./HbxEmptyState";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type HbxStandardListItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
};

type HbxStandardListProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  items: HbxStandardListItem[];
  loading?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
};

export default function HbxStandardList({
  items,
  loading = false,
  emptyTitle = "Nada para mostrar",
  emptyDescription = "Quando houver movimento, os itens aparecem aqui.",
  className,
  ...props
}: HbxStandardListProps) {
  if (loading) {
    return (
      <div className={styles.listState} role="status">
        Carregando lista...
      </div>
    );
  }

  if (!items.length) {
    return <HbxEmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cx(styles.standardList, className)} {...props}>
      {items.map((item) => (
        <article key={item.id} className={styles.standardListItem}>
          <div className={styles.standardListCopy}>
            <div className={styles.standardListTitleRow}>
              <strong>{item.title}</strong>
              {item.badge}
            </div>
            {item.description ? <p>{item.description}</p> : null}
            {item.meta ? <span>{item.meta}</span> : null}
          </div>
          {item.action ? <div className={styles.standardListAction}>{item.action}</div> : null}
        </article>
      ))}
    </div>
  );
}


import type { ReactNode, TableHTMLAttributes } from "react";
import HbxEmptyState from "./HbxEmptyState";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type HbxDataTableColumn<Row> = {
  key: string;
  header: ReactNode;
  align?: "start" | "center" | "end";
  width?: string;
  render: (row: Row, index: number) => ReactNode;
};

type HbxDataTableProps<Row> = Omit<TableHTMLAttributes<HTMLTableElement>, "children"> & {
  columns: Array<HbxDataTableColumn<Row>>;
  rows: Row[];
  getRowKey: (row: Row, index: number) => string;
  loading?: boolean;
  error?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
};

export default function HbxDataTable<Row>({
  columns,
  rows,
  getRowKey,
  loading = false,
  error,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription = "Ajuste os filtros ou tente novamente mais tarde.",
  className,
  ...props
}: HbxDataTableProps<Row>) {
  if (loading) {
    return (
      <div className={styles.tableState} role="status">
        Carregando dados...
      </div>
    );
  }

  if (error) {
    return (
      <HbxEmptyState
        title="Não foi possível carregar"
        description={error}
        className={styles.tableEmptyState}
      />
    );
  }

  if (!rows.length) {
    return <HbxEmptyState title={emptyTitle} description={emptyDescription} className={styles.tableEmptyState} />;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={cx(styles.dataTable, className)} {...props}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={{ width: column.width }} data-align={column.align || "start"}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={getRowKey(row, rowIndex)}>
              {columns.map((column) => (
                <td key={column.key} data-align={column.align || "start"}>
                  {column.render(row, rowIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


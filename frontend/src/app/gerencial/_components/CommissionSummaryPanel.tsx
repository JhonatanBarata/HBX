import type { ReactNode } from "react";
import type { CommissionTotals } from "./types";

type CommissionSummaryPanelProps = {
  commissionDueDays: number;
  commissionDueDaysDraft: string;
  setCommissionDueDaysDraft: (value: string) => void;
  canManageCommissionSettings: boolean;
  savingCommissionSettings: boolean;
  closingCommissionScope: string | null;
  syncingCommissions: boolean;
  totals?: CommissionTotals | null;
  formatCurrency: (value: number) => string;
  formatShortDate: (value?: string | null) => string;
  onCloseDueCommissions: () => void;
  onSyncHbxClientCommissions: () => void;
  onSaveCommissionSettings: () => void;
  children: ReactNode;
};

export default function CommissionSummaryPanel({
  commissionDueDays,
  commissionDueDaysDraft,
  setCommissionDueDaysDraft,
  canManageCommissionSettings,
  savingCommissionSettings,
  closingCommissionScope,
  syncingCommissions,
  totals,
  formatCurrency,
  formatShortDate,
  onCloseDueCommissions,
  onSyncHbxClientCommissions,
  onSaveCommissionSettings,
  children,
}: CommissionSummaryPanelProps) {
  return (
    <section className="panel p-4 md:p-5 rounded-[20px]">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <span className="badge badge-brand">Fase 7</span>
          <h2 className="mt-2 text-lg font-semibold">Comissões e carteira dos vendedores</h2>
          <p className="mt-1 text-sm text-muted">
            O HBX sincroniza clientes, separa D+{commissionDueDays} úteis e monta a folha de pagamento por vendedor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={closingCommissionScope !== null || Number(totals?.duePayableAmount || 0) <= 0}
            onClick={onCloseDueCommissions}
            className="btn btn-primary btn-sm"
          >
            {closingCommissionScope === "all" ? "Fechando..." : "Fechar liberadas"}
          </button>
          <button
            type="button"
            disabled={syncingCommissions}
            onClick={onSyncHbxClientCommissions}
            className="btn btn-secondary btn-sm"
          >
            {syncingCommissions ? "Sincronizando..." : "Sincronizar HBX"}
          </button>
          {canManageCommissionSettings ? (
            <>
              <label className="flex items-center gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold">
                <span>D+</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={commissionDueDaysDraft}
                  onChange={(event) => setCommissionDueDaysDraft(event.target.value)}
                  className="field h-8 w-16 px-2 py-1 text-sm"
                  aria-label="Dias úteis para liberar comissão"
                />
              </label>
              <button
                type="button"
                disabled={savingCommissionSettings}
                onClick={onSaveCommissionSettings}
                className="btn btn-secondary btn-sm"
              >
                {savingCommissionSettings ? "Salvando..." : "Salvar D+"}
              </button>
            </>
          ) : (
            <span className="badge">USERMASTER define D+{commissionDueDays}</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">A pagar</p>
          <strong className="mt-1 block text-lg">{formatCurrency(totals?.payableAmount || 0)}</strong>
        </article>
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">Liberado</p>
          <strong className="mt-1 block text-lg">{formatCurrency(totals?.duePayableAmount || 0)}</strong>
        </article>
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">Recorrente</p>
          <strong className="mt-1 block text-lg">{formatCurrency(totals?.recurringAmount || 0)}</strong>
        </article>
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">Herdada</p>
          <strong className="mt-1 block text-lg">{formatCurrency(totals?.inheritedAmount || 0)}</strong>
        </article>
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">Ativos</p>
          <strong className="mt-1 block text-2xl">{totals?.activeClients || 0}</strong>
        </article>
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">Aguardando</p>
          <strong className="mt-1 block text-2xl">{totals?.pendingActivation || 0}</strong>
        </article>
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">Inativados</p>
          <strong className="mt-1 block text-2xl">{totals?.inactiveClients || 0}</strong>
        </article>
        <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs text-muted">Próximo pagto</p>
          <strong className="mt-1 block text-lg">{formatShortDate(totals?.nextDueAt)}</strong>
        </article>
      </div>

      {children}
    </section>
  );
}

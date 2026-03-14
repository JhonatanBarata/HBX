"use client";

import { useEffect } from "react";
import styles from "../page.module.css";
import type { RecoveryCustomer } from "../recovery-model";

export type DrawerActionId =
  | "send_charge"
  | "send_pix"
  | "offer_installment"
  | "mark_paid"
  | "toggle_automation";

type ClientDrawerProps = {
  open: boolean;
  customer: RecoveryCustomer | null;
  onClose: () => void;
  onAction: (actionId: DrawerActionId) => void | Promise<void>;
  busyActionId?: DrawerActionId | null;
  formatCurrency: (value: number) => string;
};

export default function ClientDrawer({
  open,
  customer,
  onClose,
  onAction,
  busyActionId = null,
  formatCurrency,
}: ClientDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!customer) {
    return null;
  }

  return (
    <div className={styles.drawerRoot} data-open={open}>
      <button
        type="button"
        className={styles.drawerBackdrop}
        onClick={onClose}
        aria-label="Fechar detalhes do cliente"
      />

      <aside className={styles.drawerPanel} aria-label="Detalhes do cliente">
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.drawerEyebrow}>Perfil de cobranca</p>
            <h3 className={styles.drawerTitle}>{customer.name}</h3>
            <p className={styles.drawerSubtitle}>
              Ultimo contato: {customer.lastContact}
            </p>
            <p className={styles.drawerSubtitle}>
              WhatsApp: {customer.whatsappNumber || "-"}
            </p>
            <p className={styles.drawerSubtitle}>
              Cobranca automatica: {customer.automationEnabled ? "Ativa" : "Pausada"}
            </p>
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className={styles.drawerStats}>
          <article className={styles.miniStat}>
            <span>Total pago</span>
            <strong>{formatCurrency(customer.totalPaid)}</strong>
          </article>
          <article className={styles.miniStat}>
            <span>Dia trabalho/venda</span>
            <strong>Dia {customer.workdaySaleDay}</strong>
          </article>
          <article className={styles.miniStat}>
            <span>Em aberto</span>
            <strong>{formatCurrency(customer.openAmount)}</strong>
          </article>
          <article className={styles.miniStat}>
            <span>Ciclos recorrentes</span>
            <strong>{customer.recurringDelays}</strong>
          </article>
        </div>

        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h4>Historico de pagamentos</h4>
            <span className="badge badge-brand">
              {customer.paymentHistory.length} registros
            </span>
          </div>

          <div className={styles.historyList}>
            {customer.paymentHistory.map((payment) => (
              <div key={payment.id} className={styles.historyCard}>
                <div>
                  <p className={styles.historyTitle}>{payment.label}</p>
                  <p className={styles.historyMeta}>{payment.date}</p>
                </div>
                <div className={styles.historyAside}>
                  <strong>{formatCurrency(payment.amount)}</strong>
                  <span className={styles.historyStatus}>{payment.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h4>Historico de atrasos</h4>
            <span className="badge">{customer.delayHistory.length} ciclos</span>
          </div>

          <div className={styles.historyList}>
            {customer.delayHistory.map((delay) => (
              <div key={delay.id} className={styles.historyCard}>
                <div>
                  <p className={styles.historyTitle}>{delay.period}</p>
                  <p className={styles.historyMeta}>{delay.outcome}</p>
                </div>
                <div className={styles.historyAside}>
                  <strong>{delay.daysLate} dias</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h4>Acoes sugeridas</h4>
            <span className="badge badge-success">HBX Assist</span>
          </div>

          <div className={styles.drawerActions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onAction("send_charge")}
              disabled={
                Boolean(busyActionId) || customer.openAmount <= 0 || !customer.automationEnabled
              }
            >
              {busyActionId === "send_charge"
                ? "Enviando..."
                : customer.automationEnabled
                  ? "Enviar cobranca automatica"
                  : "Cobranca automatica pausada"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onAction("send_pix")}
              disabled={Boolean(busyActionId) || customer.openAmount <= 0}
            >
              {busyActionId === "send_pix" ? "Enviando..." : "Gerar link Pix"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onAction("offer_installment")}
              disabled={Boolean(busyActionId) || customer.openAmount <= 0}
            >
              {busyActionId === "offer_installment" ? "Enviando..." : "Oferecer parcelamento"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onAction("mark_paid")}
              disabled={Boolean(busyActionId) || customer.openAmount <= 0}
            >
              {busyActionId === "mark_paid"
                ? "Atualizando..."
                : customer.openAmount > 0
                  ? "Marcar como pago"
                  : "Conta ja quitada"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onAction("toggle_automation")}
              disabled={Boolean(busyActionId)}
            >
              {busyActionId === "toggle_automation"
                ? "Atualizando..."
                : customer.automationEnabled
                  ? "Pausar cobranca automatica"
                  : "Reativar cobranca automatica"}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

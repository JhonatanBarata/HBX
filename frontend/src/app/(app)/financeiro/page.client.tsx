"use client";

// FINANCEIRO-UNIVERSAL (Fase 1) — financeiro do TENANT na casca central.
// "Quem me deve" + extrato + baixar cobrança, lendo o MESMO FinanceiroCharge que
// a logística já usa, mas de QUALQUER módulo (logística + vendas) via o módulo
// backend /financeiro-tenant (@Admin). A logística segue intocada.
//
// LEI DO VENDEDOR: a tela trava em @Admin — vendedor vê estado neutro, zero valor.
// Visual 100% de classe/token central (5 Leis): .panel/.tbl/.kpi + .fin-* de
// hbx-theme/financeiro-tenant.css. ZERO style inline.

import React, { useCallback, useEffect, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

type SaldoCliente = {
  customerProfileId: string;
  nome: string | null;
  saldoAberto: number;
  cobrancas: number;
};
type SaldosResponse = { clientes: SaldoCliente[] };

type ExtratoCharge = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  lifecycle: string;
  sourceModule: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
};
type ExtratoResponse = {
  clienteId: string;
  nome: string | null;
  saldoAberto: number;
  total: number;
  charges: ExtratoCharge[];
};

function brl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function origemLabel(sourceModule: string | null): string {
  switch (sourceModule) {
    case "logistica_entrega":
      return "Entrega";
    case "logistica_fechamento":
      return "Fatura mensal";
    case "vendas_fechamento":
      return "Venda";
    default:
      return "—";
  }
}

function statusLabel(status: string): { label: string; cls: string } {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "paid") return { label: "Pago", cls: "paid" };
  if (s === "pending") return { label: "Em aberto", cls: "open" };
  if (s === "cancelled" || s === "failed") return { label: "Cancelada", cls: "muted" };
  if (s === "refunded" || s === "partially_refunded") return { label: "Estornada", cls: "muted" };
  return { label: status || "—", cls: "muted" };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export function FinanceiroClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [clientes, setClientes] = useState<SaldoCliente[]>([]);

  const [sel, setSel] = useState<{ id: string; nome: string | null } | null>(null);
  const [extLoading, setExtLoading] = useState(false);
  const [extErro, setExtErro] = useState<string | null>(null);
  const [extrato, setExtrato] = useState<ExtratoResponse | null>(null);

  const [armed, setArmed] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  const loadSaldos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await apiFetch<SaldosResponse>("/financeiro-tenant/saldos");
      setClientes(Array.isArray(res?.clientes) ? res.clientes : []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o financeiro.");
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExtrato = useCallback(async (clienteId: string) => {
    setExtLoading(true);
    setExtErro(null);
    try {
      const res = await apiFetch<ExtratoResponse>(
        `/financeiro-tenant/clientes/${encodeURIComponent(clienteId)}/extrato`,
      );
      setExtrato(res);
    } catch (e) {
      setExtErro(e instanceof Error ? e.message : "Falha ao carregar o extrato.");
      setExtrato(null);
    } finally {
      setExtLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar (loadSaldos seta loading na entrada); efeito legítimo, padrão do app
    if (admin) void loadSaldos();
  }, [admin, loadSaldos]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao trocar a seleção (loadExtrato seta loading na entrada); efeito legítimo
    if (sel?.id) void loadExtrato(sel.id);
  }, [sel?.id, loadExtrato]);

  const marcarPago = useCallback(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- guarda `quitando` lida+setada no próprio callback (anti duplo-clique); memoização manual intencional
    async (chargeId: string) => {
      if (quitando) return;
      setQuitando(chargeId);
      setArmed(null);
      try {
        await apiFetch(`/financeiro-tenant/charges/${encodeURIComponent(chargeId)}/quitar`, {
          method: "POST",
        });
        if (sel?.id) await loadExtrato(sel.id);
        await loadSaldos();
      } catch (e) {
        setExtErro(e instanceof Error ? e.message : "Falha ao dar baixa.");
      } finally {
        setQuitando(null);
      }
    },
    [quitando, sel?.id, loadExtrato, loadSaldos],
  );

  // Não-admin: estado neutro (LEI DO VENDEDOR — não citar valores).
  if (user && !admin) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Financeiro</h2></div>
        <div className="fin-note">Acesso restrito ao responsável da conta.</div>
      </section>
    );
  }

  const totalReceber = clientes.reduce((sum, c) => sum + (Number(c.saldoAberto) || 0), 0);

  return (
    <div className="fin-page">
      <div className="fin-kpis">
        <div className="kpi">
          <span className="kpi-icon"><I d={ICONS.check} size={16} /></span>
          <div>
            <div className="kpi-label">A receber (em aberto)</div>
            <div className="kpi-value">{brl(totalReceber)}</div>
            <div className="kpi-foot"><span className="kpi-delta">todas as origens (entrega + venda)</span></div>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-icon"><I d={ICONS.x} size={16} /></span>
          <div>
            <div className="kpi-label">Clientes devendo</div>
            <div className="kpi-value">{loading ? "—" : String(clientes.length)}</div>
            <div className="kpi-foot"><span className="kpi-delta">com cobrança em aberto</span></div>
          </div>
        </div>
      </div>

      {!sel && (
        <section className="panel">
          <div className="panel-head">
            <h2>Quem me deve</h2>
            <div className="meta"><span>{loading ? "carregando…" : `${clientes.length} cliente(s)`}</span></div>
          </div>
          {erro && <div className="fin-err">{erro}</div>}
          {!erro && (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Cobranças</th>
                    <th>Em aberto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr className="fin-tr-static">
                      <td colSpan={4} className="fin-td-empty">Carregando…</td>
                    </tr>
                  )}
                  {!loading && clientes.length === 0 && (
                    <tr className="fin-tr-static">
                      <td colSpan={4} className="fin-td-empty">Ninguém devendo. 👏</td>
                    </tr>
                  )}
                  {!loading &&
                    clientes.map((c) => (
                      <tr key={c.customerProfileId} onClick={() => setSel({ id: c.customerProfileId, nome: c.nome })}>
                        <td>{c.nome || "Cliente"}</td>
                        <td>{c.cobrancas}</td>
                        <td>{brl(c.saldoAberto)}</td>
                        <td className="fin-td-actions">
                          <button
                            className="btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSel({ id: c.customerProfileId, nome: c.nome });
                            }}
                          >
                            Ver extrato
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {sel && (
        <section className="panel">
          <div className="panel-head">
            <h2>{extrato?.nome || sel.nome || "Cliente"}</h2>
            <div className="meta">
              <button className="btn-ghost" onClick={() => { setSel(null); setExtrato(null); setArmed(null); }}>
                ← Voltar
              </button>
            </div>
          </div>
          <div className="fin-sum">
            <div>
              <div className="kpi-label">Em aberto</div>
              <div className="kpi-value">{brl(extrato?.saldoAberto ?? 0)}</div>
            </div>
            <div>
              <div className="kpi-label">Cobranças</div>
              <div className="kpi-value">{extrato ? String(extrato.total) : "—"}</div>
            </div>
          </div>
          {extErro && <div className="fin-err">{extErro}</div>}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Origem</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {extLoading && (
                  <tr className="fin-tr-static">
                    <td colSpan={6} className="fin-td-empty">Carregando…</td>
                  </tr>
                )}
                {!extLoading && (extrato?.charges?.length ?? 0) === 0 && (
                  <tr className="fin-tr-static">
                    <td colSpan={6} className="fin-td-empty">Sem cobranças para este cliente.</td>
                  </tr>
                )}
                {!extLoading &&
                  (extrato?.charges || []).map((ch) => {
                    const st = statusLabel(ch.status);
                    const podeQuitar = String(ch.status).toLowerCase() === "pending";
                    return (
                      <tr key={ch.id} className="fin-tr-static">
                        <td>{ch.description}</td>
                        <td>{origemLabel(ch.sourceModule)}</td>
                        <td>{fmtDate(ch.dueDate)}</td>
                        <td><span className={`fin-st ${st.cls}`}>{st.label}</span></td>
                        <td>{brl(ch.amount)}</td>
                        <td className="fin-td-actions">
                          {podeQuitar && armed !== ch.id && (
                            <button className="btn-ghost" disabled={!!quitando} onClick={() => setArmed(ch.id)}>
                              Marcar pago
                            </button>
                          )}
                          {podeQuitar && armed === ch.id && (
                            <button className="btn-teal" disabled={quitando === ch.id} onClick={() => marcarPago(ch.id)}>
                              {quitando === ch.id ? "…" : "Confirmar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

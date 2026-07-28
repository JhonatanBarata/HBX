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

type ExtratoEntrega = {
  id: string;
  data: string | null;
  entregue: boolean;
  status: string;
  quantidade: number;
  valor: number;
  produto: string | null;
  entregador: string | null;
  local: string | null;
  recebidoNaHora: boolean | null;
  receiptMethod: string | null;
  cobrancaOutcome: string | null;
  observacao: string | null;
};

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
  updatedAt: string | null;
  billingCycle: string | null;
  paymentMethod: string | null;
  competence: string | null;
  externalReference: string | null;
  entregaId: string | null;
  ledgerEntryId: string | null;
  refundedAt: string | null;
  refundAmount: number;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  mpMerchantOrderId: string | null;
  paymentUrl: string | null;
  pixTicketUrl: string | null;
  lastWebhookAt: string | null;
  criadoPorUserId: number | null;
  criadoPor: string | null;
  detalhes: Record<string, unknown> | null;
  entregas: ExtratoEntrega[];
  entregasTotal: number;
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

/** Data COM hora (fuso do navegador do dono) — o extrato detalhado precisa da hora. */
function fmtDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const CICLO: Record<string, string> = {
  ONCE: "Avulsa (uma vez)",
  MONTHLY: "Mensal",
  ANNUAL: "Anual",
};
const FORMA_COBRANCA: Record<string, string> = {
  MANUAL: "Manual (na mão)",
  PIX: "Pix",
  CARD: "Cartão",
  BOLETO: "Boleto",
  BONUS: "Bônus",
};
/** Como o dinheiro entrou de fato (receiptMethod da entrega). */
const FORMA_RECEBIDA: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  fiado: "Fiado (ficou anotado)",
};
/** O combinado da conta do cliente (formaPagamento) — não é o recebimento. */
const COMBINADO: Record<string, string> = {
  aberto: "Em aberto (paga depois)",
  na_hora: "Paga na hora",
  pendura: "Pendurado (fecha no dia combinado)",
  mensal: "Fatura mensal",
};
const ETAPA: Record<string, string> = {
  in_progress: "Em aberto",
  paid: "Paga",
  cancelled: "Cancelada",
  finalized: "Finalizada",
};
const ENTREGA_STATUS: Record<string, string> = {
  agendada: "Agendada",
  em_rota: "Em rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};
const COBRANCA_OUTCOME: Record<string, string> = {
  lancada: "Lançada",
  aguardando_fechamento: "Aguardando fechamento",
  nao_contabilizado: "Não contabilizado",
  isenta: "Isenta",
  falhou: "Falhou",
};

/** Chaves do providerPayload já mostradas em campo próprio (o resto vai no bruto). */
const PAYLOAD_JA_MOSTRADO = new Set([
  "source",
  "entregaId",
  "entregaIds",
  "forma",
  "pagoNaHora",
  "receiptMethod",
  "mesRef",
]);

function rotulo(mapa: Record<string, string>, valor: string | null | undefined): string | null {
  const v = String(valor ?? "").trim();
  if (!v) return null;
  return mapa[v] || v;
}

function texto(valor: unknown): string | null {
  if (valor == null) return null;
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "object") return JSON.stringify(valor);
  const s = String(valor).trim();
  return s || null;
}

/** Um dado do extrato. Some da tela quando não há valor salvo — nada de "—" por toda parte. */
function Campo({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="fin-det-item">
      <span className="fin-det-k">{label}</span>
      <span className="fin-det-v">{value}</span>
    </div>
  );
}

/**
 * Detalhe de UMA cobrança: TUDO o que ficou salvo dela (datas com hora, ciclo,
 * forma, quem lançou, referências) + as entregas que a compõem (avulsa = 1;
 * fatura mensal = todas as somadas no fechamento). Campo vazio não aparece.
 */
function ChargeDetalhe({ ch }: { ch: ExtratoCharge }) {
  const det = ch.detalhes || {};
  const formaRecebida = rotulo(FORMA_RECEBIDA, texto(det.receiptMethod));
  const combinado = rotulo(COMBINADO, texto(det.forma));
  const pagoNaHora = typeof det.pagoNaHora === "boolean" ? (det.pagoNaHora ? "Sim" : "Não") : null;
  const mesRef = texto(det.mesRef) || ch.competence;
  const extras = Object.entries(det).filter(
    ([k, v]) => !PAYLOAD_JA_MOSTRADO.has(k) && texto(v) != null,
  );

  return (
    <div className="fin-det">
      <div className="fin-det-block">
        <div className="fin-det-title">Cobrança</div>
        <div className="fin-det-grid">
          <Campo label="Valor" value={`${brl(ch.amount)} (${ch.currency || "BRL"})`} />
          <Campo label="Situação" value={statusLabel(ch.status).label} />
          <Campo label="Etapa" value={rotulo(ETAPA, ch.lifecycle)} />
          <Campo label="Origem" value={origemLabel(ch.sourceModule)} />
          <Campo label="Tipo de cobrança" value={rotulo(CICLO, ch.billingCycle)} />
          <Campo label="Forma prevista" value={rotulo(FORMA_COBRANCA, ch.paymentMethod)} />
          <Campo label="Combinado com o cliente" value={combinado} />
          <Campo label="Como foi recebido" value={formaRecebida} />
          <Campo label="Pago na hora" value={pagoNaHora} />
          <Campo label="Mês de referência" value={mesRef} />
          <Campo label="Criada em" value={fmtDateTime(ch.createdAt)} />
          <Campo label="Vencimento" value={fmtDateTime(ch.dueDate)} />
          <Campo label="Paga em" value={fmtDateTime(ch.paidAt)} />
          <Campo label="Última alteração" value={fmtDateTime(ch.updatedAt)} />
          <Campo label="Lançada por" value={ch.criadoPor || (ch.criadoPorUserId ? `Usuário #${ch.criadoPorUserId}` : null)} />
          <Campo label="Estornada em" value={fmtDateTime(ch.refundedAt)} />
          <Campo label="Valor estornado" value={ch.refundAmount > 0 ? brl(ch.refundAmount) : null} />
          <Campo label="Último retorno do banco" value={fmtDateTime(ch.lastWebhookAt)} />
        </div>
      </div>

      {ch.entregas.length > 0 && (
        <div className="fin-det-block">
          <div className="fin-det-title">
            {ch.entregasTotal > 1
              ? `Entregas somadas nesta cobrança (${ch.entregasTotal})`
              : "Entrega desta cobrança"}
          </div>
          <div className="tbl-wrap">
            <table className="tbl fin-det-tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th>Entregador</th>
                  <th>Recebimento</th>
                </tr>
              </thead>
              <tbody>
                {ch.entregas.map((e) => (
                  <tr key={e.id} className="fin-tr-static">
                    <td>{fmtDateTime(e.data) || "—"}</td>
                    <td>
                      {e.produto || "—"}
                      {e.local ? <span className="fin-det-sub">{e.local}</span> : null}
                      {e.observacao ? <span className="fin-det-sub">{e.observacao}</span> : null}
                    </td>
                    <td>{e.quantidade}</td>
                    <td>{brl(e.valor)}</td>
                    <td>{rotulo(ENTREGA_STATUS, e.status)}</td>
                    <td>{e.entregador || "—"}</td>
                    <td>
                      {rotulo(FORMA_RECEBIDA, e.receiptMethod) ||
                        (e.recebidoNaHora === false ? "Não recebido" : "—")}
                      {e.cobrancaOutcome ? (
                        <span className="fin-det-sub">{rotulo(COBRANCA_OUTCOME, e.cobrancaOutcome)}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ch.entregasTotal > ch.entregas.length && (
            <div className="fin-det-sub">
              {ch.entregasTotal - ch.entregas.length} entrega(s) desta cobrança já não existem mais no
              cadastro.
            </div>
          )}
        </div>
      )}

      <div className="fin-det-block">
        <div className="fin-det-title">Registro</div>
        <div className="fin-det-grid">
          <Campo label="ID da cobrança" value={ch.id} />
          <Campo label="Referência externa" value={ch.externalReference} />
          <Campo label="ID da entrega" value={ch.entregaId} />
          <Campo label="Lançamento no caixa" value={ch.ledgerEntryId} />
          <Campo label="Pagamento (Mercado Pago)" value={ch.mpPaymentId} />
          <Campo label="Preferência (Mercado Pago)" value={ch.mpPreferenceId} />
          <Campo label="Pedido (Mercado Pago)" value={ch.mpMerchantOrderId} />
          <Campo label="Link de pagamento" value={ch.paymentUrl} />
          <Campo label="Comprovante Pix" value={ch.pixTicketUrl} />
          {extras.map(([k, v]) => (
            <Campo key={k} label={k} value={texto(v)} />
          ))}
        </div>
      </div>
    </div>
  );
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
  const [abertos, setAbertos] = useState<string[]>([]);

  const toggleDetalhe = useCallback((chargeId: string) => {
    setAbertos((prev) =>
      prev.includes(chargeId) ? prev.filter((id) => id !== chargeId) : [...prev, chargeId],
    );
  }, []);

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
          <div className="fin-hint">Clique na cobrança para ver tudo o que ficou registrado nela.</div>
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
                    const aberto = abertos.includes(ch.id);
                    return (
                      <React.Fragment key={ch.id}>
                        <tr className="fin-tr-static">
                          <td>
                            <button
                              className="fin-exp"
                              aria-expanded={aberto}
                              onClick={() => toggleDetalhe(ch.id)}
                            >
                              <span className={`fin-exp-ico${aberto ? " open" : ""}`}>▸</span>
                              {ch.description}
                            </button>
                          </td>
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
                        {aberto && (
                          <tr className="fin-tr-static fin-tr-det">
                            <td colSpan={6}>
                              <ChargeDetalhe ch={ch} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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

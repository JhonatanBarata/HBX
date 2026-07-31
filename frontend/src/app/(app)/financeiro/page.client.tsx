"use client";

// FINANCEIRO-UNIVERSAL (Fase 1) — financeiro do TENANT na casca central.
// "Quem me deve" + extrato + baixar cobrança, lendo o MESMO FinanceiroCharge que
// a logística já usa, mas de QUALQUER módulo (logística + vendas) via o módulo
// backend /financeiro-tenant (@Admin). A logística segue intocada.
//
// LEI DO VENDEDOR: a tela trava em @Admin — vendedor vê estado neutro, zero valor.
// Visual 100% de classe/token central (5 Leis): .panel/.tbl/.kpi + .fin-* de
// hbx-theme/financeiro-tenant.css. ZERO style inline.

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  HbxContextEmpty,
  HbxContextHeader,
  HbxContextHero,
  HbxPanelShell,
} from "@/components/hbx/panel-shell";
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
  const [chargeAtiva, setChargeAtiva] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordemAsc, setOrdemAsc] = useState(false);
  const extratoRequest = useRef(0);

  const toggleDetalhe = useCallback((chargeId: string) => {
    setChargeAtiva(chargeId);
    setArmed(null);
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
    const requestId = ++extratoRequest.current;
    setExtLoading(true);
    setExtErro(null);
    setExtrato(null);
    setAbertos([]);
    setArmed(null);
    setChargeAtiva(null);
    try {
      const res = await apiFetch<ExtratoResponse>(
        `/financeiro-tenant/clientes/${encodeURIComponent(clienteId)}/extrato`,
      );
      if (requestId !== extratoRequest.current) return;
      setExtrato(res);
      const primeira = res?.charges?.[0]?.id || null;
      setChargeAtiva(primeira);
      setAbertos(primeira ? [primeira] : []);
    } catch (e) {
      if (requestId !== extratoRequest.current) return;
      setExtErro(e instanceof Error ? e.message : "Falha ao carregar o extrato.");
      setExtrato(null);
    } finally {
      if (requestId === extratoRequest.current) setExtLoading(false);
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
      <HbxPanelShell
        ariaLabel="Financeiro"
        main={(
          <section className="fin-restricted">
            <span className="fin-restricted-icon"><I d={ICONS.money} size={20} /></span>
            <strong>Financeiro</strong>
            <span>Acesso restrito ao responsável da conta.</span>
          </section>
        )}
      />
    );
  }

  const totalReceber = clientes.reduce((sum, c) => sum + (Number(c.saldoAberto) || 0), 0);
  const totalCobrancas = clientes.reduce((sum, c) => sum + (Number(c.cobrancas) || 0), 0);
  const maiorCliente = clientes.reduce<SaldoCliente | null>((maior, cliente) => {
    if (!maior || Number(cliente.saldoAberto) > Number(maior.saldoAberto)) return cliente;
    return maior;
  }, null);
  const concentracao =
    totalReceber > 0 && maiorCliente
      ? (Number(maiorCliente.saldoAberto) / totalReceber) * 100
      : 0;
  const saldoMedio = clientes.length > 0 ? totalReceber / clientes.length : 0;
  const termoBusca = busca.trim().toLocaleLowerCase("pt-BR");
  const clientesVisiveis = clientes
    .filter((cliente) =>
      String(cliente.nome || "Cliente")
        .toLocaleLowerCase("pt-BR")
        .includes(termoBusca),
    )
    .sort((a, b) =>
      ordemAsc
        ? Number(a.saldoAberto) - Number(b.saldoAberto)
        : Number(b.saldoAberto) - Number(a.saldoAberto),
    );
  const clienteSelecionado = sel
    ? clientes.find((cliente) => cliente.customerProfileId === sel.id) || null
    : null;
  const charges = extrato?.charges || [];
  const chargeSelecionada =
    charges.find((charge) => charge.id === chargeAtiva) || charges[0] || null;
  const saldoSelecionado =
    extrato?.saldoAberto ?? clienteSelecionado?.saldoAberto ?? 0;
  const participacaoSelecionada =
    totalReceber > 0 ? Math.min(100, (Number(saldoSelecionado) / totalReceber) * 100) : 0;
  const ultimaCharge = charges[0] || null;
  const chargesAbertas = charges.filter(
    (charge) => String(charge.status).toLowerCase() === "pending",
  );
  const totalOrigens = chargesAbertas.reduce(
    (sum, charge) => sum + (Number(charge.amount) || 0),
    0,
  );
  const origemTotais = chargesAbertas.reduce<Record<string, number>>((acc, charge) => {
    const origem = origemLabel(charge.sourceModule);
    acc[origem] = (acc[origem] || 0) + (Number(charge.amount) || 0);
    return acc;
  }, {});
  const origens = Object.entries(origemTotais)
    .map(([label, valor]) => ({
      label,
      valor,
      percentual: totalOrigens > 0 ? (valor / totalOrigens) * 100 : 0,
      cls:
        label === "Entrega"
          ? "entrega"
          : label === "Venda"
            ? "venda"
            : label === "Fatura mensal"
              ? "mensal"
              : "outros",
    }))
    .sort((a, b) => b.valor - a.valor);

  const nomeCliente = (nome: string | null | undefined) => nome || "Cliente";
  const iniciaisCliente = (nome: string | null | undefined) => {
    const partes = nomeCliente(nome)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return `${partes[0]?.[0] || "C"}${partes.length > 1 ? partes[partes.length - 1]?.[0] || "" : ""}`
      .slice(0, 2)
      .toLocaleUpperCase("pt-BR");
  };
  const qtdLabel = (valor: number, singular: string, plural: string) =>
    `${valor} ${valor === 1 ? singular : plural}`;
  const origemIcone = (sourceModule: string | null) => {
    if (sourceModule === "logistica_entrega") return ICONS.logistica;
    if (sourceModule === "vendas_fechamento") return ICONS.vendas;
    return ICONS.doc;
  };

  const main = (
    <div className="fin-cockpit">
      <header className="fin-heading">
        <div>
          <h1>Painel financeiro</h1>
          <span>Carteira aberta e cobranças por cliente</span>
        </div>
      </header>

      <div className="fin-metrics" role="list">
        <article className="fin-metric fin-metric-primary" role="listitem">
          <span className="fin-metric-icon"><I d={ICONS.money} size={15} /></span>
          <span className="fin-metric-label">A receber</span>
          <strong>{loading ? "—" : brl(totalReceber)}</strong>
          <small>em aberto</small>
        </article>
        <article className="fin-metric" role="listitem">
          <span className="fin-metric-icon"><I d={ICONS.users} size={15} /></span>
          <span className="fin-metric-label">Clientes devendo</span>
          <strong>{loading ? "—" : String(clientes.length)}</strong>
          <small>na carteira atual</small>
        </article>
        <article className="fin-metric" role="listitem">
          <span className="fin-metric-icon"><I d={ICONS.doc} size={15} /></span>
          <span className="fin-metric-label">Cobranças</span>
          <strong>{loading ? "—" : String(totalCobrancas)}</strong>
          <small>em aberto</small>
        </article>
        <article className="fin-metric" role="listitem">
          <span className="fin-metric-icon"><I d={ICONS.relat} size={15} /></span>
          <span className="fin-metric-label">Concentração</span>
          <strong>{loading ? "—" : `${concentracao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</strong>
          <small>maior saldo</small>
        </article>
      </div>

      <section className="fin-portfolio">
        <header className="fin-portfolio-head">
          <div>
            <h2>Carteira a receber</h2>
            <span>
              {loading
                ? "Carregando…"
                : qtdLabel(clientesVisiveis.length, "cliente com saldo aberto", "clientes com saldo aberto")}
            </span>
          </div>
          <label className="fin-search">
            <I d={ICONS.search} size={14} />
            <input
              type="search"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar cliente…"
              aria-label="Buscar cliente"
            />
          </label>
          <button
            type="button"
            className="fin-sort"
            title={ordemAsc ? "Ordenar por maior saldo" : "Ordenar por menor saldo"}
            aria-label={ordemAsc ? "Ordenar por maior saldo" : "Ordenar por menor saldo"}
            aria-pressed={ordemAsc}
            onClick={() => setOrdemAsc((valor) => !valor)}
          >
            <I d={ICONS.filter} size={14} />
          </button>
        </header>

        <div className="fin-list-labels" aria-hidden="true">
          <span>Cliente</span>
          <span>Concentração</span>
          <span>Cobranças</span>
          <span>Em aberto</span>
          <span></span>
        </div>

        <div className="fin-client-list">
          {loading &&
            Array.from({ length: 5 }, (_, index) => (
              <div className="fin-client-skeleton" key={index}>
                <span />
                <i />
                <i />
                <i />
              </div>
            ))}

          {!loading && erro && (
            <div className="fin-empty-state">
              <span className="fin-empty-icon"><I d={ICONS.x} size={18} /></span>
              <strong>Falha ao carregar o financeiro.</strong>
              <button type="button" className="btn-ghost" onClick={() => void loadSaldos()}>
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !erro && clientesVisiveis.length === 0 && (
            <div className="fin-empty-state">
              <span className="fin-empty-icon"><I d={ICONS.check} size={18} /></span>
              <strong>{busca ? "Nenhum cliente encontrado." : "Ninguém devendo."}</strong>
            </div>
          )}

          {!loading &&
            !erro &&
            clientesVisiveis.map((cliente, index) => {
              const selecionado = sel?.id === cliente.customerProfileId;
              const percentual =
                totalReceber > 0 ? (Number(cliente.saldoAberto) / totalReceber) * 100 : 0;
              return (
                <button
                  type="button"
                  key={cliente.customerProfileId}
                  className={`fin-client-row fin-client-tone-${(index % 5) + 1}${selecionado ? " is-selected" : ""}`}
                  aria-pressed={selecionado}
                  onClick={() =>
                    setSel({ id: cliente.customerProfileId, nome: cliente.nome })
                  }
                >
                  <span className="fin-client-identity">
                    <span className="fin-client-avatar">{iniciaisCliente(cliente.nome)}</span>
                    <span>
                      <strong>{nomeCliente(cliente.nome)}</strong>
                      <small>{qtdLabel(cliente.cobrancas, "cobrança", "cobranças")}</small>
                    </span>
                  </span>
                  <span className="fin-share">
                    <span>
                      <small>da carteira</small>
                      <strong>
                        {percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                      </strong>
                    </span>
                    <i>
                      <span style={{ width: `${Math.min(100, percentual)}%` }} />
                    </i>
                  </span>
                  <span className="fin-row-count">
                    <strong>{cliente.cobrancas}</strong>
                    <small>{cliente.cobrancas === 1 ? "cobrança" : "cobranças"}</small>
                  </span>
                  <span className="fin-row-amount">
                    <strong>{brl(cliente.saldoAberto)}</strong>
                    <small>em aberto</small>
                  </span>
                  <span className="fin-row-arrow"><I d={ICONS.arrow} size={13} /></span>
                </button>
              );
            })}
        </div>

        <footer className="fin-portfolio-foot">
          <div>
            <span className="fin-insight-icon"><I d={ICONS.relat} size={14} /></span>
            <span>
              <small>Maior saldo</small>
              <strong>
                {maiorCliente ? `${nomeCliente(maiorCliente.nome)} · ${brl(maiorCliente.saldoAberto)}` : "—"}
              </strong>
            </span>
          </div>
          <div>
            <span className="fin-insight-icon"><I d={ICONS.money} size={14} /></span>
            <span>
              <small>Saldo médio</small>
              <strong>{clientes.length > 0 ? brl(saldoMedio) : "—"}</strong>
            </span>
          </div>
        </footer>
      </section>
    </div>
  );

  const context = !sel ? (
    <>
      <HbxContextHeader title="Extrato do cliente" />
      <HbxContextEmpty
        icon={<I d={ICONS.money} size={19} />}
        title="Selecione um cliente"
      />
    </>
  ) : (
    <>
      <HbxContextHeader
        title="Extrato do cliente"
        status={(
          <span className={`fin-context-status${saldoSelecionado > 0 ? " is-open" : ""}`}>
            <i />
            {saldoSelecionado > 0 ? "Em aberto" : "Sem saldo"}
          </span>
        )}
        actions={(
          <button
            type="button"
            className="icon-ghost"
            aria-label="Fechar extrato"
            onClick={() => {
              extratoRequest.current += 1;
              setSel(null);
              setExtrato(null);
              setArmed(null);
              setAbertos([]);
              setChargeAtiva(null);
            }}
          >
            <I d={ICONS.x} size={15} />
          </button>
        )}
      />
      <div className="fin-context-scroll">
        <HbxContextHero
          visual={<span className="fin-context-initials">{iniciaisCliente(extrato?.nome || sel.nome)}</span>}
          title={extrato?.nome || sel.nome || "Cliente"}
          subtitle="Extrato financeiro"
        />

        <section className="fin-balance-card">
          <span>
            <small>Total em aberto</small>
            <strong>{extLoading ? "—" : brl(saldoSelecionado)}</strong>
            <span>
              {extLoading
                ? "Carregando…"
                : qtdLabel(extrato?.total ?? clienteSelecionado?.cobrancas ?? 0, "cobrança", "cobranças")}
            </span>
          </span>
          <span className="fin-balance-ring">
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r="18" pathLength="100" />
              <circle
                className="fin-balance-ring-value"
                cx="22"
                cy="22"
                r="18"
                pathLength="100"
                strokeDasharray={`${participacaoSelecionada} 100`}
              />
            </svg>
            <span>
              <strong>
                {participacaoSelecionada.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </strong>
              <small>carteira</small>
            </span>
          </span>
        </section>

        <div className="fin-context-minis">
          <div>
            <small>Última origem</small>
            <strong>{extLoading ? "—" : origemLabel(ultimaCharge?.sourceModule || null)}</strong>
          </div>
          <div>
            <small>Última competência</small>
            <strong>{extLoading ? "—" : ultimaCharge?.competence || "—"}</strong>
          </div>
          <div>
            <small>Último meio</small>
            <strong>
              {extLoading
                ? "—"
                : rotulo(FORMA_COBRANCA, ultimaCharge?.paymentMethod) || "—"}
            </strong>
          </div>
        </div>

        {extErro && <div className="fin-err">{extErro}</div>}

        <section className="fin-origin">
          <header>
            <strong>Origem do saldo</strong>
            <span>{extLoading ? "—" : brl(totalOrigens)}</span>
          </header>
          {origens.length > 0 ? (
            <>
              <div className="fin-origin-bar">
                {origens.map((origem) => (
                  <span
                    key={origem.label}
                    className={`fin-origin-segment is-${origem.cls}`}
                    style={{ width: `${origem.percentual}%` }}
                  />
                ))}
              </div>
              <div className="fin-origin-legend">
                {origens.map((origem) => (
                  <span key={origem.label} className={`is-${origem.cls}`}>
                    <i />
                    {origem.label}{" "}
                    {origem.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span className="fin-origin-empty">{extLoading ? "Carregando…" : "Sem saldo em aberto."}</span>
          )}
        </section>

        <section className="fin-charges">
          <header>
            <strong>Cobranças</strong>
            <span>{extLoading ? "—" : qtdLabel(charges.length, "item", "itens")}</span>
          </header>

          <div className="fin-context-charges">
            {extLoading &&
              Array.from({ length: 3 }, (_, index) => (
                <div className="fin-charge-skeleton" key={index} />
              ))}
            {!extLoading && charges.length === 0 && (
              <div className="fin-td-empty">Sem cobranças para este cliente.</div>
            )}
            {!extLoading &&
              charges.map((charge) => {
                const st = statusLabel(charge.status);
                const aberto = abertos.includes(charge.id);
                const ativo = chargeSelecionada?.id === charge.id;
                return (
                  <article
                    key={charge.id}
                    className={`fin-context-charge${aberto ? " is-open" : ""}${ativo ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="fin-charge-trigger"
                      aria-expanded={aberto}
                      onClick={() => toggleDetalhe(charge.id)}
                    >
                      <span className={`fin-charge-source is-${origemLabel(charge.sourceModule).toLocaleLowerCase("pt-BR").replace(/\s+/g, "-")}`}>
                        <I d={origemIcone(charge.sourceModule)} size={14} />
                      </span>
                      <span className="fin-context-charge-copy">
                        <strong>{charge.description}</strong>
                        <small>
                          {origemLabel(charge.sourceModule)}
                          {" · "}
                          {charge.dueDate ? `vence ${fmtDate(charge.dueDate)}` : "sem vencimento"}
                        </small>
                      </span>
                      <span className="fin-charge-value">
                        <strong>{brl(charge.amount)}</strong>
                        <small className={`fin-st ${st.cls}`}>{st.label}</small>
                      </span>
                      <span className={`fin-exp-ico${aberto ? " open" : ""}`}>▸</span>
                    </button>

                    {aberto && <ChargeDetalhe ch={charge} />}
                  </article>
                );
              })}
          </div>
        </section>
      </div>

      {!extLoading &&
        chargeSelecionada &&
        String(chargeSelecionada.status).toLowerCase() === "pending" && (
          <footer className="fin-context-footer">
            <button
              type="button"
              className={armed === chargeSelecionada.id ? "btn-teal" : "btn-primary"}
              disabled={!!quitando}
              aria-label={`${armed === chargeSelecionada.id ? "Confirmar pagamento" : "Marcar como pago"}: ${chargeSelecionada.description}, ${brl(chargeSelecionada.amount)}`}
              onClick={() => {
                if (armed === chargeSelecionada.id) {
                  void marcarPago(chargeSelecionada.id);
                } else {
                  setArmed(chargeSelecionada.id);
                }
              }}
            >
              <I d={ICONS.check} size={14} />
              {quitando === chargeSelecionada.id
                ? "Baixando…"
                : armed === chargeSelecionada.id
                  ? "Confirmar pagamento"
                  : "Marcar como pago"}
            </button>
          </footer>
        )}
    </>
  );

  return (
    <HbxPanelShell
      variant="context"
      ariaLabel="Financeiro"
      contextLabel="Extrato do cliente"
      contextClassName="fin-context"
      contentClassName="fin-shell-content"
      main={main}
      context={context}
    />
  );
}

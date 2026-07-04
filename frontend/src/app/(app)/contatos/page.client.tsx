"use client";

// NÚCLEO-CRM N4 — janela "Contatos" (pessoas) + criar cliente manual + view
// "Clientes" (papel). Contratos reais (company-scoped, companyId sempre do JWT):
//   - GET  /nucleo/contatos?query=&page=      → { items(pessoas), total, ... }
//   - GET  /nucleo/clientes?query=&uf=&page=  → { items(contas papel=cliente) }
//   - POST /nucleo/contas                     → cria conta manual + contato principal
//
// Cadastro manual é GRÁTIS (não é lead da base 28M → não debita crédito).
//
// Design system (5 Leis): visual todo em classe central (.ctt-*/.emp-* em
// screens.css + .hbx-veil/.hbx-modal/.field-dark/.btn-teal do kit). Inline aqui
// = só layout (display/gap/grid) — nada de cor/borda/sombra/fonte inline.

import React, { useCallback, useEffect, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

type ContatoItem = {
  id: string;
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  isPrincipal: boolean;
  source: string | null;
  contaId: string;
  contaNome: string | null;
  contaTipo: string | null;
  contaIsCliente: boolean;
  contaIsLead: boolean;
  contaIsFornecedor: boolean;
};

type ContatoListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ContatoItem[];
} | null;

// A view "Clientes" reusa a serialização de Empresas (contas).
type ClienteItem = {
  id: string;
  name: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  contatosCount: number;
};

type ClienteListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ClienteItem[];
} | null;

function fmtPhone(v: string | null): string {
  const d = String(v || "").replace(/\D+/g, "");
  if (d.length < 10) return v || "";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  return rest.length === 9
    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function localCityUf(cidade: string | null, uf: string | null): string {
  return [String(cidade || "").trim(), String(uf || "").trim()].filter(Boolean).join(" · ");
}

// ── LOGÍSTICA-MOBILE M2 — "Produtos do cliente" (vínculo produto×cliente) ─────
type ProdutoOption = {
  id: number;
  nome: string;
  unidade: string | null;
  usaLogistica: boolean;
  precoCatalogo: number | null;
};

type ClienteProduto = {
  id: string;
  customerProfileId: string;
  productId: number;
  qtdPadrao: number;
  precoAcordado: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: string | null;
  ativo: boolean;
  produto: { id: number; nome: string; unidade: string | null; precoCatalogo: number | null } | null;
};

function fmtRecorrencia(cp: ClienteProduto): string {
  if (cp.diasSemana) {
    const map = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const dias = cp.diasSemana
      .split(",")
      .map((d) => map[Number(d.trim())] || "")
      .filter(Boolean)
      .join("/");
    return dias ? `Toda ${dias}` : "Sem recorrência";
  }
  if (cp.frequenciaDias) return cp.frequenciaDias === 7 ? "Semanal" : `A cada ${cp.frequenciaDias} dias`;
  return "Sem recorrência";
}

// ── LOGÍSTICA-MOBILE M6 — financeiro do cliente (forma de pagamento + extrato) ─
type FinanceiroCliente = {
  id: string;
  formaPagamento: string; // aberto | mensal | na_hora | pendura
  metodoPadrao: string | null; // pix | dinheiro (só na_hora)
  contabilizar: boolean;
  diaFechamento: number | null;
};

type ExtratoCharge = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string; // pending | approved | ...
  lifecycle: string;
  dueDate: string | null;
  sourceModule: string | null;
  entregaId: string | null;
  createdAt: string | null;
  paidAt: string | null;
};

type ExtratoResult = { clienteId: string; nome: string | null; total: number; charges: ExtratoCharge[] };

const FORMA_LABEL: Record<string, string> = {
  aberto: "Escolhe na hora",
  mensal: "Fecha no mês",
  na_hora: "Sempre na hora",
  pendura: "Pendura (fiado)",
};

const CHARGE_STATUS_LABEL: Record<string, string> = {
  approved: "Pago",
  paid: "Pago",
  pending: "A receber",
  cancelled: "Cancelado",
  failed: "Falhou",
  refunded: "Estornado",
};

function fmtMoney(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

function fmtDay(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

// Editor da forma de pagamento (M6) — os 2 eixos: forma + método padrão (na_hora)
// + contabilizar + dia de fechamento (mensal). Salva via PATCH /clientes/:id/financeiro.
// ADMIN-only (o pai só renderiza este bloco para admin).
function FinanceiroEditor({ clienteId }: { clienteId: string }) {
  const [fin, setFin] = useState<FinanceiroCliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    // O PATCH com body vazio é um no-op que devolve o estado ATUAL dos 2 eixos
    // (o backend M6 não expõe um GET dedicado da forma; o echo do PATCH é a fonte).
    // ADMIN-only, idempotente — não muda nada além de refletir o contrato vigente.
    return apiFetch<FinanceiroCliente>(`/logistica/clientes/${clienteId}/financeiro`, { method: "PATCH", body: JSON.stringify({}) })
      .then((res) => { setFin(res); setError(null); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Não foi possível carregar."); })
      .finally(() => setLoading(false));
  }, [clienteId]);

  useEffect(() => { load(); }, [load]);

  async function patch(body: Partial<FinanceiroCliente>) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<FinanceiroCliente>(`/logistica/clientes/${clienteId}/financeiro`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setFin(res);
      setSavedAt(Date.now());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="cli-prod__muted">Carregando forma de pagamento…</p>;
  if (!fin) return <p className="hint cli-prod__err">{error || "Sem dados financeiros."}</p>;

  return (
    <div className="cli-fin">
      <div className="cli-fin__head">
        <strong className="cli-fin__title">Forma de pagamento</strong>
        {saving ? <span className="cli-fin__tag">Salvando…</span> : savedAt ? <span className="cli-fin__tag is-ok">Salvo</span> : null}
      </div>

      <div className="cli-fin__row">
        <label className="cli-fin__lbl" htmlFor="fin-forma">Como paga</label>
        <select
          id="fin-forma"
          className="field-dark"
          value={fin.formaPagamento}
          onChange={(e) => patch({ formaPagamento: e.target.value })}
          disabled={saving}
        >
          <option value="aberto">Escolhe na hora (avulso)</option>
          <option value="na_hora">Sempre na hora (forma fixa)</option>
          <option value="mensal">Fecha no mês</option>
          <option value="pendura">Pendura (fiado)</option>
        </select>
      </div>

      {fin.formaPagamento === "na_hora" && (
        <div className="cli-fin__row">
          <label className="cli-fin__lbl" htmlFor="fin-metodo">Método fixo</label>
          <select
            id="fin-metodo"
            className="field-dark"
            value={fin.metodoPadrao || ""}
            onChange={(e) => patch({ metodoPadrao: e.target.value })}
            disabled={saving}
          >
            <option value="">Escolher…</option>
            <option value="pix">Pix</option>
            <option value="dinheiro">Dinheiro</option>
          </select>
        </div>
      )}

      {fin.formaPagamento === "mensal" && (
        <div className="cli-fin__row">
          <label className="cli-fin__lbl" htmlFor="fin-dia">Fecha no dia</label>
          <input
            id="fin-dia"
            className="field-dark cli-fin__dia"
            type="number"
            min={1}
            max={31}
            value={fin.diaFechamento ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1 && n <= 31) patch({ diaFechamento: n });
            }}
            disabled={saving}
          />
        </div>
      )}

      <label className="ctt-toggle cli-fin__conta">
        <input
          type="checkbox"
          checked={fin.contabilizar}
          onChange={(e) => patch({ contabilizar: e.target.checked })}
          disabled={saving}
        />
        <span>Contabilizar (entra no financeiro)</span>
      </label>

      {error && <p className="hint cli-prod__err">{error}</p>}
    </div>
  );
}

// Extrato do cliente (M6) — lista os FinanceiroCharge linkados. Read-only.
function ExtratoPanel({ clienteId }: { clienteId: string }) {
  const [ext, setExt] = useState<ExtratoResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch<ExtratoResult>(`/logistica/clientes/${clienteId}/extrato`)
      .then((res) => { if (alive) { setExt(res); setError(null); } })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : "Não foi possível carregar o extrato."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clienteId]);

  if (loading) return <p className="cli-prod__muted">Carregando extrato…</p>;
  if (error) return <p className="hint cli-prod__err">{error}</p>;
  if (!ext || ext.charges.length === 0) return <p className="cli-prod__muted">Nenhuma cobrança lançada ainda.</p>;

  const totalPendente = ext.charges
    .filter((c) => c.status === "pending")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  return (
    <div className="cli-ext">
      <div className="cli-ext__head">
        <strong className="cli-fin__title">Extrato</strong>
        {totalPendente > 0 && <span className="cli-ext__due">A receber: {fmtMoney(totalPendente)}</span>}
      </div>
      <div className="cli-ext__list">
        {ext.charges.map((c) => {
          const pago = c.status === "approved" || c.status === "paid" || c.lifecycle === "paid";
          return (
            <div className="cli-ext__row" key={c.id}>
              <span className="cli-ext__main">
                <span className="cli-ext__desc">{c.description}</span>
                <span className="cli-ext__meta">
                  {pago && c.paidAt ? `Pago em ${fmtDay(c.paidAt)}` : c.dueDate ? `Vence ${fmtDay(c.dueDate)}` : fmtDay(c.createdAt)}
                </span>
              </span>
              <span className="cli-ext__side">
                <span className="cli-ext__amount">{fmtMoney(c.amount)}</span>
                <span className={`cli-ext__badge cli-ext__badge--${pago ? "paid" : c.status}`}>
                  {CHARGE_STATUS_LABEL[pago ? "paid" : c.status] || c.status}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Drawer com a lista + o formulário de adicionar produto ao cliente.
function ClienteProdutosDrawer({
  cliente,
  admin,
  onClose,
}: {
  cliente: { id: string; nome: string | null };
  admin: boolean;
  onClose: () => void;
}) {
  const [vinculos, setVinculos] = useState<ClienteProduto[]>([]);
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // LOGÍSTICA-MOBILE M5 — toggle "avisar entrega" POR CLIENTE (2º nível, soma com
  // o global de LogisticaConfig). null = ainda carregando; default do backend = true.
  const [avisarEntrega, setAvisarEntrega] = useState<boolean | null>(null);

  // form de novo vínculo
  const [productId, setProductId] = useState<string>("");
  const [qtdPadrao, setQtdPadrao] = useState("1");
  const [precoAcordado, setPrecoAcordado] = useState("");
  const [frequencia, setFrequencia] = useState(""); // "" | "7" | "15" | "30"

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ customerProfileId: cliente.id });
    return Promise.all([
      apiFetch<ClienteProduto[]>(`/logistica/cliente-produtos?${qs.toString()}`),
      apiFetch<ProdutoOption[]>(`/logistica/produtos`),
      apiFetch<{ id: string; avisarEntrega: boolean }>(`/logistica/cliente/${cliente.id}/aviso`),
    ])
      .then(([vs, ps, av]) => {
        setVinculos(vs || []);
        setProdutos(ps || []);
        setAvisarEntrega(av?.avisarEntrega ?? true);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar.");
      })
      .finally(() => setLoading(false));
  }, [cliente.id]);

  useEffect(() => { load(); }, [load]);

  // Liga/desliga o aviso de entrega deste cliente (PATCH /logistica/cliente/:id/aviso).
  async function toggleAvisar(next: boolean) {
    setAvisarEntrega(next); // otimista
    try {
      await apiFetch(`/logistica/cliente/${cliente.id}/aviso`, {
        method: "PATCH",
        body: JSON.stringify({ avisar: next }),
      });
    } catch (err: unknown) {
      setAvisarEntrega(!next); // reverte
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o aviso.");
    }
  }

  async function addVinculo(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      setError("Escolha um produto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/logistica/cliente-produtos", {
        method: "POST",
        body: JSON.stringify({
          customerProfileId: cliente.id,
          productId: Number(productId),
          qtdPadrao: Math.max(1, Number(qtdPadrao) || 1),
          precoAcordado: precoAcordado.trim() ? Number(precoAcordado) : undefined,
          frequenciaDias: frequencia ? Number(frequencia) : undefined,
        }),
      });
      setProductId("");
      setQtdPadrao("1");
      setPrecoAcordado("");
      setFrequencia("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível vincular o produto.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(cp: ClienteProduto) {
    try {
      await apiFetch(`/logistica/cliente-produtos/${cp.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !cp.ativo }),
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  // Só produtos ainda não vinculados aparecem no seletor.
  const jaVinculados = new Set(vinculos.map((v) => v.productId));
  const disponiveis = produtos.filter((p) => !jaVinculados.has(p.id));

  return (
    <div className="hbx-veil to-bottom" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-drawer-bottom cli-prod" role="dialog" aria-label="Produtos do cliente" aria-modal="true">
        <div className="hbx-drawer-bottom__handle" aria-hidden />

        <div className="cli-prod__head">
          <strong className="cli-prod__title">Produtos do cliente</strong>
          <span className="cli-prod__sub">{cliente.nome || "Cliente"}</span>
        </div>

        {/* M5 — aviso de entrega POR CLIENTE (soma com o global das Regras). */}
        {avisarEntrega !== null && (
          <label className="ctt-toggle cli-prod__aviso">
            <input
              type="checkbox"
              checked={avisarEntrega}
              onChange={(e) => toggleAvisar(e.target.checked)}
            />
            <span>Avisar no WhatsApp quando entregar</span>
          </label>
        )}

        {/* M6 — editor da forma de pagamento (ADMIN) + extrato do cliente. */}
        {admin && <FinanceiroEditor clienteId={cliente.id} />}
        {admin && <ExtratoPanel clienteId={cliente.id} />}

        {loading && <p className="cli-prod__muted">Carregando…</p>}
        {error && <p className="hint cli-prod__err">{error}</p>}

        {!loading && vinculos.length > 0 && (
          <div className="cli-prod__list">
            {vinculos.map((cp) => (
              <div className={`cli-prod__row${cp.ativo ? "" : " is-off"}`} key={cp.id}>
                <span className="cli-prod__ico"><I d={ICONS.logistica} size={16} /></span>
                <span className="cli-prod__main">
                  <span className="cli-prod__name">
                    {cp.qtdPadrao}× {cp.produto?.nome || "Produto"}
                    {cp.produto?.unidade ? ` (${cp.produto.unidade})` : ""}
                  </span>
                  <span className="cli-prod__meta">
                    {fmtRecorrencia(cp)}
                    {cp.precoAcordado != null ? `  ·  R$ ${cp.precoAcordado.toFixed(2)}` : ""}
                  </span>
                </span>
                <button type="button" className="btn-ghost btn-xs" onClick={() => toggleAtivo(cp)}>
                  {cp.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && vinculos.length === 0 && (
          <p className="cli-prod__muted">Nenhum produto vinculado ainda. Adicione abaixo.</p>
        )}

        <form className="cli-prod__form" onSubmit={addVinculo}>
          <div className="cli-prod__form-row">
            <select className="field-dark" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Produto">
              <option value="">Produto…</option>
              {disponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.unidade ? ` (${p.unidade})` : ""}
                </option>
              ))}
            </select>
            <input
              className="field-dark cli-prod__qtd"
              type="number"
              min={1}
              value={qtdPadrao}
              onChange={(e) => setQtdPadrao(e.target.value)}
              aria-label="Quantidade padrão"
            />
          </div>
          <div className="cli-prod__form-row">
            <input
              className="field-dark"
              placeholder="Preço acordado (opcional)"
              inputMode="decimal"
              value={precoAcordado}
              onChange={(e) => setPrecoAcordado(e.target.value)}
              aria-label="Preço acordado"
            />
            <select className="field-dark" value={frequencia} onChange={(e) => setFrequencia(e.target.value)} aria-label="Frequência">
              <option value="">Sem recorrência</option>
              <option value="7">Semanal (7 dias)</option>
              <option value="15">Quinzenal (15 dias)</option>
              <option value="30">Mensal (30 dias)</option>
            </select>
          </div>
          <button type="submit" className="btn-teal" disabled={saving || !productId}>
            <I d={ICONS.plus} size={13} /> {saving ? "Adicionando…" : "Adicionar produto"}
          </button>
        </form>

        <button type="button" className="btn-ghost btn-xs cli-prod__close" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

// ── Modal: novo contato/cliente ──────────────────────────────────────────────
function NovoClienteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"pf" | "pj">("pf");
  const [whatsapp, setWhatsapp] = useState("");
  const [cargo, setCargo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [isCliente, setIsCliente] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError("Informe o nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/nucleo/contas", {
        method: "POST",
        body: JSON.stringify({
          nome: nomeTrim,
          tipo,
          whatsapp: whatsapp.trim() || undefined,
          cargo: cargo.trim() || undefined,
          endereco: endereco.trim() || undefined,
          cidade: cidade.trim() || undefined,
          uf: uf.trim() || undefined,
          isCliente,
        }),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={onClose}>
      <form className="hbx-modal ctt-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>
          Novo contato / cliente
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>

        <div className="ctt-form__body">
          <div className="f">
            <label htmlFor="ctt-nome">Nome *</label>
            <input
              id="ctt-nome"
              className="field-dark"
              placeholder="Ex.: Dona Maria"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="ctt-tipo">Tipo</label>
              <select
                id="ctt-tipo"
                className="field-dark"
                value={tipo}
                onChange={(e) => setTipo(e.target.value === "pj" ? "pj" : "pf")}
              >
                <option value="pf">Pessoa (PF)</option>
                <option value="pj">Empresa (PJ)</option>
              </select>
            </div>
            <div className="f">
              <label htmlFor="ctt-wa">Telefone / WhatsApp</label>
              <input
                id="ctt-wa"
                className="field-dark"
                placeholder="(00) 00000-0000"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          <div className="f">
            <label htmlFor="ctt-cargo">Cargo / função (opcional)</label>
            <input
              id="ctt-cargo"
              className="field-dark"
              placeholder="Ex.: Compradora"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
          </div>

          <div className="f">
            <label htmlFor="ctt-end">Endereço (opcional)</label>
            <input
              id="ctt-end"
              className="field-dark"
              placeholder="Rua, número, bairro"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="ctt-cidade">Cidade (opcional)</label>
              <input
                id="ctt-cidade"
                className="field-dark"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
            <div className="f ctt-form__uf">
              <label htmlFor="ctt-uf">UF</label>
              <input
                id="ctt-uf"
                className="field-dark"
                maxLength={2}
                placeholder="UF"
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <label className="ctt-toggle">
            <input type="checkbox" checked={isCliente} onChange={(e) => setIsCliente(e.target.checked)} />
            <span>É cliente (aparece na aba Clientes)</span>
          </label>

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>

        <div className="ctt-form__foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-teal" disabled={saving}>
            {saving ? "Salvando…" : "Salvar cadastro"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ContatosClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  const [onlyClientes, setOnlyClientes] = useState(false);
  const [contatos, setContatos] = useState<ContatoListResponse>(null);
  const [clientes, setClientes] = useState<ClienteListResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showNovo, setShowNovo] = useState(false);
  // LOGÍSTICA-MOBILE M2 — cliente com o drawer "Produtos do cliente" aberto.
  const [prodCliente, setProdCliente] = useState<{ id: string; nome: string | null } | null>(null);

  const load = useCallback((only: boolean, q: string, p: number) => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (q) qs.set("query", q);
    qs.set("page", String(p));
    const path = only ? `/nucleo/clientes?${qs.toString()}` : `/nucleo/contatos?${qs.toString()}`;
    return apiFetch<ContatoListResponse | ClienteListResponse>(path)
      .then((res) => {
        if (only) { setClientes(res as ClienteListResponse); setContatos(null); }
        else { setContatos(res as ContatoListResponse); setClientes(null); }
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar.");
        setContatos(null);
        setClientes(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(onlyClientes, query, page); }, [load, onlyClientes, query, page]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  function toggleOnly(next: boolean) {
    setOnlyClientes(next);
    setPage(1);
  }

  function afterSaved() {
    setShowNovo(false);
    load(onlyClientes, query, page);
  }

  const cttItems = contatos?.items || [];
  const cliItems = clientes?.items || [];
  const total = onlyClientes ? (clientes?.total || 0) : (contatos?.total || 0);
  const totalPages = onlyClientes ? (clientes?.totalPages || 1) : (contatos?.totalPages || 1);
  const isEmpty = !loading && !error && (onlyClientes ? cliItems.length === 0 : cttItems.length === 0);

  return (
    <div className="work" style={{ flex: 1 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>{onlyClientes ? "Clientes" : "Contatos"}</h2>
          <div className="meta">
            <span>{total} {onlyClientes ? "cliente(s)" : "pessoa(s)"}</span>
          </div>
        </div>

        <div style={{ padding: "12px 16px 4px" }}>
          <form className="emp-toolbar" onSubmit={submitSearch}>
            <input
              className="field-dark emp-search"
              placeholder={onlyClientes ? "Buscar cliente por nome, CNPJ, cidade…" : "Buscar pessoa, cargo, telefone, empresa…"}
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
            />
            <button className="btn-teal" type="submit">
              <I d={ICONS.search} size={13} /> Buscar
            </button>
            <label className="ctt-toggle ctt-toggle--inline">
              <input type="checkbox" checked={onlyClientes} onChange={(e) => toggleOnly(e.target.checked)} />
              <span>Só clientes</span>
            </label>
            <button type="button" className="btn-ghost ctt-new" onClick={() => setShowNovo(true)}>
              <I d={ICONS.plus} size={13} /> Novo contato/cliente
            </button>
            {loading && <span className="emp-count">carregando…</span>}
          </form>
        </div>

        {error && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Não carregou</strong>
            <span className="emp-empty__text">{error}</span>
            <button className="btn-ghost" onClick={() => load(onlyClientes, query, page)}>Tentar novamente</button>
          </div>
        )}

        {isEmpty && (
          <div className="emp-empty">
            <strong className="emp-empty__title">
              {onlyClientes ? "Nenhum cliente ainda" : "Nenhum contato ainda"}
            </strong>
            <span className="emp-empty__text">
              {onlyClientes
                ? "Marque uma conta como cliente ou cadastre um cliente manual em \"Novo contato/cliente\"."
                : "As pessoas aparecem aqui quando você puxa contas do Radar ou cadastra um contato/cliente manual."}
            </span>
            <button className="btn-teal" onClick={() => setShowNovo(true)}>
              <I d={ICONS.plus} size={13} /> Novo contato/cliente
            </button>
          </div>
        )}

        {/* Lista de PESSOAS (contatos) */}
        {!error && !onlyClientes && cttItems.length > 0 && (
          <div className="emp-list">
            {cttItems.map((c) => {
              const canal = c.whatsapp ? fmtPhone(c.whatsapp) : c.phone ? fmtPhone(c.phone) : c.email || "";
              const sub = [c.cargo || "", canal].filter(Boolean).join("  ·  ");
              return (
                <div className="emp-row ctt-row" key={c.id}>
                  <span className="emp-row__ico"><I d={ICONS.users} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">
                      {c.nome}
                      {c.isPrincipal && <span className="badge-win" style={{ marginLeft: 6 }}>Principal</span>}
                    </span>
                    {sub && <span className="emp-row__sub">{sub}</span>}
                    {c.contaNome && (
                      <span className="ctt-row__conta">
                        <I d={ICONS.empresas} size={11} /> {c.contaNome}
                      </span>
                    )}
                  </span>
                  <span className="emp-row__side">
                    {(c.contaIsCliente || c.contaIsLead || c.contaIsFornecedor) && (
                      <span className="emp-roles">
                        {c.contaIsCliente && <span className="emp-role is-cliente">Cliente</span>}
                        {c.contaIsLead && <span className="emp-role is-lead">Lead</span>}
                        {c.contaIsFornecedor && <span className="emp-role is-fornecedor">Fornecedor</span>}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* View CLIENTES (contas papel=cliente) */}
        {!error && onlyClientes && cliItems.length > 0 && (
          <div className="emp-list">
            {cliItems.map((e) => {
              const sub = localCityUf(e.cidade, e.uf);
              return (
                <div className="emp-row ctt-row" key={e.id}>
                  <span className="emp-row__ico"><I d={ICONS.empresas} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">{e.name || "(sem nome)"}</span>
                    {sub && <span className="emp-row__sub">{sub}</span>}
                  </span>
                  <span className="emp-row__side">
                    <span className="emp-roles">
                      <span className="emp-role is-cliente">Cliente</span>
                      {e.isLead && <span className="emp-role is-lead">Lead</span>}
                      {e.isFornecedor && <span className="emp-role is-fornecedor">Fornecedor</span>}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost btn-xs ctt-prod-btn"
                      onClick={() => setProdCliente({ id: e.id, nome: e.name })}
                    >
                      <I d={ICONS.logistica} size={13} /> Produtos
                    </button>
                    <span className="emp-row__contacts" title="Contatos">
                      <I d={ICONS.users} size={13} /> {e.contatosCount}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!error && totalPages > 1 && (
          <div className="emp-pager">
            <button className="btn-ghost btn-xs" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Anterior
            </button>
            <span className="emp-pager__info">Página {page} de {totalPages}</span>
            <button className="btn-ghost btn-xs" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Próxima
            </button>
          </div>
        )}
      </section>

      {showNovo && <NovoClienteModal onClose={() => setShowNovo(false)} onSaved={afterSaved} />}
      {prodCliente && <ClienteProdutosDrawer cliente={prodCliente} admin={admin} onClose={() => setProdCliente(null)} />}
    </div>
  );
}

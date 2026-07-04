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

// Drawer com a lista + o formulário de adicionar produto ao cliente.
function ClienteProdutosDrawer({
  cliente,
  onClose,
}: {
  cliente: { id: string; nome: string | null };
  onClose: () => void;
}) {
  const [vinculos, setVinculos] = useState<ClienteProduto[]>([]);
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    ])
      .then(([vs, ps]) => {
        setVinculos(vs || []);
        setProdutos(ps || []);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar.");
      })
      .finally(() => setLoading(false));
  }, [cliente.id]);

  useEffect(() => { load(); }, [load]);

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
  useCurrentUser();
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
      {prodCliente && <ClienteProdutosDrawer cliente={prodCliente} onClose={() => setProdCliente(null)} />}
    </div>
  );
}

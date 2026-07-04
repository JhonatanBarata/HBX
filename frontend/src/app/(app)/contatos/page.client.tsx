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
    </div>
  );
}

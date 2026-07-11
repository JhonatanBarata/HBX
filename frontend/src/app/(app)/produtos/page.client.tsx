"use client";

// NÚCLEO-CRM N5 — catálogo de produtos do tenant (o que o vendedor vende/entrega:
// galão 20L, kg, unidade…). REUSA o módulo backend /products já existente
// (kind='tenant_product', RBAC por team-access, soft-delete via status), só
// adicionando os campos novos unidade/usaLogistica. Contratos reais
// (company-scoped, companyId sempre do JWT):
//   - GET    /products?status=            → Product[] (array, não paginado)
//   - POST   /products                    → cria produto do tenant
//   - PATCH  /products/:id                → edita
//   - DELETE /products/:id                → inativa (status='archived')
//
// Design system (5 Leis): visual todo em classe central (.prod-*/.emp-*/.ctt-*
// em screens.css + .hbx-veil/.hbx-modal/.field-dark/.btn-teal do kit). Inline
// aqui = só layout (display/gap/grid) — nada de cor/borda/sombra/fonte inline.

import React, { useCallback, useEffect, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import {
  ImportPlanilhaModal,
  parsePlanilhaBool,
  parsePlanilhaNumero,
  type ImportSchema,
} from "@/components/hbx/import-planilha-modal";
import { apiFetch } from "@/lib/api";

// Importação em massa (planilha): A nome (obrigatório) · B preço · C unidade ·
// D usa_logistica · E sku · F descrição. Só nome é obrigatório. Cada linha roda o
// MESMO caminho do cadastro manual (buildCreateData), inserido em lote (createMany).
const PRODUTOS_IMPORT_SCHEMA: ImportSchema = {
  title: "Importar produtos (planilha)",
  entity: "produto",
  templateName: "modelo-produtos.xlsx",
  endpoint: "/products/import",
  columns: [
    { key: "nome", header: "nome", label: "Nome", required: true, example: "Galão de água 20L", hint: "nome do produto (obrigatório)", aliases: ["produto"] },
    { key: "preco", header: "preco", label: "Preço", example: "12,50", hint: "preço em R$ (aceita vírgula)", aliases: ["preço", "valor", "preco (r$)"] },
    { key: "unidade", header: "unidade", label: "Unidade", example: "galão 20L", hint: "unidade de venda (kg, unidade, galão 20L…)", aliases: ["un", "und"] },
    { key: "usa_logistica", header: "usa_logistica", label: "Usa logística", example: "sim", hint: '"sim" se entra no roteiro de entrega', aliases: ["logistica", "logística", "entrega", "usa logistica"] },
    { key: "sku", header: "sku", label: "SKU", example: "AG20", hint: "código interno (opcional)", aliases: ["codigo", "código"] },
    { key: "descricao", header: "descricao", label: "Descrição", example: "Água mineral natural", hint: "descrição (opcional)", aliases: ["descrição", "obs", "observacao"] },
  ],
  normalizeRow: (r) => {
    const name = String(r.nome ?? "").trim();
    if (!name) return null;
    const row: Record<string, unknown> = { name };
    const preco = parsePlanilhaNumero(r.preco);
    if (preco != null) row.price = preco;
    const unidade = String(r.unidade ?? "").trim();
    if (unidade) row.unidade = unidade;
    if (String(r.usa_logistica ?? "").trim()) row.usaLogistica = parsePlanilhaBool(r.usa_logistica);
    const sku = String(r.sku ?? "").trim();
    if (sku) row.sku = sku;
    const desc = String(r.descricao ?? "").trim();
    if (desc) row.description = desc;
    return row;
  },
  previewKeys: [
    { key: "name", label: "Produto" },
    { key: "price", label: "Preço (R$)" },
    { key: "unidade", label: "Unidade" },
  ],
};

type Produto = {
  id: number;
  name: string;
  status: string;
  unidade: string | null;
  price: number | null;
  priceCents: number | null;
  usaLogistica: boolean;
  description: string | null;
  sku: string | null;
};

function fmtPrice(price: number | null, cents: number | null): string {
  const value = typeof cents === "number" ? cents / 100 : typeof price === "number" ? price : null;
  if (value === null) return "—";
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

// ── Modal: novo / editar produto ─────────────────────────────────────────────
function ProdutoModal({
  edit,
  onClose,
  onSaved,
}: {
  edit: Produto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(edit?.name ?? "");
  const [unidade, setUnidade] = useState(edit?.unidade ?? "");
  const [preco, setPreco] = useState(() => {
    const v = typeof edit?.priceCents === "number" ? edit.priceCents / 100 : edit?.price ?? null;
    return typeof v === "number" ? String(v).replace(".", ",") : "";
  });
  const [usaLogistica, setUsaLogistica] = useState(edit?.usaLogistica ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError("Informe o nome do produto.");
      return;
    }
    const precoNum = preco.trim() ? Number(preco.replace(/\./g, "").replace(",", ".")) : 0;
    if (!Number.isFinite(precoNum) || precoNum < 0) {
      setError("Preço inválido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: nomeTrim,
        unidade: unidade.trim() || undefined,
        price: precoNum,
        usaLogistica,
      };
      if (edit) {
        await apiFetch(`/products/${edit.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/products", { method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={onClose}>
      <form className="hbx-modal ctt-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>
          {edit ? "Editar produto" : "Novo produto"}
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>

        <div className="ctt-form__body">
          <div className="f">
            <label htmlFor="prod-nome">Nome *</label>
            <input
              id="prod-nome"
              className="field-dark"
              placeholder="Ex.: Galão de água 20L"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="prod-unidade">Unidade</label>
              <input
                id="prod-unidade"
                className="field-dark"
                placeholder="Ex.: galão 20L, kg, unidade"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
              />
            </div>
            <div className="f">
              <label htmlFor="prod-preco">Preço (R$)</label>
              <input
                id="prod-preco"
                className="field-dark"
                placeholder="0,00"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
              />
            </div>
          </div>

          <label className="prod-toggle">
            <input
              type="checkbox"
              checked={usaLogistica}
              onChange={(e) => setUsaLogistica(e.target.checked)}
            />
            <span>Usa na Logística (entra no roteiro de entrega)</span>
          </label>
          <span className="prod-toggle__note">
            Marque para itens que o cliente recebe fisicamente (ex.: galão de água). Serviços e planos ficam desmarcados.
          </span>

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>

        <div className="ctt-form__foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-teal" disabled={saving}>
            {saving ? "Salvando…" : edit ? "Salvar alterações" : "Salvar produto"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProdutosClient() {
  useCurrentUser();
  const [items, setItems] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; edit: Produto | null }>({ open: false, edit: null });

  const load = useCallback(() => {
    setLoading(true);
    // Sem filtro de status → traz ativos + arquivados; filtramos "arquivados" no
    // cliente pelo toggle (o endpoint aceita ?status= mas queremos o join local).
    return apiFetch<Produto[]>("/products")
      .then((res) => {
        setItems(Array.isArray(res) ? res : []);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar os produtos.");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { load(); }, [load]);

  async function inativar(p: Produto) {
    if (typeof window !== "undefined" && !window.confirm(`Inativar "${p.name}"? Ele sai do catálogo ativo.`)) return;
    try {
      await apiFetch(`/products/${p.id}`, { method: "DELETE" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível inativar o produto.");
    }
  }

  function afterSaved() {
    setModal({ open: false, edit: null });
    load();
  }

  const q = query.trim().toLowerCase();
  const filtered = items.filter((p) => {
    const archived = p.status === "archived";
    if (!showArchived && archived) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.unidade || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    );
  });

  const isEmpty = !loading && !error && filtered.length === 0;

  return (
    <div className="work" style={{ flex: 1 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Produtos</h2>
          <div className="meta">
            <span>{filtered.length} produto(s)</span>
          </div>
        </div>

        <div style={{ padding: "12px 16px 4px" }}>
          <form className="emp-toolbar" onSubmit={(e) => e.preventDefault()}>
            <input
              className="field-dark emp-search"
              placeholder="Buscar por nome, unidade, SKU…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="ctt-toggle ctt-toggle--inline">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              <span>Mostrar inativos</span>
            </label>
            <button type="button" className="btn-teal ctt-new" onClick={() => setModal({ open: true, edit: null })}>
              <I d={ICONS.plus} size={13} /> Novo produto
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowImport(true)}>
              <I d={ICONS.upload} size={13} /> Importar planilha
            </button>
            {loading && <span className="emp-count">carregando…</span>}
          </form>
        </div>

        {error && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Não carregou</strong>
            <span className="emp-empty__text">{error}</span>
            <button className="btn-ghost" onClick={() => load()}>Tentar novamente</button>
          </div>
        )}

        {isEmpty && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Nenhum produto ainda</strong>
            <span className="emp-empty__text">
              Cadastre o que você vende ou entrega (galão 20L, kg, unidade…). Marque &quot;usa na Logística&quot; nos itens que
              o cliente recebe fisicamente — eles entram no roteiro de entrega.
            </span>
            <button className="btn-teal" onClick={() => setModal({ open: true, edit: null })}>
              <I d={ICONS.plus} size={13} /> Novo produto
            </button>
          </div>
        )}

        {!error && filtered.length > 0 && (
          <div className="emp-list">
            {filtered.map((p) => {
              const archived = p.status === "archived";
              return (
                <div className={`emp-row prod-row${archived ? " is-archived" : ""}`} key={p.id}>
                  <span className="emp-row__ico"><I d={ICONS.produtos} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">{p.name}</span>
                    <span className="emp-row__sub">
                      {[p.unidade || "", archived ? "Inativo" : ""].filter(Boolean).join("  ·  ") || "Sem unidade definida"}
                    </span>
                  </span>
                  <span className="emp-row__side">
                    {p.usaLogistica && (
                      <span className="prod-badge-log" title="Entra no módulo Logística">
                        <I d={ICONS.mapin} size={11} /> Logística
                      </span>
                    )}
                    <span className="prod-row__pricecol">
                      <span className="prod-row__price">{fmtPrice(p.price, p.priceCents)}</span>
                    </span>
                    <span className="prod-row__acts">
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        onClick={() => setModal({ open: true, edit: p })}
                      >
                        Editar
                      </button>
                      {!archived && (
                        <button
                          type="button"
                          className="btn-ghost btn-xs"
                          onClick={() => inativar(p)}
                          title="Inativar produto"
                        >
                          <I d={ICONS.trash} size={13} />
                        </button>
                      )}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modal.open && (
        <ProdutoModal edit={modal.edit} onClose={() => setModal({ open: false, edit: null })} onSaved={afterSaved} />
      )}
      {showImport && (
        <ImportPlanilhaModal
          schema={PRODUTOS_IMPORT_SCHEMA}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
    </div>
  );
}

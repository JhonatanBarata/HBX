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

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import {
  HbxContextEmpty,
  HbxContextFact,
  HbxContextFacts,
  HbxContextHeader,
  HbxContextHero,
  HbxContextMetric,
  HbxContextMetrics,
  HbxPanelShell,
} from "@/components/hbx/panel-shell";
import { BlocoEstoque } from "@/components/hbx/bloco-estoque";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import {
  ImportPlanilhaModal,
  parsePlanilhaBool,
  parsePlanilhaNumero,
  type ImportSchema,
} from "@/components/hbx/import-planilha-modal";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

// Importação em massa (planilha): A nome (obrigatório) · B preço · C unidade ·
// D usa_logistica · E sku · F descrição. Só nome é obrigatório. Cada linha roda o
// MESMO caminho do cadastro manual (buildCreateData), inserido em lote (createMany).
const PRODUTOS_IMPORT_SCHEMA: ImportSchema = {
  title: "Importar produtos (planilha)",
  entity: "produto",
  templateName: "modelo-produtos.xlsx",
  endpoint: "/products/import",
  columns: [
    { key: "nome", header: "nome", label: "Nome", required: true, aliases: ["produto"] },
    { key: "preco", header: "preco", label: "Preço", aliases: ["preço", "valor", "preco (r$)"] },
    { key: "unidade", header: "unidade", label: "Unidade", aliases: ["un", "und"] },
    { key: "usa_logistica", header: "usa_logistica", label: "Usa logística", aliases: ["logistica", "logística", "entrega", "usa logistica"] },
    { key: "sku", header: "sku", label: "SKU", aliases: ["codigo", "código"] },
    { key: "descricao", header: "descricao", label: "Descrição", aliases: ["descrição", "obs", "observacao"] },
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
            Marque para itens que o cliente recebe fisicamente. Serviços e planos ficam desmarcados.
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
  const user = useCurrentUser();
  // Estoque fiscal mora AQUI (04/08, dono: "dentro do estoque tem os produtos") —
  // bloco compartilhado, só para admin com o modo HBX Gestão Fiscal ativo.
  const admin = isTenantAdmin(user);
  const [estoqueAtivo, setEstoqueAtivo] = useState(false);
  useEffect(() => {
    if (!admin) return;
    let vivo = true;
    apiFetch<{ estoqueAtivo?: boolean }>("/fiscal/perfil")
      .then((p) => { if (vivo) setEstoqueAtivo(Boolean(p?.estoqueAtivo)); })
      .catch(() => { /* sem perfil fiscal (ou sem acesso) = sem bloco; catálogo segue */ });
    return () => { vivo = false; };
  }, [admin]);
  const [items, setItems] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Produto | null>(null);
  const [modal, setModal] = useState<{ open: boolean; edit: Produto | null }>({ open: false, edit: null });
  const archivePill = useGlassPill<HTMLButtonElement>(showArchived ? "todos" : "ativos");

  const load = useCallback(() => {
    setLoading(true);
    // Sem filtro de status → traz ativos + arquivados; filtramos "arquivados" no
    // cliente pelo toggle (o endpoint aceita ?status= mas queremos o join local).
    return apiFetch<Produto[]>("/products")
      .then((res) => {
        const next = Array.isArray(res) ? res : [];
        setItems(next);
        setSelected((current) => current ? next.find((item) => item.id === current.id) || null : null);
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
      setSelected(null);
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

  const main = (
    <>
    <section className="prod-live">
      <header className="prod-command">
        <div className="prod-command__identity">
          <span className="prod-command__icon"><I d={ICONS.produtos} size={17} /></span>
          <span>
            <strong>Produtos</strong>
            <small>{filtered.length} visíveis</small>
          </span>
        </div>

        <div className="prod-view-switch glass-pill-track" aria-label="Situação do catálogo">
          <GlassPill {...archivePill} />
          <button
            type="button"
            ref={archivePill.itemRef("ativos")}
            className={"glass-pill-item" + (!showArchived ? " is-active" : "")}
            aria-pressed={!showArchived}
            onClick={() => setShowArchived(false)}
          >
            Ativos
          </button>
          <button
            type="button"
            ref={archivePill.itemRef("todos")}
            className={"glass-pill-item" + (showArchived ? " is-active" : "")}
            aria-pressed={showArchived}
            onClick={() => setShowArchived(true)}
          >
            Com inativos
          </button>
        </div>

        <div className="prod-command__search">
          <I d={ICONS.search} size={13} />
          <input
            className="field-dark"
            placeholder="Buscar por nome, unidade, SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <button type="button" className="btn-teal prod-command__new" onClick={() => setModal({ open: true, edit: null })}>
          <I d={ICONS.plus} size={13} /> <span>Novo produto</span>
        </button>
        <button type="button" className="btn-ghost prod-command__import" onClick={() => setShowImport(true)} title="Importar planilha">
          <I d={ICONS.upload} size={13} /> <span>Importar</span>
        </button>
        <span className={"prod-command__status" + (loading ? " is-loading" : "")} title={loading ? "Atualizando catálogo" : "Catálogo atualizado"}>
          <i aria-hidden="true" />
        </span>
      </header>

      <div className="prod-list-head" aria-hidden="true">
        <span>Produto</span>
        <span>Logística</span>
        <span>Preço</span>
      </div>

      <div className="prod-live__body">
        {error && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Não carregou</strong>
            <span className="emp-empty__text">{error}</span>
            <button className="btn-ghost" onClick={() => load()}>Tentar novamente</button>
          </div>
        )}

        {!error && loading && items.length === 0 && (
          <div className="prod-live-skeleton" aria-label="Carregando produtos" role="status">
            {Array.from({ length: 8 }).map((_, index) => (
              <span className="prod-live-skeleton__line" key={index} />
            ))}
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
                <div
                  className={`emp-row prod-row hbx-selectable-row${archived ? " is-archived" : ""}${selected?.id === p.id ? " is-active" : ""}`}
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-selected={selected?.id === p.id}
                  onClick={() => setSelected(p)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(p);
                    }
                  }}
                >
                  <span className="emp-row__ico"><I d={ICONS.produtos} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">{p.name}</span>
                    <span className="emp-row__sub">
                      {[p.unidade || "", archived ? "Inativo" : ""].filter(Boolean).join("  ·  ") || "Sem unidade definida"}
                    </span>
                  </span>
                  <span className="emp-row__side">
                    {p.usaLogistica ? (
                      <span className="prod-badge-log" title="Entra no módulo Logística">
                        <I d={ICONS.mapin} size={11} /> Logística
                      </span>
                    ) : (
                      <span className="prod-badge-off">Fora do roteiro</span>
                    )}
                    <span className="prod-row__pricecol">
                      <span className="prod-row__price">{fmtPrice(p.price, p.priceCents)}</span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
    {admin && estoqueAtivo ? <BlocoEstoque /> : null}
    </>
  );

  const context = selected ? (
    <>
      <HbxContextHeader
        eyebrow="Produto"
        title="Produto"
        subtitle={selected.status === "archived" ? "Fora do catálogo ativo" : "Catálogo ativo"}
        actions={(
          <button type="button" className="icon-ghost" onClick={() => setSelected(null)} aria-label="Fechar">
            <I d={ICONS.x} size={15} />
          </button>
        )}
      />
      <HbxContextHero
        visual={<I d={ICONS.produtos} size={20} />}
        title={selected.name}
        subtitle={selected.unidade || "Sem unidade definida"}
        meta={selected.sku ? `SKU ${selected.sku}` : "Sem SKU"}
      />
      <HbxContextMetrics>
        <HbxContextMetric label="Preço" value={fmtPrice(selected.price, selected.priceCents)} />
        <HbxContextMetric label="Logística" value={selected.usaLogistica ? "Sim" : "Não"} />
      </HbxContextMetrics>
      <HbxContextFacts>
        <HbxContextFact label="Situação" value={selected.status === "archived" ? "Inativo" : "Ativo"} />
        <HbxContextFact label="Unidade" value={selected.unidade || "Não definida"} />
        <HbxContextFact label="SKU" value={selected.sku || "Não informado"} />
        <HbxContextFact label="Descrição" value={selected.description || "Não informada"} />
      </HbxContextFacts>
      <div className="hbx-panel-context__actions prod-context-actions">
        <button type="button" className="btn-teal" onClick={() => setModal({ open: true, edit: selected })}>
          <I d={ICONS.edit} size={13} /> Editar produto
        </button>
        {selected.status !== "archived" && (
          <button type="button" className="btn-ghost prod-context-inactivate" onClick={() => void inativar(selected)}>
            <I d={ICONS.trash} size={13} /> Inativar
          </button>
        )}
      </div>
    </>
  ) : (
    <HbxContextEmpty
      icon={<I d={ICONS.produtos} size={19} />}
      title="Selecione um produto"
    />
  );

  return (
    <>
      <HbxPanelShell
        variant="context"
        className="prod-live-shell"
        ariaLabel="Catálogo de produtos"
        contextLabel="Produto"
        main={main}
        context={context}
      />
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
    </>
  );
}

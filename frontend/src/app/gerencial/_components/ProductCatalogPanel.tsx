"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { HbxEmptyState } from "@/components/ui";

type ProductCatalogPanelProps = {
  surface?: "desktop" | "mobile";
};

type ProductCatalogProduct = {
  id: number;
  kind?: string | null;
  status?: string | null;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  price?: number | string | null;
  priceCents?: number | string | null;
  currency?: string | null;
  billingCycle?: string | null;
  saleMode?: string | null;
  planKey?: string | null;
  externalUrl?: string | null;
  allowDiscount?: boolean | null;
  maxDiscountPercent?: number | string | null;
  minPriceCents?: number | string | null;
  defaultCommissionPercent?: number | string | null;
  sortOrder?: number | string | null;
  stock?: number | string | null;
  metadataJson?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ProductDraft = {
  name: string;
  kind: string;
  status: string;
  sku: string;
  category: string;
  description: string;
  price: string;
  currency: string;
  billingCycle: string;
  saleMode: string;
  planKey: string;
  externalUrl: string;
  allowDiscount: boolean;
  maxDiscountPercent: string;
  minPrice: string;
  defaultCommissionPercent: string;
  stock: string;
  sortOrder: string;
  metadataJson: string;
};

type ProductPayload = Partial<
  Record<
    | "name"
    | "kind"
    | "status"
    | "sku"
    | "category"
    | "description"
    | "currency"
    | "billingCycle"
    | "saleMode"
    | "planKey"
    | "externalUrl"
    | "metadataJson",
    string
  > &
    Record<
      | "priceCents"
      | "maxDiscountPercent"
      | "minPriceCents"
      | "defaultCommissionPercent"
      | "stock"
      | "sortOrder",
      number | null
    > &
    Record<"allowDiscount", boolean>
>;

const KIND_OPTIONS = [
  ["service", "Serviço"],
  ["subscription", "Assinatura"],
  ["addon", "Adicional"],
  ["product", "Produto"],
] as const;

const STATUS_OPTIONS = [
  ["active", "Ativo"],
  ["draft", "Rascunho"],
  ["archived", "Arquivado"],
] as const;

const BILLING_OPTIONS = [
  ["", "Sem ciclo"],
  ["MONTHLY", "Mensal"],
  ["QUARTERLY", "Trimestral"],
  ["YEARLY", "Anual"],
  ["ONE_TIME", "Único"],
] as const;

const SALE_MODE_OPTIONS = [
  ["internal", "Interno"],
  ["external", "Externo"],
  ["assisted", "Assistido"],
] as const;

const EMPTY_DRAFT: ProductDraft = {
  name: "",
  kind: "service",
  status: "active",
  sku: "",
  category: "",
  description: "",
  price: "",
  currency: "BRL",
  billingCycle: "",
  saleMode: "internal",
  planKey: "",
  externalUrl: "",
  allowDiscount: false,
  maxDiscountPercent: "",
  minPrice: "",
  defaultCommissionPercent: "",
  stock: "0",
  sortOrder: "0",
  metadataJson: "",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function productPriceCents(product?: ProductCatalogProduct | null) {
  if (!product) return null;
  const explicitCents = numberValue(product.priceCents);
  if (explicitCents !== null) return Math.round(explicitCents);
  const price = numberValue(product.price);
  return price === null ? null : Math.round(price * 100);
}

function centsToMoneyInput(value: unknown) {
  const cents = numberValue(value);
  if (cents === null) return "";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function optionalNumberInput(value: unknown) {
  const numeric = numberValue(value);
  return numeric === null ? "" : String(numeric).replace(".", ",");
}

function parseDecimalInput(value: string, label: string) {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) throw new Error(`${label} inválido.`);
  return numeric;
}

function parseMoneyToCents(value: string, label: string) {
  const numeric = parseDecimalInput(value, label);
  if (numeric === null) return null;
  if (numeric < 0) throw new Error(`${label} não pode ser negativo.`);
  return Math.round(numeric * 100);
}

function parseOptionalPercent(value: string, label: string) {
  const numeric = parseDecimalInput(value, label);
  if (numeric === null) return null;
  if (numeric < 0 || numeric > 100) throw new Error(`${label} deve ficar entre 0 e 100.`);
  return Math.round(numeric * 100) / 100;
}

function parseIntegerInput(value: string, label: string, fallback: number) {
  const raw = value.trim();
  if (!raw) return fallback;
  const numeric = Number(raw.replace(/[^\d-]/g, ""));
  if (!Number.isFinite(numeric)) throw new Error(`${label} inválido.`);
  return Math.trunc(numeric);
}

function formatCurrencyFromProduct(product: ProductCatalogProduct) {
  const cents = productPriceCents(product);
  if (cents === null) return "Preço restrito";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: product.currency || "BRL",
  }).format(cents / 100);
}

function labelFromOptions(options: readonly (readonly [string, string])[], value?: string | null) {
  const normalized = String(value || "").trim();
  return options.find(([key]) => key === normalized)?.[1] || normalized || "-";
}

function statusBadgeClass(status?: string | null) {
  if (status === "active") return "badge badge-success";
  if (status === "archived") return "badge badge-danger";
  return "badge";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function draftFromProduct(product: ProductCatalogProduct): ProductDraft {
  return {
    name: normalizeText(product.name),
    kind: normalizeText(product.kind) || "service",
    status: normalizeText(product.status) || "active",
    sku: normalizeText(product.sku),
    category: normalizeText(product.category),
    description: normalizeText(product.description),
    price: centsToMoneyInput(productPriceCents(product)),
    currency: normalizeText(product.currency) || "BRL",
    billingCycle: normalizeText(product.billingCycle),
    saleMode: normalizeText(product.saleMode) || "internal",
    planKey: normalizeText(product.planKey),
    externalUrl: normalizeText(product.externalUrl),
    allowDiscount: Boolean(product.allowDiscount),
    maxDiscountPercent: optionalNumberInput(product.maxDiscountPercent),
    minPrice: centsToMoneyInput(product.minPriceCents),
    defaultCommissionPercent: optionalNumberInput(product.defaultCommissionPercent),
    stock: String(numberValue(product.stock) ?? 0),
    sortOrder: String(numberValue(product.sortOrder) ?? 0),
    metadataJson: normalizeText(product.metadataJson),
  };
}

function addTextPayload(
  payload: ProductPayload,
  key: keyof ProductPayload,
  draftValue: string,
  product: ProductCatalogProduct | null,
  required = false,
) {
  const next = draftValue.trim();
  if (!product) {
    if (required || next) payload[key] = next as never;
    return;
  }
  if (next !== normalizeText(product[key as keyof ProductCatalogProduct])) {
    payload[key] = next as never;
  }
}

function addNumberPayload(
  payload: ProductPayload,
  key: keyof ProductPayload,
  next: number | null,
  current: unknown,
  product: ProductCatalogProduct | null,
) {
  if (!product) {
    if (next !== null) payload[key] = next as never;
    return;
  }
  const currentNumber = numberValue(current);
  if (next !== currentNumber) payload[key] = next as never;
}

function buildProductPayload(draft: ProductDraft, product: ProductCatalogProduct | null) {
  if (draft.name.trim().length < 2) throw new Error("Nome do produto é obrigatório.");

  const priceCents = parseMoneyToCents(draft.price, "Preço");
  const minPriceCents = parseMoneyToCents(draft.minPrice, "Preço mínimo");
  const maxDiscountPercent = parseOptionalPercent(draft.maxDiscountPercent, "Desconto máximo");
  const commissionPercent = parseOptionalPercent(draft.defaultCommissionPercent, "Comissão padrão");
  const stock = parseIntegerInput(draft.stock, "Estoque", 0);
  const sortOrder = parseIntegerInput(draft.sortOrder, "Ordem", 0);

  if (stock < 0) throw new Error("Estoque não pode ser negativo.");

  const payload: ProductPayload = {};
  addTextPayload(payload, "name", draft.name, product, true);
  addTextPayload(payload, "kind", draft.kind, product);
  addTextPayload(payload, "status", draft.status, product);
  addTextPayload(payload, "sku", draft.sku, product);
  addTextPayload(payload, "category", draft.category, product);
  addTextPayload(payload, "description", draft.description, product);
  addTextPayload(payload, "currency", draft.currency, product);
  addTextPayload(payload, "billingCycle", draft.billingCycle, product);
  addTextPayload(payload, "saleMode", draft.saleMode, product);
  addTextPayload(payload, "planKey", draft.planKey, product);
  addTextPayload(payload, "externalUrl", draft.externalUrl, product);
  addTextPayload(payload, "metadataJson", draft.metadataJson, product);

  addNumberPayload(payload, "priceCents", priceCents, productPriceCents(product), product);
  addNumberPayload(payload, "maxDiscountPercent", maxDiscountPercent, product?.maxDiscountPercent, product);
  addNumberPayload(payload, "minPriceCents", minPriceCents, product?.minPriceCents, product);
  addNumberPayload(payload, "defaultCommissionPercent", commissionPercent, product?.defaultCommissionPercent, product);
  addNumberPayload(payload, "stock", stock, product?.stock, product);
  addNumberPayload(payload, "sortOrder", sortOrder, product?.sortOrder, product);

  if (!product) {
    if (draft.allowDiscount) payload.allowDiscount = true;
  } else if (draft.allowDiscount !== Boolean(product.allowDiscount)) {
    payload.allowDiscount = draft.allowDiscount;
  }

  return payload;
}

export default function ProductCatalogPanel({ surface = "desktop" }: ProductCatalogPanelProps) {
  const [products, setProducts] = useState<ProductCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [editingProduct, setEditingProduct] = useState<ProductCatalogProduct | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);

  const isMobile = surface === "mobile";

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetch<ProductCatalogProduct[]>("/products", { requireAuth: true });
      setProducts(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const stats = useMemo(() => {
    return products.reduce(
      (acc, product) => {
        if (product.status === "archived") acc.archived += 1;
        else if (product.status === "draft") acc.draft += 1;
        else acc.active += 1;
        if (productPriceCents(product) !== null) acc.withPrice += 1;
        if (product.allowDiscount) acc.withDiscount += 1;
        return acc;
      },
      { active: 0, draft: 0, archived: 0, withPrice: 0, withDiscount: 0 },
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (statusFilter !== "all" && product.status !== statusFilter) return false;
      if (kindFilter !== "all" && product.kind !== kindFilter) return false;
      if (!query) return true;
      const haystack = [
        product.name,
        product.sku,
        product.category,
        product.description,
        product.planKey,
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [kindFilter, products, search, statusFilter]);

  function patchDraft(patch: Partial<ProductDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function startCreate() {
    setEditingProduct(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setNotice(null);
  }

  function startEdit(product: ProductCatalogProduct) {
    setEditingProduct(product);
    setDraft(draftFromProduct(product));
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = buildProductPayload(draft, editingProduct);
      if (editingProduct && Object.keys(payload).length === 0) {
        setNotice("Nenhuma alteração para salvar.");
        return;
      }
      const saved = editingProduct
        ? await apiFetch<ProductCatalogProduct>(`/products/${editingProduct.id}`, {
            method: "PATCH",
            requireAuth: true,
            body: JSON.stringify(payload),
          })
        : await apiFetch<ProductCatalogProduct>("/products", {
            method: "POST",
            requireAuth: true,
            body: JSON.stringify(payload),
          });

      setProducts((current) => {
        if (editingProduct) {
          return current.map((product) => (product.id === saved.id ? saved : product));
        }
        return [...current, saved].sort((first, second) => {
          const firstOrder = numberValue(first.sortOrder) ?? 0;
          const secondOrder = numberValue(second.sortOrder) ?? 0;
          return firstOrder - secondOrder || first.id - second.id;
        });
      });
      setEditingProduct(null);
      setDraft(EMPTY_DRAFT);
      setNotice("Produto salvo.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(product: ProductCatalogProduct) {
    if (!window.confirm(`Arquivar ${product.name || "produto"}?`)) return;
    setArchivingId(product.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<{ success: boolean }>(`/products/${product.id}`, {
        method: "DELETE",
        requireAuth: true,
      });
      setProducts((current) =>
        current.map((row) => (row.id === product.id ? { ...row, status: "archived" } : row)),
      );
      if (editingProduct?.id === product.id) startCreate();
      setNotice("Produto arquivado.");
    } catch (archiveError) {
      setError(getErrorMessage(archiveError));
    } finally {
      setArchivingId(null);
    }
  }

  const shellClass = isMobile ? "grid gap-3" : "panel p-4 md:p-5 rounded-[20px] grid gap-4";
  const cardClass = isMobile
    ? "hbx-mobile-card grid gap-3"
    : "rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4";
  const innerCardClass = isMobile
    ? "rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3"
    : "rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3";
  const primaryButtonClass = isMobile ? "hbx-mobile-primary-button" : "btn btn-primary btn-sm";
  const secondaryButtonClass = isMobile ? "hbx-mobile-secondary-button" : "btn btn-secondary btn-sm";

  return (
    <section className={shellClass} aria-label="Catálogo de produtos">
      <div className={isMobile ? "hbx-mobile-card grid gap-3" : "flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3"}>
        <div className="min-w-0">
          <span className="badge badge-brand">Produtos</span>
          <h2 className="mt-2 text-lg font-semibold">Catálogo de produtos</h2>
          <p className="mt-1 text-sm text-muted">
            Produtos, preços, descontos e comissão padrão usados no fluxo comercial.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={startCreate} className={primaryButtonClass}>
            Novo produto
          </button>
          <button type="button" onClick={() => void loadProducts()} disabled={loading} className={secondaryButtonClass}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <article className={innerCardClass}>
          <p className="text-xs text-muted">Ativos</p>
          <strong className="block text-xl">{stats.active}</strong>
        </article>
        <article className={innerCardClass}>
          <p className="text-xs text-muted">Rascunhos</p>
          <strong className="block text-xl">{stats.draft}</strong>
        </article>
        <article className={innerCardClass}>
          <p className="text-xs text-muted">Arquivados</p>
          <strong className="block text-xl">{stats.archived}</strong>
        </article>
        <article className={innerCardClass}>
          <p className="text-xs text-muted">Com preço</p>
          <strong className="block text-xl">{stats.withPrice}</strong>
        </article>
        <article className={innerCardClass}>
          <p className="text-xs text-muted">Com desconto</p>
          <strong className="block text-xl">{stats.withDiscount}</strong>
        </article>
      </div>

      {error ? (
        <div className="rounded-[14px] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-[14px] border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700" role="status">
          {notice}
        </div>
      ) : null}

      <div className={isMobile ? "grid gap-3" : "grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4"}>
        <div className={cardClass}>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <input
              className="field min-w-0 flex-1"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto, SKU ou plano"
            />
            <select
              className="field md:w-44"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtrar por status"
            >
              <option value="all">Todos os status</option>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="field md:w-44"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
              aria-label="Filtrar por tipo"
            >
              <option value="all">Todos os tipos</option>
              {KIND_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            {loading ? (
              <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-muted">
                Carregando produtos...
              </div>
            ) : filteredProducts.length === 0 ? (
              <HbxEmptyState
                title="Nenhum produto encontrado."
                description="Cadastre produtos para liberar seleção e preço no fluxo comercial."
                actions={
                  <button type="button" onClick={startCreate} className={primaryButtonClass}>
                    Novo produto
                  </button>
                }
              />
            ) : (
              filteredProducts.map((product) => (
                <article
                  key={product.id}
                  className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold truncate">{product.name || "Produto sem nome"}</h3>
                        <span className={statusBadgeClass(product.status)}>
                          {labelFromOptions(STATUS_OPTIONS, product.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted truncate">
                        {labelFromOptions(KIND_OPTIONS, product.kind)} · {product.category || "sem categoria"} · SKU {product.sku || "-"}
                      </p>
                      {product.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-muted">{product.description}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className="badge badge-brand">{formatCurrencyFromProduct(product)}</span>
                      {product.allowDiscount ? <span className="badge">Desconto</span> : null}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                      <p className="text-xs text-muted">Ciclo</p>
                      <strong className="block truncate">{labelFromOptions(BILLING_OPTIONS, product.billingCycle)}</strong>
                    </div>
                    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                      <p className="text-xs text-muted">Venda</p>
                      <strong className="block truncate">{labelFromOptions(SALE_MODE_OPTIONS, product.saleMode)}</strong>
                    </div>
                    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                      <p className="text-xs text-muted">Comissão</p>
                      <strong className="block truncate">
                        {numberValue(product.defaultCommissionPercent) === null
                          ? "-"
                          : `${numberValue(product.defaultCommissionPercent)}%`}
                      </strong>
                    </div>
                    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                      <p className="text-xs text-muted">Estoque</p>
                      <strong className="block truncate">{numberValue(product.stock) ?? 0}</strong>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(product)} className={secondaryButtonClass}>
                      Editar
                    </button>
                    {product.status !== "archived" ? (
                      <button
                        type="button"
                        disabled={archivingId === product.id}
                        onClick={() => void archiveProduct(product)}
                        className={secondaryButtonClass}
                      >
                        {archivingId === product.id ? "Arquivando..." : "Arquivar"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className={cardClass}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <span className="badge">{editingProduct ? `#${editingProduct.id}` : "Novo"}</span>
              <h3 className="mt-2 font-semibold">{editingProduct ? "Editar produto" : "Cadastrar produto"}</h3>
            </div>
            {editingProduct ? (
              <button type="button" onClick={startCreate} className={secondaryButtonClass}>
                Cancelar
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Nome</span>
              <input
                className="field"
                value={draft.name}
                onChange={(event) => patchDraft({ name: event.target.value })}
                minLength={2}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">SKU</span>
              <input className="field" value={draft.sku} onChange={(event) => patchDraft({ sku: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Tipo</span>
              <select className="field" value={draft.kind} onChange={(event) => patchDraft({ kind: event.target.value })}>
                {KIND_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Status</span>
              <select className="field" value={draft.status} onChange={(event) => patchDraft({ status: event.target.value })}>
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Categoria</span>
              <input className="field" value={draft.category} onChange={(event) => patchDraft({ category: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Plano</span>
              <input className="field" value={draft.planKey} onChange={(event) => patchDraft({ planKey: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Preço</span>
              <input
                className="field"
                inputMode="decimal"
                value={draft.price}
                onChange={(event) => patchDraft({ price: event.target.value })}
                placeholder="0,00"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Moeda</span>
              <input className="field uppercase" value={draft.currency} onChange={(event) => patchDraft({ currency: event.target.value.toUpperCase() })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Ciclo</span>
              <select className="field" value={draft.billingCycle} onChange={(event) => patchDraft({ billingCycle: event.target.value })}>
                {BILLING_OPTIONS.map(([value, label]) => (
                  <option key={value || "none"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Modo de venda</span>
              <select className="field" value={draft.saleMode} onChange={(event) => patchDraft({ saleMode: event.target.value })}>
                {SALE_MODE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Preço mínimo</span>
              <input
                className="field"
                inputMode="decimal"
                value={draft.minPrice}
                onChange={(event) => patchDraft({ minPrice: event.target.value })}
                placeholder="0,00"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Desconto máximo (%)</span>
              <input
                className="field"
                inputMode="decimal"
                value={draft.maxDiscountPercent}
                onChange={(event) => patchDraft({ maxDiscountPercent: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Comissão padrão (%)</span>
              <input
                className="field"
                inputMode="decimal"
                value={draft.defaultCommissionPercent}
                onChange={(event) => patchDraft({ defaultCommissionPercent: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Estoque</span>
              <input className="field" inputMode="numeric" value={draft.stock} onChange={(event) => patchDraft({ stock: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">Ordem</span>
              <input className="field" inputMode="numeric" value={draft.sortOrder} onChange={(event) => patchDraft({ sortOrder: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">URL externa</span>
              <input className="field" value={draft.externalUrl} onChange={(event) => patchDraft({ externalUrl: event.target.value })} />
            </label>
          </div>

          <label className="flex items-center gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
            <input
              type="checkbox"
              checked={draft.allowDiscount}
              onChange={(event) => patchDraft({ allowDiscount: event.target.checked })}
            />
            <span className="font-semibold">Permitir desconto</span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted">Descrição</span>
            <textarea
              className="field min-h-24 resize-y"
              value={draft.description}
              onChange={(event) => patchDraft({ description: event.target.value })}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted">Metadados JSON</span>
            <textarea
              className="field min-h-20 resize-y font-mono text-xs"
              value={draft.metadataJson}
              onChange={(event) => patchDraft({ metadataJson: event.target.value })}
            />
          </label>

          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? "Salvando..." : editingProduct ? "Salvar produto" : "Cadastrar produto"}
          </button>
        </form>
      </div>
    </section>
  );
}

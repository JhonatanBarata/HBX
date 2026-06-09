import { COMMERCIAL_PLAN_KEYS, COMMERCIAL_PRICING } from '../commercial-plans/commercial-plan-catalog';
import { COMPANY_KIND_TENANT } from '../common/company-kind';

export type TenantProductSeedInput = {
  key?: string | null;
  name?: string | null;
  description?: string | null;
  kind?: string | null;
  status?: string | null;
  sku?: string | null;
  category?: string | null;
  price?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  billingCycle?: string | null;
  saleMode?: string | null;
  planKey?: string | null;
  externalUrl?: string | null;
  allowDiscount?: boolean | null;
  maxDiscountPercent?: number | null;
  minPriceCents?: number | null;
  defaultCommissionPercent?: number | null;
  sortOrder?: number | null;
  stock?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type TenantProductSeed = {
  key: string;
  kind: string;
  status: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  priceCents: number;
  currency: string;
  billingCycle: string | null;
  saleMode: string;
  planKey: string | null;
  externalUrl: string | null;
  allowDiscount: boolean;
  maxDiscountPercent: number | null;
  minPriceCents: number | null;
  defaultCommissionPercent: number | null;
  sortOrder: number;
  stock: number;
  metadataJson: string;
};

export type EnsureTenantProductResult = {
  key: string;
  name: string;
  productId: number | null;
  created: boolean;
  wouldCreate: boolean;
};

export type EnsureHbxTenantProductsResult = {
  ok: true;
  dryRun: boolean;
  foundTenant: boolean;
  companyId: number | null;
  companySlug: string | null;
  products: EnsureTenantProductResult[];
};

const DEFAULT_TENANT_PRODUCT_INPUTS: TenantProductSeedInput[] = [
  {
    key: 'oferta-principal',
    name: 'Oferta principal',
    description: 'Produto ou servico principal da empresa.',
    kind: 'service',
    status: 'draft',
    category: 'Comercial',
    priceCents: 0,
    currency: 'BRL',
    saleMode: 'internal',
    allowDiscount: false,
    sortOrder: 10,
  },
];

const HBX_TENANT_PRODUCT_INPUTS: TenantProductSeedInput[] = [
  {
    key: 'hbx-list',
    sku: 'hbx-list',
    name: 'HBX List',
    description: 'Plano HBX List cadastrado como produto comum do tenant HBX.',
    kind: 'platform_plan',
    status: 'active',
    category: 'HBX',
    priceCents: Math.round(COMMERCIAL_PRICING.liteMonthly * 100),
    currency: 'BRL',
    billingCycle: 'MONTHLY',
    saleMode: 'checkout',
    planKey: COMMERCIAL_PLAN_KEYS.LITE,
    allowDiscount: false,
    sortOrder: 10,
    metadata: {
      catalog: 'hbx_tenant_products',
      productTier: 'list',
    },
  },
  {
    key: 'hbx-lead',
    sku: 'hbx-lead',
    name: 'HBX Lead',
    description: 'Plano HBX Lead cadastrado como produto comum do tenant HBX.',
    kind: 'platform_plan',
    status: 'active',
    category: 'HBX',
    priceCents: Math.round(COMMERCIAL_PRICING.padraoMonthly * 100),
    currency: 'BRL',
    billingCycle: 'MONTHLY',
    saleMode: 'checkout',
    planKey: COMMERCIAL_PLAN_KEYS.PADRAO,
    allowDiscount: false,
    sortOrder: 20,
    metadata: {
      catalog: 'hbx_tenant_products',
      productTier: 'lead',
    },
  },
  {
    key: 'hbx-company',
    sku: 'hbx-company',
    name: 'HBX Company',
    description: 'Plano HBX Company cadastrado como produto comum do tenant HBX.',
    kind: 'platform_plan',
    status: 'active',
    category: 'HBX',
    priceCents: Math.round(COMMERCIAL_PRICING.melhorMonthly * 100),
    currency: 'BRL',
    billingCycle: 'MONTHLY',
    saleMode: 'assisted',
    planKey: COMMERCIAL_PLAN_KEYS.MELHOR,
    allowDiscount: false,
    sortOrder: 30,
    metadata: {
      catalog: 'hbx_tenant_products',
      productTier: 'company',
      legacyAlias: 'hbx_company',
    },
  },
];

function normalizeText(value: unknown, max = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeKey(value: unknown, fallback: string, max = 80) {
  const text = normalizeText(value, max);
  return text
    ? text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max) || fallback
    : fallback;
}

function normalizeUpperKey(value: unknown, fallback: string | null, max = 30) {
  const text = normalizeText(value, max);
  return text ? text.toUpperCase() : fallback;
}

function normalizeInteger(value: unknown, fallback: number, min?: number, max?: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max ?? numeric, Math.max(min ?? numeric, numeric));
}

function normalizeNumber(value: unknown, fallback: number | null, min?: number, max?: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max ?? numeric, Math.max(min ?? numeric, numeric));
}

function normalizePriceCents(input: TenantProductSeedInput) {
  const explicit = normalizeInteger(input.priceCents, -1, 0);
  if (explicit >= 0) return explicit;
  const price = normalizeNumber(input.price, null, 0);
  return price === null ? 0 : Math.round(price * 100);
}

function buildMetadata(source: string, seed: TenantProductSeedInput, key: string) {
  return JSON.stringify({
    source,
    seedKey: key,
    ...(seed.metadata || {}),
  });
}

export function buildTenantProductSeeds(
  products?: TenantProductSeedInput[] | null,
  options: { source?: string; defaultStatus?: string } = {},
): TenantProductSeed[] {
  const source = normalizeKey(options.source, 'tenant_product_seed', 80);
  const explicitProducts = Array.isArray(products) && products.length > 0;
  const statusFallback = normalizeKey(options.defaultStatus, explicitProducts ? 'active' : 'draft', 40);
  const seen = new Set<string>();

  return (explicitProducts ? products || [] : DEFAULT_TENANT_PRODUCT_INPUTS)
    .map((product, index) => {
      const name = normalizeText(product?.name, 140);
      if (!name) return null;
      const key = normalizeKey(product.key || product.sku || name, `produto-${index + 1}`, 80);
      if (seen.has(key)) return null;
      seen.add(key);
      const priceCents = normalizePriceCents(product);
      const minPriceCents = normalizeInteger(product.minPriceCents, -1, 0);
      return {
        key,
        kind: normalizeKey(product.kind, 'service', 40),
        status: normalizeKey(product.status, statusFallback, 40),
        sku: normalizeText(product.sku || product.key || key, 80),
        name,
        description: normalizeText(product.description, 1000),
        category: normalizeText(product.category || 'Comercial', 120),
        priceCents,
        currency: normalizeUpperKey(product.currency, 'BRL', 12) || 'BRL',
        billingCycle: normalizeUpperKey(product.billingCycle, null, 30),
        saleMode: normalizeKey(product.saleMode, 'internal', 40),
        planKey: normalizeText(product.planKey, 80),
        externalUrl: normalizeText(product.externalUrl, 500),
        allowDiscount: Boolean(product.allowDiscount),
        maxDiscountPercent: normalizeNumber(product.maxDiscountPercent, null, 0, 100),
        minPriceCents: minPriceCents >= 0 ? minPriceCents : null,
        defaultCommissionPercent: normalizeNumber(product.defaultCommissionPercent, null, 0, 100),
        sortOrder: normalizeInteger(product.sortOrder, index * 10 + 10),
        stock: normalizeInteger(product.stock, 0, 0),
        metadataJson: buildMetadata(source, product, key),
      };
    })
    .filter((item): item is TenantProductSeed => Boolean(item));
}

export function buildHbxTenantProductSeeds(): TenantProductSeed[] {
  return buildTenantProductSeeds(HBX_TENANT_PRODUCT_INPUTS, {
    source: 'hbx_tenant_product_backfill',
    defaultStatus: 'active',
  });
}

function buildExistingProductWhere(companyId: number, seed: TenantProductSeed) {
  const or: Array<Record<string, unknown>> = [{ name: seed.name }];
  if (seed.sku) or.unshift({ sku: seed.sku });
  if (seed.planKey) or.unshift({ planKey: seed.planKey });
  return { companyId, OR: or };
}

export async function ensureTenantProductsTx(
  tx: any,
  companyId: number,
  seeds: TenantProductSeed[],
  options: { authorId?: number | null; dryRun?: boolean } = {},
): Promise<EnsureTenantProductResult[]> {
  const results: EnsureTenantProductResult[] = [];

  for (const seed of seeds) {
    const existing = await tx.product.findFirst({
      where: buildExistingProductWhere(companyId, seed),
      select: { id: true },
    });

    if (existing?.id) {
      results.push({
        key: seed.key,
        name: seed.name,
        productId: Number(existing.id),
        created: false,
        wouldCreate: false,
      });
      continue;
    }

    if (options.dryRun) {
      results.push({
        key: seed.key,
        name: seed.name,
        productId: null,
        created: false,
        wouldCreate: true,
      });
      continue;
    }

    const created = await tx.product.create({
      data: {
        kind: seed.kind,
        status: seed.status,
        sku: seed.sku,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        price: seed.priceCents / 100,
        priceCents: seed.priceCents,
        currency: seed.currency,
        billingCycle: seed.billingCycle,
        saleMode: seed.saleMode,
        planKey: seed.planKey,
        externalUrl: seed.externalUrl,
        allowDiscount: seed.allowDiscount,
        maxDiscountPercent: seed.maxDiscountPercent,
        minPriceCents: seed.minPriceCents,
        defaultCommissionPercent: seed.defaultCommissionPercent,
        sortOrder: seed.sortOrder,
        stock: seed.stock,
        companyId,
        metadataJson: seed.metadataJson,
        createdByUserId: options.authorId || null,
        updatedByUserId: options.authorId || null,
      },
      select: { id: true },
    });

    results.push({
      key: seed.key,
      name: seed.name,
      productId: Number(created.id),
      created: true,
      wouldCreate: false,
    });
  }

  return results;
}

export async function ensureHbxTenantProductsTx(
  tx: any,
  options: { authorId?: number | null; dryRun?: boolean } = {},
): Promise<EnsureHbxTenantProductsResult> {
  // SEED_ONLY: slug hbx is used only to locate the HBX tenant for idempotent product data backfill.
  const company = await tx.company.findFirst({
    where: {
      slug: 'hbx',
      companyKind: COMPANY_KIND_TENANT,
    },
    select: { id: true, slug: true },
  });

  if (!company?.id) {
    return {
      ok: true,
      dryRun: Boolean(options.dryRun),
      foundTenant: false,
      companyId: null,
      companySlug: null,
      products: [],
    };
  }

  const products = await ensureTenantProductsTx(
    tx,
    Number(company.id),
    buildHbxTenantProductSeeds(),
    options,
  );

  return {
    ok: true,
    dryRun: Boolean(options.dryRun),
    foundTenant: true,
    companyId: Number(company.id),
    companySlug: String(company.slug || 'hbx'),
    products,
  };
}

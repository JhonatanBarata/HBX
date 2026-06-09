export class Product {
  id: number;
  kind?: string;
  status?: string;
  sku?: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  priceCents?: number;
  currency?: string;
  billingCycle?: string;
  saleMode?: string;
  planKey?: string;
  externalUrl?: string;
  allowDiscount?: boolean;
  maxDiscountPercent?: number;
  minPriceCents?: number;
  defaultCommissionPercent?: number;
  sortOrder?: number;
  stock?: number;
  companyId?: number;
  categoryId?: number;
  metadataJson?: string;
}

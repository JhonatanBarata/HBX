import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  billingCycle?: string;

  @IsOptional()
  @IsString()
  saleMode?: string;

  @IsOptional()
  @IsString()
  planKey?: string;

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @IsBoolean()
  allowDiscount?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultCommissionPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  // NÚCLEO-CRM N5 — unidade de venda ("galão 20L", "kg", "unidade").
  @IsOptional()
  @IsString()
  unidade?: string;

  // NÚCLEO-CRM N5 — item entra no módulo Logística (roteiro de entrega).
  @IsOptional()
  @IsBoolean()
  usaLogistica?: boolean;

  // VASILHAME (17/08) — produto que empresta casco (garrafão, botijão, engradado).
  @IsOptional()
  @IsBoolean()
  possuiVasilhame?: boolean;

  // Valor de UM casco, em centavos. Obrigatório quando possuiVasilhame = true.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vasilhamePrecoCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  categoryId?: number;

  @IsOptional()
  @IsString()
  metadataJson?: string;
}

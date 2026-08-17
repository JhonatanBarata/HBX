import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

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

  @Type(() => Number)
  @IsOptional()
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

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  minPriceCents?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultCommissionPercent?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @Type(() => Number)
  @IsOptional()
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
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  vasilhamePrecoCents?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  categoryId?: number;

  @IsOptional()
  @IsString()
  metadataJson?: string;
}

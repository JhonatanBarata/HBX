import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * IMPORTAÇÃO EM MASSA de produtos (planilha). Uma linha = um produto, criado pelo
 * MESMO caminho do cadastro manual (buildCreateData). A planilha vem parseada do
 * navegador (preço já convertido para número, "usa logística" já convertido para
 * boolean); o backend só valida e roda em lote (createMany).
 *
 * Validação LENIENTE: campos opcionais aqui — linha sem `name` é PULADA no serviço
 * (não derruba a batelada). companyId sai do JWT, nunca do body.
 */
export class ImportProductRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  name?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unidade?: string;

  @IsOptional()
  @IsBoolean()
  usaLogistica?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class ImportProductsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportProductRowDto)
  rows!: ImportProductRowDto[];
}

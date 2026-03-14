import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const IMPORTACAO_STATUS = [
  'EM_CADASTRO',
  'EM_PRODUCAO',
  'EM_TRANSITO',
  'ATRACADO',
  'FINALIZADO',
  'CANCELADO',
] as const;

export const IMPORTACAO_ACOES = [
  'CRIAR_IMPORTACAO',
  'EDITAR_IMPORTACAO',
  'FINALIZAR_IMPORTACAO',
  'REABRIR_IMPORTACAO',
  'CRIAR_ALERTA',
  'VER_HISTORICO_FINANCEIRO',
] as const;

export class CreateImportacaoDto {
  @IsString()
  @MinLength(1)
  numeroPedido!: string;

  @IsOptional()
  @IsString()
  fornecedorId?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsString()
  portoOrigem?: string;

  @IsOptional()
  @IsString()
  portoDestino?: string;

  @IsOptional()
  @IsString()
  dataEmbarque?: string;

  @IsOptional()
  @IsString()
  dataAtracacao?: string;

  @IsOptional()
  valorUsd?: number | string;

  @IsOptional()
  valorDolar?: number | string;

  @IsOptional()
  pesoKg?: number | string;

  @IsOptional()
  @IsIn(IMPORTACAO_STATUS as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  incoterm?: string;

  @IsOptional()
  @IsString()
  prepaid?: string;

  @IsOptional()
  @IsString()
  transporteTipo?: string;

  @IsOptional()
  @IsString()
  taxasMeta?: string;
}

export class UpdateImportacaoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  numeroPedido?: string;

  @IsOptional()
  @IsString()
  fornecedorId?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsString()
  portoOrigem?: string;

  @IsOptional()
  @IsString()
  portoDestino?: string;

  @IsOptional()
  @IsString()
  dataEmbarque?: string;

  @IsOptional()
  @IsString()
  dataAtracacao?: string;

  @IsOptional()
  valorUsd?: number | string;

  @IsOptional()
  valorDolar?: number | string;

  @IsOptional()
  pesoKg?: number | string;

  @IsOptional()
  @IsIn(IMPORTACAO_STATUS as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  incoterm?: string;

  @IsOptional()
  @IsString()
  prepaid?: string;

  @IsOptional()
  @IsString()
  transporteTipo?: string;

  @IsOptional()
  @IsString()
  taxasMeta?: string;
}

export class HistoricoQueryDto {
  @IsOptional()
  @IsString()
  de?: string;

  @IsOptional()
  @IsString()
  ate?: string;

  @IsOptional()
  @IsString()
  fornecedor?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  porto?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  dolarMin?: string;

  @IsOptional()
  @IsString()
  dolarMax?: string;
}

export class CreateAlertaImportacaoDto {
  @IsInt()
  @Min(0)
  @Max(365)
  diasAntes!: number;

  @IsBoolean()
  enviarEmail!: boolean;

  @IsBoolean()
  enviarWhatsapp!: boolean;

  @IsOptional()
  @IsArray()
  listaEmails?: string[];

  @IsOptional()
  @IsArray()
  listaWhatsapp?: string[];
}

export class PermissionEntryDto {
  @IsString()
  @IsIn(IMPORTACAO_ACOES as unknown as string[])
  acao!: string;

  @IsBoolean()
  allowed!: boolean;
}

export class UpdatePermissaoRoleDto {
  @IsString()
  @IsIn(['ADMIN', 'GERENTE', 'USUARIO'])
  role!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  permissoes!: PermissionEntryDto[];
}

export class FollowupGlobalQueryDto extends HistoricoQueryDto {}

export class GraficoQueryDto {
  @IsOptional()
  @IsString()
  de?: string;

  @IsOptional()
  @IsString()
  ate?: string;
}

export class ReabrirImportacaoDto {
  @IsOptional()
  @IsIn(['EM_CADASTRO', 'EM_PRODUCAO', 'EM_TRANSITO', 'ATRACADO'])
  statusDestino?: string;
}

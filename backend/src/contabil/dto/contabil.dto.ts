import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

// PATCH /master/contabil/perfil — SEM campos *Encrypted (segredo entra só S6/S7 via UI dedicada).
export class UpdateFiscalProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  razaoSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  dataAbertura?: string; // ISO date

  @IsOptional()
  @IsString()
  @MaxLength(20)
  regime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  anexoBase?: string; // "III" | "V"

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnaePrincipal?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  aliquotaIssMunicipal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  prolaboreAlvoPct?: number;
}

// POST /master/contabil/mes/:competencia/ajuste — correção manual COM motivo obrigatório.
export class AjusteManualDto {
  @IsInt()
  ajusteManualCents!: number; // pode ser negativo (correção p/ baixo)

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  motivo!: string;
}

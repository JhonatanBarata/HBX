import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateFornecedorDto {
  @IsString()
  @MinLength(1)
  nome!: string;

  @IsOptional()
  @IsInt()
  paisId?: number;

  @IsOptional()
  @IsInt()
  portoOrigemId?: number;

  @IsOptional()
  @IsInt()
  portoDestinoId?: number;
}

export class CreatePaisDto {
  @IsString()
  @MinLength(1)
  nome!: string;
}

export class CreatePortoDto {
  @IsString()
  @MinLength(1)
  nome!: string;

  @IsOptional()
  @IsInt()
  paisId?: number;
}

export class UpsertTransitTimeDto {
  @IsInt()
  portoOrigemId!: number;

  @IsInt()
  portoDestinoId!: number;

  @IsInt()
  @Min(1)
  @Max(365)
  dias!: number;
}

export class CreateCadastroClienteDto {
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCadastroClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registrationStatus?: string;
}

export class CreateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalCustomerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceConnectionId?: string;
}

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalCustomerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceConnectionId?: string;
}

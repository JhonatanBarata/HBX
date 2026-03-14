import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

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

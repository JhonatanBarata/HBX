import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateFeatureDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateFeatureDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

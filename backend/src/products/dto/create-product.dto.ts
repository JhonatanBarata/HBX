import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsInt, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}

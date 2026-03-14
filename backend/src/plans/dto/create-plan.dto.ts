import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

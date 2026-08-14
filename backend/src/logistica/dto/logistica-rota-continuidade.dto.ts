import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RotaContinuidadeRefDto {
  @IsString()
  @MaxLength(180)
  ref!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOwnerId?: number;
}

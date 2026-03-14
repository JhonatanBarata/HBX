import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateWebsiteProjectDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsString()
  templateKey!: string;

  @IsOptional()
  @IsString()
  firebaseProjectId?: string;

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListMetaTemplatesQueryDto {
  @IsOptional()
  @IsString()
  refresh?: string;
}

export class SetMetaTemplateActivationDto {
  @IsString()
  @MaxLength(512)
  name!: string;

  @IsString()
  @MaxLength(32)
  language!: string;

  @Type(() => Boolean)
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  headerMediaUrl?: string;

}

export class CreateMetaTemplateDto {
  @IsString()
  @MaxLength(512)
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(['UTILITY', 'MARKETING', 'AUTHENTICATION'])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @IsString()
  bodyText!: string;

  @IsOptional()
  @IsString()
  footerText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  buttons?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activateInHbx?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'])
  headerFormat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  headerHandle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  headerMediaUrl?: string;

  @IsOptional()
  @IsObject()
  variableExamples?: Record<string, string>;
}

export class DeleteMetaTemplateDto {
  @IsString()
  @MaxLength(512)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;
}

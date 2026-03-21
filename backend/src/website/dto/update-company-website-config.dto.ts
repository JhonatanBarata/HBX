import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyWebsiteConfigDto {
  @IsOptional()
  @IsBoolean()
  websiteEnabled?: boolean;

  @IsOptional()
  @IsString()
  websitePublicUrl?: string;

  @IsOptional()
  @IsString()
  websiteAdminUrl?: string;

  @IsOptional()
  @IsString()
  websiteProjectId?: string;

  @IsOptional()
  @IsBoolean()
  websiteAdminEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['public', 'admin'])
  websiteLaunchMode?: 'public' | 'admin';
}
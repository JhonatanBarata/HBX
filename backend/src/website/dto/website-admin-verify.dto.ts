import { IsNotEmpty, IsString } from 'class-validator';

export class WebsiteAdminVerifyDto {
  @IsString()
  @IsNotEmpty()
  sessionToken!: string;
}
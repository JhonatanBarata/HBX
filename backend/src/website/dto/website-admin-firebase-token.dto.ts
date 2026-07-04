import { IsNotEmpty, IsString } from 'class-validator';

export class WebsiteAdminFirebaseTokenDto {
  @IsString()
  @IsNotEmpty()
  sessionToken!: string;
}

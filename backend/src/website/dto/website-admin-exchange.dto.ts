import { IsNotEmpty, IsString } from 'class-validator';

export class WebsiteAdminExchangeDto {
  @IsString()
  @IsNotEmpty()
  entryToken!: string;
}
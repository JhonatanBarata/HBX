import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export const MOBILE_ACCESS_PROFILES = ['ADMIN', 'STANDARD'] as const;
export type MobileAccessProfile = (typeof MOBILE_ACCESS_PROFILES)[number];

export class CreateMobilePairingCodeDto {
  // Ausente preserva os clientes/webs já integrados; a tela atual sempre envia a escolha.
  @IsOptional()
  @IsString()
  @IsIn([...MOBILE_ACCESS_PROFILES], { message: 'O perfil de acesso deve ser ADMIN ou STANDARD.' })
  accessProfile?: MobileAccessProfile;
}

export class PairMobileDeviceDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'O código deve ter 6 números.' })
  code!: string;

  @IsString()
  @Length(16, 120)
  installationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string;
}

export class OpenMobileDeviceSessionDto {
  @IsString()
  @Length(32, 512)
  deviceToken!: string;

  @IsString()
  @Length(16, 120)
  installationId!: string;
}

export class ConsumeMobileWebTicketDto {
  @IsString()
  @Length(32, 512)
  ticket!: string;
}

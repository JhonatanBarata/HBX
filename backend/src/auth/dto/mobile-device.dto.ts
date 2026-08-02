import { IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';

// Gerar o código PARA outra pessoa da equipe (decisão do dono 02/08). O NÍVEL
// (admin/gerente/vendedor) NÃO se escolhe aqui: ele vem do cadastro da pessoa
// em Gerencial → Equipe. Esta tela só escolhe DE QUEM é o código — "mostra num
// lugar, edita num lugar". Sem targetUserId = o próprio usuário (comportamento
// de sempre).
export class CreateMobilePairingCodeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  targetUserId?: number;
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

  // FIX 18/07 — ANDROID_ID: sobrevive a desinstalar/reinstalar o app (ao
  // contrário do installationId). Permite reconectar o MESMO celular em vez
  // de abrir um cadastro de aparelho novo a cada reinstalação.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  hardwareId?: string;
}

export class GooglePairMobileDeviceDto {
  @IsString()
  @Length(32, 8192)
  idToken!: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(128)
  hardwareId?: string;
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

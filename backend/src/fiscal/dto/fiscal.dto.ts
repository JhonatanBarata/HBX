import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// DTOs do módulo fiscal do tenant (F1a). Validação de FORMA aqui; regra de
// negócio (gates, allowlist, disjuntor) mora nos services.

export class UpdatePerfilFiscalDto {
  @IsOptional() @IsString() @MaxLength(20)
  cnpj?: string;

  @IsOptional() @IsString() @MaxLength(200)
  razaoSocial?: string;

  @IsOptional() @IsString() @MaxLength(40)
  inscricaoMunicipal?: string;

  @IsOptional() @IsInt() @Min(1) @Max(4)
  regimeCrt?: number;

  @IsOptional() @IsString() @MaxLength(10)
  municipioIbge?: string;

  @IsOptional() @IsBoolean()
  escopoServico?: boolean;

  @IsOptional() @IsBoolean()
  escopoProduto?: boolean;

  @IsOptional() @IsBoolean()
  emailAutoEnvio?: boolean;

  @IsOptional() @IsBoolean()
  whatsAutoEnvio?: boolean;

  @IsOptional() @IsBoolean()
  estoqueAtivo?: boolean;

  @IsOptional() @IsIn(['avisar', 'travar'])
  estoqueNegativo?: string;

  @IsOptional() @IsIn(['fechamento', 'entrega'])
  modoEmissaoProduto?: string; // F2a — quando a NF-e de produto é emitida

  @IsOptional() @IsBoolean()
  comprovanteEntrega?: boolean; // F2a — PDF sem valor fiscal no aviso de entrega
}

export class UploadCertificadoFiscalDto {
  @IsString() @IsNotEmpty()
  senha!: string;
}

export class CriarServicoFiscalDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  descricao!: string;

  @IsString() @IsNotEmpty() @MaxLength(6)
  codigoTributacaoNacional!: string;

  @IsString() @IsNotEmpty() @MaxLength(10)
  cnae!: string;

  @IsOptional() @IsNumber() @Min(0) @Max(0.15)
  aliquotaIss?: number | null;

  @IsOptional() @IsBoolean()
  issRetido?: boolean;
}

export class AtualizarServicoFiscalDto {
  @IsOptional() @IsString() @MaxLength(300)
  descricao?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(0.15)
  aliquotaIss?: number | null;

  @IsOptional() @IsBoolean()
  issRetido?: boolean;

  @IsOptional() @IsBoolean()
  ativo?: boolean;
}

export class EmitirNfseAvulsaDto {
  @IsString() @IsNotEmpty() @MaxLength(20)
  tomadorDoc!: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  tomadorNome!: string;

  @IsOptional() @IsString() @MaxLength(200)
  tomadorEmail?: string;

  @IsOptional() @IsString() @MaxLength(20)
  tomadorFone?: string; // WhatsApp do tomador (F1b) — DDD + número

  @IsString() @IsNotEmpty()
  servicoId!: string;

  @IsInt() @Min(1) @Max(2_000_000_000) // teto do int4 com folga (M4) — não queima nDPS em INSERT que vai falhar
  valorCents!: number;

  @IsOptional() @IsString() @MaxLength(1000)
  descricao?: string;
}

export class CancelarDocumentoDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  motivo!: string;
}

export class EnviarDocumentoDto {
  // Sem canal explícito, o service decide pelos dados do doc (tela manda os dois).
  @IsOptional() @IsBoolean()
  email?: boolean;

  @IsOptional() @IsBoolean()
  whats?: boolean;
}

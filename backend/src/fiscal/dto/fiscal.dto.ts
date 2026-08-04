import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

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

  // Endereço do prestador (checklist 6b) — entra na DPS quando completo.
  @IsOptional() @IsString() @MaxLength(10)
  endCep?: string;

  @IsOptional() @IsString() @MaxLength(200)
  endLogradouro?: string;

  @IsOptional() @IsString() @MaxLength(20)
  endNumero?: string;

  @IsOptional() @IsString() @MaxLength(100)
  endComplemento?: string;

  @IsOptional() @IsString() @MaxLength(100)
  endBairro?: string;
}

export class UploadCertificadoFiscalDto {
  @IsString() @IsNotEmpty()
  senha!: string;
}

// ── B0 — RITO DE ATIVAÇÃO DO MODO HBX GESTÃO FISCAL ────────────────────────

export class ConferirCnpjGestaoDto {
  @IsString() @IsNotEmpty() @MaxLength(20)
  cnpj!: string;
}

export class AtivarGestaoFiscalDto {
  @IsString() @IsNotEmpty() @MaxLength(20)
  cnpj!: string;

  // Versão da política aceita — tem que bater com a vigente (aceite consciente).
  @IsString() @IsNotEmpty() @MaxLength(20)
  politicaVersao!: string;

  @IsIn(['agua', 'gas', 'bebidas', 'deposito', 'outro'])
  tipoEmpresa!: string;
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

// ── F3 ESTOQUE ──────────────────────────────────────────────────────────────

export class CriarEstoqueProdutoDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  nome!: string;

  @IsOptional() @IsString() @MaxLength(20)
  unidade?: string;

  @IsOptional() @IsString() @MaxLength(10)
  ncm?: string;

  @IsOptional() @IsString() @MaxLength(10)
  cest?: string;

  @IsOptional() @IsString() @MaxLength(6)
  cfopSaida?: string;

  @IsOptional() @IsString() @MaxLength(4)
  csosn?: string;

  @IsOptional() @IsInt()
  logisticaProductId?: number;

  // B1 — código de barras (bipável) + preço de venda no balcão.
  @IsOptional() @IsString() @MaxLength(20)
  gtin?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  precoBalcaoCents?: number;
}

export class AtualizarEstoqueProdutoDto {
  @IsOptional() @IsString() @MaxLength(200)
  nome?: string;

  @IsOptional() @IsString() @MaxLength(20)
  unidade?: string;

  @IsOptional() @IsString() @MaxLength(10)
  ncm?: string;

  @IsOptional() @IsString() @MaxLength(10)
  cest?: string;

  @IsOptional() @IsString() @MaxLength(6)
  cfopSaida?: string;

  @IsOptional() @IsString() @MaxLength(4)
  csosn?: string;

  @IsOptional() @IsInt()
  logisticaProductId?: number | null;

  @IsOptional() @IsBoolean()
  ativo?: boolean;

  @IsOptional() @IsString() @MaxLength(20)
  gtin?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  precoBalcaoCents?: number | null;
}

export class MovimentoEstoqueDto {
  @IsString() @IsNotEmpty()
  produtoId!: string;

  @IsNumber()
  quantidade!: number;

  @IsOptional() @IsString() @MaxLength(300)
  motivo?: string;
}

export class PerdaAjusteEstoqueDto {
  @IsString() @IsNotEmpty()
  produtoId!: string;

  @IsNumber()
  quantidade!: number;

  @IsString() @IsNotEmpty() @MaxLength(300)
  motivo!: string;
}

export class InventarioEstoqueDto {
  @IsString() @IsNotEmpty()
  produtoId!: string;

  @IsNumber() @Min(0)
  contagem!: number;

  @IsOptional() @IsString() @MaxLength(300)
  motivo?: string;
}

export class EntradaXmlPreviewDto {
  @IsString() @IsNotEmpty()
  xml!: string;
}

export class MapeamentoEntradaXmlDto {
  @IsString()
  cProd!: string;

  @IsOptional() @IsString()
  produtoId?: string;

  @IsOptional()
  novoProduto?: { nome: string; unidade?: string; ncm?: string } | null;

  @IsOptional() @IsBoolean()
  ignorar?: boolean;
}

export class EntradaXmlConfirmarDto {
  @IsString() @IsNotEmpty()
  xml!: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => MapeamentoEntradaXmlDto)
  mapeamentos!: MapeamentoEntradaXmlDto[];

  // M7 — chave já lançada exige gesto explícito (re-lançamento consciente).
  @IsOptional() @IsBoolean()
  permitirRelancamento?: boolean;
}

// ── LIBERAÇÃO DE PRODUÇÃO ──────────────────────────────────────────────────

export class AtestarContadorDto {
  @IsBoolean()
  aprovado!: boolean;
}

// ── B1 BALCÃO ──────────────────────────────────────────────────────────────

export class BalcaoItemDto {
  @IsString() @IsNotEmpty()
  produtoId!: string;

  @IsNumber() @Min(0.001) @Max(10_000)
  quantidade!: number;
}

export class CriarVendaBalcaoDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BalcaoItemDto)
  itens!: BalcaoItemDto[];

  @IsIn(['DINHEIRO', 'PIX', 'CARTAO', 'FIADO'])
  pagamento!: string;

  @IsOptional() @IsString() @MaxLength(60)
  clienteId?: string; // obrigatório no FIADO (regra no service)

  // Gerada pela tela por venda — double-submit devolve a MESMA venda.
  @IsOptional() @IsString() @MaxLength(60)
  idempotencyKey?: string;
}

export class CancelarVendaBalcaoDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  motivo!: string;
}

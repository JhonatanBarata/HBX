import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * NÚCLEO-CRM N4 (04/07) — DTOs de ESCRITA da espinha de cadastro.
 *
 * Padrão do repo: class-validator + ValidationPipe global
 * (whitelist + forbidNonWhitelisted + transform). Só campos declarados passam;
 * qualquer chave extra no body é rejeitada (400). companyId NUNCA vem do body —
 * sai sempre do JWT no controller.
 */

// ── Criar CONTA manual (o vendedor cadastrando "Dona Maria" + endereço) ──────
export class CreateContaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsIn(['pf', 'pj'])
  tipo?: 'pf' | 'pj';

  // Telefone/whatsapp do contato principal (a pessoa). Vira o Contato principal.
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  // Documento: CNPJ (pj) ou CPF (pf) — opcional. Usado como chave de idempotência.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  cep?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  // Papéis — default: cadastro manual do vendedor nasce como CLIENTE (o pedido).
  @IsOptional()
  @IsBoolean()
  isCliente?: boolean;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;

  @IsOptional()
  @IsBoolean()
  isFornecedor?: boolean;

  // Cargo do contato principal (opcional).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cargo?: string;
}

// ── Editar CONTA (papéis, endereço, dados) ───────────────────────────────────
export class UpdateContaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsIn(['pf', 'pj'])
  tipo?: 'pf' | 'pj';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  cep?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsBoolean()
  isCliente?: boolean;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;

  @IsOptional()
  @IsBoolean()
  isFornecedor?: boolean;
}

// ── Adicionar CONTATO (pessoa) a uma conta existente ─────────────────────────
export class CreateContatoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  customerProfileId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cargo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;
}

// ── R3 — MERGE de contas duplicadas (funde a conta da rota `:id` na `into`) ──────
export class MergeContaDto {
  // A conta destino (a "into"). O vencedor real é decidido por riqueza de dado no
  // serviço; este é o par a fundir. companyId NUNCA vem do body (sai do JWT).
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  into!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  motivo?: string;
}

// ── R3 — SOFT-DELETE (motivo opcional; company/usuário saem do JWT) ──────────────
export class SoftDeleteDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  motivo?: string;
}

// ── Editar CONTATO ───────────────────────────────────────────────────────────
export class UpdateContatoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cargo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;
}

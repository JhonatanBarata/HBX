import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * NÚCLEO-CRM N6 (05/07) — DTOs de ESCRITA do módulo Logística (app de entrega).
 *
 * Padrão do repo: class-validator + ValidationPipe global
 * (whitelist + forbidNonWhitelisted + transform). Só campos declarados passam;
 * qualquer chave extra no body é rejeitada (400). companyId NUNCA vem do body —
 * sai sempre do JWT no controller.
 */

// ── Criar uma ENTREGA (agendar) ──────────────────────────────────────────────
export class CreateEntregaDto {
  // O cliente (Conta = CustomerProfile). Obrigatório: uma entrega é sempre PARA alguém.
  @IsString()
  @MaxLength(60)
  customerProfileId!: string;

  // Quem recebe (Contato) — opcional (default: o principal da conta).
  @IsOptional()
  @IsString()
  @MaxLength(60)
  contatoId?: string;

  // O que entrega (Product) — opcional.
  @IsOptional()
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  quantidade?: number;

  // Valor da entrega. Se omitido, o serviço resolve por precoPadrao/preço do produto.
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor?: number;

  // ISO date; se omitido = hoje (entra na rota do dia).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ── Confirmar entrega (recebe o GPS do celular do entregador) ────────────────
export class ConfirmarEntregaDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

// ── Cancelar entrega ─────────────────────────────────────────────────────────
export class CancelarEntregaDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}

// ── LOGÍSTICA-MOBILE M2 — vínculo produto×cliente (recorrência) ──────────────
// "O cliente X leva N do produto Y a cada Z dias (ou nos dias W), pelo preço P."
// frequenciaDias E diasSemana são mutuamente exclusivos na prática (o serviço
// prioriza diasSemana); ambos opcionais → vínculo só-manual (sem recorrência).
export class CreateClienteProdutoDto {
  @IsString()
  @MaxLength(60)
  customerProfileId!: string;

  @IsInt()
  productId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  qtdPadrao?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoAcordado?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  frequenciaDias?: number;

  // "1,3,5" = seg/qua/sex (1=seg … 7=dom). Validação de conteúdo no serviço.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  diasSemana?: string;

  // ISO date; se omitido, o serviço calcula a próxima data pela frequência.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  proximaData?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

// Update: todos opcionais (PATCH parcial). customerProfileId/productId NÃO mudam
// (a identidade do vínculo) — para trocar produto/cliente, cria outro vínculo.
export class UpdateClienteProdutoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  qtdPadrao?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoAcordado?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  frequenciaDias?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  diasSemana?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  proximaData?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

// ── LOGÍSTICA-MOBILE M2 — gerar entregas do dia ──────────────────────────────
export class GerarDiaDto {
  // ISO date do dia a gerar; se omitido = hoje.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;
}

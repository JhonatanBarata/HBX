import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// BUG 2/3 (11/07) — `@MinLength(1)` sozinho conta espaços/tabs ("   " tem length 3),
// então nome só-espaço passava na validação e só quebrava depois (trim no service, 500).
// Trim ANTES do MinLength fecha a lacuna aqui: "   " vira "" e cai no MESMO 400 de "".
const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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
  @Transform(trimString)
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

  // LOGÍSTICA-MOBILE B3 (08/07) — partes do endereço (dupla escrita com `endereco`).
  @IsOptional()
  @IsString()
  @MaxLength(30)
  numero?: string;

  // 06/08 — apartamento/bloco/sala: é o que separa duas contas na MESMA porta
  // (condomínio). Sem ele, prédio inteiro parecia cadastro repetido.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bairro?: string;

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

  // LOGÍSTICA-MOBILE B1 (07/07) — origem da coordenada acima (só o front decide;
  // 'gps_entrega' é EXCLUSIVO do confirmar, nunca aceito aqui — o serviço ignora
  // qualquer outro valor). 'geocode' (CEP) | 'gps_cadastro' ("Usar este local").
  // B-backend (08/07): 'cidade' (fallback aproximado do geocode server-side) NUNCA
  // vem do body — o serviço escreve direto quando resolve a coordenada sozinho
  // (nucleo-geo.util.ts). De propósito fora deste enum: o cliente não pode alegar
  // 'cidade' por conta própria. TETO DE PRECISÃO (25/07) — 'gps_impreciso' é o que
  // o SERVIÇO grava quando `gpsAccuracy` não prova <=60m; aceito aqui só por defesa
  // em profundidade (quem decide é sempre o serviço — ver decidirGeoFonteCadastro).
  @IsOptional()
  @IsString()
  @IsIn(['geocode', 'gps_cadastro', 'gps_impreciso'])
  geoFonte?: string;

  // TETO DE PRECISÃO DO GPS (25/07) — precisão do fix em METROS (coords.accuracy).
  // Fail-closed: o cliente NUNCA se autodeclara preciso só mandando geoFonte=
  // 'gps_cadastro' — o serviço só aceita essa fonte (intocável) quando
  // `gpsAccuracy` <=60m; do contrário grava 'gps_impreciso' (corrigível na 1ª
  // entrega confirmada).
  @IsOptional()
  @IsNumber()
  gpsAccuracy?: number;

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

  // PR18072026 W1 — observação livre sobre o cliente ("deixa na portaria"...).
  // Trim + max 500 no serviço (mesmo padrão de outros campos de texto livre).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

// ── Editar CONTA (papéis, endereço, dados) ───────────────────────────────────
export class UpdateContaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  // CPF/CNPJ do cliente — OPCIONAL por ordem do dono (07/08): a ficha do app
  // mostra e deixa editar, mas nunca cobra. Sem esta porta o campo aceitava
  // digitação e não salvava, que é pior que campo ausente.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  document?: string;

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

  // LOGÍSTICA-MOBILE B3 (08/07) — partes do endereço (dupla escrita com `endereco`).
  @IsOptional()
  @IsString()
  @MaxLength(30)
  numero?: string;

  // 06/08 — apartamento/bloco/sala: é o que separa duas contas na MESMA porta
  // (condomínio). Sem ele, prédio inteiro parecia cadastro repetido.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bairro?: string;

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

  // LOGÍSTICA-MOBILE B1 (07/07) — mesma regra do CreateContaDto acima. TETO DE
  // PRECISÃO (25/07) — 'gps_impreciso' incluído pelo mesmo motivo (ver CreateContaDto).
  @IsOptional()
  @IsString()
  @IsIn(['geocode', 'gps_cadastro', 'gps_impreciso'])
  geoFonte?: string;

  // TETO DE PRECISÃO DO GPS (25/07) — mesma regra do CreateContaDto acima.
  @IsOptional()
  @IsNumber()
  gpsAccuracy?: number;

  @IsOptional()
  @IsBoolean()
  isCliente?: boolean;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;

  @IsOptional()
  @IsBoolean()
  isFornecedor?: boolean;

  // PR18072026 W1 — mesma regra do CreateContaDto acima.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

// ── Adicionar CONTATO (pessoa) a uma conta existente ─────────────────────────
export class CreateContatoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  customerProfileId!: string;

  @Transform(trimString)
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

// ── IMPORTAÇÃO EM MASSA (planilha) — uma linha = uma Conta + Contato principal ──
//
// Reusa o MESMO contrato do cadastro manual (createConta, idempotente e GRÁTIS). A
// planilha vem parseada do navegador; o backend só valida e roda em lote. Validação
// LENIENTE de propósito: campos todos opcionais aqui — quem não tem `nome` é PULADO
// no serviço (não derruba a batelada inteira por uma linha vazia). companyId sai do JWT.
export class ImportContatoRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cidade?: string;

  // Aceita UF (2 letras) OU nome do estado ("Ceará") — normalizado no serviço.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  uf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cargo?: string;

  @IsOptional()
  @IsIn(['pf', 'pj'])
  tipo?: 'pf' | 'pj';

  @IsOptional()
  @IsBoolean()
  isCliente?: boolean;
}

export class ImportContasDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportContatoRowDto)
  rows!: ImportContatoRowDto[];
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

// ── MULTILOCAL (10/07) — CRUD de LocalEntrega (N endereços de entrega por CONTA) ──
//
// A CONTA (customerProfileId) segue com UMA cobrança; multi-local é só ONDE se
// entrega. companyId sai do JWT; customerProfileId vem da ROTA (:id), nunca do body.
export class CreateLocalDto {
  // rótulo curto e opcional ("Casa" | "Loja" | "Depósito").
  @IsOptional()
  @IsString()
  @MaxLength(60)
  apelido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numero?: string;

  // 06/08 — apartamento/bloco/sala: é o que separa duas contas na MESMA porta
  // (condomínio). Sem ele, prédio inteiro parecia cadastro repetido.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bairro?: string;

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

  // Origem do pino (mesma convenção do perfil). 'gps_entrega' é EXCLUSIVO do confirmar
  // (LogisticaService), nunca aceito aqui — o serviço ignora qualquer outro valor.
  // TETO DE PRECISÃO (25/07) — 'gps_impreciso' incluído (ver CreateContaDto).
  @IsOptional()
  @IsString()
  @IsIn(['geocode', 'gps_cadastro', 'gps_impreciso'])
  geoFonte?: string;

  // TETO DE PRECISÃO DO GPS (25/07) — mesma regra do CreateContaDto acima.
  @IsOptional()
  @IsNumber()
  gpsAccuracy?: number;

  // Marca este local como principal (desmarca os outros). O 1º local nasce principal
  // mesmo sem esta flag (regra do serviço).
  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;
}

// Editar local (parcial) — os MESMOS campos, todos opcionais.
export class UpdateLocalDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  apelido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numero?: string;

  // 06/08 — apartamento/bloco/sala: é o que separa duas contas na MESMA porta
  // (condomínio). Sem ele, prédio inteiro parecia cadastro repetido.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bairro?: string;

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

  // TETO DE PRECISÃO (25/07) — 'gps_impreciso' incluído (ver CreateContaDto).
  @IsOptional()
  @IsString()
  @IsIn(['geocode', 'gps_cadastro', 'gps_impreciso'])
  geoFonte?: string;

  // TETO DE PRECISÃO DO GPS (25/07) — mesma regra do CreateContaDto acima.
  @IsOptional()
  @IsNumber()
  gpsAccuracy?: number;

  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;
}

// ── MULTILOCAL (10/07) — CRUD de telefones (via Contato) ─────────────────────────
//
// Um "telefone" é um Contato carregando whatsapp/phone. Exige ao menos um número
// (validado no serviço); sem `nome`, o próprio número vira o rótulo. companyId sai do
// JWT; customerProfileId vem da ROTA (:id) no POST.
export class CreateTelefoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;
}

// Editar telefone (parcial) — reusa a edição de Contato no serviço.
export class UpdateTelefoneDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;
}

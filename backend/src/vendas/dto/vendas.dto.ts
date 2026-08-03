import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsObject,
  IsBoolean,
  MaxLength,
  MinLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const LEAD_STATUSES = ['novo', 'contato', 'retorno', 'qualificado', 'encerrado'] as const;
const SALE_STATUSES = ['none', 'activation_pending', 'trial_started', 'sale_confirmed', 'inactive', 'canceled'] as const;
const COMMISSION_STATUSES = ['none', 'pending', 'payable', 'paid', 'canceled'] as const;
const MASTER_NOTICE_AUDIENCES = ['seller', 'customer'] as const;
const MASTER_NOTICE_TONES = ['info', 'success', 'warning', 'urgent'] as const;
// S4 LEAD-CENTRICO (04-robozinho.md): motivo estruturado obrigatório ao encerrar
// (statusChanged -> 'encerrado'). Aditivo — alimenta S7 (marquinha/pool) e o
// reembolso futuro (00-FRENTE.md, decisão nº1 do dono).
// 'opt_out' entrou em 30/07/2026: a marca global (VendasContactSuppression) já
// tratava opt-out como supressão PERMANENTE, mas o vocabulário da coluna não
// conhecia o valor — então o caminho do /atendimento precisava traduzir e a
// timeline mostrava "motivo não informado". As telas montam a própria lista de
// opções, então ampliar aqui só amplia o que a API ACEITA; nenhuma tela muda
// sozinha por causa disto.
export const VENDAS_CLOSURE_REASONS = ['sem_interesse', 'nao_atendeu', 'contato_invalido', 'opt_out', 'convertido', 'outro'] as const;
export type VendasClosureReason = (typeof VENDAS_CLOSURE_REASONS)[number];
// S4 LEAD-CENTRICO: personas de cadência prontas (seeds) — 'custom' fica de fora
// do robozinho por lead (custom precisa de passos próprios, fora de escopo aqui).
const ROBO_PERSONA_KEYS = ['conservador', 'moderado', 'agressivo'] as const;

function optionalEmail(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export class CreateManualVendasLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  websiteStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reviews?: number;

  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: (typeof LEAD_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(140)
  nextAction?: string;

  @IsOptional()
  @IsString()
  returnAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attemptCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productId?: number;
}

export class UpdateVendasLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  address?: string;

  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: (typeof LEAD_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(140)
  nextAction?: string;

  @IsOptional()
  @IsString()
  returnAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attemptCount?: number;

  @IsOptional()
  @IsIn(SALE_STATUSES)
  saleStatus?: (typeof SALE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saleValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  setupValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  salePlanKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productId?: number;

  @IsOptional()
  @IsIn(COMMISSION_STATUSES)
  commissionStatus?: (typeof COMMISSION_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(280)
  commissionNote?: string;

  @IsOptional()
  @IsIn(['manual', 'auto_email', 'auto_whatsapp', 'auto_both'])
  retornoMode?: 'manual' | 'auto_email' | 'auto_whatsapp' | 'auto_both';

  // S4 LEAD-CENTRICO: obrigatório no service quando o PATCH muda status -> 'encerrado'
  // (validação de "obrigatório" fica no service, que sabe se status mudou de fato).
  @IsOptional()
  @IsIn(VENDAS_CLOSURE_REASONS)
  closureReason?: VendasClosureReason;
}

// S4 LEAD-CENTRICO (04-robozinho.md): POST /vendas/lead/:id/robo — liga a cadência
// POR LEAD (opt-in). personaKey resolve pra uma cadência seed da empresa (cria se
// não existir ainda); cadenciaId aponta direto pra uma cadência já existente
// (inclusive custom). Um dos dois é obrigatório (o service valida).
export class LigarRoboDto {
  @IsOptional()
  @IsIn(ROBO_PERSONA_KEYS)
  personaKey?: (typeof ROBO_PERSONA_KEYS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cadenciaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  objetivo?: string;

  // S1 CORREÇÃO DO NOTURNO (30/07/2026): quando o disparo tem hora marcada. Sem
  // isto o robô ligava com `nextStepAt: new Date()` cru — ignorando janela, teto e
  // intervalo (B2). Agora TODO caminho passa pelo motor de slots; `startAt` só diz
  // a partir de quando procurar.
  @IsOptional()
  @IsDateString()
  startAt?: string;

  // Copy do primeiro contato, quando a tela já sabe qual vai ser. Serve pra recusar
  // carimbo repetido NA HORA DE AGENDAR (S2) — o vendedor descobre hoje, não amanhã
  // quando o freio cancelar.
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  message?: string;
}

// S1 CORREÇÃO DO NOTURNO (30/07/2026) — POST /vendas/lead/:id/agendar-disparo.
// NÃO é lembrete de CRM: cria o disparo de verdade com horário reservado pelo motor
// de slots. `desiredAt` é ISO COMPLETO (data+hora) e obrigatório — "99:99" morre
// aqui no DTO (B7), nunca chega a corromper a agenda.
export class AgendarDisparoDto {
  @IsDateString()
  desiredAt!: string;

  @IsOptional()
  @IsIn(ROBO_PERSONA_KEYS)
  personaKey?: (typeof ROBO_PERSONA_KEYS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cadenciaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  objetivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  message?: string;
}

// S5 LEAD-CENTRICO (05-agenda-slots.md): config comercial ENXUTA por empresa — janela
// de horário + teto de disparos por user/chip/dia + intervalo mínimo. 1 cartão, 3
// campos + salvar (a UI é mínima de propósito; horário validado/normalizado no
// service via normalizeTimeHHMM, então aqui basta string).
export class UpdateVendasComercialConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(5)
  workingHoursStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  workingHoursEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  dailyLimitPerSender?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  intervalMinutes?: number;
}

// Catálogo comercial (30/07): o corpo é a forma livre de vendas-catalogo.ts — quem
// valida/sanitiza é normalizeCatalogo (nunca lança; podre vira vazio). `catalogo: null`
// limpa e volta ao estado NULO ("IA proibida de afirmar produto").
export class UpdateVendasCatalogoComercialDto {
  @IsOptional()
  catalogo?: unknown;
}

// Variações de copy por IA (item 3, 30/07): frase-base da pessoa -> propostas da IA.
export class GerarVariacoesPrimeiroContatoDto {
  @IsString()
  @MaxLength(1200)
  frase!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  quantidade?: number;
}

// GET /vendas/agenda-disparo/proximo-slot?desiredAt=ISO — desiredAt opcional (default
// agora); devolve o próximo horário livre e, se desiredAt estava ocupado/fora da
// janela, o motivo do conflito ("08:00 ocupado — próximo livre 08:15").
export class ProximoSlotDisparoQueryDto {
  @IsOptional()
  @IsDateString()
  desiredAt?: string;
}

export class CreateHbxSalesHandoffDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  salePlanKey?: string;

  // Valor REAL combinado no fechamento (mensalidade). Quando vier > 0, vira a base
  // da comissao — "a comissao e calculada sobre o valor real". Sem isso, cai no
  // preco de tabela do plano/produto (comportamento legado).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  saleValue?: number;

  // Implantacao (one-time) acordada — comissao da mesma vendedora, nao recorrente.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  setupValue?: number;

  // Pre-cadastro confirmado no fechamento — alimenta o prefill do checkout (o que o
  // vendedor sabe do cliente). Preenche GAPS do lead (nunca apaga valor existente).
  // cpf vai pro CustomerProfile.document; o resto pro VendasLead.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  origin?: string;
}

export class CreateHbxAssistedSignupDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  salePlanKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password?: string;
}

export class CreateMasterNoticeDto {
  @IsOptional()
  @IsIn(MASTER_NOTICE_AUDIENCES)
  audience?: (typeof MASTER_NOTICE_AUDIENCES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(96)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1200)
  body!: string;

  @IsOptional()
  @IsIn(MASTER_NOTICE_TONES)
  tone?: (typeof MASTER_NOTICE_TONES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  forceSeconds?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateCommissionPayoutDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sellerUserId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  @IsBoolean()
  includeNotYetDue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
}

export class ResolveCancellationCaseDto {
  @IsIn(['kept', 'reversed', 'unlinked'])
  resolution!: 'kept' | 'reversed' | 'unlinked';

  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
}

export class CancelCommissionPayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
}

export class BulkDeleteVendasLeadsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  leadIds?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  all?: boolean;

  // Motivo da exclusão (matriz de disposição PR24062026): 'excluir' (só excluir, volta
  // pra própria empresa) ou 'unsatisfactory' (resultado não satisfatório, some pra você).
  // Vazio = default conservador na fonte única (unsatisfactory). Validação de vocabulário
  // acontece no resolveDispositionReason — aceita variantes/PT.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reason?: string;
}

export class DeleteVendasLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reason?: string;
}

export class ReportVendasLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(600)
  reason?: string;
}

export class ImportWebscrapingLeadItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsString()
  phoneDigits?: string;

  @IsOptional()
  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reviews?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  segment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emailStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emailSource?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  emailConfidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  socialStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  socialConfidence?: number;

  @IsOptional()
  @IsIn(['instagram', 'facebook', 'both'])
  primarySocial?: 'instagram' | 'facebook' | 'both' | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  googleMapsUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  openingHoursStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recommendedChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  painType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  painLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  painPitch?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  enrichmentScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  enrichmentConfidence?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  opportunityScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  opportunityReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceEngine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  enrichmentJson?: unknown;

  @IsOptional()
  quality?: {
    status?: string | null;
    billable?: boolean | null;
    segmentMatchScore?: number | null;
    contactQualityScore?: number | null;
    commercialScore?: number | null;
    reasons?: string[];
  } | null;

  @IsOptional()
  qualityV2?: unknown;

  @IsOptional()
  @IsIn(['candidate', 'list_basic', 'enrichment_pending', 'lead_plus_qualified', 'review_backup', 'blocked'])
  visibilityTier?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @IsOptional()
  @IsBoolean()
  debitEligible?: boolean;

  @IsOptional()
  @IsIn(['list', 'lead_plus'])
  deliveryProduct?: 'list' | 'lead_plus';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  qualityReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  scriptText?: string;

  @IsOptional()
  @IsString()
  sourceHistoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  placeId?: string;
}

export class ImportWebscrapingLeadsDto {
  @IsOptional()
  @IsString()
  sourceHistoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedUserId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on', 'none', 'skip'].includes(value.trim().toLowerCase());
    return value;
  })
  skipWhatsappValidation?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  @IsBoolean()
  debitOnImport?: boolean;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportWebscrapingLeadItemDto)
  leads!: ImportWebscrapingLeadItemDto[];
}

export class UpdateVendasProspectingConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  segment?: string;

  @IsOptional()
  @IsIn(['hbx', 'google'])
  engine?: 'hbx' | 'google';

  @IsOptional()
  @IsIn(['pj', 'pf', 'agenda_pf'])
  targetType?: 'pj' | 'pf' | 'agenda_pf';

  @IsOptional()
  filtersJson?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  messageTemplate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  preMessageEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  preMessageVariants?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  intervalMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  intervalVarianceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  botReplyIntervalReductionPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  dailyLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  minLeadBuffer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  desiredLeadBuffer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxAttemptsPerLead?: number;

  // NÍVEL DE DISPARO (dono, 31/07): um clique no lugar de quatro campos. Quando vem
  // preenchido, o service expande nos 4 campos de risco (vendas-nivel-disparo.ts) e
  // o que veio junto no mesmo PATCH para esses campos é ignorado — senão "escolhi
  // Médio e continuou 17/dia" volta a acontecer.
  @IsOptional()
  @IsString()
  @IsIn(['conservador', 'medio', 'agressivo'])
  nivelDisparo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  workingHoursStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  workingHoursEnd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(45)
  typingSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  typingVarianceSeconds?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  positiveIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  negativeIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  whatIsItIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  neutralIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  callbackIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  humanHandoffIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  firstContactVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  positiveReplyVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  whatIsItReplyVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  scheduledReplyVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  optOutVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  neutralHandoffVariants?: string[];

  // 🔴 03/08 — ROTEIRO DE PASSAGEM PRO GERENTE. Não é "mais uma variante de
  // resposta": é o momento em que o robô PARA de vender e entrega o lead pra uma
  // pessoa, com nome e telefone. Vazio = desarmado (o caminho de hoje segue
  // intacto). Duas listas porque o dono cravou DUAS mensagens, a 2ª alguns
  // segundos depois — texto de gente não vem tudo num balão só.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  handoffGerenteVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  handoffGerenteFollowUpVariants?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  optOutMessage?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  optOutReplyEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  websiteFallbackEnabled?: boolean;
}

export class StartVendasProspectingDto extends UpdateVendasProspectingConfigDto {}

// Simulação do disparo frio (preview interativo "Teste de conversa"). NÃO escreve
// nada, NÃO envia WhatsApp: roda o MESMO classificador do motor sobre um texto de
// teste e devolve a resposta/variantes que o bot mandaria. `config` é a config que
// está sendo editada na tela (draft) — quando ausente, cai na campanha salva.
export class SimulateProspectingDto {
  @IsOptional()
  @IsIn(['opener', 'reply'])
  mode?: 'opener' | 'reply';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  // Config efetiva da tela (mesmos campos de UpdateVendasProspectingConfigDto).
  // Lida de forma defensiva no service; nunca persistida.
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateSalesProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  whatDoYouSell?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  offerCategory?: string;

  @IsOptional()
  @IsObject()
  targetAudience?: { labels?: string[]; notes?: string };

  @IsOptional()
  @IsObject()
  targetSegments?: { labels?: string[]; weights?: Record<string, number> };

  @IsOptional()
  @IsObject()
  avoidSegments?: { labels?: string[]; hardReject?: string[] };

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  preferredCities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  preferredStates?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  preferredChannels?: string[];

  @IsOptional()
  @IsObject()
  leadPreferences?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ticketRange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  salesGoal?: string;

  @IsOptional()
  @IsObject()
  negativeRules?: Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  @IsBoolean()
  weeklyAutoUpdateEnabled?: boolean;
}

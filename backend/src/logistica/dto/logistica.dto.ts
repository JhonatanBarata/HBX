import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  // B1 (07/07) — precisão do GPS em metros (navigator.geolocation coords.accuracy).
  // Usada SÓ pra decidir se este ponto é bom o bastante pra realimentar o cadastro
  // do cliente (accuracy<=60m); nunca bloqueia a confirmação em si.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracy?: number;

  // M4 — pagamento condicional: método escolhido na folha de chegada. SÓ chega
  // quando o cliente é 'aberto' (chips visíveis) e o módulo financeiro está ON;
  // costumeiro/OFF nunca manda. Aceito e persistido (receiptMethod); a criação
  // do charge é M6 — aqui só registra o desfecho.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(['pix', 'dinheiro', 'fiado'])
  receiptMethod?: string; // pix | dinheiro | fiado

  // M4 — quantidades efetivamente entregues (stepper por item). Best-effort:
  // se ausente, mantém a qtdPrevista de cada EntregaItem (M6 reconcilia).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmarEntregaItemDto)
  itens?: ConfirmarEntregaItemDto[];

  // M8 (offline-first) — chave de idempotência gerada no celular (uuid) antes de
  // enfileirar a confirmação. O reenvio da MESMA confirmação (mesma key, típico da
  // fila offline drenando após reconectar) NÃO dispara efeito 2× (WhatsApp/charge):
  // se a key já foi gravada na Entrega, o serviço devolve o desfecho anterior sem
  // re-executar. Opcional: sem key = comportamento clássico (idempotência por status).
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}

// Um item confirmado no stepper (id do EntregaItem + qtd entregue).
export class ConfirmarEntregaItemDto {
  @IsString()
  @MaxLength(60)
  id!: string;

  @IsInt()
  @Min(0)
  @Max(9999)
  qtdEntregue!: number;
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

// ── LOGÍSTICA-MOBILE M3 — motor de rota + ETA ────────────────────────────────
// Planejar: ordena a rota do dia (NN+2-opt Haversine), grava rotaOrdem/etaAt e
// devolve a previsão de término. origemLat/Lng = GPS do entregador (ponto de
// partida); se ausente, começa pela 1ª parada com coordenada.
export class PlanejarRotaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  origemLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  origemLng?: number;
}

// Iniciar: re-planeja com a origem atual e marca a 1ª parada em rota.
export class IniciarRotaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  origemLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  origemLng?: number;
}

// ── LOGÍSTICA-MOBILE M5 — regras do admin (LogisticaConfig) ───────────────────
// PATCH parcial da config da empresa: template do aviso + toggles + params de rota.
// Só campos declarados passam (whitelist). companyId NUNCA vem do body (JWT).
export class UpdateLogisticaConfigDto {
  @IsOptional()
  @IsBoolean()
  avisoWhatsEnabled?: boolean;

  // Template do aviso "entregue". Variáveis: {saudacao} {cliente} {itens} {qtd} {produto}.
  // Vazio → volta ao fallback (a mensagem fixa do N6).
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  templateAviso?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  raioChegadaM?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  velocidadeMediaKmH?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  tempoParadaMin?: number;

  @IsOptional()
  @IsBoolean()
  cobrancaNaEntrega?: boolean;

  @IsOptional()
  @IsBoolean()
  moduloFinanceiroAtivo?: boolean;

  @IsOptional()
  @IsBoolean()
  moduloRecoveryAtivo?: boolean;

  @IsOptional()
  @IsBoolean()
  gerarDiaAutomatico?: boolean;

  // F1 — Pix direto do tenant (BR Code gerado no app, sem MP). Vazio limpa/desliga.
  @IsOptional()
  @IsString()
  @MaxLength(77)
  pixChave?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pixNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  pixCidade?: string;
}

// Toggle "avisar entrega" de UM cliente (2º nível de silêncio, soma com o global).
export class SetAvisarClienteDto {
  @IsBoolean()
  avisar!: boolean;
}

// ── NÚCLEO-CRM R2 — fechar o mês (modelo mensal) ─────────────────────────────
// Agrupa as entregas 'aguardando_fechamento' por cliente e cria 1 charge. Ambos
// opcionais: clienteId → fecha só ele; mesRef ("YYYY-MM") → mês de referência
// (default hoje). companyId NUNCA vem do body (JWT). ADMIN-only no controller.
export class FecharMesDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  clienteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  mesRef?: string; // "YYYY-MM"
}

// ── LOGÍSTICA-MOBILE M6 — editar a forma de pagamento do cliente (na ficha) ───
// PATCH parcial dos DOIS eixos do contrato (regra do dono 04/07, NÃO misturar):
// formaPagamento (COMO/QUANDO paga) + contabilizar (entra na contabilidade?) +
// metodoPadrao (pix|dinheiro, só p/ na_hora) + diaFechamento (modelo mensal).
// companyId NUNCA vem do body (JWT). ADMIN-only no controller. Não dispara nada.
export class UpdateFinanceiroClienteDto {
  // aberto | mensal | na_hora | pendura. Enum travado no DTO (rejeita fora do conjunto);
  // o serviço ainda normaliza/valida por segurança.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(['aberto', 'mensal', 'na_hora', 'pendura'])
  formaPagamento?: string;

  // pix | dinheiro (só p/ na_hora). '' limpa o método. Enum travado no DTO.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(['pix', 'dinheiro', ''])
  metodoPadrao?: string;

  @IsOptional()
  @IsBoolean()
  contabilizar?: boolean;

  // Dia do mês em que fecha a fatura (modelo mensal). 1..31 (clampado no serviço).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaFechamento?: number;

  // F1 — teto de fiado do cliente (R$). null limpa (sem limite). O app só AVISA
  // o entregador quando o saldo em aberto estoura — nunca bloqueia a entrega.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  limiteFiado?: number | null;
}

// ── LOGÍSTICA-MOBILE M7 — recovery opt-in (varrer cobranças vencidas) ─────────
export class VarrerRecoveryDto {
  // Data de corte (ISO YYYY-MM-DD); charges com dueDate < esse dia entram. Omitido = hoje.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;
}

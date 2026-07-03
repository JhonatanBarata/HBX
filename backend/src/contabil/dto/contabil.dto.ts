import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

// PATCH /master/contabil/perfil — SEM campos *Encrypted (segredo entra só S6/S7 via UI dedicada).
export class UpdateFiscalProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  razaoSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  dataAbertura?: string; // ISO date

  @IsOptional()
  @IsString()
  @MaxLength(20)
  regime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  anexoBase?: string; // "III" | "V"

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnaePrincipal?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  aliquotaIssMunicipal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  prolaboreAlvoPct?: number;
}

// POST /master/contabil/mes/:competencia/ajuste — correção manual COM motivo obrigatório.
export class AjusteManualDto {
  @IsInt()
  ajusteManualCents!: number; // pode ser negativo (correção p/ baixo)

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  motivo!: string;
}

// POST /master/contabil/obrigacoes/:id/marcar — transição manual (dono marcou
// TRANSMITIDO/PAGO/CONFERIDO com nº de recibo — modo semi-auto do S2/S5).
export class MarcarObligationDto {
  @IsString()
  @MaxLength(30)
  estado!: string; // AGUARDANDO_DADOS | PRONTO | ARMADO | TRANSMITIDO | PAGO | CONFERIDO

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resultJson?: string; // recibo/nº protocolo/comprovante (JSON serializado pelo caller)
}

// CONTABIL S4 — Livro Caixa -------------------------------------------------

// POST /master/contabil/livro-caixa — lançamento MANUAL (servidor, ferramenta,
// pró-labore pago, distribuição de lucro). origem sempre 'MANUAL' no service
// (não vem do body — nunca deixamos o caller forjar AUTO_MP/AUTO_OBRIGACAO).
export class CriarLancamentoManualDto {
  @IsString()
  @MaxLength(30)
  data!: string; // ISO date

  @IsString()
  @MaxLength(20)
  tipo!: string; // ENTRADA | SAIDA

  @IsString()
  @MaxLength(40)
  categoria!: string; // PROLABORE | DISTRIBUICAO_LUCRO | INFRA | FERRAMENTA | OUTRO | ...

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  descricao!: string;

  @IsInt()
  @Min(1)
  valorCents!: number;
}

// POST /master/contabil/livro-caixa/:id/estornar — corrige um lançamento (automático
// ou manual) via lançamento de ESTORNO novo, nunca edição direta (Guardrail do S4).
export class EstornarLancamentoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  motivo!: string;
}

// POST /master/contabil/livro-caixa/fechar/:ano — congela o ano (edição só via estorno,
// mesmo depois de fechado — o fechamento é sinalização/trilha, não imutabilidade física).
export class FecharAnoDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  motivo?: string;
}

// CONTABIL S5 — copiloto "Fechar o mês" -------------------------------------

// POST /master/contabil/mes/:competencia/prolabore — define o pró-labore do mês
// (input do dono no passo 2 do wizard). Recomputa a cadeia (DAS/INSS/IRRF do motor).
export class DefinirProlaboreDto {
  @IsInt()
  @Min(0)
  prolaboreCents!: number;
}

// GET/POST /master/contabil/mes/:competencia/impacto-prolabore — simula o impacto
// de um pró-labore hipotético (passo 2 ao vivo). Só leitura, não grava.
export class ImpactoProlaboreDto {
  @IsInt()
  @Min(0)
  prolaboreCents!: number;
}

// POST /master/contabil/mes/:competencia/validar-das — o disjuntor do copiloto:
// compara o DAS que o governo calculou (digitado pelo dono) com o do motor.
export class ValidarDasDto {
  @IsInt()
  @Min(0)
  dasGovernoCents!: number;
}

// POST /master/contabil/mes/:competencia/fechar — o clique final do dono (passo 6).
// Grava fechadoEm + obrigações CONFERIDO + relatório. NUNCA transmite (Lei nº1).
export class FecharMesDto {
  // Se vier, o fechamento revalida a divergência do DAS e recusa fechar se divergir.
  @IsOptional()
  @IsInt()
  @Min(0)
  dasGovernoCents?: number;
}

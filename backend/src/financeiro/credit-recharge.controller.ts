import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditRechargeService } from './credit-recharge.service';

// CRÉDITOS S3-PARTE2 — rota da recarga self-service (cartão one-off, Regra de Ouro).
// Guard: só JWT — a autorização fina (dono/master; vendedor E gerente = Forbidden NEUTRO)
// mora no service via isBillingOwnerActor, porque @Admin() deixaria GERENTE passar
// (gerente é role ADMIN) e a LEI DO VENDEDOR exige bloqueio sem citar preço/pacote.
// Flag HBX_CREDITS_ENABLED OFF ⇒ 404 (service), espelhando o resto do módulo credits.

class RechargeCreditsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  packKey!: string;

  // UUID gerado pelo front POR INTENÇÃO de recarga (aberto o fluxo = 1 chave).
  // Vira X-Idempotency-Key no MP e dedupa retry sem cobrar 2x.
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Type(() => String)
  cardTokenId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Type(() => String)
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Type(() => String)
  taxDocument?: string;
}

// PIX (PR22082026-CLIENTE-ME-ACHA) — 2 fases: POST gera o QR (cobrança pendente), GET
// consulta/assenta. Mesma guarda do cartão (dono/master no service, LEI DO VENDEDOR).
class PixRechargeCreditsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  packKey!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(80)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Type(() => String)
  taxDocument?: string;
}

@Controller('financeiro/credits')
export class CreditRechargeController {
  constructor(private readonly rechargeService: CreditRechargeService) {}

  @Post('recharge')
  @UseGuards(JwtAuthGuard)
  async recharge(@Req() req: any, @Body() body: RechargeCreditsDto) {
    return this.rechargeService.rechargeWithCard(req.user, {
      packKey: body.packKey,
      idempotencyKey: body.idempotencyKey,
      cardTokenId: body.cardTokenId ?? null,
      paymentMethodId: body.paymentMethodId ?? null,
      taxDocument: body.taxDocument ?? null,
    });
  }

  @Post('recharge/pix')
  @UseGuards(JwtAuthGuard)
  async rechargePix(@Req() req: any, @Body() body: PixRechargeCreditsDto) {
    return this.rechargeService.createPixRecharge(req.user, {
      packKey: body.packKey,
      idempotencyKey: body.idempotencyKey,
      taxDocument: body.taxDocument ?? null,
    });
  }

  @Get('recharge/pix/:paymentId')
  @UseGuards(JwtAuthGuard)
  async rechargePixStatus(@Req() req: any, @Param('paymentId') paymentId: string) {
    return this.rechargeService.getPixRechargeStatus(req.user, paymentId);
  }
}

import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
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
}

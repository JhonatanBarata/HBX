import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeadEmailService } from './lead-email.service';

// LEADS-FINAL/06 — E-MAIL v1. Conta SMTP do PRÓPRIO usuário + envio da timeline
// do lead. Gate: só usuário autenticado do tenant (JwtAuthGuard). Vendedor pode
// conectar a própria conta e enviar — é canal de prospecção, sem valores/planos.
// Escopo: companyId do token + userId do token (1 conta por usuário por empresa).
//
// A flag real = presença do secret de cifra (checada no service): sem ele, o GET
// devolve `{ enabled:false }` e o front esconde a aba (fail-closed gracioso).

class SaveAccountDto {
  @IsOptional() @IsEmail() @MaxLength(180)
  address?: string;

  @IsOptional() @IsString() @MaxLength(120)
  senderName?: string | null;

  @IsOptional() @IsString() @MaxLength(40)
  provider?: string | null;

  @IsOptional() @IsString() @MaxLength(180)
  smtpHost?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(65535)
  smtpPort?: number | null;

  @IsOptional() @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional() @IsString() @MaxLength(180)
  username?: string | null;

  @IsOptional() @IsString() @MaxLength(255)
  password?: string | null;
}

class SendDto {
  @IsString() @MaxLength(64)
  leadId!: string;

  @IsEmail() @MaxLength(180)
  to!: string;

  @IsString() @MaxLength(240)
  subject!: string;

  @IsString() @MaxLength(20000)
  bodyText!: string;
}

@Controller('lead-email')
@UseGuards(JwtAuthGuard)
export class LeadEmailController {
  constructor(private readonly service: LeadEmailService) {}

  private companyIdOf(req: any): number {
    const companyId = Math.trunc(Number(req?.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Contexto de empresa obrigatório.');
    return companyId;
  }
  private userIdOf(req: any): number {
    const userId = Math.trunc(Number(req?.user?.id || 0));
    if (!userId) throw new ForbiddenException('Usuário não identificado.');
    return userId;
  }

  // Estado da flag — o front usa pra mostrar/esconder a aba (fail-closed).
  @Get('status')
  status() {
    return this.service.status();
  }

  @Get('account')
  getAccount(@Req() req: any) {
    return this.service.getAccountState(this.companyIdOf(req), this.userIdOf(req));
  }

  @Put('account')
  async saveAccount(@Req() req: any, @Body() dto: SaveAccountDto) {
    const account = await this.service.saveAccount(this.companyIdOf(req), this.userIdOf(req), dto || {});
    return { ok: true, account };
  }

  @Delete('account')
  deleteAccount(@Req() req: any) {
    return this.service.deleteAccount(this.companyIdOf(req), this.userIdOf(req));
  }

  @Post('account/test')
  testConnection(@Req() req: any) {
    return this.service.testConnection(this.companyIdOf(req), this.userIdOf(req));
  }

  @Post('send')
  send(@Req() req: any, @Body() dto: SendDto) {
    return this.service.send(this.companyIdOf(req), this.userIdOf(req), dto || ({} as SendDto));
  }

  @Get('history')
  history(@Req() req: any, @Query('leadId') leadId: string) {
    return this.service.history(this.companyIdOf(req), String(leadId || ''));
  }
}

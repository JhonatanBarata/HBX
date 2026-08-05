import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { PulsoAppService } from './pulso-app.service';

/**
 * PULSO DO APP (PR04082026-PULSO-DO-APP, 04/08) — a leitura do painel.
 *
 * MASTER-ONLY (JWT + MasterGuard, mesmo par do master-cockpit): é visão de
 * PLATAFORMA. Admin de tenant NÃO vê isto no v1, por decisão do plano; se um
 * dia ver, nasce endpoint próprio escopado por empresa, nunca este com um `if`.
 *
 * 05/08 (PR05082026-VER-TELA): a LISTA global (`GET /master/pulso`) morreu
 * junto com a janela "Pulso" — a lista de aparelhos agora é da EMPRESA e mora
 * na ficha do cliente (`master-aparelhos.controller.ts`). Sobrou a trilha, que
 * é por aparelho e continua servindo o painel novo.
 *
 * Só LEITURA — quem escreve o pulso é o poll do APK, do outro lado.
 */
@Controller('master/pulso')
export class MasterPulsoController {
  constructor(private readonly pulso: PulsoAppService) {}

  /** A trilha do dia de UM aparelho (`?date=YYYY-MM-DD`; sem data = hoje). */
  @Get(':deviceId/trilha')
  @UseGuards(JwtAuthGuard, MasterGuard)
  trilha(@Param('deviceId') deviceId: string, @Query('date') date?: string) {
    return this.pulso.trilhaDoDia(deviceId, date);
  }
}

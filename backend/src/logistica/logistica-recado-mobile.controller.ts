import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OpenMobileDeviceSessionDto } from '../auth/dto/mobile-device.dto';
import { MobileDevicePresenceService } from '../auth/mobile-device-presence.service';
import { LogisticaRecadoService } from './logistica-recado.service';

class MobileRecadoPullDto extends OpenMobileDeviceSessionDto {}

class MobileRecadosRecebidosDto extends OpenMobileDeviceSessionDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];
}

/**
 * Campainha nativa da Logística.
 *
 * Não usa JWT da WebView: o Firebase pode acordar o processo com o app fechado.
 * A credencial opaca do aparelho resolve usuário + empresa no servidor e passa
 * pelo mesmo gate comercial DRIVER/logística antes de tocar em qualquer recado.
 */
@Controller('mobile/logistica/recados')
export class LogisticaRecadoMobileController {
  constructor(
    private readonly presence: MobileDevicePresenceService,
    private readonly recados: LogisticaRecadoService,
  ) {}

  @Post('pull')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async pull(@Body() dto: MobileRecadoPullDto) {
    const device = await this.presence.authenticateLogisticaDevice(dto);
    // APARELHO DO TURNO (08/08): a credencial JÁ diz qual celular está pedindo —
    // então o pull entrega só o que é DELE. Sem isso, o aparelho de teste
    // parado no escritório puxava o recado do celular que está na rua.
    return { recados: await this.recados.puxar(device.companyId, device.userId, device.id) };
  }

  @Post('recebidos')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async recebidos(@Body() dto: MobileRecadosRecebidosDto) {
    const device = await this.presence.authenticateLogisticaDevice(dto);
    return {
      marcados: await this.recados.marcarRecebidos(
        device.companyId,
        device.userId,
        dto.ids,
        device.id,
      ),
    };
  }
}

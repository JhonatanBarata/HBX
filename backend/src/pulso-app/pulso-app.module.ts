import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ErrosAppService } from './erros-app.service';
import { EspelhoAppService } from './espelho-app.service';
import { MasterAparelhosController } from './master-aparelhos.controller';
import { MasterAparelhosService } from './master-aparelhos.service';
import { MasterPulsoController } from './master-pulso.controller';
import { PulsoAppService } from './pulso-app.service';

/**
 * PULSO DO APP (PR04082026-PULSO-DO-APP, 04/08).
 *
 * Nome `pulso-app` pra não colidir com o `pulse/` que já existe (HBX Pulse é
 * outra coisa: resumo de vendas do usuário). São dois assuntos, dois módulos.
 *
 * Só depende de Prisma — por isso o LogisticaModule pode importá-lo para o
 * poll do APK gravar o pulso sem criar ciclo de dependência no boot.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MasterPulsoController, MasterAparelhosController],
  providers: [PulsoAppService, MasterAparelhosService, EspelhoAppService, ErrosAppService, MasterGuard],
  // Espelho e erros são exportados porque o outro lado deles (o APK) entra pelo
  // poll e pelo `/logistica/espelho/quadro`, que moram no LogisticaController.
  exports: [PulsoAppService, EspelhoAppService, ErrosAppService],
})
export class PulsoAppModule {}

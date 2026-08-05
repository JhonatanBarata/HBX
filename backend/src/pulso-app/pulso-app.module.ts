import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaModule } from '../prisma/prisma.module';
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
  controllers: [MasterPulsoController],
  providers: [PulsoAppService, MasterGuard],
  exports: [PulsoAppService],
})
export class PulsoAppModule {}

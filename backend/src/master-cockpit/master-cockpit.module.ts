import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { MasterCockpitController } from './master-cockpit.controller';
import { MasterCockpitService } from './master-cockpit.service';

// O WebwhatsBridgeService só depende de Prisma, então o provemos aqui como
// instância própria (mesmo padrão do MasterAlertModule) — assim NÃO importamos
// o MessagingModule e NÃO criamos ciclo de dependência no boot. A sonda de
// saúde do cockpit usa SÓ leitura do motor (listMotorInstances).
@Module({
  imports: [PrismaModule],
  controllers: [MasterCockpitController],
  providers: [MasterCockpitService, MasterGuard, WebwhatsBridgeService],
})
export class MasterCockpitModule {}

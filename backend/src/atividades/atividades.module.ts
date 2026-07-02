import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { AtividadesController } from './atividades.controller';
import { AtividadesService } from './atividades.service';

// WORM-12 — agenda do vendedor. Exporta o service para o WORM-13 (automacao)
// injetar `createFromAutomation` sem passar por HTTP.
@Module({
  imports: [PrismaModule, ModulesAccessModule, AuthModule],
  controllers: [AtividadesController],
  providers: [AtividadesService],
  exports: [AtividadesService],
})
export class AtividadesModule {}

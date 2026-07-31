import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { ComexCambioService } from './comex-cambio.service';
import { ComexController } from './comex.controller';
import { ComexDataService } from './comex-data.service';
import { ComexNewsService } from './comex-news.service';
import { ComexService } from './comex.service';

// HBX COMEX — módulo NOVO e isolado: zero import de vendas/radar/whatsapp.
// Dado analítico vem de Parquet (comex-motor/), nunca do Postgres do CRM.
@Module({
  imports: [ModulesAccessModule, AuthModule],
  controllers: [ComexController],
  providers: [ComexDataService, ComexService, ComexNewsService, ComexCambioService],
})
export class ComexModule {}

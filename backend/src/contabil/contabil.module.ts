import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContabilController } from './contabil.controller';
import { ContabilService } from './contabil.service';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';

// Módulo-folha (só PrismaModule) — mesma filosofia do MasterAlertModule: sem
// ciclos de dependência. No S2 entra o MasterAlertService (alertas fiscais).
@Module({
  imports: [PrismaModule],
  controllers: [ContabilController],
  providers: [FiscalEngineService, RevenueSyncService, ContabilService],
  exports: [FiscalEngineService, RevenueSyncService, ContabilService],
})
export class ContabilModule {}

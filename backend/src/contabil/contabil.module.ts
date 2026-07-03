import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterAlertModule } from '../master-alert/master-alert.module';
import { ContabilController } from './contabil.controller';
import { ContabilService } from './contabil.service';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';
import { ObligationSchedulerService } from './obligation-scheduler.service';
import { LivroCaixaService } from './livro-caixa.service';
import { ContabilCloseService } from './contabil-close.service';
import { ComprovanteService } from './comprovante.service';

// Módulo-folha (PrismaModule + MasterAlertModule) — mesma filosofia do
// MasterAlertModule: sem ciclos de dependência. S2: importamos MasterAlertModule
// DIRETO (não MessagingModule) — MasterAlertModule já provê WebwhatsBridgeService
// como instância própria, então NÃO recriamos o ciclo
// CommercialPlans → Messaging → Modules → CommercialPlans.
@Module({
  imports: [PrismaModule, MasterAlertModule],
  controllers: [ContabilController],
  providers: [FiscalEngineService, RevenueSyncService, ContabilService, ObligationSchedulerService, LivroCaixaService, ContabilCloseService, ComprovanteService],
  exports: [FiscalEngineService, RevenueSyncService, ContabilService, ObligationSchedulerService, LivroCaixaService, ContabilCloseService, ComprovanteService],
})
export class ContabilModule {}

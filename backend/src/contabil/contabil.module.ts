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
import { NfseCertService } from './nfse-cert.service';
import { NfseNationalClient } from './nfse-national.client';
import { NfseEmitterService } from './nfse-emitter.service';
import { FiscalAutomationLogService } from './fiscal-automation-log.service';
import { SerproCredService } from './serpro-cred.service';
import { SerproIntegraClient } from './serpro-integra.client';
import { SerproAutopostService } from './serpro-autopost.service';

// Módulo-folha (PrismaModule + MasterAlertModule) — mesma filosofia do
// MasterAlertModule: sem ciclos de dependência. S2: importamos MasterAlertModule
// DIRETO (não MessagingModule) — MasterAlertModule já provê WebwhatsBridgeService
// como instância própria, então NÃO recriamos o ciclo
// CommercialPlans → Messaging → Modules → CommercialPlans.
//
// S6 (NFS-e): NfseNationalClient nasce com o transporte HTTP REAL (mTLS) por
// default — mas ele SÓ é exercido quando a flag HBX_CONTABIL_NFSE_ENABLED=1 e o
// emissor chama emitir(). Deploy com flag OFF = nenhuma chamada externa.
//
// S7 (Serpro): SerproIntegraClient nasce com o transporte HTTP REAL (OAuth+gateway)
// por default — SÓ exercido quando HBX_CONTABIL_SERPRO_ENABLED=1 e o wizard chama
// transmitir(), sob clique-com-confirmação do dono (Lei nº1). Deploy com flag OFF
// = braço inerte (ARMAR/TRANSMITIR nem aparecem; wizard fica no semi-auto do S5).
@Module({
  imports: [PrismaModule, MasterAlertModule],
  controllers: [ContabilController],
  providers: [
    FiscalEngineService,
    RevenueSyncService,
    ContabilService,
    ObligationSchedulerService,
    LivroCaixaService,
    ContabilCloseService,
    ComprovanteService,
    NfseCertService,
    NfseNationalClient,
    NfseEmitterService,
    FiscalAutomationLogService,
    SerproCredService,
    SerproIntegraClient,
    SerproAutopostService,
  ],
  exports: [
    FiscalEngineService,
    RevenueSyncService,
    ContabilService,
    ObligationSchedulerService,
    LivroCaixaService,
    ContabilCloseService,
    ComprovanteService,
    NfseCertService,
    NfseEmitterService,
    FiscalAutomationLogService,
    SerproCredService,
    SerproAutopostService,
  ],
})
export class ContabilModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContabilModule } from '../contabil/contabil.module';
import { NfseNationalClient } from '../contabil/nfse-national.client';
import { FiscalController } from './fiscal.controller';
import { FiscalProfileService } from './fiscal-profile.service';
import { FiscalNfseService } from './fiscal-nfse.service';

// FISCAL DO TENANT (PR04082026-FISCAL-TENANT F1a) — módulo do TENANT, irmão do
// financeiro-tenant. O contabil/ (robô do dono) fica INTOCADO: importamos o
// módulo p/ FiscalAutomationLogService (trilha compartilhada, exportado) e
// provemos NOSSA instância do NfseNationalClient (a classe é paramétrica e não
// é exportada lá; instância própria = zero mudança no contabil). O client nasce
// com transporte HTTP real, mas ele SÓ é exercido quando um tenant com perfil
// completo + cert no cofre + município na allowlist clica Emitir — o gate é o
// onboarding, não flag (lei: entregar LIGADO).
@Module({
  imports: [PrismaModule, ContabilModule],
  controllers: [FiscalController],
  providers: [NfseNationalClient, FiscalProfileService, FiscalNfseService],
  exports: [FiscalProfileService, FiscalNfseService],
})
export class FiscalModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LogisticaModule } from '../logistica/logistica.module';
import { FinanceiroTenantService } from './financeiro-tenant.service';
import { FinanceiroTenantController } from './financeiro-tenant.controller';

/**
 * FINANCEIRO-UNIVERSAL (Fase 1) — módulo do financeiro do TENANT, desacoplado da
 * logística. Importa LogisticaModule só pra DELEGAR a baixa de cobrança logística
 * ao LogisticaService.quitarCharge (paridade total + parar recovery). Não há
 * ciclo: a logística NÃO importa este módulo.
 */
@Module({
  imports: [PrismaModule, LogisticaModule],
  controllers: [FinanceiroTenantController],
  providers: [FinanceiroTenantService],
  exports: [FinanceiroTenantService],
})
export class FinanceiroTenantModule {}

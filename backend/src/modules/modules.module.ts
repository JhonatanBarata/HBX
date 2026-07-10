import { Module, forwardRef } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { ModuleAccessGuard } from './module-access.guard';
import { BotArmedGuard } from './bot-armed.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { MasterContextModule } from '../master-context/master-context.module';
import { CompaniesModule } from '../companies/companies.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { CreditsModule } from '../credits/credits.module';

// WebwhatsBridgeService só depende de Prisma (mesmo padrão do MasterCockpitModule):
// provemos aqui como instância própria em vez de importar o MessagingModule inteiro,
// evitando ciclo de dependência no boot. Uso em ModulesService é SÓ leitura do motor
// (listMotorInstances, C3 — TESTE-GERAL/CORRECOES.md), nunca conectar/desconectar chip.
// CreditsModule: S1 MASTER-REFAB — a listagem master precisa do saldo agregado de créditos
// (coluna "Créditos" honesta); só leitura (CreditWalletService.getBalancesByCompanyIds).
@Module({
  imports: [PrismaModule, forwardRef(() => UsersModule), MasterContextModule, IntegrationsModule, forwardRef(() => CompaniesModule), CommercialPlansModule, CreditsModule],
  providers: [ModulesService, ModuleAccessGuard, BotArmedGuard, MasterGuard, WebwhatsBridgeService],
  controllers: [ModulesController],
  exports: [ModulesService, ModuleAccessGuard, BotArmedGuard],
})
export class ModulesAccessModule {}

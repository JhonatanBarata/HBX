import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { ModuleAccessGuard } from './module-access.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { MasterContextModule } from '../master-context/master-context.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [PrismaModule, UsersModule, MasterContextModule, IntegrationsModule, CompaniesModule],
  providers: [ModulesService, ModuleAccessGuard, MasterGuard],
  controllers: [ModulesController],
  exports: [ModulesService, ModuleAccessGuard],
})
export class ModulesAccessModule {}

import { Module } from '@nestjs/common';
import { ModulesAccessModule } from '../modules/modules.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NightFactoryController } from './night-factory.controller';
import { NightFactoryPublicController } from './night-factory-public.controller';
import { NightFactoryService } from './night-factory.service';
import { NightOrderController } from './night-order.controller';
import { NightOrderService } from './night-order.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule],
  controllers: [NightFactoryController, NightFactoryPublicController, NightOrderController],
  providers: [NightFactoryService, NightOrderService],
  exports: [NightFactoryService, NightOrderService],
})
export class NightFactoryModule {}

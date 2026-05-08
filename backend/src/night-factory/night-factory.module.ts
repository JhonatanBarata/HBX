import { Module } from '@nestjs/common';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NightFactoryController } from './night-factory.controller';
import { NightFactoryService } from './night-factory.service';
import { NightFactoryWorker } from './night-factory.worker';

@Module({
  imports: [PrismaModule, CommercialPlansModule],
  controllers: [NightFactoryController],
  providers: [NightFactoryService, NightFactoryWorker],
  exports: [NightFactoryService],
})
export class NightFactoryModule {}

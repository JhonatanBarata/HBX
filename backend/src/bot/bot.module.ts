import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { BotActivationController } from './bot-activation.controller';
import { BotActivationService } from './bot-activation.service';
import { BotConfigStoreModule } from './config/bot-config-store.module';

@Module({
  imports: [PrismaModule, ModulesAccessModule, BotConfigStoreModule],
  controllers: [BotActivationController],
  providers: [BotActivationService],
  exports: [BotActivationService],
})
export class BotModule {}

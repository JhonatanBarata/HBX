import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { BotActivationController } from './bot-activation.controller';
import { BotActivationService } from './bot-activation.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule],
  controllers: [BotActivationController],
  providers: [BotActivationService],
  exports: [BotActivationService],
})
export class BotModule {}

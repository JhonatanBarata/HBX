import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { TechAssistantAiProvider } from './tech-assistant-ai.provider';
import { TechAssistantController } from './tech-assistant.controller';
import { TechAssistantService } from './tech-assistant.service';

@Module({
  imports: [PrismaModule, MasterContextModule],
  controllers: [TechAssistantController],
  providers: [TechAssistantService, TechAssistantAiProvider],
})
export class TechAssistantModule {}
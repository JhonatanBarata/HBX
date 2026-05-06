import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAssistantController, AiAssistantLeadsController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';

@Module({
  imports: [PrismaModule],
  controllers: [AiAssistantController, AiAssistantLeadsController],
  providers: [AiAssistantService],
})
export class AiAssistantModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MailModule } from '../mail/mail.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ImportacoesController } from './importacoes.controller';
import { ImportacoesService } from './importacoes.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule, MailModule, MessagingModule],
  controllers: [ImportacoesController],
  providers: [ImportacoesService],
})
export class ImportacoesModule {}

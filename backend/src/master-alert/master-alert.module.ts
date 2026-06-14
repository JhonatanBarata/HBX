import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { MasterAlertService } from './master-alert.service';

// Módulo-folha (PRISMA + MAIL apenas). O WebwhatsBridgeService só depende de
// Prisma, então o provemos aqui como instância própria — assim NÃO importamos o
// MessagingModule e NÃO criamos o ciclo de dependência (que derrubaria o boot).
@Module({
  imports: [PrismaModule, MailModule],
  providers: [MasterAlertService, WebwhatsBridgeService],
  exports: [MasterAlertService],
})
export class MasterAlertModule {}

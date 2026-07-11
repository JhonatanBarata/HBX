import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { MasterAlertService } from './master-alert.service';
import { MasterWatchService } from './master-watch.service';
import { AiPressureWatchService } from './ai-pressure-watch.service';

// Módulo-folha (PRISMA + MAIL apenas). O WebwhatsBridgeService só depende de
// Prisma, então o provemos aqui como instância própria — assim NÃO importamos o
// MessagingModule e NÃO criamos o ciclo de dependência (que derrubaria o boot).
//
// COCKPIT-MASTER Sprint 3: MasterWatchService entra no MESMO módulo-folha (só
// usa Prisma + WebwhatsBridge, já presentes, + MasterAlertService local) — o
// módulo continua folha, nenhuma dependência nova.
//
// AI-SOS (11/07): AiPressureWatchService idem — só Prisma + MasterAlertService
// local + estáticos (AiGatewayService.snapshot/AiPressureSignals). Continua folha.
@Module({
  imports: [PrismaModule, MailModule],
  providers: [MasterAlertService, WebwhatsBridgeService, MasterWatchService, AiPressureWatchService],
  exports: [MasterAlertService],
})
export class MasterAlertModule {}

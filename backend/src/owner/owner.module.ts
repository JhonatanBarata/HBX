import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterTicketsController } from './master-tickets.controller';
import { OwnerTicketsController } from './owner-tickets.controller';
import { TicketService } from './ticket.service';

@Module({
  imports: [PrismaModule],
  controllers: [OwnerTicketsController, MasterTicketsController],
  providers: [TicketService],
  exports: [TicketService],
})
export class OwnerModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerTicketsController } from './owner-tickets.controller';
import { TicketService } from './ticket.service';

@Module({
  imports: [PrismaModule],
  controllers: [OwnerTicketsController],
  providers: [TicketService],
  exports: [TicketService],
})
export class OwnerModule {}

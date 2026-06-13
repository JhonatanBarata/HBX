import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { TicketService } from './ticket.service';

// Espelho de LEITURA do owner/tickets para o painel /master (E7 da fila,
// PLAN12062026001). O canal de escrita/dispatch continua exclusivo do
// Ops Control via x-owner-secret (owner-tickets.controller).
@Controller('modules/master/tickets')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterTicketsController {
  constructor(private readonly tickets: TicketService) {}

  @Get()
  listTickets(@Query('status') status?: string, @Query('take') take?: string) {
    return this.tickets.listOwnerTickets({ status, take });
  }
}

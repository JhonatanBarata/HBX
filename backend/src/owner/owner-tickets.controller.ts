import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CreateOwnerTicketDto, UpdateOwnerTicketDispatchDto } from './dto/owner-ticket.dto';
import { TicketService } from './ticket.service';

@Controller('owner/tickets')
export class OwnerTicketsController {
  constructor(private readonly tickets: TicketService) {}

  @Post()
  createTicket(
    @Body() dto: CreateOwnerTicketDto,
    @Headers('x-owner-secret') ownerSecret?: string,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    this.assertOwnerSecret(ownerSecret || internalSecret);
    return this.tickets.createOwnerTicket(dto || {});
  }

  @Get()
  listTickets(
    @Headers('x-owner-secret') ownerSecret?: string,
    @Headers('x-internal-secret') internalSecret?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
  ) {
    this.assertOwnerSecret(ownerSecret || internalSecret);
    return this.tickets.listOwnerTickets({ status, take });
  }

  @Post(':ticketCode/dispatch')
  updateDispatch(
    @Param('ticketCode') ticketCode: string,
    @Body() dto: UpdateOwnerTicketDispatchDto,
    @Headers('x-owner-secret') ownerSecret?: string,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    this.assertOwnerSecret(ownerSecret || internalSecret);
    return this.tickets.updateOwnerTicketDispatch(ticketCode, dto || {});
  }

  private assertOwnerSecret(secret?: string) {
    const expected = String(
      process.env.OWNER_TICKETS_SECRET ||
        process.env.INTERNAL_SECRET ||
        process.env.PROD_INTERNAL_SECRET ||
        '',
    ).trim();
    if (!expected) {
      throw new BadRequestException('OWNER_TICKETS_SECRET or INTERNAL_SECRET not configured');
    }
    if (!secret || secret !== expected) {
      throw new ForbiddenException('invalid owner secret');
    }
  }
}

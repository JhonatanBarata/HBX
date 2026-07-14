import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeadsBankService } from './leads-bank.service';

@Controller('leads-bank')
@UseGuards(JwtAuthGuard)
export class LeadsBankController {
  constructor(private readonly leadsBank: LeadsBankService) {}

  @Get()
  getLeadsBank() {
    return this.leadsBank.getLeadsBank();
  }
}

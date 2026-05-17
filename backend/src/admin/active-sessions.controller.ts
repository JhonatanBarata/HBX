import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { ActiveSessionsService } from './active-sessions.service';

@Controller('admin')
export class ActiveSessionsController {
  constructor(private readonly activeSessionsService: ActiveSessionsService) {}

  @Get('active-sessions')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listActiveSessions() {
    return this.activeSessionsService.listActiveSessions();
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { SystemHealthService } from './system-health.service';

@Controller('admin')
export class SystemHealthController {
  constructor(private readonly systemHealthService: SystemHealthService) {}

  @Get('system-health')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getSystemHealth() {
    return this.systemHealthService.getSystemHealth();
  }
}

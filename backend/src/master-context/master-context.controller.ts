import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { AssumeMasterContextDto } from './dto/assume-master-context.dto';
import { ExitMasterContextDto } from './dto/exit-master-context.dto';
import { MasterContextService } from './master-context.service';

@Controller('master-context')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterContextController {
  constructor(private readonly masterContextService: MasterContextService) {}

  @Get('current')
  getCurrentContext(@Req() req: any) {
    return this.masterContextService.getCurrentContext(Number(req.user?.id));
  }

  @Post('assume')
  async assumeContext(@Req() req: any, @Body() dto: AssumeMasterContextDto) {
    const result = await this.masterContextService.assumeContext(Number(req.user?.id), Number(dto.companyId), {
      reason: dto.reason,
      ttlMinutes: dto.ttlMinutes,
      route: String(req.headers?.['x-master-route'] || ''),
    });
    return { ok: true, context: result };
  }

  @Post('exit')
  exitContext(@Req() req: any, @Body() dto: ExitMasterContextDto) {
    return this.masterContextService.exitContext(Number(req.user?.id), {
      reason: dto.reason,
      route: String(req.headers?.['x-master-route'] || ''),
    });
  }

  @Get('audit')
  listAudit(@Req() req: any, @Query('limit') limit?: string) {
    return this.masterContextService.listRecentAudit(Number(req.user?.id), Number(limit || 80));
  }
}

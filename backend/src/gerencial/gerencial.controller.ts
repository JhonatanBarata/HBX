import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Admin } from '../auth/admin.decorator';
import { GerencialService } from './gerencial.service';
import { Patch, Param, Body, BadRequestException } from '@nestjs/common';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';

class MarkComplaintDto {
  isComplaint: boolean;
}

@Controller('gerencial')
export class GerencialController {
  constructor(private readonly gerencialService: GerencialService) {}

  @Get('overview')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  overview(@Req() req: any) {
    return this.gerencialService.overview(req.user);
  }

  @Patch('message/:id/complaint')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async markMessageComplaint(@Req() req: any, @Param('id') id: string, @Body() dto: MarkComplaintDto) {
    const messageId = Number(id);
    if (Number.isNaN(messageId)) throw new BadRequestException('Invalid message id');
    return this.gerencialService.markComplaint(req.user, messageId, Boolean(dto.isComplaint));
  }
}

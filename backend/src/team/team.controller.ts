import { Body, Controller, Get, Param, ParseIntPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { TeamPolicyService } from './team-policy.service';

@Controller('team')
export class TeamController {
  constructor(private readonly teamPolicyService: TeamPolicyService) {}

  @Get('policy/me')
  @UseGuards(JwtAuthGuard)
  getMyPolicy(@Req() req: any) {
    return this.teamPolicyService.getMyPolicy(req.user);
  }

  @Get('policies')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  listPolicies(@Req() req: any) {
    return this.teamPolicyService.listPolicies(req.user);
  }

  @Get('policy/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  getPolicy(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.teamPolicyService.getPolicy(req.user, userId);
  }

  @Patch('policy/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  updatePolicy(
    @Req() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: any,
  ) {
    return this.teamPolicyService.updatePolicy(req.user, userId, body || {});
  }
}

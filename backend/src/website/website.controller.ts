import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { CreateWebsiteProjectDto } from './dto/create-website-project.dto';
import { UpdateWebsiteProjectDto } from './dto/update-website-project.dto';
import { WebsiteService } from './website.service';

@Controller('website')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('website')
export class WebsiteController {
  constructor(private readonly websiteService: WebsiteService) {}

  @Get('templates')
  listTemplates() {
    return this.websiteService.listTemplates();
  }

  @Get('project')
  getMyProject(@Req() req: any, @Query('companyId') companyId?: string) {
    return this.websiteService.getMyProject(req.user, Number(companyId || 0) || undefined);
  }

  @Post('project')
  createMyProject(@Req() req: any, @Body() dto: CreateWebsiteProjectDto) {
    return this.websiteService.createMyProject(req.user, dto);
  }

  @Patch('project')
  updateMyProject(@Req() req: any, @Body() dto: UpdateWebsiteProjectDto) {
    return this.websiteService.updateMyProject(req.user, dto);
  }
}

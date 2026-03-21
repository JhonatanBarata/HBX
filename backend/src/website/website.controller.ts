import { Body, Controller, Get, Ip, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { UpdateCompanyWebsiteConfigDto } from './dto/update-company-website-config.dto';
import { WebsiteAdminExchangeDto } from './dto/website-admin-exchange.dto';
import { WebsiteAdminVerifyDto } from './dto/website-admin-verify.dto';
import { WebsiteService } from './website.service';

@Controller('website')
export class WebsiteController {
  constructor(private readonly websiteService: WebsiteService) {}

  @Get('portal')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('website')
  getPortal(@Req() req: any, @Query('target') target?: string) {
    return this.websiteService.getPortal(req.user, target);
  }

  @Patch('master/company/:companyId/config')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateCompanyConfig(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateCompanyWebsiteConfigDto,
  ) {
    return this.websiteService.updateCompanyConfigByMaster(Number(req.user?.id), companyId, dto);
  }

  @Get('master/company/:companyId/launch')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getCompanyLaunchForMaster(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('target') target?: string,
  ) {
    return this.websiteService.getPortalForCompanyByMaster(Number(req.user?.id), companyId, target);
  }

  @Post('admin/exchange')
  exchangeAdminEntry(@Body() dto: WebsiteAdminExchangeDto, @Ip() ip?: string) {
    return this.websiteService.exchangeAdminEntry(dto, ip);
  }

  @Post('admin/verify')
  verifyAdminSession(@Body() dto: WebsiteAdminVerifyDto, @Ip() ip?: string) {
    return this.websiteService.verifyAdminSession(dto, ip);
  }
}

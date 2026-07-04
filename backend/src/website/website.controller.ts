import { Body, Controller, Get, Ip, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { UpdateCompanyWebsiteConfigDto } from './dto/update-company-website-config.dto';
import { WebsiteAdminExchangeDto } from './dto/website-admin-exchange.dto';
import { WebsiteAdminFirebaseTokenDto } from './dto/website-admin-firebase-token.dto';
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

  // COLD-22: token opaco pro form do site apontar o POST público de captura de lead.
  // Emite na primeira chamada (idempotente); rotação é ação explícita (invalida o form antigo).
  @Get('master/company/:companyId/capture-token')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getCaptureTokenForMaster(@Req() req: any, @Param('companyId', ParseIntPipe) companyId: number) {
    return this.websiteService.getOrCreateCaptureTokenByMaster(Number(req.user?.id), companyId);
  }

  @Post('master/company/:companyId/capture-token/rotate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  rotateCaptureTokenForMaster(@Req() req: any, @Param('companyId', ParseIntPipe) companyId: number) {
    return this.websiteService.rotateCaptureTokenByMaster(Number(req.user?.id), companyId);
  }

  @Post('admin/exchange')
  exchangeAdminEntry(@Body() dto: WebsiteAdminExchangeDto, @Ip() ip?: string) {
    return this.websiteService.exchangeAdminEntry(dto, ip);
  }

  @Post('admin/verify')
  verifyAdminSession(@Body() dto: WebsiteAdminVerifyDto, @Ip() ip?: string) {
    return this.websiteService.verifyAdminSession(dto, ip);
  }

  // Mint central do Firebase Custom Token (Sprint 3 / T3, 02/07). Sem guard de
  // JWT do app — mesma familia do exchange/verify, a sessao HBX (sessionToken)
  // ja e a prova de identidade. Atras de WEBSITE_TOKEN_MINT_ENABLED (ver
  // WebsiteFirebaseMintService); quando desligado responde 503 com mensagem
  // clara e o hbx-admin-auth.js do site cai no fallback da Function antiga.
  @Post('admin/firebase-token')
  mintFirebaseToken(@Body() dto: WebsiteAdminFirebaseTokenDto, @Ip() ip?: string) {
    return this.websiteService.mintFirebaseTokenForAdmin(dto.sessionToken, ip);
  }
}

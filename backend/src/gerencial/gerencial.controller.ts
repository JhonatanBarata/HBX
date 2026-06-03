import { Controller, Get, Post, Req, UseGuards, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Admin } from '../auth/admin.decorator';
import { GerencialService } from './gerencial.service';
import { Patch, Param, Body, BadRequestException } from '@nestjs/common';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { SellerOnboardingService } from './seller-onboarding.service';

class MarkComplaintDto {
  isComplaint: boolean;
}

class UpdateCommissionDto {
  commissionStatus?: string;
  commissionNote?: string;
}

class UpdateCommissionSettingsDto {
  commissionDueBusinessDays?: number;
}

class UpdateClientSaleStatusDto {
  saleStatus?: string;
  commissionNote?: string;
}

class CreateCommissionPayoutDto {
  sellerUserId?: number;
  dueOnly?: boolean;
  referenceLabel?: string;
  notes?: string;
}

@Controller('gerencial')
export class GerencialController {
  constructor(
    private readonly gerencialService: GerencialService,
    private readonly sellerOnboardingService: SellerOnboardingService,
  ) {}

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

  @Patch('commission/settings')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async updateCommissionSettings(@Req() req: any, @Body() dto: UpdateCommissionSettingsDto) {
    return this.gerencialService.updateCommissionSettings(req.user, dto || {});
  }

  @Patch('commission/:leadId')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async updateCommission(@Req() req: any, @Param('leadId') leadId: string, @Body() dto: UpdateCommissionDto) {
    return this.gerencialService.updateCommissionStatus(req.user, leadId, dto || {});
  }

  @Patch('commission/:leadId/sale-status')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async updateClientSaleStatus(@Req() req: any, @Param('leadId') leadId: string, @Body() dto: UpdateClientSaleStatusDto) {
    return this.gerencialService.updateClientSaleStatus(req.user, leadId, dto || {});
  }

  @Post('commission/payouts')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async createCommissionPayout(@Req() req: any, @Body() dto: CreateCommissionPayoutDto) {
    return this.gerencialService.createCommissionPayout(req.user, dto || {});
  }

  @Post('commission/sync-hbx-clients')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async syncHbxClientCommissions(@Req() req: any) {
    return this.gerencialService.syncHbxClientCommissions(req.user);
  }

  @Get('sellers/:userId/onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async getSellerOnboarding(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.sellerOnboardingService.getForUser(req.user, userId);
  }

  @Patch('sellers/:userId/onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async updateSellerOnboarding(@Req() req: any, @Param('userId', ParseIntPipe) userId: number, @Body() dto: any) {
    return this.sellerOnboardingService.updateDraft(req.user, userId, dto || {});
  }

  @Post('sellers/:userId/onboarding/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async uploadSellerOnboardingAttachment(
    @Req() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Body('kind') kind: string,
    @UploadedFile() file: any,
  ) {
    return this.sellerOnboardingService.uploadAttachment(req.user, userId, kind, file);
  }

  @Post('sellers/:userId/onboarding/generate-contract')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async generateSellerOnboardingContract(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.sellerOnboardingService.generateContract(req.user, userId);
  }

  @Post('sellers/:userId/onboarding/send-email')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async sendSellerOnboardingEmail(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.sellerOnboardingService.sendOnboardingEmail(req.user, userId);
  }

  @Post('sellers/onboarding/purge-expired')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async purgeExpiredSellerOnboardingAttachments() {
    return this.sellerOnboardingService.purgeExpiredAttachments();
  }
}

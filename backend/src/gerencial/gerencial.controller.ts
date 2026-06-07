import { Controller, Delete, Get, Post, Req, Res, UseGuards, ParseIntPipe, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
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
import { HbxPartnerReferralService } from './hbx-partner-referral.service';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

class MarkComplaintDto {
  @IsBoolean()
  isComplaint: boolean;
}

class UpdateCommissionDto {
  @IsOptional()
  @IsIn(['pending', 'payable', 'paid', 'canceled'])
  commissionStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  commissionNote?: string;
}

class UpdateCommissionSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  commissionDueBusinessDays?: number;
}

class UpdateClientSaleStatusDto {
  @IsOptional()
  @IsIn(['activation_pending', 'trial_started', 'sale_confirmed', 'inactive', 'canceled'])
  saleStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  commissionNote?: string;
}

class CreateCommissionPayoutDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sellerUserId?: number;

  @IsOptional()
  @IsBoolean()
  dueOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class RejectHbxPartnerReferralDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}

function contentDispositionFilename(filename: string) {
  return String(filename || 'anexo').replace(/["\r\n]/g, '').slice(0, 180) || 'anexo';
}

@Controller('gerencial')
export class GerencialController {
  constructor(
    private readonly gerencialService: GerencialService,
    private readonly sellerOnboardingService: SellerOnboardingService,
    private readonly hbxPartnerReferrals: HbxPartnerReferralService,
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

  @Get('hbx-partners/:userId/onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async getSellerOnboarding(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.sellerOnboardingService.getOrCreateForUser(Number(req.user?.companyId), userId, Number(req.user?.id || 0) || null);
  }

  @Patch('hbx-partners/:userId/onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async updateSellerOnboarding(@Req() req: any, @Param('userId', ParseIntPipe) userId: number, @Body() dto: any) {
    return this.sellerOnboardingService.updateDraft(Number(req.user?.companyId), userId, dto || {});
  }

  @Post('hbx-partners/:userId/onboarding/generate-contract')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async generateSellerOnboardingContract(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.sellerOnboardingService.generateContract(Number(req.user?.companyId), userId, Number(req.user?.id || 0) || null);
  }

  @Get('hbx-partners/:userId/onboarding/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async listSellerOnboardingAttachments(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.sellerOnboardingService.listAttachments(Number(req.user?.companyId), userId);
  }

  @Post('hbx-partners/:userId/onboarding/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadSellerOnboardingAttachment(
    @Req() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @UploadedFile() file: any,
    @Body() dto: any,
  ) {
    return this.sellerOnboardingService.uploadAttachment(Number(req.user?.companyId), userId, file, dto || {});
  }

  @Get('hbx-partners/:userId/onboarding/attachments/:attachmentId/download')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async downloadSellerOnboardingAttachment(
    @Req() req: any,
    @Res() res: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('attachmentId') attachmentId: string,
  ) {
    const file = await this.sellerOnboardingService.getAttachmentFile(Number(req.user?.companyId), userId, attachmentId);
    const filename = contentDispositionFilename(file.filename);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.byteSize));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(file.content);
  }

  @Delete('hbx-partners/:userId/onboarding/attachments/:attachmentId')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async deleteSellerOnboardingAttachment(
    @Req() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.sellerOnboardingService.deleteAttachment(Number(req.user?.companyId), userId, attachmentId);
  }

  @Patch('hbx-partners/:userId/onboarding/document-requirement')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async updateSellerOnboardingDocumentRequirement(
    @Req() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: any,
  ) {
    return this.sellerOnboardingService.updateDocumentRequirement(
      Number(req.user?.companyId),
      userId,
      dto?.kind,
      dto?.required,
    );
  }

  @Post('hbx-partners/:userId/onboarding/send-email')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async sendSellerOnboardingEmail(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    return this.sellerOnboardingService.sendOnboardingEmail(Number(req.user?.companyId), userId, Number(req.user?.id || 0) || null, {
      allowMissingRequiredAttachments: true,
      includeConfirmationLink: true,
    });
  }

  @Post('hbx-partners/onboarding/purge-expired-attachments')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async purgeSellerOnboardingAttachments(@Req() req: any) {
    return this.sellerOnboardingService.purgeExpiredAttachments(Number(req.user?.companyId));
  }

  @Get('hbx-partner-referrals/pending')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async listHbxPartnerReferrals(@Req() req: any) {
    const candidates = await this.hbxPartnerReferrals.listPendingForMaster(req.user);
    return { candidates };
  }

  @Get('hbx-partner-referrals/lookup-phone')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async lookupHbxPartnerReferralByPhone(@Req() req: any, @Query('phone') phone?: string) {
    const companyId = Number(req.user?.companyId || 0);
    const candidate = await this.hbxPartnerReferrals.findCandidateByPhone(companyId, phone);
    return { found: Boolean(candidate), candidate, referrer: candidate?.referrerUser || null };
  }

  @Post('hbx-partner-referrals/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async approveHbxPartnerReferral(@Req() req: any, @Param('id') id: string) {
    const candidate = await this.hbxPartnerReferrals.approveCandidate(req.user, id);
    return { candidate };
  }

  @Post('hbx-partner-referrals/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async rejectHbxPartnerReferral(@Req() req: any, @Param('id') id: string, @Body() dto: RejectHbxPartnerReferralDto) {
    const candidate = await this.hbxPartnerReferrals.rejectCandidate(req.user, id, dto?.reason);
    return { candidate };
  }
}

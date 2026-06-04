import { Controller, Delete, Get, Post, Req, UseGuards, ParseIntPipe, Query, ForbiddenException, NotFoundException, UploadedFile, UseInterceptors } from '@nestjs/common';
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
import { PrismaService } from '../prisma/prisma.service';
import { isMasterOperationalCompanySlug } from '../commercial-plans/seat-billing.util';

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
    private readonly prisma: PrismaService,
  ) {}

  private normalizePhoneDigits(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits || null;
  }

  private async assertHbxSellerNetwork(companyId: number) {
    if (!companyId) throw new ForbiddenException('Company context required');
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
    if (!isMasterOperationalCompanySlug(company?.slug)) {
      throw new ForbiddenException('Indicações de parceiros estão disponíveis apenas na operação HBX.');
    }
  }

  private hbxReferralCandidateInclude() {
    return {
      referrerUser: { select: { id: true, name: true, username: true, email: true, sellerReferralCommissionPercent: true, commissionPercent: true } },
      reviewedByUser: { select: { id: true, name: true, username: true, email: true } },
      convertedUser: { select: { id: true, name: true, username: true, email: true, isActive: true } },
    };
  }

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
    return this.sellerOnboardingService.sendOnboardingEmail(Number(req.user?.companyId), userId, Number(req.user?.id || 0) || null);
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
    const companyId = Number(req.user?.companyId || 0);
    await this.assertHbxSellerNetwork(companyId);
    const candidates = await this.prisma.hbxPartnerReferralCandidate.findMany({
      where: { companyId, status: { in: ['pending', 'approved'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.hbxReferralCandidateInclude(),
    });
    return { candidates };
  }

  @Get('hbx-partner-referrals/lookup-phone')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async lookupHbxPartnerReferralByPhone(@Req() req: any, @Query('phone') phone?: string) {
    const companyId = Number(req.user?.companyId || 0);
    await this.assertHbxSellerNetwork(companyId);
    const phoneNormalized = this.normalizePhoneDigits(phone);
    if (!phoneNormalized) return { found: false, candidate: null, referrer: null };
    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { companyId, phoneNormalized, status: { in: ['pending', 'approved'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: this.hbxReferralCandidateInclude(),
    });
    return { found: Boolean(candidate), candidate, referrer: candidate?.referrerUser || null };
  }

  @Post('hbx-partner-referrals/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async approveHbxPartnerReferral(@Req() req: any, @Param('id') id: string) {
    const companyId = Number(req.user?.companyId || 0);
    await this.assertHbxSellerNetwork(companyId);
    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id, companyId },
      include: {
        referrerUser: {
          select: { id: true, companyId: true, role: true, isActive: true, deactivatedAt: true, isSystemMaster: true },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada');
    if (candidate.status !== 'pending') throw new BadRequestException('Esta indicação já foi revisada.');
    const referrer = candidate.referrerUser;
    if (
      !referrer ||
      Number(referrer.companyId || 0) !== companyId ||
      String(referrer.role || '').toUpperCase() !== 'USER' ||
      !referrer.isActive ||
      referrer.deactivatedAt ||
      referrer.isSystemMaster
    ) {
      throw new BadRequestException('Indicador precisa ser parceiro ativo da operação HBX.');
    }
    const updated = await this.prisma.hbxPartnerReferralCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'approved',
        reviewedByUserId: Number(req.user?.id || 0) || null,
        reviewedAt: new Date(),
      },
      include: this.hbxReferralCandidateInclude(),
    });
    return { candidate: updated };
  }

  @Post('hbx-partner-referrals/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  async rejectHbxPartnerReferral(@Req() req: any, @Param('id') id: string) {
    const companyId = Number(req.user?.companyId || 0);
    await this.assertHbxSellerNetwork(companyId);
    const candidate = await this.prisma.hbxPartnerReferralCandidate.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!candidate) throw new NotFoundException('Indicação não encontrada');
    if (candidate.status !== 'pending') throw new BadRequestException('Esta indicação já foi revisada.');
    const updated = await this.prisma.hbxPartnerReferralCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'rejected',
        reviewedByUserId: Number(req.user?.id || 0) || null,
        reviewedAt: new Date(),
      },
      include: this.hbxReferralCandidateInclude(),
    });
    return { candidate: updated };
  }
}

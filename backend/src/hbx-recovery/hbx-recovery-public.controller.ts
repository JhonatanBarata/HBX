import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HbxRecoveryService } from './hbx-recovery.service';

@Controller('hbx-recovery/public')
export class HbxRecoveryPublicController {
  constructor(private readonly recoveryService: HbxRecoveryService) {}

  @Get('meta-template-media/:companyId/:templateName')
  async getMetaTemplateMedia(
    @Param('companyId') companyIdRaw: string,
    @Param('templateName') templateName: string,
    @Query('language') language?: string,
    @Query('module') moduleKey?: string,
    @Res() res?: Response,
  ) {
    const asset = await this.recoveryService.getPublicMetaTemplateHeaderMedia(
      Number(companyIdRaw || 0),
      templateName,
      language,
      moduleKey,
    );
    return res
      ?.setHeader('Content-Type', asset.contentType)
      .setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .status(200)
      .send(asset.buffer);
  }
}

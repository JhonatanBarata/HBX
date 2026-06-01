import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { WebscrapingService } from './webscraping.service';

@Controller('webscraping/radar/internal')
export class WebscrapingInternalRadarController {
  constructor(private readonly webscrapingService: WebscrapingService) {}

  @Post('lead-pool-lookup')
  lookupLeadPool(
    @Body() body: any,
    @Headers('x-hbx-internal-token') hbxToken?: string,
    @Headers('x-internal-token') genericToken?: string,
  ) {
    this.assertInternalToken(hbxToken || genericToken);
    return this.webscrapingService.lookupRadarLeadPoolInternal(body || {});
  }

  private assertInternalToken(token: string | undefined) {
    const expected = String(
      process.env.HBX_INTERNAL_API_TOKEN
      || process.env.HBX_ENGINE_INTERNAL_TOKEN
      || process.env.INTERNAL_API_TOKEN
      || '',
    ).trim();
    if (!expected && process.env.NODE_ENV !== 'production') return;
    if (!expected || String(token || '').trim() !== expected) {
      throw new UnauthorizedException('Token interno invalido.');
    }
  }
}

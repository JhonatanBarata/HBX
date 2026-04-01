import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { WebscrapingService } from './webscraping.service';

class WebscrapingSearchDto {
  @IsString()
  city!: string;

  @IsString()
  segment!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50000)
  minReviews?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyProbableWhatsApp?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyWithWebsite?: boolean;
}

@Controller('webscraping')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('webscraping')
export class WebscrapingController {
  constructor(private readonly webscrapingService: WebscrapingService) {}

  @Get('runtime')
  getRuntime(@Req() req: any) {
    return this.webscrapingService.getRuntime(req.user);
  }

  @Post('search')
  search(@Req() req: any, @Body() dto: WebscrapingSearchDto) {
    return this.webscrapingService.searchContactsForUser(req.user, dto);
  }

  @Get('history')
  history(@Req() req: any, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.webscrapingService.listRecentHistoryForUser(
      req.user,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Post('history/:id/reuse')
  reuseHistory(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.reuseHistorySearchForUser(req.user, id);
  }

  @Post('export')
  async exportExcel(
    @Req() req: any,
    @Body() dto: WebscrapingSearchDto,
    @Res() res: Response,
  ) {
    const exported = await this.webscrapingService.exportContactsForUser(req.user, dto);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.send(exported.buffer);
  }
}

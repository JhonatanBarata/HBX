import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';
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
}

@Controller('webscraping')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('webscraping')
export class WebscrapingController {
  constructor(private readonly webscrapingService: WebscrapingService) {}

  @Get('runtime')
  getRuntime() {
    return this.webscrapingService.getRuntime();
  }

  @Post('search')
  search(@Body() dto: WebscrapingSearchDto) {
    return this.webscrapingService.searchContacts(dto);
  }
}

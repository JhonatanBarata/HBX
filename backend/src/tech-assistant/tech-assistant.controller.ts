import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { AnalyzeTechAssistantDto } from './dto/analyze-tech-assistant.dto';
import { TechAssistantService } from './tech-assistant.service';

@Controller('tech-assistant')
@UseGuards(JwtAuthGuard, MasterGuard)
export class TechAssistantController {
  constructor(private readonly techAssistantService: TechAssistantService) {}

  @Get('history')
  listHistory(@Req() req: any) {
    return this.techAssistantService.listHistory(Number(req.user?.id));
  }

  @Get('examples')
  getExamples() {
    return this.techAssistantService.getExamples();
  }

  @Post('analyze')
  analyze(@Req() req: any, @Body() dto: AnalyzeTechAssistantDto) {
    return this.techAssistantService.analyze(Number(req.user?.id), dto);
  }

  @Delete('history')
  clearHistory(@Req() req: any) {
    return this.techAssistantService.clearHistory(Number(req.user?.id));
  }

  @Delete('history/:id')
  deleteHistoryItem(@Req() req: any, @Param('id') id: string) {
    return this.techAssistantService.deleteHistoryItem(Number(req.user?.id), id);
  }
}
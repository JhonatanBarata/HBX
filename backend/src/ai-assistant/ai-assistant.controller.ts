import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiAssistantService } from './ai-assistant.service';

@Controller('api/ai-assistant')
@UseGuards(JwtAuthGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get('status')
  getStatus(@Req() req: any) {
    return this.aiAssistantService.getStatus(req.user);
  }

  @Post('toggle')
  toggle(@Req() req: any, @Body() body: any) {
    return this.aiAssistantService.toggle(req.user, body || {});
  }

  @Get('next-prospect')
  getNextProspect(@Req() req: any) {
    return this.aiAssistantService.getNextProspect(req.user);
  }

  @Get('insights')
  getInsights(@Req() req: any) {
    return this.aiAssistantService.getInsights(req.user);
  }

  @Post('suggest-reply')
  suggestReply(@Req() req: any, @Body() body: any) {
    return this.aiAssistantService.suggestReply(req.user, body || {});
  }
}

@Controller('api/leads')
@UseGuards(JwtAuthGuard)
export class AiAssistantLeadsController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('request-more')
  requestMoreLeads(@Req() req: any, @Body() body: any) {
    return this.aiAssistantService.requestMoreLeads(req.user, body || {});
  }
}

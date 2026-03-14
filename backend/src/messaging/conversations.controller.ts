import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  list(@Req() req: any, @Query('take') take?: string) {
    const parsed = take ? Number(take) : undefined;
    return this.conversations.listConversations(req.user, { take: Number.isFinite(parsed) ? parsed : undefined });
  }

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('atendimento')
  listMessages(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Query('take') take?: string) {
    const parsed = take ? Number(take) : undefined;
    return this.conversations.listConversationMessages(req.user, id, { take: Number.isFinite(parsed) ? parsed : undefined });
  }
}

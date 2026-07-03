import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MetaLeadAdsService } from './meta-lead-ads.service';

// Configuração da integração Meta por empresa. Só o ADMIN da empresa configura
// (checado no service via requireCompanyAdmin). Vendedor nunca chega aqui.
@UseGuards(JwtAuthGuard)
@Controller('integrations/meta/connections')
export class MetaLeadAdsAdminController {
  constructor(private readonly metaService: MetaLeadAdsService) {}

  @Get()
  list(@Req() req: any) {
    return this.metaService.listConnectionsForUser(req.user);
  }

  @Post()
  upsert(
    @Req() req: any,
    @Body()
    body: {
      pageId?: string;
      pageName?: string;
      accessToken?: string;
      defaultAssignedUserId?: number;
      status?: string;
    },
  ) {
    return this.metaService.upsertConnectionForUser(req.user, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.metaService.deleteConnectionForUser(req.user, id);
  }

  // ARQ11 S1 — assina a página no webhook do Meta (subscribed_apps + leadgen) usando o token
  // da conexão. Sem este passo o Meta não manda evento de lead. Contrato fixo { subscribed, error? }.
  @Post(':id/subscribe-webhook')
  subscribeWebhook(@Req() req: any, @Param('id') id: string) {
    return this.metaService.subscribeConnectionWebhook(req.user, id);
  }
}

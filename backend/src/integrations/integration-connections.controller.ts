import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreateIntegrationConnectionDto, UpdateIntegrationConnectionDto } from './dto/integration-connection.dto';
import { IntegrationConnectionsService } from './integration-connections.service';

@Controller('integrations/connections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationConnectionsController {
  constructor(private readonly service: IntegrationConnectionsService) {}

  @Get()
  @Admin()
  list(@Req() req: any, @Query('provider') provider?: string) {
    return this.service.listByUser(req.user, provider);
  }

  @Get(':id')
  @Admin()
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.service.getByUser(req.user, id);
  }

  @Post()
  @Admin()
  create(@Req() req: any, @Body() dto: CreateIntegrationConnectionDto) {
    return this.service.createByUser(req.user, dto);
  }

  @Patch(':id')
  @Admin()
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateIntegrationConnectionDto) {
    return this.service.updateByUser(req.user, id, dto);
  }
}
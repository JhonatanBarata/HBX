import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationConnectionsController } from './integration-connections.controller';
import { IntegrationConnectionsService } from './integration-connections.service';
import { IntegrationSecretsService } from './integration-secrets.service';

@Module({
  imports: [PrismaModule],
  controllers: [IntegrationConnectionsController],
  providers: [IntegrationConnectionsService, IntegrationSecretsService],
  exports: [IntegrationConnectionsService, IntegrationSecretsService],
})
export class IntegrationsModule {}
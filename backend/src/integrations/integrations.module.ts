import { Module } from '@nestjs/common';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuvoClient } from './auvo/auvo.client';
import { AuvoIntegrationService } from './auvo/auvo.integration.service';
import { AuvoMapper } from './auvo/auvo.mapper';
import { AuvoSyncService } from './auvo/auvo.sync.service';
import { IntegrationConnectionsController } from './integration-connections.controller';
import { IntegrationConnectionsService } from './integration-connections.service';
import { IntegrationHttpService } from './integration-http.service';
import { IntegrationProjectionService } from './integration-projection.service';
import { IntegrationSecretsService } from './integration-secrets.service';
import { TagPlusClient } from './tagplus/tagplus.client';
import { TagPlusIntegrationService } from './tagplus/tagplus.integration.service';
import { TagPlusMapper } from './tagplus/tagplus.mapper';
import { TagPlusSyncService } from './tagplus/tagplus.sync.service';

@Module({
  imports: [PrismaModule, CustomerProfileModule],
  controllers: [IntegrationConnectionsController],
  providers: [
    IntegrationConnectionsService,
    IntegrationHttpService,
    IntegrationProjectionService,
    IntegrationSecretsService,
    AuvoClient,
    AuvoMapper,
    AuvoSyncService,
    AuvoIntegrationService,
    TagPlusClient,
    TagPlusMapper,
    TagPlusSyncService,
    TagPlusIntegrationService,
  ],
  exports: [IntegrationConnectionsService, IntegrationHttpService, IntegrationSecretsService],
})
export class IntegrationsModule {}
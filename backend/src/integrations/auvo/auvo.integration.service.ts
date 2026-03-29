import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationSecretsService } from '../integration-secrets.service';
import { AuvoClient } from './auvo.client';
import { AuvoSyncRequest } from './auvo.types';
import { AuvoSyncService } from './auvo.sync.service';

@Injectable()
export class AuvoIntegrationService {
  constructor(
    private readonly prisma: any,
    private readonly integrationSecrets: IntegrationSecretsService,
    private readonly auvoClient: AuvoClient,
    private readonly auvoSyncService: AuvoSyncService,
  ) {}

  private async getConnection(companyId: number, integrationId: string) {
    const row = await this.prisma.integrationConnection.findFirst({
      where: {
        id: String(integrationId),
        companyId,
        provider: 'AUVO',
      },
    });

    if (!row) {
      throw new NotFoundException('Conexao AUVO nao encontrada.');
    }

    return row;
  }

  async testConnection(companyId: number, input: { integrationId: string }) {
    const connection = await this.getConnection(companyId, input.integrationId);
    const secret = this.integrationSecrets.decryptSecret(connection.secretCiphertext);
    const result = await this.auvoClient.testConnection({ secret: secret || '' });
    const now = new Date();

    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        lastTestedAt: now,
        lastTestStatus: result.ok ? 'SUCCESS' : 'ERROR',
        lastTestMessage: result.message,
        status: result.ok ? 'CONNECTED' : 'ERROR',
        lastError: result.ok ? null : result.message,
      },
    });

    return result;
  }

  async syncNow(request: AuvoSyncRequest) {
    return this.auvoSyncService.syncNow(request);
  }

  async syncIncremental(request: AuvoSyncRequest) {
    return this.auvoSyncService.syncIncremental(request);
  }
}